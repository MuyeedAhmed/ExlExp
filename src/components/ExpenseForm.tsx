import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  FlatList,
  Alert,
  Platform,
  DimensionValue,
} from 'react-native';
import { Expense, CreditCard } from '../types';

interface ExpenseFormProps {
  cards: CreditCard[];
  expenses: Expense[];
  onSubmit: (
    expense:
      | (Omit<Expense, 'id'> & { id?: string })
      | (Omit<Expense, 'id'> & { id?: string })[]
  ) => void;
  editingExpense?: Expense | null;
  onCancelEditing?: () => void;
}

const parseZelleDetails = (detailsStr: string) => {
  if (!detailsStr) return null;
  const match = detailsStr.match(/^Zelle (To|From) (.+?) \((.*?)\)$/);
  if (match) {
    return {
      type: match[1] as 'To' | 'From',
      name: match[2],
      details: match[3],
    };
  }
  return null;
};

export const ExpenseForm: React.FC<ExpenseFormProps> = ({
  cards,
  expenses,
  onSubmit,
  editingExpense,
  onCancelEditing,
}) => {
  const [logType, setLogType] = useState<'transaction' | 'transfer'>('transaction');

  // Common Form States
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');

  // Transaction States (Standard Card/Account spends)
  const [selectedCardId, setSelectedCardId] = useState('');
  const [description, setDescription] = useState('');

  // Checking/Saving specific states
  const [fromTo, setFromTo] = useState('');
  const [details, setDetails] = useState('');
  const [isZelle, setIsZelle] = useState(false);
  const [fromOrTo, setFromOrTo] = useState<'To' | 'From'>('To');
  const [zelleName, setZelleName] = useState('');
  const [zelleDetails, setZelleDetails] = useState('');

  // Credit Card specific states
  const [isFee, setIsFee] = useState(false);
  const [isReward, setIsReward] = useState(false);
  const [rewardType, setRewardType] = useState<'cashback' | 'other'>('cashback');
  const [rewardValue, setRewardValue] = useState('');

  // Transfer States (Account -> Account)
  const [selectedSourceCardId, setSelectedSourceCardId] = useState('');
  const [selectedTargetCardId, setSelectedTargetCardId] = useState('');
  const [transferDetails, setTransferDetails] = useState('');

  // Modals Visibility
  const [cardModalVisible, setCardModalVisible] = useState(false);
  const [sourceModalVisible, setSourceModalVisible] = useState(false);
  const [targetModalVisible, setTargetModalVisible] = useState(false);

  // Helper for dates formatted as YYYY-MM-DD
  const getTodayString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getYesterdayString = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const isCheckingSelected = useMemo(() => {
    const card = cards.find(c => c.id === selectedCardId);
    return !!(card?.isChecking || card?.isSaving);
  }, [cards, selectedCardId]);

  // Sync state when editing an existing transaction or transfer
  useEffect(() => {
    if (editingExpense) {
      setDate(editingExpense.date);

      if (editingExpense.transferLinkId) {
        // We are editing a linked transfer
        setLogType('transfer');
        setTransferDetails(editingExpense.details || '');
        setAmount(Math.abs(editingExpense.amount).toString());

        // Find the other linked transaction in expenses
        const linked = expenses.find(
          e => e.transferLinkId === editingExpense.transferLinkId && e.id !== editingExpense.id
        );

        let sourceId = '';
        let targetId = '';

        if (linked) {
          const exp1Card = cards.find(c => c.id === editingExpense.creditCardId);
          const exp2Card = cards.find(c => c.id === linked.creditCardId);

          if (exp1Card && exp2Card) {
            const exp1IsDeposit = exp1Card.isChecking || exp1Card.isSaving;
            const exp2IsDeposit = exp2Card.isChecking || exp2Card.isSaving;

            if (exp1IsDeposit && !exp2IsDeposit) {
              sourceId = editingExpense.creditCardId;
              targetId = linked.creditCardId;
            } else if (!exp1IsDeposit && exp2IsDeposit) {
              sourceId = linked.creditCardId;
              targetId = editingExpense.creditCardId;
            } else {
              // Both are deposit accounts or both are credit cards
              // The one with negative amount is the source (money went out)
              if (editingExpense.amount < 0) {
                sourceId = editingExpense.creditCardId;
                targetId = linked.creditCardId;
              } else {
                sourceId = linked.creditCardId;
                targetId = editingExpense.creditCardId;
              }
            }
          }
        } else {
          sourceId = editingExpense.creditCardId;
          targetId = cards.find(c => c.id !== sourceId)?.id || '';
        }

        setSelectedSourceCardId(sourceId);
        setSelectedTargetCardId(targetId);
      } else {
        // We are editing a standard transaction
        setLogType('transaction');
        setSelectedCardId(editingExpense.creditCardId);
        setDescription(editingExpense.description);
        setIsFee(!!editingExpense.isFee);
        setIsReward(!!editingExpense.isReward);
        setRewardType(editingExpense.rewardType || 'cashback');
        setRewardValue(editingExpense.rewardValue ? editingExpense.rewardValue.toString() : '');

        const card = cards.find(c => c.id === editingExpense.creditCardId);
        const isDepositAcc = !!(card?.isChecking || card?.isSaving);

        if (isDepositAcc) {
          setAmount(Math.abs(editingExpense.amount).toString());
          setFromOrTo(editingExpense.amount >= 0 ? 'From' : 'To');
          setFromTo(editingExpense.fromTo || editingExpense.description || '');
          const zelleInfo = parseZelleDetails(editingExpense.details || '');
          if (zelleInfo) {
            setIsZelle(true);
            setZelleName(zelleInfo.name);
            setZelleDetails(zelleInfo.details);
            setDetails('');
          } else {
            setIsZelle(false);
            setDetails(editingExpense.details || '');
            setZelleName('');
            setZelleDetails('');
          }
        } else {
          setAmount(Math.abs(editingExpense.amount).toString());
          setFromOrTo('To');
          setFromTo('');
          setDetails('');
          setIsZelle(false);
          setZelleName('');
          setZelleDetails('');
        }
      }
    } else {
      resetForm();
    }
  }, [editingExpense, cards]);

  // Clear name fields if Zelle is enabled
  useEffect(() => {
    if (isZelle) {
      setFromTo('');
    }
  }, [isZelle]);

  const resetForm = () => {
    setAmount('');
    setDate(getTodayString());

    const initialCardId = cards[0]?.id || '';
    setSelectedCardId(initialCardId);

    // Transaction resets
    setDescription('');
    setFromTo('');
    setDetails('');
    setIsZelle(false);
    setFromOrTo('To');
    setZelleName('');
    setZelleDetails('');
    setIsFee(false);
    setIsReward(false);
    setRewardType('cashback');
    setRewardValue('');

    // Transfer resets
    const depositAccs = cards.filter(c => c.isChecking || c.isSaving);
    setSelectedSourceCardId(depositAccs[0]?.id || initialCardId);
    setSelectedTargetCardId(cards.find(c => c.id !== depositAccs[0]?.id)?.id || initialCardId);
    setTransferDetails('');
  };

  const handleQuickDateSelect = (type: 'today' | 'yesterday') => {
    if (type === 'today') {
      setDate(getTodayString());
    } else {
      setDate(getYesterdayString());
    }
  };

  const handleSubmit = () => {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      showAlert('Error', 'Please enter a valid date in YYYY-MM-DD format.');
      return;
    }

    const parsedAmount = parseFloat(amount);

    if (logType === 'transfer') {
      // 1. Transfer Submit Validation
      if (!selectedSourceCardId || !selectedTargetCardId) {
        showAlert('Error', 'Please select both source and target accounts.');
        return;
      }
      if (selectedSourceCardId === selectedTargetCardId) {
        showAlert('Error', 'Source and target accounts must be different.');
        return;
      }
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        showAlert('Error', 'Please enter a valid amount greater than 0.');
        return;
      }

      const sourceCard = cards.find(c => c.id === selectedSourceCardId);
      const targetCard = cards.find(c => c.id === selectedTargetCardId);
      const sourceName = sourceCard ? sourceCard.name : 'Unknown';
      const targetName = targetCard ? targetCard.name : 'Unknown';

      // Source Account: withdrawal of money
      const sourceTx: Omit<Expense, 'id'> = {
        creditCardId: selectedSourceCardId,
        amount: -parsedAmount,
        description: `Transfer to ${targetName}`,
        date,
        fromTo: targetName,
        details: transferDetails.trim() || 'Account Transfer',
        isTransfer: true,
      };

      // Target Account: credit payment (for CC) or deposit (for checking/saving)
      const targetIsDeposit = !!(targetCard?.isChecking || targetCard?.isSaving);
      const targetTx: Omit<Expense, 'id'> = {
        creditCardId: selectedTargetCardId,
        amount: targetIsDeposit ? parsedAmount : -parsedAmount, // paying credit card is negative (reduces balance owed)
        description: `Transfer from ${sourceName}`,
        date,
        fromTo: sourceName,
        details: transferDetails.trim() || 'Account Transfer',
        isTransfer: true,
      };

      onSubmit([sourceTx, targetTx]);
      resetForm();
    } else {
      // 2. Transaction Submit Validation
      if (!selectedCardId) {
        showAlert('Error', 'Please select a payment card or checking account.');
        return;
      }

      if (isCheckingSelected) {
        if (isZelle) {
          if (!zelleName.trim()) {
            showAlert('Error', 'Please enter a Zelle name.');
            return;
          }
        } else {
          if (!fromTo.trim()) {
            showAlert('Error', 'Please enter a From/To name.');
            return;
          }
        }
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
          showAlert('Error', 'Please enter a valid amount greater than 0.');
          return;
        }
      } else {
        // Credit Card validation
        if (!description.trim()) {
          showAlert('Error', 'Please enter a description or merchant name.');
          return;
        }

        const isPointsReward = isReward && rewardType === 'other';
        if (isPointsReward) {
          // Points reward can have 0 amount but must have rewards points count
          const pts = parseInt(rewardValue);
          if (isNaN(pts) || pts <= 0) {
            showAlert('Error', 'Please enter a valid points/miles reward value.');
            return;
          }
        } else {
          if (isNaN(parsedAmount) || parsedAmount <= 0) {
            showAlert('Error', 'Please enter a valid amount greater than 0.');
            return;
          }
        }
      }

      // 3. Formulate standard Transaction object
      let finalAmount = parsedAmount;
      let finalDescription = description.trim();
      let finalFromTo: string | undefined = undefined;
      let finalDetails: string | undefined = undefined;
      let finalRewardValue: number | undefined = undefined;

      if (isCheckingSelected) {
        finalAmount = fromOrTo === 'From' ? parsedAmount : -parsedAmount;
        if (isZelle) {
          finalFromTo = '';
          finalDetails = `Zelle ${fromOrTo} ${zelleName.trim()} (${zelleDetails.trim()})`;
          finalDescription = `Zelle ${fromOrTo} ${zelleName.trim()}`;
        } else {
          finalFromTo = fromTo.trim();
          finalDetails = details.trim();
          finalDescription = fromTo.trim();
        }
      } else {
        // Credit Card Spends/Fees/Rewards
        if (isReward) {
          finalRewardValue = parseFloat(rewardValue) || 0;
          if (rewardType === 'cashback') {
            finalAmount = -parsedAmount; // reduces CC statement owed balance
          } else {
            finalAmount = 0; // miles/points doesn't affect CC cash owed balance
          }
        } else if (isFee) {
          finalAmount = parsedAmount;
        } else {
          finalAmount = parsedAmount;
        }
      }

      onSubmit({
        id: editingExpense?.id || undefined,
        description: finalDescription,
        amount: finalAmount,
        creditCardId: selectedCardId,
        date,
        fromTo: finalFromTo,
        details: finalDetails,
        isFee: !isCheckingSelected ? isFee : undefined,
        isReward: !isCheckingSelected ? isReward : undefined,
        rewardType: !isCheckingSelected && isReward ? rewardType : undefined,
        rewardValue: !isCheckingSelected && isReward ? finalRewardValue : undefined,
      });

      resetForm();
    }
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const selectedCard = cards.find(c => c.id === selectedCardId);
  const selectedSourceCard = cards.find(c => c.id === selectedSourceCardId);
  const selectedTargetCard = cards.find(c => c.id === selectedTargetCardId);

  const depositAccounts = cards.filter(c => c.isChecking || c.isSaving);
  const targetAccountsList = cards.filter(c => c.id !== selectedSourceCardId);

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>
          {editingExpense ? 'Edit Log Entry' : 'Log New Entry'}
        </Text>

        {/* Toggle Log Type (Disabled in edit mode to prevent structure mismatch) */}
        {(!editingExpense || editingExpense.isTransfer) && (
          <View style={styles.logTypeToggleRow}>
            <TouchableOpacity
              style={[styles.logTypeBtn, logType === 'transaction' && styles.activeLogTypeBtn]}
              onPress={() => !editingExpense && setLogType('transaction')}
              disabled={!!editingExpense}
            >
              <Text style={[styles.logTypeText, logType === 'transaction' && styles.activeLogTypeText]}>Transaction</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.logTypeBtn, logType === 'transfer' && styles.activeLogTypeBtn]}
              onPress={() => !editingExpense && setLogType('transfer')}
              disabled={!!editingExpense}
            >
              <Text style={[styles.logTypeText, logType === 'transfer' && styles.activeLogTypeText]}>Transfer</Text>
            </TouchableOpacity>
          </View>
        )}

        {logType === 'transfer' ? (
          // ==================== TRANSFER VIEW ====================
          <>
            {/* Source Account Dropdown */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Source Account (Money Out)</Text>
              <TouchableOpacity
                style={styles.selectorButton}
                onPress={() => setSourceModalVisible(true)}
              >
                <Text style={styles.selectorButtonText}>
                  {selectedSourceCard
                    ? selectedSourceCard.name
                    : 'Select Source Account'}
                </Text>
                <Text style={styles.dropdownArrow}>▼</Text>
              </TouchableOpacity>
            </View>

            {/* Target Account Dropdown */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Target Account (Money In / Payment)</Text>
              <TouchableOpacity
                style={styles.selectorButton}
                onPress={() => setTargetModalVisible(true)}
              >
                <Text style={styles.selectorButtonText}>
                  {selectedTargetCard
                    ? selectedTargetCard.name
                    : 'Select Target Account'}
                </Text>
                <Text style={styles.dropdownArrow}>▼</Text>
              </TouchableOpacity>
            </View>

            {/* Amount */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Transfer Amount (USD)</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor="#94a3b8"
                keyboardType="decimal-pad"
              />
            </View>

            {/* Details Description */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Transfer Details</Text>
              <TextInput
                style={styles.input}
                value={transferDetails}
                onChangeText={setTransferDetails}
                placeholder="e.g. Credit Card Payment, Saving Deposit"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </>
        ) : (
          // ==================== STANDARD TRANSACTION VIEW ====================
          <>
            {/* Account Selector */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{isCheckingSelected ? 'Checking/Saving Account' : 'Payment Card'}</Text>
              <TouchableOpacity
                style={styles.selectorButton}
                onPress={() => setCardModalVisible(true)}
              >
                <Text style={styles.selectorButtonText}>
                  {selectedCard
                    ? selectedCard.name
                    : 'Select Card/Account'}
                </Text>
                <Text style={styles.dropdownArrow}>▼</Text>
              </TouchableOpacity>
            </View>

            {/* Checking/Saving Specific From/To Direction */}
            {isCheckingSelected && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Transaction Direction</Text>
                <View style={styles.zelleTypeRow}>
                  <TouchableOpacity
                    style={[styles.zelleTypeBtn, fromOrTo === 'From' && styles.activeZelleTypeBtn]}
                    onPress={() => setFromOrTo('From')}
                  >
                    <Text style={[styles.zelleTypeText, fromOrTo === 'From' && styles.activeZelleTypeText]}>From (Deposit / Income)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.zelleTypeBtn, fromOrTo === 'To' && styles.activeZelleTypeBtn]}
                    onPress={() => setFromOrTo('To')}
                  >
                    <Text style={[styles.zelleTypeText, fromOrTo === 'To' && styles.activeZelleTypeText]}>To (Payment / Expense)</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Option Checkboxes (Credit Card Only) */}
            {!isCheckingSelected && (
              <View style={styles.optionRow}>
                <TouchableOpacity
                  style={[styles.optionBtn, isFee && styles.activeOptionBtn]}
                  onPress={() => {
                    setIsFee(!isFee);
                    setIsReward(false);
                  }}
                >
                  <Text style={[styles.optionBtnText, isFee && styles.activeOptionBtnText]}>Annual Fee</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.optionBtn, isReward && styles.activeOptionBtn]}
                  onPress={() => {
                    setIsReward(!isReward);
                    setIsFee(false);
                  }}
                >
                  <Text style={[styles.optionBtnText, isReward && styles.activeOptionBtnText]}>Reward / Credit</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Reward Sub-options */}
            {!isCheckingSelected && isReward && (
              <View style={styles.zelleDetailsContainer}>
                <Text style={styles.label}>Reward Type</Text>
                <View style={styles.zelleTypeRow}>
                  <TouchableOpacity
                    style={[styles.zelleTypeBtn, rewardType === 'cashback' && styles.activeZelleTypeBtn]}
                    onPress={() => setRewardType('cashback')}
                  >
                    <Text style={[styles.zelleTypeText, rewardType === 'cashback' && styles.activeZelleTypeText]}>Cashback Credit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.zelleTypeBtn, rewardType === 'other' && styles.activeZelleTypeBtn]}
                    onPress={() => setRewardType('other')}
                  >
                    <Text style={[styles.zelleTypeText, rewardType === 'other' && styles.activeZelleTypeText]}>Miles / Points</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.inputGroup, { marginTop: 8 }]}>
                  <Text style={styles.label}>{rewardType === 'cashback' ? 'Cashback Amount (USD)' : 'Miles/Points Earned'}</Text>
                  <TextInput
                    style={styles.input}
                    value={rewardValue}
                    onChangeText={setRewardValue}
                    placeholder={rewardType === 'cashback' ? "0.00" : "e.g. 5000"}
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
            )}

            {/* Description or From/To Name */}
            {!isCheckingSelected ? (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Merchant / Description</Text>
                <TextInput
                  style={styles.input}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="e.g. Starbucks, Walmart, Gas"
                  placeholderTextColor="#94a3b8"
                />
              </View>
            ) : (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>From / To Name</Text>
                <View style={styles.fromToRow}>
                  <TextInput
                    style={[styles.input, styles.fromToInput, isZelle && styles.disabledInput]}
                    value={fromTo}
                    onChangeText={setFromTo}
                    placeholder={isZelle ? "(Cleared for Zelle)" : "e.g. Landlord, Employer, John Doe"}
                    placeholderTextColor="#94a3b8"
                    editable={!isZelle}
                  />
                  <TouchableOpacity
                    style={[styles.zelleToggleBtn, isZelle && styles.activeZelleToggleBtn]}
                    onPress={() => setIsZelle(!isZelle)}
                  >
                    <Text style={[styles.zelleToggleText, isZelle && styles.activeZelleToggleText]}>Zelle</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Amount input (Hidden only for non-cashback rewards, since amount is 0) */}
            {!(logType === 'transaction' && !isCheckingSelected && isReward && rewardType === 'other') && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>
                  {rewardType === 'cashback' && isReward ? 'Cashback Amount to Credit (USD)' : 'Amount (USD)'}
                </Text>
                <TextInput
                  style={styles.input}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor="#94a3b8"
                  keyboardType="decimal-pad"
                />
              </View>
            )}

            {/* Checking-Specific Details or Zelle inputs */}
            {isCheckingSelected && (
              <>
                {!isZelle ? (
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Details (Excel For Column)</Text>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      value={details}
                      onChangeText={setDetails}
                      placeholder="e.g. Monthly rent, utility bill payment"
                      placeholderTextColor="#94a3b8"
                      multiline={true}
                      numberOfLines={2}
                    />
                  </View>
                ) : (
                  <View style={styles.zelleDetailsContainer}>
                    {/* Zelle Name */}
                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Recipient / Sender Name</Text>
                      <TextInput
                        style={styles.input}
                        value={zelleName}
                        onChangeText={setZelleName}
                        placeholder="e.g. Jane Smith"
                        placeholderTextColor="#94a3b8"
                      />
                    </View>

                    {/* Zelle Details */}
                    <View style={styles.inputGroup}>
                      <Text style={styles.label}>Zelle Details</Text>
                      <TextInput
                        style={[styles.input, styles.textArea]}
                        value={zelleDetails}
                        onChangeText={setZelleDetails}
                        placeholder="e.g. Pizza split, concert tickets"
                        placeholderTextColor="#94a3b8"
                        multiline={true}
                        numberOfLines={2}
                      />
                    </View>
                  </View>
                )}
              </>
            )}
          </>
        )}

        {/* Date Selector */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Date</Text>
          <View style={styles.dateRow}>
            <TextInput
              style={[styles.input, styles.dateInput]}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
            />
            <TouchableOpacity
              style={[styles.quickDateButton, date === getTodayString() && styles.activeQuickDate]}
              onPress={() => handleQuickDateSelect('today')}
            >
              <Text style={[styles.quickDateText, date === getTodayString() && styles.activeQuickDateText]}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickDateButton, date === getYesterdayString() && styles.activeQuickDate]}
              onPress={() => handleQuickDateSelect('yesterday')}
            >
              <Text style={[styles.quickDateText, date === getYesterdayString() && styles.activeQuickDateText]}>Yesterday</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          {editingExpense && (
            <TouchableOpacity style={styles.cancelButton} onPress={onCancelEditing}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
            <Text style={styles.submitButtonText}>
              {editingExpense ? 'Update' : 'Add'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Credit Card / Standard Account Modal Picker */}
      <Modal
        visible={cardModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCardModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Account/Card</Text>
            <FlatList
              data={cards}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, selectedCardId === item.id && styles.modalItemSelected]}
                  onPress={() => {
                    setSelectedCardId(item.id);
                    setCardModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalItemText, selectedCardId === item.id && styles.modalItemTextSelected]}>
                    {item.name} ({item.isChecking ? 'Checking' : item.isSaving ? 'Saving' : 'Credit Card'})
                  </Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setCardModalVisible(false)}>
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Source Account Modal Picker */}
      <Modal
        visible={sourceModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSourceModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Source Account</Text>
            <FlatList
              data={depositAccounts}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, selectedSourceCardId === item.id && styles.modalItemSelected]}
                  onPress={() => {
                    setSelectedSourceCardId(item.id);
                    setSourceModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalItemText, selectedSourceCardId === item.id && styles.modalItemTextSelected]}>
                    {item.name} ({item.isSaving ? 'Saving' : 'Checking'})
                  </Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setSourceModalVisible(false)}>
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Target Account Modal Picker */}
      <Modal
        visible={targetModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setTargetModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Target Account</Text>
            <FlatList
              data={targetAccountsList}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, selectedTargetCardId === item.id && styles.modalItemSelected]}
                  onPress={() => {
                    setSelectedTargetCardId(item.id);
                    setTargetModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalItemText, selectedTargetCardId === item.id && styles.modalItemTextSelected]}>
                    {item.name} ({item.isChecking ? 'Checking' : item.isSaving ? 'Saving' : 'Credit Card'})
                  </Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setTargetModalVisible(false)}>
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 0,
    padding: 20,
    margin: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  formTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 16,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  logTypeToggleRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 8,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 12,
  },
  logTypeBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    backgroundColor: '#e2e8f0',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  activeLogTypeBtn: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  logTypeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
  },
  activeLogTypeText: {
    color: '#ffffff',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  selectorButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
  },
  selectorButtonText: {
    fontSize: 14,
    color: '#0f172a',
  },
  dropdownArrow: {
    fontSize: 12,
    color: '#64748b',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateInput: {
    flex: 2,
  },
  quickDateButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    backgroundColor: '#e2e8f0',
    borderRadius: 0,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  activeQuickDate: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  quickDateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  activeQuickDateText: {
    color: '#ffffff',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 0,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  cancelButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  submitButton: {
    flex: 2,
    backgroundColor: '#0f172a',
    borderRadius: 0,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#0f172a',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    padding: 20,
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 16,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  modalItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalItemSelected: {
    backgroundColor: '#f1f5f9',
  },
  modalItemText: {
    fontSize: 14,
    color: '#334155',
  },
  modalItemTextSelected: {
    color: '#0f172a',
    fontWeight: '700',
  },
  modalCloseButton: {
    marginTop: 16,
    backgroundColor: '#f1f5f9',
    borderRadius: 0,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  modalCloseButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  fromToRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fromToInput: {
    flex: 1,
  },
  disabledInput: {
    backgroundColor: '#f1f5f9',
    color: '#94a3b8',
  },
  zelleToggleBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    paddingHorizontal: 16,
    backgroundColor: '#e2e8f0',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  activeZelleToggleBtn: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  zelleToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  activeZelleToggleText: {
    color: '#ffffff',
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  zelleDetailsContainer: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    backgroundColor: '#f8fafc',
    marginBottom: 16,
    gap: 12,
  },
  zelleTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  zelleTypeBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    backgroundColor: '#e2e8f0',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  activeZelleTypeBtn: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  zelleTypeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  activeZelleTypeText: {
    color: '#ffffff',
  },
  optionRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 8,
    marginBottom: 16,
  },
  optionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  activeOptionBtn: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  optionBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  activeOptionBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
});
