import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  ScrollView,
  Image,
  ActivityIndicator,
  TextInput,
  Platform,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { CreditCard } from '../types';
import {
  ReceiptRecognitionResult,
  ReceiptItem,
  recognizeReceipt,
  matchCardToAccount,
} from '../services/receiptRecognition';
import { captureImageWithCamera, pickImageFromGallery, CapturedImage } from '../utils/imageCapture';

interface ReceiptScannerModalProps {
  visible: boolean;
  cards: CreditCard[];
  onClose: () => void;
  onApplyReceipt: (data: {
    selectedCardId: string;
    amount: number;
    description: string;
    date: string;
    items: ReceiptItem[];
    details: string;
    category?: string;
    autoSubmit?: boolean;
  }) => void;
  onUpdateCard?: (card: CreditCard) => void;
  onAddCard?: (card: Omit<CreditCard, 'id'>) => void;
}

/**
 * Distributes TotalTax = T - ST across items that have the tax toggle ON.
 * If TotalTax > 0 and taxed items exist, adds proportional tax to each taxed item
 * so that sum(item.amount) == T exactly.
 */
function recalculateItemsWithTax(
  itemsList: ReceiptItem[],
  total: number
): { updatedItems: ReceiptItem[]; baseSubtotal: number; totalTax: number } {
  const baseSubtotal = Math.round(
    itemsList.reduce((sum, it) => sum + (it.rawAmount ?? it.amount ?? 0), 0) * 100
  ) / 100;

  const totalTax = Math.max(0, Math.round((total - baseSubtotal) * 100) / 100);

  const taxedItems = itemsList.filter(it => it.isTaxed);
  const taxedSubtotal = Math.round(
    taxedItems.reduce((sum, it) => sum + (it.rawAmount ?? it.amount ?? 0), 0) * 100
  ) / 100;

  if (totalTax <= 0 || taxedSubtotal <= 0) {
    const updated = itemsList.map(it => {
      const base = it.rawAmount ?? it.amount ?? 0;
      return {
        ...it,
        rawAmount: base,
        amount: base,
        taxAmount: 0,
      };
    });
    return { updatedItems: updated, baseSubtotal, totalTax };
  }

  let allocatedTaxSum = 0;
  const updated = itemsList.map(it => {
    const base = it.rawAmount ?? it.amount ?? 0;
    if (!it.isTaxed || base <= 0) {
      return {
        ...it,
        rawAmount: base,
        amount: base,
        taxAmount: 0,
      };
    }
    const rawTax = (base / taxedSubtotal) * totalTax;
    const itemTax = Math.round(rawTax * 100) / 100;
    allocatedTaxSum = Math.round((allocatedTaxSum + itemTax) * 100) / 100;
    return {
      ...it,
      rawAmount: base,
      amount: Math.round((base + itemTax) * 100) / 100,
      taxAmount: itemTax,
    };
  });

  // Reconcile 1-cent rounding difference with the last taxed item
  const roundingDiff = Math.round((totalTax - allocatedTaxSum) * 100) / 100;
  if (roundingDiff !== 0) {
    const lastTaxedIdx = updated.map(it => it.isTaxed).lastIndexOf(true);
    if (lastTaxedIdx !== -1) {
      const target = updated[lastTaxedIdx];
      const newTax = Math.round(((target.taxAmount || 0) + roundingDiff) * 100) / 100;
      target.taxAmount = newTax;
      target.amount = Math.round(((target.rawAmount || 0) + newTax) * 100) / 100;
    }
  }

  return { updatedItems: updated, baseSubtotal, totalTax };
}

export const ReceiptScannerModal: React.FC<ReceiptScannerModalProps> = ({
  visible,
  cards,
  onClose,
  onApplyReceipt,
  onUpdateCard,
  onAddCard,
}) => {
  const [capturedImage, setCapturedImage] = useState<CapturedImage | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recognitionResult, setRecognitionResult] = useState<ReceiptRecognitionResult | null>(null);

  // Editable fields post-recognition
  const [merchant, setMerchant] = useState('');
  const [date, setDate] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string>('');

  // Card matching & in-window linking states
  const [detectedLast4, setDetectedLast4] = useState<string>('');
  const [isEditingLast4, setIsEditingLast4] = useState(false);
  const [last4Input, setLast4Input] = useState('');
  const [showAddCardInline, setShowAddCardInline] = useState(false);
  const [newCardName, setNewCardName] = useState('');
  const [newCardType, setNewCardType] = useState<'credit' | 'checking'>('credit');
  const [linkedSuccessMsg, setLinkedSuccessMsg] = useState('');
  const [showCardPickerModal, setShowCardPickerModal] = useState(false);

  const resetScanner = () => {
    setCapturedImage(null);
    setIsProcessing(false);
    setRecognitionResult(null);
    setMerchant('');
    setDate('');
    setTotalAmount('');
    setItems([]);
    setSelectedCardId('');
    setDetectedLast4('');
    setLast4Input('');
    setIsEditingLast4(false);
    setShowAddCardInline(false);
    setNewCardName('');
    setLinkedSuccessMsg('');
    setShowCardPickerModal(false);
  };

  const handleClose = () => {
    resetScanner();
    onClose();
  };

  const handleImageSelected = async (image: CapturedImage) => {
    setCapturedImage(image);
    setIsProcessing(true);
    try {
      const result = await recognizeReceipt(image.base64, { rawUri: image.uri });
      populateFromRecognition(result);

      const hasAnyExtractedData = (result.totalAmount && result.totalAmount > 0) || (result.items && result.items.length > 0);
      if (!hasAnyExtractedData) {
        const errorMsg =
          (result.warning && !result.warning.includes('FormDataPart') && !result.warning.includes('Network request'))
            ? result.warning
            : 'Could not clearly read details from this receipt image. You can manually enter the total and items below, or try retaking the photo closer to the receipt.';
        if (Platform.OS === 'web') {
          alert(errorMsg);
        } else {
          Alert.alert('Scan Incomplete', errorMsg);
        }
      }
    } catch (err: any) {
      console.error('Recognition error:', err);
      if (Platform.OS === 'web') {
        alert('Failed to process receipt: ' + (err?.message || 'Unknown error'));
      } else {
        Alert.alert('Processing Error', err?.message || 'Unable to scan receipt');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const { width: windowWidth } = useWindowDimensions();
  const isCompactScreen = windowWidth < 520;

  const baseSubtotal = useMemo(() => {
    return Math.round(items.reduce((sum, it) => sum + (it.rawAmount ?? it.amount ?? 0), 0) * 100) / 100;
  }, [items]);

  const parsedTotal = parseFloat(totalAmount) || 0;
  const calculatedTotalTax = Math.max(0, Math.round((parsedTotal - baseSubtotal) * 100) / 100);
  const taxedCount = items.filter(it => it.isTaxed).length;

  const populateFromRecognition = (result: ReceiptRecognitionResult) => {
    setRecognitionResult(result);
    setMerchant(result.merchant || 'Store Purchase');
    setDate(result.date || new Date().toISOString().split('T')[0]);

    const totalVal = typeof result.totalAmount === 'number'
      ? result.totalAmount
      : (parseFloat(String(result.totalAmount)) || 0);

    const rawSubtotal = (result.items || []).reduce(
      (sum, it) =>
        sum +
        (typeof it.rawAmount === 'number'
          ? it.rawAmount
          : typeof it.amount === 'number'
          ? it.amount
          : parseFloat(String(it.amount)) || 0),
      0
    );
    const hasTaxDifference = Boolean((result.tax && result.tax > 0) || totalVal > rawSubtotal + 0.005);
    const anyExplicitTax = (result.items || []).some(it => it.isTaxed === true);

    const initialRawItems: ReceiptItem[] = (result.items || []).map(it => {
      const amt =
        typeof it.rawAmount === 'number'
          ? it.rawAmount
          : typeof it.amount === 'number'
          ? Number(it.amount.toFixed(2))
          : parseFloat(String(it.amount)) || 0;
      const isTaxed = anyExplicitTax ? Boolean(it.isTaxed) : hasTaxDifference;
      return {
        ...it,
        rawAmount: amt,
        amount: amt,
        isTaxed,
        assignedTo: it.assignedTo ?? '',
        taxAmount: 0,
      };
    });

    const finalTotal = totalVal > 0 ? totalVal : (rawSubtotal > 0 ? rawSubtotal : 0);
    const { updatedItems } = recalculateItemsWithTax(initialRawItems, finalTotal);
    setItems(updatedItems);
    setTotalAmount(finalTotal > 0 ? finalTotal.toFixed(2) : '0.00');

    // Match card automatically
    const foundLast4 = result.cardUsage?.last4 || '';
    setDetectedLast4(foundLast4);
    setLast4Input(foundLast4);
    setIsEditingLast4(false);
    setShowAddCardInline(false);
    setLinkedSuccessMsg('');

    const matched = matchCardToAccount(result.cardUsage, cards);
    if (matched) {
      setSelectedCardId(matched.id);
    } else if (cards.length > 0) {
      setSelectedCardId(cards[0].id);
    }
  };

  // Check if detectedLast4 matches any card
  const matchedCardByLast4 = useMemo(() => {
    if (!detectedLast4 || detectedLast4 === '0000' || detectedLast4.length !== 4) return undefined;
    return cards.find(c => c.last4 === detectedLast4);
  }, [cards, detectedLast4]);

  const isCardLinked = Boolean(matchedCardByLast4);

  const handleSaveLast4Input = () => {
    const trimmed = last4Input.replace(/\D/g, '').slice(0, 4);
    setDetectedLast4(trimmed);
    setLast4Input(trimmed);
    setIsEditingLast4(false);
    setLinkedSuccessMsg('');

    if (trimmed && trimmed.length === 4 && trimmed !== '0000') {
      const match = cards.find(c => c.last4 === trimmed);
      if (match) {
        setSelectedCardId(match.id);
      }
    }
  };

  const handleLinkToSelectedCard = () => {
    if (!selectedCard || !detectedLast4 || detectedLast4.length !== 4) return;
    if (onUpdateCard) {
      onUpdateCard({
        ...selectedCard,
        last4: detectedLast4,
      });
      setLinkedSuccessMsg(`Linked ending in ${detectedLast4} to "${selectedCard.name}"!`);
      setTimeout(() => setLinkedSuccessMsg(''), 4000);
    }
  };

  const handleCreateNewCardInline = () => {
    const trimmedName = newCardName.trim();
    if (!trimmedName) {
      if (Platform.OS === 'web') alert('Please enter a card or account name');
      else Alert.alert('Required', 'Please enter a card or account name');
      return;
    }
    const cardData: Omit<CreditCard, 'id'> = {
      name: trimmedName,
      isChecking: newCardType === 'checking',
      isSaving: false,
      isBrokerage: false,
      isHidden: false,
      priority: cards.length,
      openDate: new Date().toISOString().split('T')[0],
      last4: detectedLast4 || '0000',
    };

    if (onAddCard) {
      onAddCard(cardData);
      setLinkedSuccessMsg(`Created "${trimmedName}" with ending ${detectedLast4 || '0000'}!`);
      setTimeout(() => setLinkedSuccessMsg(''), 4000);
    }
    setShowAddCardInline(false);
    setNewCardName('');
  };

  const handleCameraCapture = async () => {
    try {
      const img = await captureImageWithCamera();
      if (img) {
        handleImageSelected(img);
      }
    } catch (err: any) {
      console.error('Camera capture error:', err);
      if (Platform.OS === 'web') {
        alert('Camera error: ' + (err?.message || 'Failed to capture image'));
      } else {
        Alert.alert('Camera Error', err?.message || 'Failed to capture image');
      }
    }
  };

  const handleGalleryPick = async () => {
    try {
      const img = await pickImageFromGallery();
      if (img) {
        handleImageSelected(img);
      }
    } catch (err: any) {
      console.error('Gallery pick error:', err);
      if (Platform.OS === 'web') {
        alert('Gallery error: ' + (err?.message || 'Failed to select image'));
      } else {
        Alert.alert('Gallery Error', err?.message || 'Failed to select image');
      }
    }
  };

  const handleTotalAmountChange = (newTotalStr: string) => {
    setTotalAmount(newTotalStr);
    const parsedTot = parseFloat(newTotalStr) || 0;
    const { updatedItems } = recalculateItemsWithTax(items, parsedTot);
    setItems(updatedItems);
  };

  const handleItemChange = (index: number, field: keyof ReceiptItem, value: any) => {
    const parsedTot = parseFloat(totalAmount) || 0;

    if (field === 'isTaxed') {
      const nextItems = items.map((it, i) =>
        i === index ? { ...it, isTaxed: Boolean(value), amountStr: undefined } : it
      );
      const { updatedItems } = recalculateItemsWithTax(nextItems, parsedTot);
      setItems(updatedItems);
      return;
    }

    if (field === 'amount') {
      const valStr = String(value);
      const baseVal = parseFloat(valStr) || 0;
      const nextItems = items.map((it, i) =>
        i === index
          ? { ...it, rawAmount: baseVal, amount: baseVal, amountStr: valStr }
          : { ...it, amountStr: undefined }
      );

      let effectiveTotal = parsedTot;
      const currentRawSubtotal = Math.round(
        nextItems.reduce((sum, it) => sum + (it.rawAmount ?? it.amount ?? 0), 0) * 100
      ) / 100;

      if (effectiveTotal <= 0) {
        effectiveTotal = currentRawSubtotal;
        setTotalAmount(effectiveTotal > 0 ? effectiveTotal.toFixed(2) : '');
      }

      const { updatedItems } = recalculateItemsWithTax(nextItems, effectiveTotal);
      updatedItems[index].amountStr = valStr;
      setItems(updatedItems);
      return;
    }

    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleItemBlur = (index: number) => {
    const parsedTot = parseFloat(totalAmount) || 0;
    const nextItems = items.map((it, i) =>
      i === index ? { ...it, amountStr: undefined } : it
    );
    const { updatedItems } = recalculateItemsWithTax(nextItems, parsedTot);
    setItems(updatedItems);
  };

  const handleDeleteItem = (index: number) => {
    const remaining = items.filter((_, i) => i !== index);
    const parsedTot = parseFloat(totalAmount) || 0;
    const { updatedItems } = recalculateItemsWithTax(remaining, parsedTot);
    setItems(updatedItems);
  };

  const handleAddItem = () => {
    const anyTaxed = items.some(it => it.isTaxed);
    const newItem: ReceiptItem = {
      id: `custom-${Date.now()}`,
      description: 'New Item',
      rawAmount: 0.0,
      amount: 0.0,
      quantity: 1,
      category: 'Others',
      isTaxed: anyTaxed,
      assignedTo: '',
      taxAmount: 0,
    };
    const parsedTot = parseFloat(totalAmount) || 0;
    const { updatedItems } = recalculateItemsWithTax([...items, newItem], parsedTot);
    setItems(updatedItems);
  };

  const handleToggleAllTax = () => {
    const anyUntaxed = items.some(it => !it.isTaxed);
    const nextItems = items.map(it => ({ ...it, isTaxed: anyUntaxed, amountStr: undefined }));
    const parsedTot = parseFloat(totalAmount) || 0;
    const { updatedItems } = recalculateItemsWithTax(nextItems, parsedTot);
    setItems(updatedItems);
  };

  const splitSummary = useMemo(() => {
    const summary: Record<string, { subtotal: number; taxedSubtotal: number; taxShare: number; total: number }> = {};
    let hasAnyAssignee = false;

    items.forEach(it => {
      const rawAssignee = it.assignedTo?.trim();
      if (rawAssignee) hasAnyAssignee = true;
      const assigneeStr = rawAssignee || 'Me';
      const base = it.rawAmount ?? it.amount ?? 0;
      const tax = it.taxAmount ?? 0;
      const finalAmt = it.amount ?? base;

      const assignees = assigneeStr.split(',').map(s => s.trim()).filter(Boolean);
      const shareCount = assignees.length > 0 ? assignees.length : 1;

      assignees.forEach(person => {
        if (!summary[person]) {
          summary[person] = { subtotal: 0, taxedSubtotal: 0, taxShare: 0, total: 0 };
        }
        summary[person].subtotal = Math.round((summary[person].subtotal + base / shareCount) * 100) / 100;
        summary[person].taxShare = Math.round((summary[person].taxShare + tax / shareCount) * 100) / 100;
        summary[person].total = Math.round((summary[person].total + finalAmt / shareCount) * 100) / 100;
        if (it.isTaxed) {
          summary[person].taxedSubtotal = Math.round((summary[person].taxedSubtotal + base / shareCount) * 100) / 100;
        }
      });
    });

    if (!hasAnyAssignee && Object.keys(summary).length <= 1) {
      return {};
    }

    return summary;
  }, [items]);

  const handleApply = (autoSubmit: boolean = true) => {
    const parsedAmount = parseFloat(totalAmount) || 0;
    if (parsedAmount <= 0) {
      if (Platform.OS === 'web') {
        alert('Please enter a valid total amount.');
      } else {
        Alert.alert('Invalid Amount', 'Total amount must be greater than 0.');
      }
      return;
    }

    if (!selectedCardId && cards.length > 0) {
      if (Platform.OS === 'web') {
        alert('Please select a payment card or account.');
      } else {
        Alert.alert('Account Required', 'Please select a card or account to log this expense.');
      }
      return;
    }

    // Generate formatted itemwise details string
    let detailsString = '';
    if (items.length > 0) {
      const itemSummaries = items.map(it => {
        let tag = '';
        if (it.isTaxed && (it.taxAmount || 0) > 0) {
          tag += ` [Tax: +$${(it.taxAmount || 0).toFixed(2)}]`;
        } else if (it.isTaxed) {
          tag += ' [Tax]';
        }
        if (it.assignedTo?.trim()) tag += ` @${it.assignedTo.trim()}`;
        return `${it.description} ($${Number(it.amount).toFixed(2)}${tag})`;
      });
      detailsString = `Items: ${itemSummaries.join(', ')}`;

      if (calculatedTotalTax > 0) {
        detailsString += ` | Tax: $${calculatedTotalTax.toFixed(2)}`;
      }

      const assignedPeople = Object.keys(splitSummary);
      if (assignedPeople.length > 0) {
        const splitText = assignedPeople
          .map(p => `${p}: $${splitSummary[p].total.toFixed(2)}`)
          .join(', ');
        detailsString += ` | Split: ${splitText}`;
      }

      if (recognitionResult?.cardUsage?.detectedCardText) {
        detailsString += ` | Paid via ${recognitionResult.cardUsage.detectedCardText}`;
      }
    }

    // Determine primary category
    let dominantCategory = 'Grocery';
    if (items.length > 0 && items[0].category) {
      dominantCategory = items[0].category;
    }

    const finalItems: ReceiptItem[] = items.map(it => ({
      ...it,
      amount: parseFloat(String(it.amount)) || 0,
    }));

    onApplyReceipt({
      selectedCardId,
      amount: parsedAmount,
      description: merchant.trim() || 'Store Purchase',
      date: date.trim() || new Date().toISOString().split('T')[0],
      items: finalItems,
      details: detailsString,
      category: dominantCategory,
      autoSubmit,
    });

    handleClose();
  };

  const selectedCard = cards.find(c => c.id === selectedCardId);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View>
              <View style={styles.titleRow}>
                <Text style={styles.modalTitle}>Scan Receipt</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            {/* Step 1: Capture / Selection Mode */}
            {!recognitionResult && !isProcessing && (
              <View style={styles.captureSection}>
                <View style={styles.actionButtonsRow}>
                  <TouchableOpacity style={styles.captureBtnPrimary} onPress={handleCameraCapture}>
                    <Text style={styles.captureBtnIcon}>📸</Text>
                    <Text style={styles.captureBtnTextPrimary}>Take Photo</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.captureBtnSecondary} onPress={handleGalleryPick}>
                    <Text style={styles.captureBtnIcon}>🖼️</Text>
                    <Text style={styles.captureBtnTextSecondary}>Upload Image</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Step 2: Processing Animation */}
            {isProcessing && (
              <View style={styles.processingSection}>
                <ActivityIndicator size="large" color="#0284c7" />
                <Text style={styles.processingTitle}>Analyzing Receipt...</Text>
                <Text style={styles.processingStep}>
                  1. Preprocessing image and running OCR
                </Text>
                <Text style={styles.processingStep}>
                  2. Invoking AWS SageMaker Document AI endpoint
                </Text>
                <Text style={styles.processingStep}>
                  3. Extracting card usage, total amount & items
                </Text>
              </View>
            )}

            {/* Step 3: Verification & Results Mode */}
            {recognitionResult && !isProcessing && (
              <View style={styles.resultsContainer}>
                {/* Status Bar */}
                <View style={styles.successBanner}>
                  <Text style={styles.successBannerIcon}>✓</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.successBannerTitle}>Recognition Completed</Text>
                    <Text style={styles.successBannerMeta}>
                      Source: {recognitionResult.source} • Confidence:{' '}
                      {Math.round((recognitionResult.confidence || 0.95) * 100)}%
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.rescanBtn}
                    onPress={() => {
                      setRecognitionResult(null);
                      setCapturedImage(null);
                    }}
                  >
                    <Text style={styles.rescanBtnText}>Re-scan</Text>
                  </TouchableOpacity>
                </View>

                {/* Card Usage Detection Card */}
                <View style={styles.cardUsageBox}>
                  <View style={styles.cardUsageHeader}>
                    <Text style={styles.sectionLabel}>💳 Card Usage Detection</Text>
                    {recognitionResult.cardUsage?.cardType && (
                      <View style={styles.detectedCardTag}>
                        <Text style={styles.detectedCardTagText}>
                          {recognitionResult.cardUsage.cardType}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Detected Card Details & Editable Last 4 */}
                  <View style={styles.detectedCardDetailsRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <Text style={styles.cardDetailText}>
                        Card: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{recognitionResult.cardUsage?.cardType || 'Credit Card'}</Text>
                      </Text>
                      <Text style={{ color: '#cbd5e1' }}>•</Text>
                      <Text style={styles.cardDetailText}>Ending in:</Text>

                      {isEditingLast4 ? (
                        <View style={styles.last4EditRow}>
                          <TextInput
                            style={styles.last4EditInput}
                            value={last4Input}
                            onChangeText={setLast4Input}
                            keyboardType="number-pad"
                            maxLength={4}
                            placeholder="4242"
                            placeholderTextColor="#94a3b8"
                            autoFocus
                          />
                          <TouchableOpacity style={styles.last4SaveBtn} onPress={handleSaveLast4Input}>
                            <Text style={styles.last4SaveBtnText}>Save</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.last4CancelBtn}
                            onPress={() => {
                              setLast4Input(detectedLast4);
                              setIsEditingLast4(false);
                            }}
                          >
                            <Text style={styles.last4CancelBtnText}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.last4BadgeBtn}
                          onPress={() => setIsEditingLast4(true)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.last4BadgeText}>
                            {detectedLast4 ? `•••• ${detectedLast4}` : 'None detected'}
                          </Text>
                          <Text style={styles.last4EditIcon}>✏️</Text>
                        </TouchableOpacity>
                      )}

                      {recognitionResult.cardUsage?.authCode && (
                        <>
                          <Text style={{ color: '#cbd5e1' }}>•</Text>
                          <Text style={styles.authCodeText}>
                            Auth: {recognitionResult.cardUsage.authCode}
                          </Text>
                        </>
                      )}
                    </View>
                  </View>

                  {/* Linked / Unlinked Status & In-Window Linking */}
                  {detectedLast4 && detectedLast4 !== '0000' && (
                    <View style={{ marginTop: 8 }}>
                      {isCardLinked ? (
                        <View style={styles.matchedCardBanner}>
                          <Text style={styles.matchedCardIcon}>✅</Text>
                          <Text style={styles.matchedCardText}>
                            Auto-matched to <Text style={{ fontWeight: '700' }}>{matchedCardByLast4?.name}</Text> (•••• {detectedLast4})
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.unlinkedCardBanner}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ fontSize: 13 }}>⚠️</Text>
                            <Text style={styles.unlinkedCardTitle}>
                              Card ending in {detectedLast4} is not registered yet.
                            </Text>
                          </View>
                          <Text style={styles.unlinkedCardSub}>
                            Link this number to an existing card or create a new card so future scans match automatically.
                          </Text>
                          <View style={styles.unlinkedActionsRow}>
                            {selectedCard && (
                              <TouchableOpacity
                                style={styles.linkCardBtn}
                                onPress={handleLinkToSelectedCard}
                                activeOpacity={0.8}
                              >
                                <Text style={styles.linkCardBtnText}>
                                  🔗 Link {detectedLast4} to "{selectedCard.name}"
                                </Text>
                              </TouchableOpacity>
                            )}
                            <TouchableOpacity
                              style={styles.addNewCardInlineBtn}
                              onPress={() => setShowAddCardInline(true)}
                              activeOpacity={0.8}
                            >
                              <Text style={styles.addNewCardInlineBtnText}>+ Add New Card</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  )}

                  {linkedSuccessMsg.length > 0 && (
                    <View style={styles.linkedSuccessBanner}>
                      <Text style={styles.linkedSuccessText}>✓ {linkedSuccessMsg}</Text>
                    </View>
                  )}

                  {/* Inline Add New Card Form */}
                  {showAddCardInline && (
                    <View style={styles.inlineAddCardBox}>
                      <View style={styles.inlineAddCardHeader}>
                        <Text style={styles.inlineAddCardTitle}>💳 Add New Account / Card</Text>
                        <TouchableOpacity onPress={() => setShowAddCardInline(false)}>
                          <Text style={{ fontSize: 14, color: '#64748b', fontWeight: 'bold' }}>✕</Text>
                        </TouchableOpacity>
                      </View>
                      <TextInput
                        style={styles.inlineCardNameInput}
                        placeholder="Account / Card Name (e.g. Chase Freedom)"
                        placeholderTextColor="#94a3b8"
                        value={newCardName}
                        onChangeText={setNewCardName}
                        autoFocus
                      />
                      <View style={styles.inlineCardTypeRow}>
                        <TouchableOpacity
                          style={[
                            styles.inlineTypeChip,
                            newCardType === 'credit' && styles.inlineTypeChipActive,
                          ]}
                          onPress={() => setNewCardType('credit')}
                        >
                          <Text style={[styles.inlineTypeChipText, newCardType === 'credit' && styles.inlineTypeChipTextActive]}>
                            💳 Credit Card
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.inlineTypeChip,
                            newCardType === 'checking' && styles.inlineTypeChipActive,
                          ]}
                          onPress={() => setNewCardType('checking')}
                        >
                          <Text style={[styles.inlineTypeChipText, newCardType === 'checking' && styles.inlineTypeChipTextActive]}>
                            🏛️ Checking / Debit
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.inlineCardLast4Info}>
                        <Text style={{ fontSize: 12, color: '#64748b' }}>
                          Card Last 4: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{detectedLast4 || '0000'}</Text>
                        </Text>
                      </View>
                      <View style={styles.inlineAddCardFooter}>
                        <TouchableOpacity style={styles.inlineCancelBtn} onPress={() => setShowAddCardInline(false)}>
                          <Text style={styles.inlineCancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.inlineSaveBtn} onPress={handleCreateNewCardInline}>
                          <Text style={styles.inlineSaveBtnText}>Save & Select Card</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Account Selector */}
                  <View style={styles.accountSelectorBox}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={styles.accountSelectorLabel}>Log to Account / Card:</Text>
                      <TouchableOpacity onPress={() => setShowAddCardInline(true)}>
                        <Text style={styles.inlineAddCardLink}>+ New Card</Text>
                      </TouchableOpacity>
                    </View>
                    {Platform.OS === 'web' ? (
                      <select
                        style={{
                          width: '100%',
                          padding: '10px',
                          borderRadius: '8px',
                          borderColor: '#cbd5e1',
                          backgroundColor: '#ffffff',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: '#0f172a',
                        }}
                        value={selectedCardId}
                        onChange={(e: any) => setSelectedCardId(e.target.value)}
                      >
                        {cards.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.last4 && c.last4 !== '0000' ? `(•••• ${c.last4})` : ''} {c.isChecking ? '(Checking)' : c.isSaving ? '(Saving)' : '(Credit Card)'}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <TouchableOpacity
                        style={styles.nativeCardSelector}
                        onPress={() => setShowCardPickerModal(true)}
                        activeOpacity={0.7}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.nativeCardSelectorName}>
                            {selectedCard?.name || 'Select an account'}
                          </Text>
                          <Text style={styles.nativeCardSelectorSub}>
                            {selectedCard?.last4 && selectedCard.last4 !== '0000'
                              ? `•••• ${selectedCard.last4}  •  `
                              : ''}
                            {selectedCard?.isChecking ? 'Checking' : selectedCard?.isSaving ? 'Saving' : 'Credit Card'}
                          </Text>
                        </View>
                        <Text style={styles.nativeCardSelectorArrow}>▾</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Financial Summary (Total, Subtotal, Tax) */}
                <View style={styles.summaryBox}>
                  <View style={styles.formRow}>
                    <View style={{ flex: 2, marginRight: 10 }}>
                      <Text style={styles.inputLabel}>Merchant / Store</Text>
                      <TextInput
                        style={styles.textInput}
                        value={merchant}
                        onChangeText={setMerchant}
                        placeholder="Merchant Name"
                      />
                    </View>
                    <View style={{ flex: 1.5 }}>
                      <Text style={styles.inputLabel}>Date (YYYY-MM-DD)</Text>
                      <TextInput
                        style={styles.textInput}
                        value={date}
                        onChangeText={setDate}
                        placeholder="YYYY-MM-DD"
                      />
                    </View>
                  </View>

                  <View style={styles.totalRow}>
                    <View>
                      <Text style={styles.totalLabel}>Total Amount Due</Text>
                    </View>
                    <View style={styles.totalInputWrapper}>
                      <Text style={styles.currencyPrefix}>$</Text>
                      <TextInput
                        style={styles.totalTextInput}
                        value={totalAmount}
                        onChangeText={handleTotalAmountChange}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>
                </View>

                {/* Itemwise Breakdown Section */}
                <View style={styles.itemsSection}>
                  <View style={styles.itemsHeaderRow}>
                    <Text style={styles.sectionLabel}>
                      📋 Itemwise Breakdown ({items.length} items)
                    </Text>
                    <TouchableOpacity style={styles.addItemBtn} onPress={handleAddItem}>
                      <Text style={styles.addItemBtnText}>+ Add Item</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Quick Action Chips */}
                  {items.length > 0 && (
                    <View style={styles.quickAssignRow}>
                      <Text style={styles.quickAssignLabel}>Quick Actions:</Text>
                      <TouchableOpacity
                        style={styles.quickAssignChip}
                        onPress={() => setItems(items.map(it => ({ ...it, assignedTo: 'Me' })))}
                      >
                        <Text style={styles.quickAssignChipText}>All Me</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.quickAssignChip}
                        onPress={() => setItems(items.map(it => ({ ...it, assignedTo: 'Split' })))}
                      >
                        <Text style={styles.quickAssignChipText}>All Split</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.quickAssignChip}
                        onPress={handleToggleAllTax}
                      >
                        <Text style={styles.quickAssignChipText}>Toggle All Tax</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Table Column Header (Desktop) */}
                  {!isCompactScreen && items.length > 0 && (
                    <View style={styles.itemsTableHeader}>
                      <Text style={[styles.columnHeader, { flex: 1 }]}>Item Description</Text>
                      <Text style={[styles.columnHeader, { width: 90, textAlign: 'right' }]}>Amount</Text>
                      <Text style={[styles.columnHeader, { width: 85, textAlign: 'center' }]}>Tax</Text>
                      <Text style={[styles.columnHeader, { width: 90, textAlign: 'left', paddingLeft: 4 }]}>Assigned To</Text>
                      <View style={{ width: 32 }} />
                    </View>
                  )}

                  {items.map((item, idx) =>
                    isCompactScreen ? (
                      <View key={item.id || idx} style={styles.compactItemCard}>
                        {/* Row 1: Full-width Description */}
                        <TextInput
                          style={styles.compactDescInput}
                          textAlign="left"
                          value={item.description}
                          onChangeText={val => handleItemChange(idx, 'description', val)}
                          placeholder="Item description"
                          placeholderTextColor="#94a3b8"
                        />

                        {/* Row 2: Amount, Tax, Assignee, Delete */}
                        <View style={styles.compactRowBottom}>
                          <View style={styles.itemAmountWrapper}>
                            <Text style={styles.smallCurrency}>$</Text>
                            <TextInput
                              style={styles.itemAmountInput}
                              value={
                                item.amountStr !== undefined
                                  ? item.amountStr
                                  : typeof item.amount === 'number'
                                  ? item.amount.toFixed(2)
                                  : String(item.amount ?? '')
                              }
                              onChangeText={val => handleItemChange(idx, 'amount', val)}
                              onBlur={() => handleItemBlur(idx)}
                              keyboardType="decimal-pad"
                            />
                          </View>

                          <TouchableOpacity
                            style={[
                              styles.taxToggleBtn,
                              item.isTaxed ? styles.taxToggleBtnActive : styles.taxToggleBtnInactive,
                            ]}
                            onPress={() => handleItemChange(idx, 'isTaxed', !item.isTaxed)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.taxCheckmark, item.isTaxed ? styles.taxTextActive : styles.taxTextInactive]}>
                              {item.isTaxed
                                ? item.taxAmount && item.taxAmount > 0
                                  ? `☑ +$${item.taxAmount.toFixed(2)}`
                                  : '☑ Taxed'
                                : '☐ Tax'}
                            </Text>
                          </TouchableOpacity>

                          <View style={[styles.assigneeWrapper, { flex: 1, width: undefined }]}>
                            <Text style={styles.assigneeIcon}>👤</Text>
                            <TextInput
                              style={styles.assigneeInput}
                              textAlign="left"
                              value={item.assignedTo ?? ''}
                              onChangeText={val => handleItemChange(idx, 'assignedTo', val)}
                              placeholder="Me"
                              placeholderTextColor="#94a3b8"
                            />
                          </View>

                          <TouchableOpacity
                            style={styles.deleteItemBtn}
                            onPress={() => handleDeleteItem(idx)}
                          >
                            <Text style={styles.deleteItemBtnText}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <View key={item.id || idx} style={styles.itemRow}>
                        {/* 1. Description */}
                        <TextInput
                          style={styles.itemDescInput}
                          textAlign="left"
                          value={item.description}
                          onChangeText={val => handleItemChange(idx, 'description', val)}
                          placeholder="Item description"
                        />

                        {/* 2. Amount */}
                        <View style={styles.itemAmountWrapper}>
                          <Text style={styles.smallCurrency}>$</Text>
                          <TextInput
                            style={styles.itemAmountInput}
                            value={
                              item.amountStr !== undefined
                                ? item.amountStr
                                : typeof item.amount === 'number'
                                ? item.amount.toFixed(2)
                                : String(item.amount ?? '')
                            }
                            onChangeText={val => handleItemChange(idx, 'amount', val)}
                            onBlur={() => handleItemBlur(idx)}
                            keyboardType="decimal-pad"
                          />
                        </View>

                        {/* 3. Tax Checkmark */}
                        <TouchableOpacity
                          style={[
                            styles.taxToggleBtn,
                            item.isTaxed ? styles.taxToggleBtnActive : styles.taxToggleBtnInactive,
                          ]}
                          onPress={() => handleItemChange(idx, 'isTaxed', !item.isTaxed)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.taxCheckmark, item.isTaxed ? styles.taxTextActive : styles.taxTextInactive]}>
                            {item.isTaxed
                              ? item.taxAmount && item.taxAmount > 0
                                ? `☑ +$${item.taxAmount.toFixed(2)}`
                                : '☑ Tax'
                              : '☐ Tax'}
                          </Text>
                        </TouchableOpacity>

                        {/* 4. Assigned To (Splitwise type) */}
                        <View style={styles.assigneeWrapper}>
                          <Text style={styles.assigneeIcon}>👤</Text>
                          <TextInput
                            style={styles.assigneeInput}
                            textAlign="left"
                            value={item.assignedTo ?? ''}
                            onChangeText={val => handleItemChange(idx, 'assignedTo', val)}
                            placeholder="Me"
                            placeholderTextColor="#94a3b8"
                          />
                        </View>

                        {/* 5. Delete Button */}
                        <TouchableOpacity
                          style={styles.deleteItemBtn}
                          onPress={() => handleDeleteItem(idx)}
                        >
                          <Text style={styles.deleteItemBtnText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    )
                  )}

                  {/* Splitwise Summary Card */}
                  {Object.keys(splitSummary).length > 0 && (
                    <View style={styles.splitCard}>
                      <View style={styles.splitCardHeader}>
                        <Text style={styles.splitCardTitle}>👥 Split Summary</Text>
                      </View>
                      <View style={styles.splitList}>
                        {Object.entries(splitSummary).map(([person, data]) => (
                          <View key={person} style={styles.splitRow}>
                            <View style={styles.splitPersonLeft}>
                              <Text style={styles.splitPersonName}>
                                {person === 'Me' ? '👤 Me' : `👤 ${person}`}
                              </Text>
                              <Text style={styles.splitPersonSub}>
                                Items: ${data.subtotal.toFixed(2)}
                                {data.taxShare > 0 ? `  •  Tax: $${data.taxShare.toFixed(2)}` : ''}
                              </Text>
                            </View>
                            <Text style={styles.splitPersonTotal}>
                              ${data.total.toFixed(2)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer Actions */}
          {recognitionResult && !isProcessing && (
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
                <Text style={styles.cancelBtnText}>Discard</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={() => handleApply(true)}>
                <Text style={styles.applyBtnText}>
                  ➕ Log Expense (${parseFloat(totalAmount || '0').toFixed(2)})
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {/* Card Picker Modal for Mobile */}
          <Modal
            visible={showCardPickerModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowCardPickerModal(false)}
          >
            <TouchableOpacity
              style={styles.pickerBackdrop}
              activeOpacity={1}
              onPress={() => setShowCardPickerModal(false)}
            >
              <View style={styles.pickerContainer}>
                <View style={styles.pickerHeader}>
                  <Text style={styles.pickerTitle}>Select Account / Card</Text>
                  <TouchableOpacity onPress={() => setShowCardPickerModal(false)}>
                    <Text style={{ fontSize: 16, color: '#64748b', fontWeight: 'bold' }}>✕</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={{ maxHeight: 300 }}>
                  {cards.map(c => {
                    const isSelected = c.id === selectedCardId;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.pickerItem, isSelected && styles.pickerItemActive]}
                        onPress={() => {
                          setSelectedCardId(c.id);
                          setShowCardPickerModal(false);
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.pickerItemName, isSelected && styles.pickerItemNameActive]}>
                            {c.name}
                          </Text>
                          <Text style={styles.pickerItemSub}>
                            {c.last4 && c.last4 !== '0000' ? `•••• ${c.last4}  •  ` : ''}
                            {c.isChecking ? 'Checking' : c.isSaving ? 'Savings' : 'Credit Card'}
                          </Text>
                        </View>
                        {isSelected && <Text style={styles.pickerItemCheckmark}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <TouchableOpacity
                  style={styles.pickerAddBtn}
                  onPress={() => {
                    setShowCardPickerModal(false);
                    setShowAddCardInline(true);
                  }}
                >
                  <Text style={styles.pickerAddBtnText}>+ Add New Account or Card</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 25,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  aiBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  aiBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  closeBtnText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '700',
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  captureSection: {
    paddingVertical: 8,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  captureBtnPrimary: {
    flex: 1,
    backgroundColor: '#0284c7',
    paddingVertical: 20,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  captureBtnSecondary: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    paddingVertical: 20,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  captureBtnIcon: {
    fontSize: 32,
    marginBottom: 6,
  },
  captureBtnTextPrimary: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  captureBtnTextSecondary: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  captureBtnSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 3,
  },
  processingSection: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  processingTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 16,
    marginBottom: 8,
  },
  processingStep: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  resultsContainer: {
    paddingBottom: 10,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  successBannerIcon: {
    fontSize: 16,
    color: '#16a34a',
    fontWeight: 'bold',
    marginRight: 10,
  },
  successBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  successBannerMeta: {
    fontSize: 11,
    color: '#15803d',
    marginTop: 1,
  },
  rescanBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  rescanBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
  },
  cardUsageBox: {
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#ffedd5',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  cardUsageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#9a3412',
  },
  detectedCardTag: {
    backgroundColor: '#ffedd5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  detectedCardTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#c2410c',
  },
  detectedCardDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardDetailText: {
    fontSize: 13,
    color: '#475569',
  },
  authCodeText: {
    fontSize: 12,
    color: '#64748b',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  last4BadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffedd5',
    borderWidth: 1,
    borderColor: '#fed7aa',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  last4BadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9a3412',
  },
  last4EditIcon: {
    fontSize: 10,
  },
  last4EditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  last4EditInput: {
    height: 28,
    width: 60,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#ea580c',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  last4SaveBtn: {
    backgroundColor: '#ea580c',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  last4SaveBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  last4CancelBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  last4CancelBtnText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: 'bold',
  },
  matchedCardBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  matchedCardIcon: {
    fontSize: 13,
  },
  matchedCardText: {
    fontSize: 12,
    color: '#065f46',
    flex: 1,
  },
  unlinkedCardBanner: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fef3c7',
    borderRadius: 8,
    padding: 10,
    gap: 6,
  },
  unlinkedCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400e',
    flex: 1,
  },
  unlinkedCardSub: {
    fontSize: 11,
    color: '#78350f',
    lineHeight: 15,
  },
  unlinkedActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  linkCardBtn: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  linkCardBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  addNewCardInlineBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d97706',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addNewCardInlineBtnText: {
    color: '#d97706',
    fontSize: 11,
    fontWeight: '700',
  },
  linkedSuccessBanner: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  linkedSuccessText: {
    fontSize: 12,
    color: '#166534',
    fontWeight: '600',
  },
  inlineAddCardBox: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#38bdf8',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    gap: 8,
  },
  inlineAddCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inlineAddCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0369a1',
  },
  inlineCardNameInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#0f172a',
  },
  inlineCardTypeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  inlineTypeChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  inlineTypeChipActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0284c7',
  },
  inlineTypeChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  inlineTypeChipTextActive: {
    color: '#0284c7',
  },
  inlineCardLast4Info: {
    paddingHorizontal: 2,
  },
  inlineAddCardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  inlineCancelBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  inlineCancelBtnText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  inlineSaveBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  inlineSaveBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  inlineAddCardLink: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7',
  },
  nativeCardSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  nativeCardSelectorName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  nativeCardSelectorSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  nativeCardSelectorArrow: {
    fontSize: 16,
    color: '#64748b',
    paddingLeft: 8,
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 4,
  },
  pickerItemActive: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  pickerItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  pickerItemNameActive: {
    color: '#166534',
    fontWeight: '700',
  },
  pickerItemSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  pickerItemCheckmark: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#16a34a',
    marginLeft: 8,
  },
  pickerAddBtn: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#0284c7',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f9ff',
  },
  pickerAddBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284c7',
  },
  accountSelectorBox: {
    marginTop: 6,
  },
  accountSelectorLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  nativeCardBadge: {
    padding: 10,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  nativeCardBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  summaryBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  formRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 10,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  totalSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  totalInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#0284c7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  currencyPrefix: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0284c7',
    marginRight: 4,
  },
  totalTextInput: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    minWidth: 80,
    textAlign: 'right',
  },
  itemsSection: {
    marginBottom: 16,
  },
  itemsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  addItemBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#e0f2fe',
    borderRadius: 6,
  },
  addItemBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0284c7',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  compactItemCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 8,
    marginBottom: 8,
  },
  compactDescInput: {
    width: '100%',
    height: 38,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#0f172a',
    textAlign: 'left',
    marginBottom: 6,
    ...(Platform.OS === 'web'
      ? ({
          outlineStyle: 'none',
          textAlign: 'left',
          direction: 'ltr',
        } as any)
      : {}),
  },
  compactRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactRowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickAssignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  quickAssignLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginRight: 2,
  },
  quickAssignChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  quickAssignChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  itemsTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
    marginBottom: 6,
  },
  columnHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemDescInput: {
    flex: 1,
    height: 38,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#0f172a',
    textAlign: 'left',
    ...(Platform.OS === 'web'
      ? ({
          outlineStyle: 'none',
          textAlign: 'left',
          direction: 'ltr',
        } as any)
      : {}),
  },
  itemAmountWrapper: {
    position: 'relative',
    height: 38,
    width: 90,
    justifyContent: 'center',
  },
  smallCurrency: {
    position: 'absolute',
    left: 8,
    zIndex: 2,
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    ...(Platform.OS === 'web' ? ({ pointerEvents: 'none' } as any) : {}),
  },
  itemAmountInput: {
    width: 90,
    height: 38,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    paddingLeft: 22,
    paddingRight: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
    textAlign: 'right',
    ...(Platform.OS === 'web'
      ? ({
          outlineStyle: 'none',
          boxSizing: 'border-box',
        } as any)
      : {}),
  },
  taxToggleBtn: {
    width: 85,
    height: 38,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taxToggleBtnActive: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  taxToggleBtnInactive: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  taxCheckmark: {
    fontSize: 11,
  },
  taxTextActive: {
    color: '#16a34a',
    fontWeight: '700',
  },
  taxTextInactive: {
    color: '#94a3b8',
    fontWeight: '500',
  },
  assigneeWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    paddingHorizontal: 6,
    height: 38,
    width: 90,
    overflow: 'hidden',
  },
  assigneeIcon: {
    fontSize: 12,
    marginRight: 4,
    color: '#64748b',
  },
  assigneeInput: {
    flex: 1,
    fontSize: 12,
    color: '#0f172a',
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web'
      ? ({
          outlineStyle: 'none',
          minWidth: 0,
        } as any)
      : {}),
  },
  deleteItemBtn: {
    width: 32,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: '#fee2e2',
  },
  deleteItemBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#ef4444',
  },
  splitCard: {
    marginTop: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  splitCardHeader: {
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 6,
  },
  splitCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  splitCardSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  splitList: {
    gap: 6,
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  splitPersonLeft: {
    flex: 1,
  },
  splitPersonName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  splitPersonSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  splitPersonTotal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0284c7',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  applyBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#10b981',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  applyBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
});
