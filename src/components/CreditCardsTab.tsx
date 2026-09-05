import React, { useMemo, useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { Expense, CreditCard } from '../types';

const formatCurrency = (val: number): string => {
  if (Math.abs(val) < 0.005) return '0.00';
  return val.toFixed(2);
};

export const isClosedCard = (card: CreditCard): boolean => {
  const nameLower = (card.name || '').toLowerCase();
  return nameLower.includes('closed') || nameLower.includes('close');
};

export const isAnnualFeeExpense = (e: Expense): boolean => !!e.isFee;

export const calculateCreditAge = (openDateStr?: string): { years: number; months: number; totalMonths: number; formatted: string } => {
  if (!openDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(openDateStr)) {
    return { years: 0, months: 0, totalMonths: 0, formatted: '0 mos' };
  }
  const [y, m, d] = openDateStr.split('-').map(Number);
  const open = new Date(y, m - 1, d);
  const now = new Date();
  if (isNaN(open.getTime())) return { years: 0, months: 0, totalMonths: 0, formatted: '0 mos' };

  let totalMonths = (now.getFullYear() - open.getFullYear()) * 12 + (now.getMonth() - open.getMonth());
  if (now.getDate() < open.getDate()) {
    totalMonths -= 1;
  }
  if (totalMonths < 0) totalMonths = 0;

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  let formatted = '';
  if (years > 0 && months > 0) {
    formatted = `${years} yr${years > 1 ? 's' : ''} ${months} mo${months > 1 ? 's' : ''}`;
  } else if (years > 0) {
    formatted = `${years} yr${years > 1 ? 's' : ''}`;
  } else {
    formatted = `${months} mo${months > 1 ? 's' : ''}`;
  }

  return { years, months, totalMonths, formatted };
};

interface CreditCardsTabProps {
  expenses: Expense[];
  cards: CreditCard[];
  onDelete: (id: string) => void;
  onEdit: (expense: Expense) => void;
  selectedCardId?: string;
  onSelectCard?: (id: string) => void;
  onUpdateCard?: (updatedCard: CreditCard) => void;
  onNavigateToSettings?: () => void;
}

interface CreditCardRowItemProps {
  item: Expense;
  isWeb: boolean;
  onEdit: (expense: Expense) => void;
  confirmDelete: (id: string) => void;
}

const CreditCardRowItem = React.memo<CreditCardRowItemProps>(({
  item,
  isWeb,
  onEdit,
  confirmDelete,
}) => {
  const amt = Number(item.amount) || 0;

  let spendVal = '-';
  let paidVal = '-';
  let rewardsVal = '-';

  if (item.isReward) {
    if (amt < 0) {
      paidVal = `$${formatCurrency(Math.abs(amt))}`;
    }
    rewardsVal = `$${formatCurrency(item.rewardValue || 0)}`;
  } else if (amt > 0) {
    spendVal = `$${formatCurrency(amt)}`;
  } else if (amt < 0) {
    paidVal = `$${formatCurrency(Math.abs(amt))}`;
  }

  return (
    <View key={item.id} style={[styles.tableRow, isWeb ? styles.tableRowWeb : styles.tableRowMobile]}>
      <Text style={[styles.cell, isWeb ? styles.colDateWeb : styles.colDateMobile, styles.monoText]}>
        {item.date ? item.date.substring(5) : ''}
      </Text>
      <Text style={[styles.cell, isWeb ? styles.colDescWeb : styles.colDescMobile]} numberOfLines={1}>
        {item.description}
      </Text>
      
      <Text style={[styles.cell, isWeb ? styles.colSpendWeb : styles.colSpendMobile, styles.monoText]}>
        {spendVal}
      </Text>
      <Text style={[styles.cell, isWeb ? styles.colPaidWeb : styles.colPaidMobile, styles.monoText, paidVal !== '-' && { color: '#16a34a' }]}>
        {paidVal}
      </Text>
      <Text style={[styles.cell, isWeb ? styles.colRewardsWeb : styles.colRewardsMobile, styles.monoText, rewardsVal !== '-' && { color: '#16a34a' }]}>
        {rewardsVal}
      </Text>
      
      <Text style={[styles.cell, isWeb ? styles.colCategoryWeb : styles.colCategoryMobile]} numberOfLines={1}>
        {item.category || 'Others'}
      </Text>
      
      <View style={[styles.cellActions, isWeb ? styles.colActionsWeb : styles.colActionsMobile]}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onEdit(item)} accessibilityLabel="Edit">
          <Text style={styles.actionIconText}>✏️</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => confirmDelete(item.id)} accessibilityLabel="Delete">
          <Text style={styles.actionIconText}>🗑️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

export const CreditCardsTab: React.FC<CreditCardsTabProps> = React.memo(({
  expenses,
  cards,
  onDelete,
  onEdit,
  selectedCardId: propSelectedCardId,
  onSelectCard,
  onUpdateCard,
  onNavigateToSettings,
}) => {
  const isWeb = Platform.OS === 'web';
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Filter out checking, saving & brokerage accounts
  const creditCardsOnly = useMemo(() => {
    return cards.filter(c => !c.isChecking && !c.isSaving && !c.isBrokerage);
  }, [cards]);

  // Default landing tab is 'all' (Overview)
  const [internalSelectedCardId, setInternalSelectedCardId] = useState<string>('all');
  const selectedCardId = propSelectedCardId !== undefined ? propSelectedCardId : internalSelectedCardId;

  const setSelectedCardId = (id: string) => {
    setInternalSelectedCardId(id);
    onSelectCard?.(id);
  };

  // Pagination for transactions in individual card sheet
  const [visibleCount, setVisibleCount] = useState<number>(25);

  // Date editing modal state for mobile
  const [editingCardForDate, setEditingCardForDate] = useState<CreditCard | null>(null);
  const [pickerYear, setPickerYear] = useState<number>(new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState<number>(new Date().getMonth());
  const [selectedDateVal, setSelectedDateVal] = useState<string>(todayStr);

  const openDatePickerModal = (card: CreditCard) => {
    setEditingCardForDate(card);
    const dateToUse = card.openDate || todayStr;
    setSelectedDateVal(dateToUse);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateToUse)) {
      const [y, m] = dateToUse.split('-').map(Number);
      setPickerYear(y);
      setPickerMonth(m - 1);
    }
  };

  const handleSaveCardDate = (dateToSave: string) => {
    if (editingCardForDate && onUpdateCard) {
      onUpdateCard({
        ...editingCardForDate,
        openDate: dateToSave,
      });
    }
    setEditingCardForDate(null);
  };

  // Reset pagination when selected card changes
  useEffect(() => {
    setVisibleCount(25);
  }, [selectedCardId]);

  const activeCard = useMemo(() => {
    if (selectedCardId === 'all') return null;
    return creditCardsOnly.find(c => c.id === selectedCardId) || null;
  }, [creditCardsOnly, selectedCardId]);

  // Calculate statistics map for each individual card
  const cardStatsMap = useMemo(() => {
    const map: Record<string, { spent: number; paid: number; rewards: number; fees: number; due: number }> = {};

    creditCardsOnly.forEach(c => {
      let spent = 0;
      let paid = 0;
      let rewards = 0;
      let fees = 0;

      const cExpenses = expenses.filter(e => e.creditCardId === c.id);
      cExpenses.forEach(e => {
        const amt = Number(e.amount) || 0;
        if (e.isReward) {
          rewards += Number(e.rewardValue) || 0;
          if (amt < 0) {
            paid += Math.abs(amt);
          }
        } else if (e.isFee) {
          fees += amt;
          spent += amt;
        } else if (amt > 0) {
          spent += amt;
        } else if (amt < 0) {
          paid += Math.abs(amt);
        }
      });

      map[c.id] = {
        spent,
        paid,
        rewards,
        fees,
        due: spent - paid,
      };
    });

    return map;
  }, [creditCardsOnly, expenses]);

  // Calculate overall grand totals across cards
  const grandTotals = useMemo(() => {
    let totalSpent = 0;
    let totalPaid = 0;
    let totalRewards = 0;
    let totalFees = 0;
    let totalDue = 0;

    Object.values(cardStatsMap).forEach(s => {
      totalSpent += s.spent;
      totalPaid += s.paid;
      totalRewards += s.rewards;
      totalFees += s.fees;
      totalDue += s.due;
    });

    const openCards = creditCardsOnly.filter(c => !isClosedCard(c));
    const totalOpenMonths = openCards.reduce((acc, c) => acc + calculateCreditAge(c.openDate).totalMonths, 0);
    const avgMonths = openCards.length > 0 ? totalOpenMonths / openCards.length : 0;
    const avgYears = Math.floor(avgMonths / 12);
    const avgRemMonths = Math.round(avgMonths % 12);

    let avgAgeFormatted = '0 mos';
    if (openCards.length === 0) {
      avgAgeFormatted = 'N/A';
    } else if (avgYears > 0 && avgRemMonths > 0) {
      avgAgeFormatted = `${avgYears} yr${avgYears > 1 ? 's' : ''} ${avgRemMonths} mo${avgRemMonths > 1 ? 's' : ''}`;
    } else if (avgYears > 0) {
      avgAgeFormatted = `${avgYears} yr${avgYears > 1 ? 's' : ''}`;
    } else {
      avgAgeFormatted = `${avgRemMonths} mo${avgRemMonths > 1 ? 's' : ''}`;
    }

    return {
      totalSpent,
      totalPaid,
      totalRewards,
      totalFees,
      totalDue,
      openCardsCount: openCards.length,
      closedCardsCount: creditCardsOnly.length - openCards.length,
      avgAgeFormatted,
    };
  }, [cardStatsMap, creditCardsOnly]);

  // Expenses for the currently active individual card
  const cardExpenses = useMemo(() => {
    if (!selectedCardId || selectedCardId === 'all') return [];
    return expenses
      .filter(e => e.creditCardId === selectedCardId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, selectedCardId]);

  // Active card totals (only due is shown in header)
  const activeCardStats = useMemo(() => {
    if (!selectedCardId || selectedCardId === 'all') return { due: 0 };
    return cardStatsMap[selectedCardId] || { due: 0 };
  }, [cardStatsMap, selectedCardId]);

  const confirmDelete = (id: string) => {
    const performDelete = () => onDelete(id);

    if (Platform.OS === 'web') {
      if (confirm('Are you sure you want to delete this transaction?')) {
        performDelete();
      }
    } else {
      Alert.alert(
        'Delete Transaction',
        'Are you sure you want to delete this transaction?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: performDelete },
        ]
      );
    }
  };

  // Calendar builder helper for date picker modal
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(pickerYear, pickerMonth, 1).getDay();
    const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(d);
    }
    return days;
  }, [pickerYear, pickerMonth]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handlePrevMonth = () => {
    if (pickerMonth === 0) {
      setPickerMonth(11);
      setPickerYear(prev => prev - 1);
    } else {
      setPickerMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (pickerMonth === 11) {
      setPickerMonth(0);
      setPickerYear(prev => prev + 1);
    } else {
      setPickerMonth(prev => prev + 1);
    }
  };

  const isOverview = selectedCardId === 'all' || !activeCard;

  return (
    <View style={styles.container}>
      {/* Excel Sheet style Navigation Tabs */}
      <View style={styles.sheetTabsContainer}>
        <Text style={styles.sheetSelectorLabel}>Cards:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sheetTabsScroll}>
          {/* Overview Tab */}
          <TouchableOpacity
            style={[
              styles.sheetTab,
              isOverview && styles.activeSheetTab,
            ]}
            onPress={() => setSelectedCardId('all')}
          >
            <Text
              style={[
                styles.sheetTabText,
                isOverview && styles.activeSheetTabText,
              ]}
            >
              📊 Overview
            </Text>
          </TouchableOpacity>

          {/* Individual Card Tabs */}
          {creditCardsOnly.map(card => {
            const isSelected = selectedCardId === card.id;
            const closed = isClosedCard(card);
            return (
              <TouchableOpacity
                key={card.id}
                style={[
                  styles.sheetTab,
                  isSelected && styles.activeSheetTab,
                ]}
                onPress={() => setSelectedCardId(card.id)}
              >
                <Text
                  style={[
                    styles.sheetTabText,
                    isSelected && styles.activeSheetTabText,
                    closed && styles.closedTabText,
                  ]}
                >
                  {card.name} {closed ? '(Closed)' : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
          {onNavigateToSettings && (
            <TouchableOpacity
              style={styles.addCardTabBtn}
              onPress={onNavigateToSettings}
            >
              <Text style={styles.addCardTabBtnText}>➕ Add Card</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* ========================================================= */}
      {/* 1. OVERVIEW PAGE (Default Landing Page)                   */}
      {/* ========================================================= */}
      {isOverview ? (
        <ScrollView
          style={styles.overviewScroll}
          contentContainerStyle={[styles.overviewContent, !isWeb && styles.overviewContentMobile]}
        >
          {/* Summary KPIs Row */}
          <View style={styles.kpiGrid}>
            {/* Average Credit Age */}
            <View style={[styles.kpiCard, styles.kpiCardHighlight]}>
              <Text style={styles.kpiLabel}>Average Credit Age</Text>
              <Text style={styles.kpiValueLarge}>{grandTotals.avgAgeFormatted}</Text>
              <Text style={styles.kpiSub}>
                Across {grandTotals.openCardsCount} open account{grandTotals.openCardsCount !== 1 ? 's' : ''} (excludes closed)
              </Text>
            </View>

            {/* Total Balance Due */}
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Total Balance Due</Text>
              <Text style={[styles.kpiValue, grandTotals.totalDue > 0.005 ? { color: '#dc2626' } : { color: '#16a34a' }]}>
                ${formatCurrency(grandTotals.totalDue)}
              </Text>
              <Text style={styles.kpiSub}>Across all cards</Text>
            </View>

            {/* Total Spent */}
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Total Spent</Text>
              <Text style={styles.kpiValue}>${formatCurrency(grandTotals.totalSpent)}</Text>
              <Text style={styles.kpiSub}>Purchases & charges</Text>
            </View>

            {/* Total Paid */}
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Total Paid</Text>
              <Text style={[styles.kpiValue, { color: '#16a34a' }]}>${formatCurrency(grandTotals.totalPaid)}</Text>
              <Text style={styles.kpiSub}>Payments & credits</Text>
            </View>

            {/* Rewards */}
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Total Rewards</Text>
              <Text style={[styles.kpiValue, { color: '#16a34a' }]}>${formatCurrency(grandTotals.totalRewards)}</Text>
              <Text style={styles.kpiSub}>Cashback & points</Text>
            </View>

            {/* Annual Fees Paid */}
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>Annual Fees Paid</Text>
              <Text style={[styles.kpiValue, grandTotals.totalFees > 0 ? { color: '#d97706' } : {}]}>
                ${formatCurrency(grandTotals.totalFees)}
              </Text>
              <Text style={styles.kpiSub}>Total card fees</Text>
            </View>
          </View>

          {/* Credit Cards Summary Table */}
          <View style={styles.tableSection}>
            <View style={styles.tableSectionHeader}>
              <Text style={styles.tableSectionTitle}>All Credit Cards Summary</Text>
              <Text style={styles.tableSectionSub}>
                Tap any card or opening date to edit. Tap "View Sheet" to see transactions.
              </Text>
            </View>

            {creditCardsOnly.length === 0 ? (
              <View style={styles.emptyOverviewBox}>
                <Text style={styles.emptyOverviewTitle}>No Credit Cards Configured</Text>
                <Text style={styles.emptyOverviewSub}>
                  You don't have any credit cards configured yet. Add your credit cards to track credit age, balances, spent, paid, rewards, and annual fees.
                </Text>
                {onNavigateToSettings && (
                  <TouchableOpacity style={styles.emptyActionBtn} onPress={onNavigateToSettings}>
                    <Text style={styles.emptyActionBtnText}>➕ Add Credit Card</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={true}
                style={styles.tableScroll}
                contentContainerStyle={isWeb ? styles.tableScrollContentWeb : undefined}
              >
                <View style={isWeb ? styles.overviewTableWeb : styles.overviewTableMobile}>
                  {/* Table Header */}
                  <View style={[styles.overviewTableHeaderRow, isWeb ? styles.overviewRowWeb : styles.overviewRowMobile]}>
                    <Text style={[styles.ovHeaderCell, isWeb ? styles.ovColNameWeb : styles.ovColNameMobile]}>Credit Card</Text>
                    <Text style={[styles.ovHeaderCell, isWeb ? styles.ovColDateWeb : styles.ovColDateMobile, { textAlign: 'center' }]}>Opened Date</Text>
                    <Text style={[styles.ovHeaderCell, isWeb ? styles.ovColAgeWeb : styles.ovColAgeMobile]}>Credit Age</Text>
                    <Text style={[styles.ovHeaderCell, isWeb ? styles.ovColSpentWeb : styles.ovColSpentMobile]}>Total Spent</Text>
                    <Text style={[styles.ovHeaderCell, isWeb ? styles.ovColPaidWeb : styles.ovColPaidMobile]}>Total Paid</Text>
                    <Text style={[styles.ovHeaderCell, isWeb ? styles.ovColRewardsWeb : styles.ovColRewardsMobile]}>Rewards</Text>
                    <Text style={[styles.ovHeaderCell, isWeb ? styles.ovColFeesWeb : styles.ovColFeesMobile]}>Annual Fees</Text>
                    <Text style={[styles.ovHeaderCell, isWeb ? styles.ovColDueWeb : styles.ovColDueMobile]}>Balance Due</Text>
                    <Text style={[styles.ovHeaderCell, isWeb ? styles.ovColActionWeb : styles.ovColActionMobile, { textAlign: 'center', borderRightWidth: 0 }]}>Actions</Text>
                  </View>

                  {/* Table Rows */}
                  {creditCardsOnly.map(card => {
                    const stats = cardStatsMap[card.id] || { spent: 0, paid: 0, rewards: 0, fees: 0, due: 0 };
                    const closed = isClosedCard(card);
                    const age = calculateCreditAge(card.openDate);

                    return (
                      <View
                        key={card.id}
                        style={[
                          styles.overviewTableRow,
                          isWeb ? styles.overviewRowWeb : styles.overviewRowMobile,
                          closed && styles.closedTableRow,
                        ]}
                      >
                        {/* Card Name */}
                        <TouchableOpacity
                          style={[styles.ovCell, isWeb ? styles.ovColNameWeb : styles.ovColNameMobile, styles.ovNameCell]}
                          onPress={() => setSelectedCardId(card.id)}
                        >
                          <Text style={[styles.ovCardNameText, closed && styles.closedText]}>
                            {card.name}
                          </Text>
                          {closed && <Text style={styles.closedBadge}>CLOSED</Text>}
                        </TouchableOpacity>

                        {/* Date Opened (Editable) */}
                        <View style={[styles.ovCell, isWeb ? styles.ovColDateWeb : styles.ovColDateMobile, { alignItems: 'center', justifyContent: 'center' }]}>
                          {isWeb ? (
                            <input
                              type="date"
                              style={{
                                border: '1px solid #cbd5e1',
                                borderRadius: 4,
                                padding: '3px 6px',
                                fontSize: '12px',
                                fontFamily: 'monospace',
                                color: '#0f172a',
                                backgroundColor: '#ffffff',
                                width: '100%',
                                maxWidth: 135,
                                height: 28,
                                boxSizing: 'border-box',
                                outline: 'none',
                                textAlign: 'center',
                              }}
                              value={card.openDate || todayStr}
                              onChange={e => {
                                if (onUpdateCard) {
                                  onUpdateCard({ ...card, openDate: e.target.value });
                                }
                              }}
                            />
                          ) : (
                            <TouchableOpacity
                              style={styles.dateEditButton}
                              onPress={() => openDatePickerModal(card)}
                            >
                              <Text style={styles.dateEditText}>
                                {card.openDate || todayStr} ✏️
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>

                        {/* Credit Age */}
                        <View style={[styles.ovCell, isWeb ? styles.ovColAgeWeb : styles.ovColAgeMobile]}>
                          <Text style={[styles.ovMonoText, closed && styles.closedText]}>
                            {age.formatted}
                          </Text>
                          {closed && <Text style={styles.excludedTag}>excluded</Text>}
                        </View>

                        {/* Total Spent */}
                        <View style={[styles.ovCell, isWeb ? styles.ovColSpentWeb : styles.ovColSpentMobile]}>
                          <Text style={[styles.ovMonoText, styles.alignRight]}>
                            ${formatCurrency(stats.spent)}
                          </Text>
                        </View>

                        {/* Total Paid */}
                        <View style={[styles.ovCell, isWeb ? styles.ovColPaidWeb : styles.ovColPaidMobile]}>
                          <Text style={[styles.ovMonoText, styles.alignRight, { color: '#16a34a' }]}>
                            ${formatCurrency(stats.paid)}
                          </Text>
                        </View>

                        {/* Rewards */}
                        <View style={[styles.ovCell, isWeb ? styles.ovColRewardsWeb : styles.ovColRewardsMobile]}>
                          <Text style={[styles.ovMonoText, styles.alignRight, { color: '#16a34a' }]}>
                            ${formatCurrency(stats.rewards)}
                          </Text>
                        </View>

                        {/* Annual Fees */}
                        <View style={[styles.ovCell, isWeb ? styles.ovColFeesWeb : styles.ovColFeesMobile]}>
                          <Text style={[styles.ovMonoText, styles.alignRight, stats.fees > 0 && { color: '#d97706' }]}>
                            ${formatCurrency(stats.fees)}
                          </Text>
                        </View>

                        {/* Balance Due */}
                        <View style={[styles.ovCell, isWeb ? styles.ovColDueWeb : styles.ovColDueMobile]}>
                          <Text style={[
                            styles.ovMonoText,
                            styles.alignRight,
                            styles.boldText,
                            stats.due > 0.005 ? { color: '#dc2626' } : { color: '#16a34a' }
                          ]}>
                            ${formatCurrency(stats.due)}
                          </Text>
                        </View>

                        {/* Action Button */}
                        <View style={[styles.ovCell, isWeb ? styles.ovColActionWeb : styles.ovColActionMobile, { justifyContent: 'center', alignItems: 'center', borderRightWidth: 0 }]}>
                          <TouchableOpacity
                            style={styles.viewSheetBtn}
                            onPress={() => setSelectedCardId(card.id)}
                          >
                            <Text style={styles.viewSheetBtnText}>View Sheet →</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>
        </ScrollView>
      ) : (
        /* ========================================================= */
        /* 2. INDIVIDUAL CARD VIEW                                    */
        /* ========================================================= */
        <View style={styles.individualCardContainer}>
          {/* Card Header Banner (Only Current Balance kept as requested!) */}
          <View style={styles.headerBanner}>
            <View style={styles.bannerLeftRow}>
              <Text style={styles.headerLabel}>
                {activeCard.name}
              </Text>
            </View>

            <View style={styles.balanceOnlyContainer}>
              <Text style={styles.balanceLabel}>Current Balance:</Text>
              <Text style={[
                styles.balanceValue,
                activeCardStats.due > 0.005 ? { color: '#dc2626' } : { color: '#16a34a' }
              ]}>
                ${formatCurrency(activeCardStats.due)}
              </Text>
            </View>
          </View>

          {/* Spreadsheet Grid */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={true}
            style={styles.tableScroll}
            contentContainerStyle={isWeb ? styles.tableScrollContentWeb : undefined}
          >
            <View style={isWeb ? styles.tableContainerWeb : styles.tableContainerMobile}>
              {/* Table Headers */}
              <View style={[styles.tableRowHeader, isWeb ? styles.tableRowWeb : styles.tableRowMobile]}>
                <Text style={[styles.headerCell, isWeb ? styles.colDateWeb : styles.colDateMobile]}>Date</Text>
                <Text style={[styles.headerCell, isWeb ? styles.colDescWeb : styles.colDescMobile]}>Description</Text>
                <Text style={[styles.headerCell, isWeb ? styles.colSpendWeb : styles.colSpendMobile]}>Spend</Text>
                <Text style={[styles.headerCell, isWeb ? styles.colPaidWeb : styles.colPaidMobile]}>Paid</Text>
                <Text style={[styles.headerCell, isWeb ? styles.colRewardsWeb : styles.colRewardsMobile]}>Rewards</Text>
                <Text style={[styles.headerCell, isWeb ? styles.colCategoryWeb : styles.colCategoryMobile]}>Category</Text>
                <Text style={[styles.headerCell, isWeb ? styles.colActionsWeb : styles.colActionsMobile]}>Actions</Text>
              </View>

              {/* Table Rows */}
              <ScrollView
                style={styles.rowsScroll}
                contentContainerStyle={[styles.rowsScrollContent, !isWeb && styles.rowsScrollContentMobile]}
              >
                {cardExpenses.length === 0 ? (
                  <Text style={styles.emptyText}>No transactions recorded for this card.</Text>
                ) : (
                  <>
                    {cardExpenses.slice(0, visibleCount).map(item => (
                      <CreditCardRowItem
                        key={item.id}
                        item={item}
                        isWeb={isWeb}
                        onEdit={onEdit}
                        confirmDelete={confirmDelete}
                      />
                    ))}
                    {cardExpenses.length > visibleCount && (
                      <TouchableOpacity
                        style={[styles.loadMoreRow, isWeb ? styles.loadMoreRowWeb : styles.loadMoreRowMobile]}
                        onPress={() => setVisibleCount(prev => prev + 25)}
                      >
                        <Text style={styles.loadMoreText}>
                          Show More (showing {visibleCount} of {cardExpenses.length})
                        </Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </ScrollView>
            </View>
          </ScrollView>
        </View>
      )}

      {/* Date Picker Modal for Mobile Card Open Date Editing */}
      <Modal
        visible={!!editingCardForDate}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEditingCardForDate(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => setEditingCardForDate(null)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Edit Open Date: {editingCardForDate?.name}
              </Text>
              <TouchableOpacity onPress={() => setEditingCardForDate(null)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Month & Year Navigation */}
            <View style={styles.calendarNavRow}>
              <TouchableOpacity onPress={handlePrevMonth} style={styles.navBtn}>
                <Text style={styles.navBtnText}>‹</Text>
              </TouchableOpacity>
              <Text style={styles.monthYearTitle}>
                {monthNames[pickerMonth]} {pickerYear}
              </Text>
              <TouchableOpacity onPress={handleNextMonth} style={styles.navBtn}>
                <Text style={styles.navBtnText}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Day Headers */}
            <View style={styles.weekHeadersRow}>
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((w, idx) => (
                <Text key={idx} style={styles.weekHeaderText}>{w}</Text>
              ))}
            </View>

            {/* Calendar Grid */}
            <View style={styles.daysGrid}>
              {calendarDays.map((day, idx) => {
                if (day === null) {
                  return <View key={idx} style={styles.emptyDayCell} />;
                }
                const formattedD = day < 10 ? `0${day}` : `${day}`;
                const formattedM = (pickerMonth + 1) < 10 ? `0${pickerMonth + 1}` : `${pickerMonth + 1}`;
                const cellDateStr = `${pickerYear}-${formattedM}-${formattedD}`;
                const isSelected = selectedDateVal === cellDateStr;

                return (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.dayCell, isSelected && styles.selectedDayCell]}
                    onPress={() => setSelectedDateVal(cellDateStr)}
                  >
                    <Text style={[styles.dayCellText, isSelected && styles.selectedDayCellText]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Selected Date Confirmation */}
            <View style={styles.selectedDateBanner}>
              <Text style={styles.selectedDateBannerText}>
                Selected Date: <Text style={{ fontWeight: 'bold' }}>{selectedDateVal}</Text>
              </Text>
            </View>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={() => setEditingCardForDate(null)}
              >
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveModalBtn}
                onPress={() => handleSaveCardDate(selectedDateVal)}
              >
                <Text style={styles.saveModalBtnText}>Save Date</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    width: '100%',
  },
  sheetTabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    paddingHorizontal: 12,
    height: 38,
  },
  sheetSelectorLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748b',
    marginRight: 8,
    textTransform: 'uppercase',
  },
  sheetTabsScroll: {
    alignItems: 'flex-end',
    height: '100%',
  },
  sheetTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#e2e8f0',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderBottomWidth: 0,
    marginRight: 4,
  },
  activeSheetTab: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderBottomWidth: 1,
    borderBottomColor: '#ffffff',
    zIndex: 2,
    transform: [{ translateY: 1 }],
  },
  sheetTabText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  activeSheetTabText: {
    color: '#0f172a',
    fontWeight: 'bold',
  },
  closedTabText: {
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  // Overview Screen Styles
  overviewScroll: {
    flex: 1,
    width: '100%',
  },
  overviewContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 20,
    width: '100%',
  },
  overviewContentMobile: {
    paddingBottom: 48,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    width: '100%',
  },
  kpiCard: {
    flex: 1,
    minWidth: 160,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    borderRadius: 6,
  },
  kpiCardHighlight: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    marginBottom: 2,
  },
  kpiValueLarge: {
    fontSize: 20,
    fontWeight: '900',
    color: '#15803d',
    marginBottom: 2,
  },
  kpiSub: {
    fontSize: 11,
    color: '#94a3b8',
  },
  tableSection: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    overflow: 'hidden',
    width: '100%',
  },
  tableSectionHeader: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  tableSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableSectionSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  tableScroll: {
    width: '100%',
  },
  tableScrollContentWeb: {
    width: '100%',
    minWidth: '100%',
  },
  overviewTableWeb: {
    width: '100%',
    minWidth: '100%',
    flexDirection: 'column',
  },
  overviewTableMobile: {
    width: 1030,
    flexDirection: 'column',
  },
  overviewTableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 2,
    borderBottomColor: '#cbd5e1',
  },
  overviewTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  overviewRowWeb: {
    width: '100%',
  },
  overviewRowMobile: {
    width: 1030,
  },
  closedTableRow: {
    backgroundColor: '#f8fafc',
  },
  ovHeaderCell: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: '#cbd5e1',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  ovCell: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
    justifyContent: 'center',
  },
  // Overview Web columns (flex-based to fill 100% width)
  ovColNameWeb: {
    flex: 2.2,
    minWidth: 160,
  },
  ovColDateWeb: {
    flex: 1.8,
    minWidth: 155,
  },
  ovColAgeWeb: {
    flex: 1.3,
    minWidth: 110,
  },
  ovColSpentWeb: {
    flex: 1.1,
    minWidth: 95,
  },
  ovColPaidWeb: {
    flex: 1.1,
    minWidth: 95,
  },
  ovColRewardsWeb: {
    flex: 1.1,
    minWidth: 95,
  },
  ovColFeesWeb: {
    flex: 1.1,
    minWidth: 95,
  },
  ovColDueWeb: {
    flex: 1.2,
    minWidth: 105,
  },
  ovColActionWeb: {
    flex: 1.2,
    minWidth: 110,
  },
  // Overview Mobile columns (fixed width)
  ovColNameMobile: {
    width: 160,
  },
  ovColDateMobile: {
    width: 140,
  },
  ovColAgeMobile: {
    width: 110,
  },
  ovColSpentMobile: {
    width: 95,
  },
  ovColPaidMobile: {
    width: 95,
  },
  ovColRewardsMobile: {
    width: 95,
  },
  ovColFeesMobile: {
    width: 95,
  },
  ovColDueMobile: {
    width: 110,
  },
  ovColActionMobile: {
    width: 130,
  },
  ovNameCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ovCardNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
  },
  closedBadge: {
    fontSize: 9,
    fontWeight: '800',
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
    marginLeft: 4,
  },
  closedText: {
    color: '#94a3b8',
  },
  excludedTag: {
    fontSize: 9,
    color: '#94a3b8',
    fontStyle: 'italic',
    marginTop: 2,
  },
  ovMonoText: {
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    color: '#0f172a',
  },
  alignRight: {
    textAlign: 'right',
  },
  boldText: {
    fontWeight: '800',
  },
  dateEditButton: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  dateEditText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    color: '#0f172a',
    fontWeight: '600',
  },
  viewSheetBtn: {
    backgroundColor: '#0f172a',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 4,
    alignItems: 'center',
  },
  viewSheetBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  // Individual Card View Styles
  individualCardContainer: {
    flex: 1,
    width: '100%',
  },
  headerBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    gap: 8,
    width: '100%',
  },
  bannerLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  balanceOnlyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  balanceValue: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  tableContainerWeb: {
    flexDirection: 'column',
    width: '100%',
    minWidth: 720,
  },
  tableContainerMobile: {
    flexDirection: 'column',
    width: 720,
  },
  tableRowHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 2,
    borderBottomColor: '#cbd5e1',
  },
  headerCell: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#475569',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: '#cbd5e1',
  },
  rowsScroll: {
    flex: 1,
  },
  rowsScrollContent: {
    paddingBottom: 20,
  },
  rowsScrollContentMobile: {
    paddingBottom: 48,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    alignItems: 'center',
  },
  tableRowWeb: {
    width: '100%',
  },
  tableRowMobile: {
    width: 720,
  },
  colDateWeb: {
    flex: 0.9,
    minWidth: 80,
  },
  colDescWeb: {
    flex: 2.5,
    minWidth: 150,
  },
  colSpendWeb: {
    flex: 1.1,
    minWidth: 85,
    textAlign: 'right',
  },
  colPaidWeb: {
    flex: 1.1,
    minWidth: 85,
    textAlign: 'right',
  },
  colRewardsWeb: {
    flex: 1.1,
    minWidth: 85,
    textAlign: 'right',
  },
  colCategoryWeb: {
    flex: 1.4,
    minWidth: 110,
  },
  colActionsWeb: {
    flex: 1,
    minWidth: 90,
    textAlign: 'center',
  },
  colDateMobile: {
    width: 90,
  },
  colDescMobile: {
    width: 150,
  },
  colSpendMobile: {
    width: 90,
    textAlign: 'right',
  },
  colPaidMobile: {
    width: 90,
    textAlign: 'right',
  },
  colRewardsMobile: {
    width: 90,
    textAlign: 'right',
  },
  colCategoryMobile: {
    width: 110,
  },
  colActionsMobile: {
    width: 100,
    textAlign: 'center',
  },
  cell: {
    fontSize: 13,
    color: '#334155',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  monoText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  cellActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  actionBtn: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  actionIconText: {
    fontSize: 13,
  },
  editBtnText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  deleteBtnText: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '600',
  },
  loadMoreRow: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
  },
  loadMoreRowWeb: {
    width: '100%',
  },
  loadMoreRowMobile: {
    width: 720,
  },
  loadMoreText: {
    fontSize: 13,
    color: '#3b82f6',
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  emptyText: {
    padding: 20,
    color: '#64748b',
    textAlign: 'center',
    fontSize: 14,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 20,
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f172a',
    flex: 1,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalCloseText: {
    fontSize: 18,
    color: '#64748b',
    fontWeight: 'bold',
  },
  calendarNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  navBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  navBtnText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  monthYearTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  weekHeadersRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 6,
  },
  weekHeaderText: {
    width: 36,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: 'bold',
    color: '#64748b',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  emptyDayCell: {
    width: '14.28%',
    height: 36,
  },
  dayCell: {
    width: '14.28%',
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
    marginVertical: 2,
  },
  selectedDayCell: {
    backgroundColor: '#0f172a',
  },
  dayCellText: {
    fontSize: 13,
    color: '#0f172a',
  },
  selectedDayCellText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
  selectedDateBanner: {
    marginTop: 14,
    padding: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  selectedDateBannerText: {
    fontSize: 13,
    color: '#0f172a',
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  cancelModalBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  cancelModalBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  saveModalBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#0f172a',
  },
  saveModalBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  addCardTabBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#0f172a',
    borderRadius: 6,
    marginLeft: 10,
    alignSelf: 'center',
    marginBottom: 2,
  },
  addCardTabBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  emptyOverviewBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  emptyOverviewTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyOverviewSub: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 16,
    maxWidth: 420,
    lineHeight: 18,
  },
  emptyActionBtn: {
    backgroundColor: '#0f172a',
    paddingVertical: 9,
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


