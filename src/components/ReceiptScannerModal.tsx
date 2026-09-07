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
  }) => void;
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

  const resetScanner = () => {
    setCapturedImage(null);
    setIsProcessing(false);
    setRecognitionResult(null);
    setMerchant('');
    setDate('');
    setTotalAmount('');
    setItems([]);
    setSelectedCardId('');
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
      (sum, it) => sum + (typeof it.amount === 'number' ? it.amount : parseFloat(String(it.amount)) || 0),
      0
    );
    const hasTax = Boolean((result.tax && result.tax > 0) || (totalVal > rawSubtotal + 0.005));

    const initialRawItems: ReceiptItem[] = (result.items || []).map(it => {
      const amt = typeof it.amount === 'number' ? Number(it.amount.toFixed(2)) : parseFloat(String(it.amount)) || 0;
      return {
        ...it,
        rawAmount: amt,
        amount: amt,
        isTaxed: it.isTaxed !== undefined ? it.isTaxed : hasTax,
        assignedTo: it.assignedTo ?? '',
        taxAmount: 0,
      };
    });

    const { updatedItems } = recalculateItemsWithTax(initialRawItems, totalVal);
    setItems(updatedItems);
    setTotalAmount(totalVal > 0 ? totalVal.toFixed(2) : '0.00');

    // Match card automatically
    const matched = matchCardToAccount(result.cardUsage, cards);
    if (matched) {
      setSelectedCardId(matched.id);
    } else if (cards.length > 0) {
      setSelectedCardId(cards[0].id);
    }
  };

  const handleCameraCapture = async () => {
    const img = await captureImageWithCamera();
    if (img) {
      handleImageSelected(img);
    }
  };

  const handleGalleryPick = async () => {
    const img = await pickImageFromGallery();
    if (img) {
      handleImageSelected(img);
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
      const { updatedItems } = recalculateItemsWithTax(nextItems, parsedTot);
      updatedItems[index].amountStr = valStr;
      setItems(updatedItems);
      return;
    }

    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const handleItemBlur = (index: number) => {
    setItems(prev =>
      prev.map((it, i) => (i === index ? { ...it, amountStr: undefined } : it))
    );
  };

  const handleDeleteItem = (index: number) => {
    const remaining = items.filter((_, i) => i !== index);
    const parsedTot = parseFloat(totalAmount) || 0;
    const { updatedItems } = recalculateItemsWithTax(remaining, parsedTot);
    setItems(updatedItems);
  };

  const handleAddItem = () => {
    const newItem: ReceiptItem = {
      id: `custom-${Date.now()}`,
      description: 'New Item',
      rawAmount: 0.0,
      amount: 0.0,
      quantity: 1,
      category: 'Others',
      isTaxed: false,
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

  const handleApply = () => {
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
      description: merchant.trim() || 'Store Receipt',
      date: date.trim() || new Date().toISOString().split('T')[0],
      items: finalItems,
      details: detailsString,
      category: dominantCategory,
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

                  <View style={styles.detectedCardDetailsRow}>
                    <Text style={styles.cardDetailText}>
                      Detected:{' '}
                      <Text style={{ fontWeight: '700', color: '#0f172a' }}>
                        {recognitionResult.cardUsage?.detectedCardText || 'Credit Card'}
                      </Text>
                    </Text>
                    {recognitionResult.cardUsage?.authCode && (
                      <Text style={styles.authCodeText}>
                        Auth: {recognitionResult.cardUsage.authCode}
                      </Text>
                    )}
                  </View>

                  {/* Account Selector */}
                  <View style={styles.accountSelectorBox}>
                    <Text style={styles.accountSelectorLabel}>Log to Account / Card:</Text>
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
                            {c.name} {c.isChecking ? '(Checking)' : c.isSaving ? '(Saving)' : '(Credit Card)'}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <View style={styles.nativeCardBadge}>
                        <Text style={styles.nativeCardBadgeText}>
                          {selectedCard?.name || 'Selected Card'}
                        </Text>
                      </View>
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
                      <Text style={styles.totalSub}>
                        {`ST (Items): $${baseSubtotal.toFixed(2)}  •  Tax (T-ST): $${calculatedTotalTax.toFixed(2)}  •  ${taxedCount} taxed`}
                      </Text>
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
                      <Text style={[styles.columnHeader, { width: 85, textAlign: 'right' }]}>Price</Text>
                      <Text style={[styles.columnHeader, { width: 74, textAlign: 'center' }]}>Tax</Text>
                      <Text style={[styles.columnHeader, { width: 68, textAlign: 'right' }]}>Total</Text>
                      <Text style={[styles.columnHeader, { width: 95, textAlign: 'left', paddingLeft: 4 }]}>Assigned To</Text>
                      <View style={{ width: 32 }} />
                    </View>
                  )}

                  {items.map((item, idx) =>
                    isCompactScreen ? (
                      <View key={item.id || idx} style={styles.compactItemCard}>
                        <View style={styles.compactRowTop}>
                          <TextInput
                            style={styles.itemDescInput}
                            value={item.description}
                            onChangeText={val => handleItemChange(idx, 'description', val)}
                            placeholder="Item description"
                          />
                          <View style={styles.itemAmountWrapper}>
                            <Text style={styles.smallCurrency}>$</Text>
                            <TextInput
                              style={styles.itemAmountInput}
                              value={
                                item.amountStr !== undefined
                                  ? item.amountStr
                                  : typeof item.rawAmount === 'number'
                                  ? item.rawAmount.toFixed(2)
                                  : typeof item.amount === 'number'
                                  ? item.amount.toFixed(2)
                                  : ''
                              }
                              onChangeText={val => handleItemChange(idx, 'amount', val)}
                              onBlur={() => handleItemBlur(idx)}
                              keyboardType="decimal-pad"
                            />
                          </View>
                          <TouchableOpacity
                            style={styles.deleteItemBtn}
                            onPress={() => handleDeleteItem(idx)}
                          >
                            <Text style={styles.deleteItemBtnText}>✕</Text>
                          </TouchableOpacity>
                        </View>
                        <View style={styles.compactRowBottom}>
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
                          <View style={styles.compactTotalBadge}>
                            <Text style={styles.compactTotalText}>
                              ${(item.amount ?? item.rawAmount ?? 0).toFixed(2)}
                            </Text>
                          </View>
                          <View style={[styles.assigneeWrapper, { flex: 1 }]}>
                            <Text style={styles.assigneeIcon}>👤</Text>
                            <TextInput
                              style={styles.assigneeInput}
                              value={item.assignedTo ?? ''}
                              onChangeText={val => handleItemChange(idx, 'assignedTo', val)}
                              placeholder="Assigned to (e.g. Me, Alex)"
                              placeholderTextColor="#94a3b8"
                            />
                          </View>
                        </View>
                      </View>
                    ) : (
                      <View key={item.id || idx} style={styles.itemRow}>
                        {/* 1. Description */}
                        <TextInput
                          style={styles.itemDescInput}
                          value={item.description}
                          onChangeText={val => handleItemChange(idx, 'description', val)}
                          placeholder="Item description"
                        />

                        {/* 2. Base Price */}
                        <View style={styles.itemAmountWrapper}>
                          <Text style={styles.smallCurrency}>$</Text>
                          <TextInput
                            style={styles.itemAmountInput}
                            value={
                              item.amountStr !== undefined
                                ? item.amountStr
                                : typeof item.rawAmount === 'number'
                                ? item.rawAmount.toFixed(2)
                                : typeof item.amount === 'number'
                                ? item.amount.toFixed(2)
                                : ''
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

                        {/* 4. Total Amount Badge */}
                        <View style={styles.itemTotalBadge}>
                          <Text style={styles.itemTotalText}>
                            ${(item.amount ?? item.rawAmount ?? 0).toFixed(2)}
                          </Text>
                        </View>

                        {/* 5. Assigned To (Splitwise type) */}
                        <View style={styles.assigneeWrapper}>
                          <Text style={styles.assigneeIcon}>👤</Text>
                          <TextInput
                            style={styles.assigneeInput}
                            value={item.assignedTo ?? ''}
                            onChangeText={val => handleItemChange(idx, 'assignedTo', val)}
                            placeholder="Me"
                            placeholderTextColor="#94a3b8"
                          />
                        </View>

                        {/* 6. Delete Button */}
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
              <TouchableOpacity style={styles.applyBtn} onPress={handleApply}>
                <Text style={styles.applyBtnText}>
                  Apply to Log Entry (${parseFloat(totalAmount || '0').toFixed(2)})
                </Text>
              </TouchableOpacity>
            </View>
          )}
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
  accountSelectorBox: {
    marginTop: 6,
  },
  accountSelectorLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
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
    gap: 6,
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
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  itemAmountWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    paddingLeft: 6,
    paddingRight: 6,
    height: 38,
    width: 85,
    overflow: 'hidden',
  },
  smallCurrency: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    marginRight: 2,
  },
  itemAmountInput: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
    flex: 1,
    minWidth: 0,
    width: 0,
    textAlign: 'right',
    paddingVertical: 0,
    paddingRight: 2,
    paddingLeft: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web'
      ? ({
          outlineStyle: 'none',
          minWidth: 0,
          width: '100%',
          boxSizing: 'border-box',
        } as any)
      : {}),
  },
  taxToggleBtn: {
    width: 74,
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
  itemTotalBadge: {
    width: 68,
    height: 38,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 4,
  },
  itemTotalText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  compactTotalBadge: {
    paddingHorizontal: 8,
    height: 38,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactTotalText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  assigneeWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    paddingLeft: 6,
    paddingRight: 6,
    height: 38,
    width: 95,
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
    minWidth: 0,
    width: 0,
    ...(Platform.OS === 'web'
      ? ({
          outlineStyle: 'none',
          minWidth: 0,
          width: '100%',
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
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  cancelBtn: {
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  applyBtn: {
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#10b981',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  applyBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});
