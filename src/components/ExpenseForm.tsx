import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Keyboard,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
} from 'react-native';
import { Expense, CreditCard } from '../types';

interface ExpenseFormProps {
  cards: CreditCard[];
  expenses: Expense[];
  onSubmit: (
    expense:
      | (Omit<Expense, 'id'> & { id?: string })
      | (Omit<Expense, 'id'> & { id?: string })[],
    targetAccountCardId?: string,
    stayInLogPage?: boolean
  ) => void;
  editingExpense?: Expense | null;
  onCancelEditing?: () => void;
  onNavigateToSettings?: () => void;
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

const isClosedCard = (c: CreditCard) => {
  const nameLower = c.name.toLowerCase();
  return nameLower.includes('closed') || nameLower.includes('close');
};

const getCardBgColor = (item: CreditCard) => {
  if (item.isChecking) return '#dcfce7'; // Lite green for checking
  if (item.isSaving) return '#15803d'; // Dark green for saving
  if (item.isBrokerage) return '#7c3aed'; // Violet for brokerage
  return '#c2410c'; // Dark orange for Credit Card
};

const getCardTextColor = (item: CreditCard) => {
  if (item.isChecking) return '#14532d'; // Dark green text for lite green bg
  return '#ffffff'; // White text for dark backgrounds
};

const getCardBadgeInfo = (card?: CreditCard) => {
  if (!card) return null;
  if (card.isChecking) return { label: 'Checking', bg: '#dcfce7', text: '#15803d' };
  if (card.isSaving) return { label: 'Saving', bg: '#dcfce7', text: '#166534' };
  if (card.isBrokerage) return { label: 'Brokerage', bg: '#f3e8ff', text: '#7e22ce' };
  return { label: 'Credit Card', bg: '#ffedd5', text: '#c2410c' };
};

const getTodayString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getYesterdayString = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getCardTypeStyles = (card?: CreditCard) => {
  if (!card) {
    return {
      badgeBg: '#f1f5f9',
      badgeText: '#475569',
      border: '#cbd5e1',
      label: 'Account',
      prefix: '',
      optionBg: '#ffffff',
      optionColor: '#0f172a',
    };
  }
  if (card.isChecking) {
    return {
      badgeBg: '#dcfce7',
      badgeText: '#15803d',
      border: '#22c55e',
      label: 'Checking',
      prefix: '🏛️ ',
      optionBg: '#f0fdf4',
      optionColor: '#166534',
    };
  }
  if (card.isSaving) {
    return {
      badgeBg: '#dcfce7',
      badgeText: '#166534',
      border: '#15803d',
      label: 'Saving',
      prefix: '💰 ',
      optionBg: '#dcfce7',
      optionColor: '#14532d',
    };
  }
  if (card.isBrokerage) {
    return {
      badgeBg: '#f3e8ff',
      badgeText: '#7e22ce',
      border: '#a855f7',
      label: 'Brokerage',
      prefix: '📈 ',
      optionBg: '#faf5ff',
      optionColor: '#6b21a8',
    };
  }
  return {
    badgeBg: '#ffedd5',
    badgeText: '#c2410c',
    border: '#ea580c',
    label: 'Credit Card',
    prefix: '💳 ',
    optionBg: '#fff7ed',
    optionColor: '#9a3412',
  };
};

const getWebSelectStyle = (card?: CreditCard): React.CSSProperties => {
  const typeStyles = getCardTypeStyles(card);
  return {
    width: '100%',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#cbd5e1',
    borderLeftWidth: card ? '6px' : '1px',
    borderLeftColor: card ? typeStyles.border : '#cbd5e1',
    borderRadius: '8px',
    padding: '11px 36px 11px 12px',
    fontSize: '14px',
    fontWeight: 600,
    color: card ? typeStyles.optionColor : '#0f172a',
    backgroundColor: '#ffffff',
    fontFamily: 'inherit',
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    boxSizing: 'border-box',
  };
};

const webDateInputStyle: React.CSSProperties = {
  width: '100%',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: '#cbd5e1',
  borderRadius: '8px',
  padding: '10px 14px',
  fontSize: '14px',
  color: '#0f172a',
  backgroundColor: '#ffffff',
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
  cursor: 'pointer',
  textAlign: 'center',
};

const CATEGORIES = [
  'Rent',
  'Utilities',
  'Car Payment',
  'Transportation',
  'Grocery',
  'Eating Out',
  'Necessary Purchases',
  'Luxary Purchases',
  'Others',
  'Salary',
  'Transfer'
];

export const ExpenseForm: React.FC<ExpenseFormProps> = ({
  cards,
  expenses,
  onSubmit,
  editingExpense,
  onCancelEditing,
  onNavigateToSettings,
}) => {
  const [logType, setLogType] = useState<'transaction' | 'transfer'>('transaction');
  const [showToast, setShowToast] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const renderCardBadge = (card?: CreditCard) => {
    const info = getCardBadgeInfo(card);
    if (!info) return null;
    return (
      <View style={[styles.cardBadge, { backgroundColor: info.bg }]}>
        <Text style={[styles.cardBadgeText, { color: info.text }]}>{info.label}</Text>
      </View>
    );
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 150);
  };

  // Common Form States
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(getTodayString());

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

  // Savings specific state
  const [isInterest, setIsInterest] = useState(false);

  // Credit Card specific states
  const [isFee, setIsFee] = useState(false);
  const [isReward, setIsReward] = useState(false);
  const [rewardType, setRewardType] = useState<'cashback' | 'other'>('cashback');
  const [rewardValue, setRewardValue] = useState('');

  // Transfer States (Account -> Account)
  const [selectedSourceCardId, setSelectedSourceCardId] = useState('');
  const [selectedTargetCardId, setSelectedTargetCardId] = useState('');
  const [transferDetails, setTransferDetails] = useState('');
  const [isCcBillPay, setIsCcBillPay] = useState(false);

  // Category States
  const [category, setCategory] = useState('Others');

  // Multiple Log Creation State (stay on log page vs navigate to account)
  const [keepInLogPage, setKeepInLogPage] = useState(false);

  // Modals Visibility
  const [cardModalVisible, setCardModalVisible] = useState(false);
  const [sourceModalVisible, setSourceModalVisible] = useState(false);
  const [targetModalVisible, setTargetModalVisible] = useState(false);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth());

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const openDatePicker = () => {
    if (Platform.OS !== 'web') {
      Keyboard.dismiss();
    }
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const parts = date.split('-').map(Number);
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        setCalendarYear(parts[0]);
        setCalendarMonth(parts[1] - 1);
      }
    } else {
      const now = new Date();
      setCalendarYear(now.getFullYear());
      setCalendarMonth(now.getMonth());
    }
    setDatePickerVisible(true);
  };

  const getCalendarDays = () => {
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(d);
    }
    return days;
  };

  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(calendarYear - 1);
    } else {
      setCalendarMonth(calendarMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(calendarYear + 1);
    } else {
      setCalendarMonth(calendarMonth + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    const formatted = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setDate(formatted);
    setDatePickerVisible(false);
  };

  const isCheckingSelected = useMemo(() => {
    const card = cards.find(c => c.id === selectedCardId);
    return !!(card?.isChecking || card?.isSaving || card?.isBrokerage);
  }, [cards, selectedCardId]);

  const selectedCard = cards.find(c => c.id === selectedCardId);

  // Force Interest values when marked as interest
  useEffect(() => {
    if (isInterest) {
      setFromOrTo('From');
      setFromTo('Interest');
      setIsZelle(false);
    }
  }, [isInterest]);

  // Sync state when editing an existing transaction or transfer
  useEffect(() => {
    if (editingExpense) {
      setDate(editingExpense.date);

      if (editingExpense.transferLinkId) {
        // We are editing a linked transfer
        setLogType('transfer');
        const detailsVal = editingExpense.details || '';
        setTransferDetails(detailsVal);
        if (detailsVal.startsWith('Credit Card Bill Pay -')) {
          setIsCcBillPay(true);
        } else {
          setIsCcBillPay(false);
        }
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
            const exp1IsDeposit = exp1Card.isChecking || exp1Card.isSaving || exp1Card.isBrokerage;
            const exp2IsDeposit = exp2Card.isChecking || exp2Card.isSaving || exp2Card.isBrokerage;

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
        setIsInterest(!!editingExpense.isInterest);
        setCategory(editingExpense.category || 'Others');

        const card = cards.find(c => c.id === editingExpense.creditCardId);
        const isDepositAcc = !!(card?.isChecking || card?.isSaving || card?.isBrokerage);

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

  const handleCreditChange = (val: string) => {
    setAmount(val);
    if (rewardValue === '' || rewardValue === amount) {
      setRewardValue(val);
    }
  };

  const resetForm = () => {
    setAmount('');
    setDate(getTodayString());

    const activeCards = cards.filter(c => !isClosedCard(c) && !c.isHidden);
    const standardCards = activeCards.filter(c => !c.isBrokerage);
    
    // Default to the first active standard card (highest priority from Settings)
    const initialCardId = standardCards[0]?.id || '';
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
    setIsInterest(false);
    setCategory('Others');

    // Transfer resets
    const depositAccs = activeCards.filter(c => c.isChecking || c.isSaving || c.isBrokerage);
    setSelectedSourceCardId(depositAccs[0]?.id || initialCardId);
    setSelectedTargetCardId(activeCards.find(c => c.id !== depositAccs[0]?.id)?.id || initialCardId);
    setTransferDetails('');
    setIsCcBillPay(false);
  };

  const handleSubmit = () => {
    if (Platform.OS !== 'web') {
      Keyboard.dismiss();
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      showAlert('Error', 'Please enter a valid date in YYYY-MM-DD format.');
      return;
    }

    const cleanAmount = (amount || '').trim().replace(/^\$/, '');
    const parsedAmount = parseFloat(cleanAmount);

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
      const finalDetails = isCcBillPay
        ? `Credit Card Bill Pay - ${targetName}`
        : (transferDetails.trim() || 'Account Transfer');

      const sourceTx: Omit<Expense, 'id'> = {
        creditCardId: selectedSourceCardId,
        amount: -parsedAmount,
        description: `Transfer to ${targetName}`,
        date,
        category: 'Transfer',
        fromTo: targetName,
        details: finalDetails,
        isTransfer: true,
      };

      // Target Account: credit payment (for CC) or deposit (for checking/saving/brokerage)
      const targetIsDeposit = !!(targetCard?.isChecking || targetCard?.isSaving || targetCard?.isBrokerage);
      const targetTx: Omit<Expense, 'id'> = {
        creditCardId: selectedTargetCardId,
        amount: targetIsDeposit ? parsedAmount : -parsedAmount, // paying credit card is negative (reduces balance owed)
        description: `Transfer from ${sourceName}`,
        date,
        category: 'Transfer',
        fromTo: sourceName,
        details: finalDetails,
        isTransfer: true,
      };

      onSubmit([sourceTx, targetTx], selectedTargetCardId, keepInLogPage);
      resetForm();
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    } else {
      // 2. Transaction Submit Validation
      if (!selectedCardId) {
        showAlert('Error', 'Please select a payment card or checking account.');
        return;
      }

      if (isCheckingSelected) {
        if (!isInterest) {
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

        if (isReward) {
          const cleanReward = (rewardValue || '').trim().replace(/^\$/, '');
          const rewardVal = parseFloat(cleanReward) || 0;
          const creditVal = parseFloat(cleanAmount) || 0;
          if (rewardVal <= 0 && creditVal <= 0) {
            showAlert('Error', 'Please enter a valid Reward or Credit value.');
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
        if (isInterest) {
          finalFromTo = 'Interest';
          finalDetails = details.trim() || 'Savings Interest';
          finalDescription = 'Interest';
        } else if (isZelle) {
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
          const cleanReward = (rewardValue || '').trim().replace(/^\$/, '');
          finalRewardValue = parseFloat(cleanReward) || 0;
          const creditVal = parseFloat(cleanAmount) || 0;
          finalAmount = -creditVal; // Negative represents credit reducing CC owed balance
        } else if (isFee) {
          finalAmount = parsedAmount;
        } else {
          finalAmount = parsedAmount;
        }
      }

      const isAutoFee = !isCheckingSelected && (
        isFee ||
        finalDescription.toLowerCase().includes('annual fee') ||
        finalDescription.toLowerCase().includes('membership fee') ||
        (finalDetails || '').toLowerCase().includes('annual fee') ||
        (category || '').toLowerCase().includes('annual fee')
      );

      onSubmit({
        id: editingExpense?.id || undefined,
        description: finalDescription,
        amount: finalAmount,
        creditCardId: selectedCardId,
        date,
        category: category || 'Others',
        fromTo: finalFromTo,
        details: finalDetails,
        isFee: isAutoFee ? true : undefined,
        isReward: !isCheckingSelected ? isReward : undefined,
        rewardType: !isCheckingSelected && isReward ? rewardType : undefined,
        rewardValue: !isCheckingSelected && isReward ? finalRewardValue : undefined,
        isInterest: isCheckingSelected && selectedCard?.isSaving ? isInterest : undefined,
      }, selectedCardId, keepInLogPage);

      resetForm();
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const selectedSourceCard = cards.find(c => c.id === selectedSourceCardId);
  const selectedTargetCard = cards.find(c => c.id === selectedTargetCardId);

  const isTargetCreditCard = useMemo(() => {
    if (!selectedTargetCard) return false;
    return !selectedTargetCard.isChecking && !selectedTargetCard.isSaving && !selectedTargetCard.isBrokerage;
  }, [selectedTargetCard]);

  // Turn off isCcBillPay if target account is not a credit card
  useEffect(() => {
    if (!isTargetCreditCard && isCcBillPay) {
      setIsCcBillPay(false);
    }
  }, [isTargetCreditCard, isCcBillPay]);

  // Transfers support checking, saving, and brokerage
  const depositAccounts = cards.filter(
    c => (c.isChecking || c.isSaving || c.isBrokerage) && !isClosedCard(c) && !c.isHidden
  );

  // Filter Target accounts list
  const targetAccountsList = useMemo(() => {
    const sourceCard = cards.find(c => c.id === selectedSourceCardId);
    const activeCards = cards.filter(c => !isClosedCard(c) && !c.isHidden);
    if (sourceCard?.isBrokerage) {
      // If source is brokerage, target can only be Checking or Saving
      return activeCards.filter(c => c.id !== selectedSourceCardId && (c.isChecking || c.isSaving));
    }
    // Checking/saving source accounts can target any other accounts
    return activeCards.filter(c => c.id !== selectedSourceCardId);
  }, [cards, selectedSourceCardId]);

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoidingView}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <ScrollView
        ref={scrollViewRef}
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        showsVerticalScrollIndicator={false}
      >
        <TouchableWithoutFeedback
          onPress={Platform.OS !== 'web' ? Keyboard.dismiss : undefined}
          accessible={false}
          disabled={Platform.OS === 'web'}
        >
          <View style={Platform.OS === 'web' ? { width: '100%', alignItems: 'center' } : undefined}>
            {showToast && (
              <View style={styles.toastContainer}>
                <Text style={styles.toastText}>✓ Log successfully added!</Text>
              </View>
            )}
            <View style={styles.formCard}>
              {cards.length === 0 ? (
                <View style={styles.emptyFormBox}>
                  <Text style={styles.emptyFormTitle}>⚠️ No Accounts Configured</Text>
                  <Text style={styles.emptyFormSub}>
                    You need to add at least one Credit Card, Checking, or Savings account in Settings before logging transactions.
                  </Text>
                  {onNavigateToSettings && (
                    <TouchableOpacity
                      style={styles.emptyActionBtn}
                      onPress={onNavigateToSettings}
                    >
                      <Text style={styles.emptyActionBtnText}>+ Create Account or Card</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <>
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
            {/* Source & Target Account Dropdowns Row */}
            <View style={styles.transferDropdownsRow}>
              {/* Source Account Dropdown */}
              <View style={styles.transferDropdownCol}>
                <Text style={styles.centeredTwoLineLabel}>
                  Source{"\n"}Account
                </Text>
                {Platform.OS === 'web' ? (
                  <View style={styles.webSelectContainer}>
                    <select
                      style={getWebSelectStyle(selectedSourceCard)}
                      value={selectedSourceCardId}
                      onChange={(e: any) => setSelectedSourceCardId(e.target.value)}
                    >
                      <option value="" disabled>Select Source Account</option>
                      {depositAccounts.map(item => {
                        const t = getCardTypeStyles(item);
                        return (
                          <option
                            key={item.id}
                            value={item.id}
                            style={{
                              backgroundColor: t.optionBg,
                              color: t.optionColor,
                              fontWeight: 600,
                            }}
                          >
                            {t.prefix}{item.name}
                          </option>
                        );
                      })}
                    </select>
                    <View style={styles.webSelectArrow} pointerEvents="none">
                      <Text style={styles.dropdownArrow}>▼</Text>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.selectorButton,
                      selectedSourceCard && {
                        borderLeftWidth: 6,
                        borderLeftColor: getCardTypeStyles(selectedSourceCard).border,
                      }
                    ]}
                    onPress={() => setSourceModalVisible(true)}
                  >
                    <View style={styles.selectorButtonInner}>
                      <Text
                        style={[
                          styles.selectorButtonText,
                          selectedSourceCard && { color: getCardTypeStyles(selectedSourceCard).optionColor, fontWeight: '600' }
                        ]}
                        numberOfLines={1}
                      >
                        {selectedSourceCard
                          ? `${getCardTypeStyles(selectedSourceCard).prefix}${selectedSourceCard.name}`
                          : 'Select Source'}
                      </Text>
                    </View>
                    <Text style={styles.dropdownArrow}>▼</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Target Account Dropdown */}
              <View style={styles.transferDropdownCol}>
                <Text style={styles.centeredTwoLineLabel}>
                  Target{"\n"}Account
                </Text>
                {Platform.OS === 'web' ? (
                  <View style={styles.webSelectContainer}>
                    <select
                      style={getWebSelectStyle(selectedTargetCard)}
                      value={selectedTargetCardId}
                      onChange={(e: any) => setSelectedTargetCardId(e.target.value)}
                    >
                      <option value="" disabled>Select Target Account</option>
                      {targetAccountsList.map(item => {
                        const t = getCardTypeStyles(item);
                        return (
                          <option
                            key={item.id}
                            value={item.id}
                            style={{
                              backgroundColor: t.optionBg,
                              color: t.optionColor,
                              fontWeight: 600,
                            }}
                          >
                            {t.prefix}{item.name}
                          </option>
                        );
                      })}
                    </select>
                    <View style={styles.webSelectArrow} pointerEvents="none">
                      <Text style={styles.dropdownArrow}>▼</Text>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.selectorButton,
                      selectedTargetCard && {
                        borderLeftWidth: 6,
                        borderLeftColor: getCardTypeStyles(selectedTargetCard).border,
                      }
                    ]}
                    onPress={() => setTargetModalVisible(true)}
                  >
                    <View style={styles.selectorButtonInner}>
                      <Text
                        style={[
                          styles.selectorButtonText,
                          selectedTargetCard && { color: getCardTypeStyles(selectedTargetCard).optionColor, fontWeight: '600' }
                        ]}
                        numberOfLines={1}
                      >
                        {selectedTargetCard
                          ? `${getCardTypeStyles(selectedTargetCard).prefix}${selectedTargetCard.name}`
                          : 'Select Target'}
                      </Text>
                    </View>
                    <Text style={styles.dropdownArrow}>▼</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Amount & Date Side-by-Side Centered Row */}
            <View style={styles.amountDateRow}>
              {/* Amount */}
              <View style={styles.amountDateCol}>
                <Text style={[styles.label, styles.centeredLabel]}>Amount</Text>
                <TextInput
                  style={[styles.input, styles.centeredInput]}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor="#94a3b8"
                  keyboardType="decimal-pad"
                />
              </View>

              {/* Date */}
              <View style={styles.amountDateCol}>
                <Text style={[styles.label, styles.centeredLabel]}>Date</Text>
                {Platform.OS === 'web' ? (
                  <input
                    type="date"
                    style={webDateInputStyle}
                    value={date}
                    onChange={(e: any) => setDate(e.target.value)}
                  />
                ) : (
                  <TouchableOpacity
                    style={[styles.input, { justifyContent: 'center', height: 42 }]}
                    onPress={openDatePicker}
                  >
                    <Text style={{ textAlign: 'center', fontSize: 14, fontWeight: '600', color: '#0f172a' }}>
                      📅 {date || 'Select Date'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Details Description */}
            <View style={styles.inputGroup}>
              <View style={styles.transferDetailsHeader}>
                <Text style={[styles.label, { marginBottom: 0 }]}>Details</Text>
                {isTargetCreditCard && (
                  <TouchableOpacity
                    style={[styles.ccBillPayTag, isCcBillPay && styles.activeCcBillPayTag]}
                    onPress={() => setIsCcBillPay(!isCcBillPay)}
                  >
                    <Text style={[styles.ccBillPayTagText, isCcBillPay && styles.activeCcBillPayTagText]}>
                      Credit Card Bill Pay
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              {!(isTargetCreditCard && isCcBillPay) && (
                <TextInput
                  style={styles.input}
                  value={transferDetails}
                  onChangeText={setTransferDetails}
                  placeholder="e.g. Credit Card Payment, Saving Deposit"
                  placeholderTextColor="#94a3b8"
                />
              )}
            </View>
          </>
        ) : (
          // ==================== STANDARD TRANSACTION VIEW ====================
          <>
            {/* Account & Category Dropdowns Row */}
            <View style={styles.transferDropdownsRow}>
              {/* Account Selector */}
              <View style={styles.transferDropdownCol}>
                <Text style={[styles.label, styles.centeredLabel]}>{isCheckingSelected ? 'Account' : 'Payment Card'}</Text>
                {Platform.OS === 'web' ? (
                  <View style={styles.webSelectContainer}>
                    <select
                      style={getWebSelectStyle(selectedCard)}
                      value={selectedCardId}
                      onChange={(e: any) => setSelectedCardId(e.target.value)}
                    >
                      <option value="" disabled>Select Card/Account</option>
                      {cards.filter(c => !c.isBrokerage && !isClosedCard(c) && !c.isHidden).map(item => {
                        const t = getCardTypeStyles(item);
                        return (
                          <option
                            key={item.id}
                            value={item.id}
                            style={{
                              backgroundColor: t.optionBg,
                              color: t.optionColor,
                              fontWeight: 600,
                            }}
                          >
                            {t.prefix}{item.name}
                          </option>
                        );
                      })}
                    </select>
                    <View style={styles.webSelectArrow} pointerEvents="none">
                      <Text style={styles.dropdownArrow}>▼</Text>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.selectorButton,
                      selectedCard && {
                        borderLeftWidth: 6,
                        borderLeftColor: getCardTypeStyles(selectedCard).border,
                      }
                    ]}
                    onPress={() => setCardModalVisible(true)}
                  >
                    <View style={styles.selectorButtonInner}>
                      <Text
                        style={[
                          styles.selectorButtonText,
                          selectedCard && { color: getCardTypeStyles(selectedCard).optionColor, fontWeight: '600' }
                        ]}
                        numberOfLines={1}
                      >
                        {selectedCard
                          ? `${getCardTypeStyles(selectedCard).prefix}${selectedCard.name}`
                          : 'Select Card/Account'}
                      </Text>
                    </View>
                    <Text style={styles.dropdownArrow}>▼</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Category Selector */}
              <View style={styles.transferDropdownCol}>
                <Text style={[styles.label, styles.centeredLabel]}>Category</Text>
                {Platform.OS === 'web' ? (
                  <View style={styles.webSelectContainer}>
                    <select
                      style={getWebSelectStyle()}
                      value={category}
                      onChange={(e: any) => setCategory(e.target.value)}
                    >
                      {CATEGORIES.map(item => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                    <View style={styles.webSelectArrow} pointerEvents="none">
                      <Text style={styles.dropdownArrow}>▼</Text>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.selectorButton}
                    onPress={() => setCategoryModalVisible(true)}
                  >
                    <Text style={styles.selectorButtonText} numberOfLines={1}>{category}</Text>
                    <Text style={styles.dropdownArrow}>▼</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

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
                <TextInput
                  style={[styles.input, (isZelle || isInterest) && styles.disabledInput]}
                  value={fromTo}
                  onChangeText={setFromTo}
                  placeholder={
                    isInterest
                      ? "Interest"
                      : isZelle
                      ? "(Cleared for Zelle)"
                      : "e.g. Landlord, Employer, John Doe"
                  }
                  placeholderTextColor="#94a3b8"
                  editable={!isZelle && !isInterest}
                />
              </View>
            )}

            {/* Amount & Date Side-by-Side Centered Row */}
            <View style={styles.amountDateRow}>
              {/* Amount */}
              <View style={styles.amountDateCol}>
                <Text style={[styles.label, styles.centeredLabel]}>Amount</Text>
                <TextInput
                  style={[styles.input, styles.centeredInput]}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.00"
                  placeholderTextColor="#94a3b8"
                  keyboardType="decimal-pad"
                />
              </View>

              {/* Date */}
              <View style={styles.amountDateCol}>
                <Text style={[styles.label, styles.centeredLabel]}>Date</Text>
                {Platform.OS === 'web' ? (
                  <input
                    type="date"
                    style={webDateInputStyle}
                    value={date}
                    onChange={(e: any) => setDate(e.target.value)}
                  />
                ) : (
                  <TouchableOpacity
                    style={[styles.input, { justifyContent: 'center', height: 42 }]}
                    onPress={openDatePicker}
                  >
                    <Text style={{ textAlign: 'center', fontSize: 14, fontWeight: '600', color: '#0f172a' }}>
                      📅 {date || 'Select Date'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Option Buttons Row (Fee/Reward for Credit Card, From/To/Interest for Deposit accounts) */}
            {!isCheckingSelected ? (
              <View style={styles.transactionOptionRow}>
                <TouchableOpacity
                  style={[styles.quickDateButton, { flex: 1 }, isFee && styles.activeOrangeBtn]}
                  onPress={() => {
                    setIsFee(!isFee);
                    setIsReward(false);
                  }}
                >
                  <Text style={[styles.quickDateText, isFee && styles.activeOrangeBtnText]}>Fee</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quickDateButton, { flex: 1 }, isReward && styles.activeLiteGreenBtn]}
                  onPress={() => {
                    setIsReward(!isReward);
                    setIsFee(false);
                  }}
                >
                  <Text style={[styles.quickDateText, isReward && styles.activeLiteGreenBtnText]}>Reward</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.transactionOptionRow}>
                {/* From Button */}
                <TouchableOpacity
                  style={[
                    styles.quickDateButton,
                    { flex: 1 },
                    fromOrTo === 'From' && !isInterest && styles.activeLiteGreenBtn
                  ]}
                  onPress={() => {
                    setFromOrTo('From');
                    setIsInterest(false);
                  }}
                >
                  <Text style={[styles.quickDateText, fromOrTo === 'From' && !isInterest && styles.activeLiteGreenBtnText]}>
                    From
                  </Text>
                </TouchableOpacity>

                {/* To Button */}
                <TouchableOpacity
                  style={[
                    styles.quickDateButton,
                    { flex: 1 },
                    fromOrTo === 'To' && !isInterest && styles.activeOrangeBtn
                  ]}
                  onPress={() => {
                    setFromOrTo('To');
                    setIsInterest(false);
                  }}
                >
                  <Text style={[styles.quickDateText, fromOrTo === 'To' && !isInterest && styles.activeOrangeBtnText]}>
                    To
                  </Text>
                </TouchableOpacity>

                {/* Interest Button (Savings Only) */}
                {selectedCard?.isSaving && (
                  <TouchableOpacity
                    style={[
                      styles.quickDateButton,
                      { flex: 1 },
                      isInterest && styles.activeOptionBtn
                    ]}
                    onPress={() => {
                      setIsInterest(!isInterest);
                    }}
                  >
                    <Text style={[styles.quickDateText, isInterest && styles.activeOptionBtnText]}>
                      Interest
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Reward Sub-options */}
            {!isCheckingSelected && isReward && (
              <View style={styles.zelleDetailsContainer}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Credit ($) - Reduces statement balance</Text>
                  <TextInput
                    style={[styles.input, styles.amountInput]}
                    value={amount}
                    onChangeText={handleCreditChange}
                    placeholder="0.00"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                  />
                </View>

                <View style={[styles.inputGroup, { marginTop: 8 }]}>
                  <Text style={styles.label}>Reward ($) - Cash reward value earned</Text>
                  <TextInput
                    style={[styles.input, styles.amountInput]}
                    value={rewardValue}
                    onChangeText={setRewardValue}
                    placeholder="0.00"
                    placeholderTextColor="#94a3b8"
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
            )}

            {/* Checking-Specific Details or Zelle inputs */}
            {isCheckingSelected && (
              <View style={styles.inputGroup}>
                <View style={styles.transferDetailsHeader}>
                  <Text style={[styles.label, { marginBottom: 0 }]}>Details</Text>
                  {!isInterest && (
                    <TouchableOpacity
                      style={[styles.ccBillPayTag, isZelle && styles.activeCcBillPayTag]}
                      onPress={() => setIsZelle(!isZelle)}
                    >
                      <Text style={[styles.ccBillPayTagText, isZelle && styles.activeCcBillPayTagText]}>
                        Zelle
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {!isZelle ? (
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={details}
                    onChangeText={setDetails}
                    placeholder={isInterest ? "e.g. Monthly interest credit" : "e.g. Monthly rent, utility bill payment"}
                    placeholderTextColor="#94a3b8"
                    multiline={true}
                    numberOfLines={2}
                  />
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
                    <View style={[styles.inputGroup, { marginBottom: 0 }]}>
                      <Text style={styles.label}>Details</Text>
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
              </View>
            )}
          </>
        )}

        {/* Multiple Log Creation Toggle */}
        {!editingExpense && (
          <TouchableOpacity
            style={styles.keepInPageRow}
            onPress={() => setKeepInLogPage(!keepInLogPage)}
            activeOpacity={0.8}
          >
            <View style={[styles.checkboxBox, keepInLogPage && styles.checkboxBoxChecked]}>
              {keepInLogPage && <Text style={styles.checkboxCheckmark}>✓</Text>}
            </View>
            <Text style={styles.keepInPageText}>
              Create multiple logs (stay on this page)
            </Text>
          </TouchableOpacity>
        )}

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
        </>
      )}
      </View>
    </View>
  </TouchableWithoutFeedback>

      {/* Credit Card / Standard Account Modal Picker */}
      <Modal
        visible={cardModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCardModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setCardModalVisible(false)}>
            <View style={styles.modalBackdropTouch} />
          </TouchableWithoutFeedback>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Account / Card</Text>
              <TouchableOpacity
                style={styles.modalHeaderCloseBtn}
                onPress={() => setCardModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.modalHeaderCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={cards.filter(c => !c.isBrokerage && !isClosedCard(c) && !c.isHidden)}
              keyExtractor={item => item.id}
              renderItem={({ item }) => {
                const t = getCardTypeStyles(item);
                const isSelected = selectedCardId === item.id;
                return (
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      {
                        backgroundColor: t.optionBg,
                        borderLeftWidth: 6,
                        borderLeftColor: t.border,
                        marginVertical: 4,
                        borderRadius: 8,
                        borderWidth: isSelected ? 2 : 1,
                        borderColor: isSelected ? t.border : '#e2e8f0',
                      },
                    ]}
                    onPress={() => {
                      setSelectedCardId(item.id);
                      setCardModalVisible(false);
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[styles.modalItemText, { color: t.optionColor, fontWeight: isSelected ? '700' : '600' }]}>
                        {t.prefix}{item.name}
                      </Text>
                      {isSelected && (
                        <Text style={{ color: t.border, fontWeight: '800', fontSize: 16 }}>✓</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setCardModalVisible(false)}>
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Category Modal Picker */}
      <Modal
        visible={categoryModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setCategoryModalVisible(false)}>
            <View style={styles.modalBackdropTouch} />
          </TouchableWithoutFeedback>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Category</Text>
              <TouchableOpacity
                style={styles.modalHeaderCloseBtn}
                onPress={() => setCategoryModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.modalHeaderCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={CATEGORIES}
              keyExtractor={item => item}
              renderItem={({ item }) => {
                const isSelected = category === item;
                return (
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      {
                        backgroundColor: isSelected ? '#f1f5f9' : '#ffffff',
                        marginVertical: 4,
                        borderRadius: 8,
                        borderWidth: isSelected ? 2 : 1,
                        borderColor: isSelected ? '#0f172a' : '#e2e8f0',
                      },
                    ]}
                    onPress={() => {
                      setCategory(item);
                      setCategoryModalVisible(false);
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[styles.modalItemText, { color: '#0f172a', fontWeight: isSelected ? '700' : '500' }]}>
                        {item}
                      </Text>
                      {isSelected && (
                        <Text style={{ color: '#0f172a', fontWeight: '800', fontSize: 16 }}>✓</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setCategoryModalVisible(false)}>
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
          <TouchableWithoutFeedback onPress={() => setSourceModalVisible(false)}>
            <View style={styles.modalBackdropTouch} />
          </TouchableWithoutFeedback>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Source Account</Text>
              <TouchableOpacity
                style={styles.modalHeaderCloseBtn}
                onPress={() => setSourceModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.modalHeaderCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={depositAccounts}
              keyExtractor={item => item.id}
              renderItem={({ item }) => {
                const t = getCardTypeStyles(item);
                const isSelected = selectedSourceCardId === item.id;
                return (
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      {
                        backgroundColor: t.optionBg,
                        borderLeftWidth: 6,
                        borderLeftColor: t.border,
                        marginVertical: 4,
                        borderRadius: 8,
                        borderWidth: isSelected ? 2 : 1,
                        borderColor: isSelected ? t.border : '#e2e8f0',
                      },
                    ]}
                    onPress={() => {
                      setSelectedSourceCardId(item.id);
                      setSourceModalVisible(false);
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[styles.modalItemText, { color: t.optionColor, fontWeight: isSelected ? '700' : '600' }]}>
                        {t.prefix}{item.name}
                      </Text>
                      {isSelected && (
                        <Text style={{ color: t.border, fontWeight: '800', fontSize: 16 }}>✓</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
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
          <TouchableWithoutFeedback onPress={() => setTargetModalVisible(false)}>
            <View style={styles.modalBackdropTouch} />
          </TouchableWithoutFeedback>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Target Account</Text>
              <TouchableOpacity
                style={styles.modalHeaderCloseBtn}
                onPress={() => setTargetModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.modalHeaderCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={targetAccountsList}
              keyExtractor={item => item.id}
              renderItem={({ item }) => {
                const t = getCardTypeStyles(item);
                const isSelected = selectedTargetCardId === item.id;
                return (
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      {
                        backgroundColor: t.optionBg,
                        borderLeftWidth: 6,
                        borderLeftColor: t.border,
                        marginVertical: 4,
                        borderRadius: 8,
                        borderWidth: isSelected ? 2 : 1,
                        borderColor: isSelected ? t.border : '#e2e8f0',
                      },
                    ]}
                    onPress={() => {
                      setSelectedTargetCardId(item.id);
                      setTargetModalVisible(false);
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[styles.modalItemText, { color: t.optionColor, fontWeight: isSelected ? '700' : '600' }]}>
                        {t.prefix}{item.name}
                      </Text>
                      {isSelected && (
                        <Text style={{ color: t.border, fontWeight: '800', fontSize: 16 }}>✓</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setTargetModalVisible(false)}>
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Calendar Date Picker Modal (for Mobile App) */}
      <Modal
        visible={datePickerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDatePickerVisible(false)}
      >
        <View style={styles.centerModalOverlay}>
          <TouchableWithoutFeedback onPress={() => setDatePickerVisible(false)}>
            <View style={styles.modalBackdropTouch} />
          </TouchableWithoutFeedback>
          <View style={styles.calendarModalCard}>
            {/* Header: Title + Top Close Button */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Date</Text>
              <TouchableOpacity
                style={styles.modalHeaderCloseBtn}
                onPress={() => setDatePickerVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={styles.modalHeaderCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Header: Month & Year + Navigation */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <TouchableOpacity
                onPress={handlePrevMonth}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a' }}>◀</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {MONTH_NAMES[calendarMonth]} {calendarYear}
              </Text>
              <TouchableOpacity
                onPress={handleNextMonth}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1' }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a' }}>▶</Text>
              </TouchableOpacity>
            </View>

            {/* Days of Week Header */}
            <View style={{ flexDirection: 'row', marginBottom: 8 }}>
              {DAYS_OF_WEEK.map(d => (
                <View key={d} style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748b' }}>{d}</Text>
                </View>
              ))}
            </View>

            {/* Days Grid */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {getCalendarDays().map((day, idx) => {
                if (day === null) {
                  return <View key={`empty-${idx}`} style={{ width: `${100 / 7}%`, height: 36 }} />;
                }
                const dayStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isSelected = date === dayStr;
                const isToday = getTodayString() === dayStr;
                return (
                  <TouchableOpacity
                    key={`day-${day}`}
                    style={[
                      {
                        width: `${100 / 7}%`,
                        height: 36,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 6,
                        marginVertical: 1,
                      },
                      isSelected && { backgroundColor: '#0f172a' },
                      isToday && !isSelected && { borderWidth: 1, borderColor: '#0f172a' },
                    ]}
                    onPress={() => handleSelectDay(day)}
                  >
                    <Text
                      style={[
                        { fontSize: 13, fontWeight: '600', color: '#0f172a' },
                        isSelected && { color: '#ffffff', fontWeight: '800' },
                      ]}
                    >
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Quick Today & Close Buttons */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#f1f5f9',
                  borderRadius: 6,
                  paddingVertical: 10,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                }}
                onPress={() => {
                  setDate(getTodayString());
                  setDatePickerVisible(false);
                }}
              >
                <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 12, textTransform: 'uppercase' }}>
                  Today
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: '#0f172a',
                  borderRadius: 6,
                  paddingVertical: 10,
                  alignItems: 'center',
                }}
                onPress={() => setDatePickerVisible(false)}
              >
                <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 12, textTransform: 'uppercase' }}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    flexGrow: 1,
    paddingVertical: 20,
    paddingBottom: Platform.OS === 'ios' ? 380 : Platform.OS === 'web' ? 40 : 300,
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 24,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    maxWidth: 600,
    width: Platform.OS === 'web' ? '100%' : undefined,
    alignSelf: 'center',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 20,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.75,
  },
  logTypeToggleRow: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 4,
    gap: 6,
    marginBottom: 20,
  },
  logTypeBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  activeLogTypeBtn: {
    backgroundColor: '#0f172a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  logTypeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activeLogTypeText: {
    color: '#ffffff',
  },
  transferDropdownsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  transferDropdownCol: {
    flex: 1,
  },
  centeredTwoLineLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569',
    marginBottom: 8,
    textTransform: 'uppercase',
    textAlign: 'center',
    lineHeight: 16,
    letterSpacing: 0.5,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  },
  amountInput: {
    width: 160,
  },
  selectorButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: '#ffffff',
  },
  selectorButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
    gap: 8,
  },
  selectorButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0f172a',
  },
  dropdownArrow: {
    fontSize: 11,
    color: '#64748b',
  },
  webSelectContainer: {
    position: 'relative',
    width: '100%',
  },
  webSelectArrow: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cardBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  amountDateRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  amountDateCol: {
    flex: 1,
  },
  centeredLabel: {
    textAlign: 'center',
  },
  centeredInput: {
    textAlign: 'center',
  },
  transactionOptionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateInput: {
    flex: 1.5,
  },
  todayDateButton: {
    flex: 0.9,
  },
  yesterdayDateButton: {
    flex: 1.3,
  },
  quickDateButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  activeQuickDate: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  quickDateText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    paddingHorizontal: 2,
  },
  activeQuickDateText: {
    color: '#ffffff',
  },
  keepInPageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
    marginBottom: 14,
    paddingVertical: 4,
    alignSelf: 'center',
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#94a3b8',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  checkboxCheckmark: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 14,
  },
  keepInPageText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  cancelButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  submitButton: {
    flex: 2,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
    alignItems: Platform.OS === 'web' ? 'center' : undefined,
    padding: Platform.OS === 'web' ? 20 : 0,
  },
  modalBackdropTouch: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  centerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  calendarModalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderRadius: Platform.OS === 'web' ? 16 : undefined,
    padding: 20,
    paddingBottom: Platform.OS === 'android' ? 44 : (Platform.OS === 'ios' ? 36 : 20),
    maxHeight: '85%',
    width: Platform.OS === 'web' ? 440 : '100%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 10,
  },
  modalHeaderCloseBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
  },
  modalHeaderCloseText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#64748b',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginVertical: 4,
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
    marginTop: 14,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  modalCloseButtonText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
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
    backgroundColor: '#f8fafc',
    color: '#94a3b8',
    borderColor: '#e2e8f0',
  },
  zelleToggleBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 38,
    paddingHorizontal: 16,
    backgroundColor: '#e2e8f0',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
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
    minHeight: 64,
    textAlignVertical: 'top',
  },
  zelleDetailsContainer: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 14,
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
    borderRadius: 6,
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
    borderRadius: 8,
  },
  activeOptionBtn: {
    backgroundColor: '#ede9fe',
    borderColor: '#c4b5fd',
  },
  activeFeeBtn: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  activeRewardBtn: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  activeOrangeBtn: {
    backgroundColor: '#ffedd5',
    borderColor: '#fdba74',
  },
  activeOrangeBtnText: {
    color: '#c2410c',
    fontWeight: 'bold',
  },
  activeLiteGreenBtn: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  activeLiteGreenBtnText: {
    color: '#15803d',
    fontWeight: 'bold',
  },
  optionBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  activeOptionBtnText: {
    color: '#6d28d9',
    fontWeight: 'bold',
  },
  transferDetailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ccBillPayTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    borderRadius: 6,
  },
  activeCcBillPayTag: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  ccBillPayTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  activeCcBillPayTagText: {
    color: '#ffffff',
  },
  toastContainer: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 600,
    width: Platform.OS === 'web' ? '100%' : undefined,
    alignSelf: 'center',
  },
  toastText: {
    color: '#15803d',
    fontWeight: '700',
    fontSize: 14,
  },
  emptyFormBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyFormTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyFormSub: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
    maxWidth: 380,
  },
  emptyActionBtn: {
    backgroundColor: '#0f172a',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  emptyActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
});
