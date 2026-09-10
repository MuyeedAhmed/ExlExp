import React, { useMemo, useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
  BackHandler,
  Alert,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Expense, CreditCard, FutureExpense } from '../types';
import { AllTransactionsPage } from './AllTransactionsPage';
import { ScheduledBillModal } from './ScheduledBillModal';
import { consolidateTransactions, formatCurrencyInput, normalizeCategory } from '../transactionUtils';

const formatCurrency = (val: number): string => {
  if (Math.abs(val) < 0.005) return '0.00';
  return val.toFixed(2);
};

const formatSpending = (val: number): string => {
  if (val < -0.005) {
    return `-$${formatCurrency(Math.abs(val))}`;
  }
  return `$${formatCurrency(val)}`;
};

const formatShortK = (val: number): string => {
  if (val <= 0) return '$0';
  if (val >= 1000) {
    return `$${(val / 1000).toFixed(1)}k`;
  }
  return `$${Math.round(val)}`;
};

const CATEGORY_COLORS: { [key: string]: string } = {
  rent: '#e45023',                 
  utilities: '#0284c7',
  'car payment': '#000000',
  transportation: '#06b6d4',
  grocery: '#07802b',
  'eating out': '#f59e0b',
  'necessary purchases': '#14b8a6',
  'luxury purchases': '#ec4899',
  others: '#64748b',
  salary: '#22c55e',
  transfer: '#94a3b8',
};

const PALETTE = [
  '#0284c7', // Sky Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#6366f1', // Indigo
  '#14b8a6', // Teal
  '#ef4444', // Red
  '#84cc16', // Lime
  '#a855f7', // Violet
  '#64748b', // Slate
];

const getCategoryColor = (name: string): string => {
  if (!name) return '#64748b';
  const key = name.trim().toLowerCase();
  if (CATEGORY_COLORS[key]) return CATEGORY_COLORS[key];
  if (CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
};

const getDynamicColor = getCategoryColor;

interface DashboardProps {
  expenses: Expense[];
  cards: CreditCard[];
  futureExpenses: FutureExpense[];
  onAddFutureExpense: (expense: Omit<FutureExpense, 'id'>) => void;
  onEditFutureExpense?: (expense: FutureExpense) => void;
  onDeleteFutureExpense: (id: string) => void;
  onExecuteFutureExpense?: (expense: FutureExpense) => void;
  onNavigateToSettings?: () => void;
  onEditExpense?: (expense: Expense) => void;
  onDeleteExpense?: (id: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = React.memo(({
  expenses,
  cards,
  futureExpenses,
  onAddFutureExpense,
  onEditFutureExpense,
  onDeleteFutureExpense,
  onExecuteFutureExpense,
  onNavigateToSettings,
  onEditExpense,
  onDeleteExpense,
}) => {
  const { width } = useWindowDimensions();
  const isWeb = width > 768;

  // View state for All Transactions subpage
  const [showAllTransactions, setShowAllTransactions] = useState(false);

  // Handle hardware back press on Android when viewing All Transactions
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const handleBackPress = () => {
      if (showAllTransactions) {
        setShowAllTransactions(false);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => sub.remove();
  }, [showAllTransactions]);

  // Future Expense Modal State
  const [billModalVisible, setBillModalVisible] = useState(false);
  const [editingBill, setEditingBill] = useState<FutureExpense | null>(null);

  // 10 most recent transactions (fast O(1) early limit)
  const recent10Transactions = useMemo(() => {
    return consolidateTransactions(expenses, cards, 10);
  }, [expenses, cards]);

  // Rolling last 12 months for trends and the spending wheel
  const last12Months = useMemo(() => {
    const today = new Date();
    const list: {
      key: string;
      label: string;
      year: string;
      fullLabel: string;
    }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      const year = `'${String(d.getFullYear()).slice(-2)}`;
      const fullLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      list.push({ key, label, year, fullLabel });
    }
    return list;
  }, []);

  // Available months for the wheel (strictly last 12 months)
  const availableMonths = useMemo(() => last12Months.map(m => m.key), [last12Months]);

  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const activeMonth = selectedMonth || availableMonths[0] || '';

  const formatMonthLabel = (monthStr: string) => {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Helpers to get card name by ID
  const cardMap = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);

  // Calculate balances dynamically from transactions
  const cardBalances = useMemo(() => {
    const balances: { [cardId: string]: number } = {};
    cards.forEach(c => {
      balances[c.id] = 0.0;
    });
    expenses.forEach(e => {
      if (balances[e.creditCardId] !== undefined) {
        balances[e.creditCardId] += Number(e.amount) || 0;
      }
    });
    return balances;
  }, [expenses, cards]);

  const activeCheckingAccounts = useMemo(() => {
    return cards.filter(c => c.isChecking).filter(c => {
      const bal = cardBalances[c.id] || 0.0;
      return Math.abs(bal) >= 0.005;
    });
  }, [cards, cardBalances]);

  const creditCardsOnly = useMemo(() => {
    return cards.filter(c => !c.isChecking && !c.isSaving && !c.isBrokerage);
  }, [cards]);

  const activeCreditCards = useMemo(() => {
    return creditCardsOnly.filter(c => {
      const bal = cardBalances[c.id] || 0.0;
      return Math.abs(bal) >= 0.005;
    });
  }, [creditCardsOnly, cardBalances]);

  const checkingBalance = useMemo(() => {
    return cards.filter(c => c.isChecking).reduce((sum, account) => {
      const bal = cardBalances[account.id] || 0;
      return sum + bal;
    }, 0);
  }, [cardBalances, cards]);

  const creditCardDebt = useMemo(() => {
    return creditCardsOnly.reduce((sum, card) => {
      const bal = cardBalances[card.id] || 0;
      return sum + bal;
    }, 0);
  }, [cardBalances, creditCardsOnly]);

  const futureExpensesTotal = useMemo(() => {
    return futureExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  }, [futureExpenses]);

  const netBalance = useMemo(() => {
    return checkingBalance - creditCardDebt - futureExpensesTotal;
  }, [checkingBalance, creditCardDebt, futureExpensesTotal]);

  // 12-Month Rolling Spending Trend & Category Breakdown in a SINGLE O(N) pass
  const { monthlySpendingTrend, categorySpendingByMonth } = useMemo(() => {
    const monthKeysSet = new Set(availableMonths);
    const monthSpendMap = new Map<string, number>();
    const monthCategoryMap = new Map<string, { [cat: string]: number }>();

    availableMonths.forEach(k => {
      monthSpendMap.set(k, 0);
      monthCategoryMap.set(k, {});
    });

    // Single pass over expenses
    for (let i = 0; i < expenses.length; i++) {
      const e = expenses[i];
      if (e.isTransfer || e.category === 'Transfer' || e.category === 'Salary') continue;
      if (!e.date || e.date.length < 7) continue;

      const monthKey = e.date.substring(0, 7);
      if (!monthKeysSet.has(monthKey)) continue; // Drop all data older than last 12 months!

      const card = cardMap.get(e.creditCardId);
      const isDeposit = card?.isChecking || card?.isSaving || card?.isBrokerage;

      let spendAmt = 0;
      if (isDeposit) {
        if (e.amount < 0 && !e.isInterest) {
          spendAmt = Math.abs(e.amount);
        } else if (e.amount > 0) {
          spendAmt = -e.amount;
        }
      } else {
        if (e.amount > 0 && !e.isReward) {
          spendAmt = e.amount;
        } else if (e.amount < 0) {
          spendAmt = e.amount;
        }
      }

      if (spendAmt !== 0) {
        monthSpendMap.set(monthKey, (monthSpendMap.get(monthKey) || 0) + spendAmt);
        const catMap = monthCategoryMap.get(monthKey)!;
        const cat = normalizeCategory(e.category);
        catMap[cat] = (catMap[cat] || 0) + spendAmt;
      }
    }

    // Build trend in reverse chronological order (current month to 11 months ago)
    const trendMonths = last12Months.map(m => ({
      ...m,
      totalSpending: Math.max(0, monthSpendMap.get(m.key) || 0),
    }));

    const total12Months = trendMonths.reduce((s, m) => s + m.totalSpending, 0);
    const avgMonthly = total12Months / 12;
    const maxSpending = Math.max(...trendMonths.map(m => m.totalSpending), 1);

    // Format category spending for each of the 12 months
    const formattedCategories: { [monthKey: string]: { name: string; amount: number; percentage: number; color: string }[] } = {};

    monthCategoryMap.forEach((sums, monthKey) => {
      const totalMonthSpend = Math.max(
        0.001,
        Object.values(sums).reduce((acc, curr) => acc + (curr > 0 ? curr : 0), 0)
      );

      formattedCategories[monthKey] = Object.entries(sums)
        .map(([name, amount]) => {
          const positiveAmt = Math.max(0, amount);
          const percentage = totalMonthSpend > 0 ? (positiveAmt / totalMonthSpend) * 100 : 0;
          return {
            name,
            amount,
            percentage,
            color: getCategoryColor(name),
          };
        })
        .filter(item => Math.abs(item.amount) >= 0.005)
        .sort((a, b) => b.amount - a.amount);
    });

    return {
      monthlySpendingTrend: {
        months: trendMonths,
        total12Months,
        avgMonthly,
        maxSpending,
      },
      categorySpendingByMonth: formattedCategories,
    };
  }, [expenses, cardMap, availableMonths, last12Months]);

  // Category Spending Breakdown for the active month (O(1) instant lookup)
  const categorySpending = useMemo(() => {
    return categorySpendingByMonth[activeMonth] || [];
  }, [categorySpendingByMonth, activeMonth]);

  const totalActiveMonthSpending = useMemo(() => {
    return categorySpending.reduce((sum, item) => sum + Math.max(0, item.amount), 0);
  }, [categorySpending]);

  const handleOpenAddBillModal = () => {
    setEditingBill(null);
    setBillModalVisible(true);
  };

  const handleOpenEditBillModal = (bill: FutureExpense) => {
    setEditingBill(bill);
    setBillModalVisible(true);
  };

  const handleSaveBill = (bill: { id?: string; description: string; amount: number; dueDate?: string; acc: string }) => {
    if (bill.id && onEditFutureExpense) {
      onEditFutureExpense({
        id: bill.id,
        description: bill.description,
        amount: bill.amount,
        dueDate: bill.dueDate,
        acc: bill.acc,
      });
    } else {
      onAddFutureExpense({
        description: bill.description,
        amount: bill.amount,
        dueDate: bill.dueDate,
        acc: bill.acc,
      });
    }
  };

  const handleExecuteBill = (bill: FutureExpense) => {
    const accCard = cards.find(c => c.id === bill.acc);
    const accName = accCard ? `${accCard.name} (${accCard.isSaving ? 'Saving' : 'Checking'})` : 'Account';
    const message = `Execute this scheduled bill?\n\nThis will log a -$${Number(bill.amount).toFixed(2)} transaction to ${accName} with today's date.`;

    const doExecute = () => {
      if (onExecuteFutureExpense) {
        onExecuteFutureExpense(bill);
      }
    };

    if (Platform.OS === 'web') {
      if (confirm(message)) {
        doExecute();
      }
    } else {
      Alert.alert(
        'Execute Scheduled Bill',
        message,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Execute', style: 'default', onPress: doExecute },
        ]
      );
    }
  };

  const handleDeleteBill = (bill: FutureExpense) => {
    const doDelete = () => onDeleteFutureExpense(bill.id);

    if (Platform.OS === 'web') {
      if (confirm(`Are you sure you want to delete "${bill.description}"?`)) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Delete Scheduled Bill',
        `Are you sure you want to delete "${bill.description}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  // Donut SVG Parameters
  const donutSize = 160;
  const strokeWidth = 24;
  const radius = (donutSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  if (showAllTransactions) {
    return (
      <AllTransactionsPage
        expenses={expenses}
        cards={cards}
        onBack={() => setShowAllTransactions(false)}
        onEditExpense={onEditExpense}
        onDeleteExpense={onDeleteExpense}
      />
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
    >
      {cards.length === 0 && (
        <View style={styles.emptyWelcomeBanner}>
          <Text style={styles.emptyWelcomeTitle}>👋 Welcome to ExlExp!</Text>
          <Text style={styles.emptyWelcomeSub}>
            You don't have any accounts or credit cards set up yet. Get started by adding your credit cards, checking, or savings accounts.
          </Text>
          {onNavigateToSettings && (
            <View style={styles.emptyWelcomeActions}>
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={onNavigateToSettings}
              >
                <Text style={styles.btnPrimaryText}>➕ Add Credit Card or Bank Account</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* ========================================================= */}
      {/* 1. FINANCIAL SUMMARY                                      */}
      {/* ========================================================= */}
      <Text style={styles.title}>Financial Summary</Text>

      {/* Main Balances - Spreadsheet Grid Style */}
      <View style={styles.sheetGrid}>
        <View style={styles.sheetHeaderRow}>
          <Text style={[styles.sheetHeaderCell, { flex: 2 }]}>Account Description</Text>
          <Text style={[styles.sheetHeaderCell, { flex: 1, textAlign: 'right' }]}>Balance Value</Text>
        </View>

        <View style={styles.sheetRow}>
          <Text style={[styles.sheetCell, { flex: 2 }]}>Total Checking Balance</Text>
          <Text style={[styles.sheetCell, { flex: 1, textAlign: 'right' }, styles.monoText, { color: '#16a34a' }]}>
            ${formatCurrency(checkingBalance)}
          </Text>
        </View>

        <View style={styles.sheetRow}>
          <Text style={[styles.sheetCell, { flex: 2 }]}>Total Credit Card Debt</Text>
          <Text style={[styles.sheetCell, { flex: 1, textAlign: 'right' }, styles.monoText, creditCardDebt > 0.005 && { color: '#dc2626' }]}>
            ${formatCurrency(creditCardDebt)}
          </Text>
        </View>

        <View style={styles.sheetRow}>
          <Text style={[styles.sheetCell, { flex: 2 }]}>Upcoming Scheduled Bills</Text>
          <Text style={[styles.sheetCell, { flex: 1, textAlign: 'right' }, styles.monoText, futureExpensesTotal > 0.005 && { color: '#dc2626' }]}>
            ${formatCurrency(futureExpensesTotal)}
          </Text>
        </View>

        <View style={[styles.sheetRow, { backgroundColor: '#f8fafc' }]}>
          <Text style={[styles.sheetCell, { flex: 2, fontWeight: 'bold' }]}>Net Financial Position</Text>
          <Text style={[styles.sheetCell, { flex: 1, textAlign: 'right', fontWeight: 'bold' }, styles.monoText]}>
            ${formatCurrency(netBalance)}
          </Text>
        </View>
      </View>

      {/* Recent Transactions */}
      <View style={[styles.sheetGrid, { marginTop: 12 }]}>
        <TouchableOpacity
          style={styles.sheetHeaderRow}
          onPress={() => setShowAllTransactions(true)}
          disabled={expenses.length === 0}
          activeOpacity={expenses.length > 0 ? 0.7 : 1}
          accessibilityRole="button"
          accessibilityLabel="Show all transactions"
        >
          <Text style={[styles.sheetHeaderCell, { flex: 1 }]}>
            Recent Transactions
          </Text>
          
        </TouchableOpacity>

        {recent10Transactions.length === 0 ? (
          <View style={styles.emptyCardRow}>
            <Text style={styles.emptyCardText}>No transactions recorded yet.</Text>
          </View>
        ) : (
          recent10Transactions.map(item => {
            const dateStr = item.date ? item.date.substring(5) : '';

            return (
              <View key={item.id} style={styles.twoLineTxRow}>
                {/* Line 1: Date, Card/Account, Amount */}
                <View style={styles.txLine1}>
                  <Text style={[styles.txDate, styles.monoText]}>{dateStr}</Text>
                  <Text style={styles.txDesc} numberOfLines={1} ellipsizeMode="tail">
                    {item.description}
                  </Text>
                  <Text style={[styles.txAmount, styles.monoText, { color: item.amountColor }]}>
                    {item.formattedAmount}
                  </Text>
                </View>

                {/* Line 2: Empty under date, Desc */}
                <View style={styles.txLine2}>
                  <View style={styles.txDateSpacer} />
                  <Text style={styles.txAccount} numberOfLines={1} ellipsizeMode="tail">
                    {item.displayAccount}
                  </Text>
                </View>
              </View>
            );
          })
        )}

        {expenses.length > 0 && (
          <TouchableOpacity
            style={styles.showAllFooterBtn}
            onPress={() => setShowAllTransactions(true)}
            accessibilityLabel="Show all transactions"
          >
            <Text style={styles.showAllFooterBtnText}>
              Show all transactions →
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ========================================================= */}
      {/* 2. 12-MONTH TOTAL SPENDING TREND (BAR CHART)              */}
      {/* ========================================================= */}
      <View style={styles.analyticsSection}>
        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionHeading}>📊 12-Month Spending Trend</Text>
            <Text style={styles.sectionSubtitle}>Tap any month bar to inspect its category breakdown</Text>
          </View>
          <View style={styles.statsBadgeRow}>
            <View style={styles.statBadge}>
              <Text style={styles.statBadgeLabel}>12-Mo Total</Text>
              <Text style={styles.statBadgeValue}>${formatCurrency(monthlySpendingTrend.total12Months)}</Text>
            </View>
            <View style={styles.statBadge}>
              <Text style={styles.statBadgeLabel}>Monthly Avg</Text>
              <Text style={styles.statBadgeValue}>${formatCurrency(monthlySpendingTrend.avgMonthly)}</Text>
            </View>
          </View>
        </View>

        {/* Bar Chart Container */}
        <View style={styles.barChartCard}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.barChartScroll}
          >
            <View style={styles.barChartGrid}>
              {monthlySpendingTrend.months.map(m => {
                const isSelected = activeMonth === m.key;
                const ratio = m.totalSpending / monthlySpendingTrend.maxSpending;
                const barHeightPercent = Math.max(6, Math.round(ratio * 100));

                return (
                  <TouchableOpacity
                    key={m.key}
                    style={[styles.barColumn, isSelected && styles.barColumnSelected]}
                    onPress={() => setSelectedMonth(m.key)}
                    activeOpacity={0.7}
                  >
                    {/* Amount Label on top of bar */}
                    <Text style={[styles.barAmountLabel, isSelected && styles.barAmountLabelSelected]}>
                      {formatShortK(m.totalSpending)}
                    </Text>

                    {/* Bar Track & Fill */}
                    <View style={styles.barTrackVertical}>
                      <View
                        style={[
                          styles.barFillVertical,
                          { height: `${barHeightPercent}%` },
                          isSelected ? styles.barFillSelected : styles.barFillDefault,
                        ]}
                      />
                    </View>

                    {/* Month and Year Labels */}
                    <Text style={[styles.barMonthLabel, isSelected && styles.barMonthLabelSelected]}>
                      {m.label}
                    </Text>
                    <Text style={[styles.barYearLabel, isSelected && styles.barYearLabelSelected]}>
                      {m.year}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </View>

      {/* ========================================================= */}
      {/* 3. SPENDING DISTRIBUTION (PIE/DONUT WHEEL & BREAKDOWN)    */}
      {/* ========================================================= */}
      <View style={styles.analyticsSection}>
        <View style={styles.monthSelectorRow}>
          <Text style={styles.monthSelectorLabel}>Month:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthSelectorScroll}>
            {availableMonths.map(month => (
              <TouchableOpacity
                key={month}
                style={[
                  styles.monthTab,
                  activeMonth === month && styles.activeMonthTab,
                ]}
                onPress={() => setSelectedMonth(month)}
              >
                <Text
                  style={[
                    styles.monthTabText,
                    activeMonth === month && styles.activeMonthTabText,
                  ]}
                >
                  {formatMonthLabel(month)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.distributionCard}>
          <View style={styles.distributionHeader}>
            <Text style={styles.distributionTitle}>
              Spending Distribution - {formatMonthLabel(activeMonth)}
            </Text>
            <Text style={styles.distributionTotalText}>
              Total Spent: <Text style={styles.monoText}>${formatCurrency(totalActiveMonthSpending)}</Text>
            </Text>
          </View>

          {categorySpending.length === 0 ? (
            <View style={styles.emptyDistributionBox}>
              <Text style={styles.emptyText}>No categorized spending logged for this month.</Text>
            </View>
          ) : (
            <View style={[styles.distributionBody, isWeb ? styles.distributionBodyWeb : styles.distributionBodyMobile]}>
              {/* Donut Wheel */}
              <View style={styles.wheelWrapper}>
                {Platform.OS === 'web' ? (
                  <View style={styles.donutSvgContainer}>
                    {/* @ts-ignore */}
                    <svg
                      width={donutSize}
                      height={donutSize}
                      viewBox={`0 0 ${donutSize} ${donutSize}`}
                      style={{ transform: 'rotate(-90deg)' }}
                    >
                      {(() => {
                        let accumulatedPercent = 0;
                        return categorySpending.map((cat, idx) => {
                          const strokeDasharray = `${(cat.percentage / 100) * circumference} ${circumference}`;
                          const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
                          accumulatedPercent += cat.percentage;
                          return (
                            /* @ts-ignore */
                            <circle
                              key={idx}
                              cx={donutSize / 2}
                              cy={donutSize / 2}
                              r={radius}
                              fill="transparent"
                              stroke={cat.color}
                              strokeWidth={strokeWidth}
                              strokeDasharray={strokeDasharray}
                              strokeDashoffset={strokeDashoffset}
                            />
                          );
                        });
                      })()}
                    </svg>
                    <View style={styles.donutCenter}>
                      <Text style={styles.donutCenterLabel}>Spent</Text>
                      <Text style={styles.donutCenterAmount}>{formatShortK(totalActiveMonthSpending)}</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.donutSvgContainer}>
                    <Svg
                      width={donutSize}
                      height={donutSize}
                      viewBox={`0 0 ${donutSize} ${donutSize}`}
                      style={{ transform: [{ rotate: '-90deg' }] }}
                    >
                      {(() => {
                        let accumulatedPercent = 0;
                        return categorySpending.map((cat, idx) => {
                          const strokeDasharray = `${(cat.percentage / 100) * circumference} ${circumference}`;
                          const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
                          accumulatedPercent += cat.percentage;
                          return (
                            <Circle
                              key={idx}
                              cx={donutSize / 2}
                              cy={donutSize / 2}
                              r={radius}
                              fill="transparent"
                              stroke={cat.color}
                              strokeWidth={strokeWidth}
                              strokeDasharray={strokeDasharray}
                              strokeDashoffset={strokeDashoffset}
                            />
                          );
                        });
                      })()}
                    </Svg>
                    <View style={styles.donutCenter}>
                      <Text style={styles.donutCenterLabel}>Spent</Text>
                      <Text style={styles.donutCenterAmount}>{formatShortK(totalActiveMonthSpending)}</Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Category Breakdown Legend */}
              <View style={styles.categoryLegendList}>
                {categorySpending.map(cat => (
                  <View key={cat.name} style={styles.legendRow}>
                    <View style={styles.legendTopLine}>
                      <View style={styles.legendNameBox}>
                        <View style={[styles.colorDot, { backgroundColor: cat.color }]} />
                        <Text style={styles.legendCategoryName}>{cat.name}</Text>
                      </View>
                      <View style={styles.legendAmountBox}>
                        <Text style={[styles.legendAmountText, styles.monoText]}>
                          {formatSpending(cat.amount)}
                        </Text>
                        <Text style={styles.legendPercentText}>
                          {cat.percentage.toFixed(1)}%
                        </Text>
                      </View>
                    </View>
                    {/* Progress Bar */}
                    <View style={styles.categoryBarTrack}>
                      <View
                        style={[
                          styles.categoryBarFill,
                          { width: `${Math.min(100, Math.max(3, cat.percentage))}%`, backgroundColor: cat.color },
                        ]}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </View>


      {/* Checking Accounts List - Spreadsheet Grid Style */}
      <View style={[styles.sheetGrid, { marginTop: 12 }]}>
        <View style={styles.sheetHeaderRow}>
          <Text style={[styles.sheetHeaderCell, { flex: 2 }]}>Active Checking Accounts</Text>
          <Text style={[styles.sheetHeaderCell, { flex: 1, textAlign: 'right' }]}>Current Balance</Text>
        </View>
        {activeCheckingAccounts.length === 0 ? (
          <View style={styles.emptyCardRow}>
            <Text style={styles.emptyCardText}>
              No checking accounts with active balance.
            </Text>
            {onNavigateToSettings && (
              <TouchableOpacity style={styles.btnSmall} onPress={onNavigateToSettings}>
                <Text style={styles.btnSmallText}>➕ Add Account</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          activeCheckingAccounts.map(account => {
            const bal = cardBalances[account.id] || 0.0;
            return (
              <View key={account.id} style={styles.sheetRow}>
                <Text style={[styles.sheetCell, { flex: 2 }]}>🏛️ {account.name}</Text>
                <Text style={[styles.sheetCell, { flex: 1, textAlign: 'right' }, styles.monoText, bal >= 0.005 ? { color: '#16a34a' } : (bal < -0.005 ? { color: '#dc2626' } : { color: '#334155' })]}>
                  ${formatCurrency(bal)}
                </Text>
              </View>
            );
          })
        )}
      </View>

      {/* Credit Card List - Spreadsheet Grid Style */}
      <View style={[styles.sheetGrid, { marginTop: 12 }]}>
        <View style={styles.sheetHeaderRow}>
          <Text style={[styles.sheetHeaderCell, { flex: 2 }]}>Credit Cards with Balance</Text>
          <Text style={[styles.sheetHeaderCell, { flex: 1, textAlign: 'right' }]}>Owed Balance</Text>
        </View>
        {activeCreditCards.length === 0 ? (
          <View style={styles.emptyCardRow}>
            <Text style={styles.emptyCardText}>
              No credit cards with active balance.
            </Text>
            {onNavigateToSettings && (
              <TouchableOpacity style={styles.btnSmall} onPress={onNavigateToSettings}>
                <Text style={styles.btnSmallText}>➕ Add Credit Card</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          activeCreditCards.map(card => {
            const bal = cardBalances[card.id] || 0.0;
            return (
              <View key={card.id} style={styles.sheetRow}>
                <Text style={[styles.sheetCell, { flex: 2 }]}>💳 {card.name}</Text>
                <Text style={[styles.sheetCell, { flex: 1, textAlign: 'right' }, styles.monoText, bal > 0.005 && { color: '#dc2626' }]}>
                  {bal >= 0.005 ? `$${formatCurrency(bal)}` : (bal < -0.005 ? `-$${formatCurrency(Math.abs(bal))}` : `$${formatCurrency(bal)}`)}
                </Text>
              </View>
            );
          })
        )}
      </View>

      {/* Future Bills Box - Spreadsheet Grid Style */}
      <View style={[styles.sheetGrid, { marginTop: 12 }]}>
        <View style={[styles.sheetHeaderRow, { justifyContent: 'space-between', alignItems: 'center', paddingRight: 8 }]}>
          <Text style={[styles.sheetHeaderCell, { flex: 1, borderBottomWidth: 0 }]}>Upcoming Scheduled Bills</Text>
          <TouchableOpacity
            style={styles.btnAddBillHeader}
            onPress={handleOpenAddBillModal}
            accessibilityLabel="Add Scheduled Bill"
          >
            <Text style={styles.btnAddBillHeaderText}>➕ Add Bill</Text>
          </TouchableOpacity>
        </View>

        {/* Future Bills Table Headers (Web only) */}
        {isWeb && (
          <View style={styles.tableSubHeader}>
            <Text style={[styles.subHeaderCell, { flex: 2.5 }]}>Bill Item</Text>
            <Text style={[styles.subHeaderCell, { flex: 1.1, textAlign: 'right' }]}>Amount</Text>
            <Text style={[styles.subHeaderCell, { flex: 1.2, textAlign: 'center' }]}>Due Date</Text>
            <Text style={[styles.subHeaderCell, { flex: 1.5, textAlign: 'center' }]}>Acc (Checking/Sav)</Text>
            <Text style={[styles.subHeaderCell, { flex: 1.5, textAlign: 'center' }]}>Action</Text>
          </View>
        )}

        {/* Future Bills Rows */}
        {futureExpenses.length === 0 ? (
          <View style={styles.sheetRow}>
            <Text style={[styles.sheetCell, { flex: 1, textAlign: 'center', color: '#64748b', paddingVertical: 14 }]}>
              No upcoming scheduled bills logged.
            </Text>
          </View>
        ) : (
          futureExpenses.map(item => {
            const accCard = cards.find(c => c.id === item.acc);

            // Web Spreadsheet Row View
            if (isWeb) {
              return (
                <View key={item.id} style={styles.sheetRow}>
                  <Text style={[styles.sheetCell, { flex: 2.5 }]}>{item.description}</Text>
                  <Text style={[styles.sheetCell, { flex: 1.1, textAlign: 'right' }, styles.monoText]}>
                    ${Number(item.amount).toFixed(2)}
                  </Text>
                  <Text style={[styles.sheetCell, { flex: 1.2, textAlign: 'center' }, styles.monoText]}>
                    {item.dueDate || '-'}
                  </Text>
                  <View style={[styles.sheetCell, { flex: 1.5, justifyContent: 'center', alignItems: 'center' }]}>
                    {accCard ? (
                      <View style={[styles.accBadge, accCard.isSaving ? styles.savingBadge : styles.checkingBadge]}>
                        <Text
                          style={[styles.accBadgeText, accCard.isSaving ? styles.savingBadgeText : styles.checkingBadgeText]}
                          numberOfLines={1}
                        >
                          {accCard.name} ({accCard.isSaving ? 'Sav' : 'Chk'})
                        </Text>
                      </View>
                    ) : (
                      <Text style={[styles.monoText, { color: '#94a3b8', fontSize: 12 }]}>
                        {item.acc || '-'}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.sheetCell, { flex: 1.5, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 2 }]}>
                    <TouchableOpacity
                      style={styles.btnActionExecute}
                      onPress={() => handleExecuteBill(item)}
                      accessibilityLabel="Execute bill"
                      accessibilityHint="Log bill transaction into account on today's date"
                    >
                      <Text style={styles.btnActionExecuteText}>⚡</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.btnActionEdit}
                      onPress={() => handleOpenEditBillModal(item)}
                      accessibilityLabel="Edit bill"
                    >
                      <Text style={styles.btnActionEditText}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.btnDangerSmall}
                      onPress={() => handleDeleteBill(item)}
                      accessibilityLabel="Delete bill"
                    >
                      <Text style={styles.btnDangerSmallText}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }

            // Mobile / App Multiline Card View
            return (
              <View key={item.id} style={styles.billMobileCard}>
                {/* Line 1: Bill Item Name & Amount */}
                <View style={styles.billMobileLine1}>
                  <Text style={styles.billMobileDesc} numberOfLines={1} ellipsizeMode="tail">
                    {item.description}
                  </Text>
                  <Text style={[styles.billMobileAmount, styles.monoText]}>
                    ${Number(item.amount).toFixed(2)}
                  </Text>
                </View>

                {/* Line 2: Due Date, Account Badge, and Actions */}
                <View style={styles.billMobileLine2}>
                  <View style={styles.billMobileMeta}>
                    {item.dueDate ? (
                      <Text style={[styles.billMobileDueDate, styles.monoText]}>
                        Due: {item.dueDate}
                      </Text>
                    ) : null}
                    {accCard ? (
                      <View style={[styles.accBadge, accCard.isSaving ? styles.savingBadge : styles.checkingBadge]}>
                        <Text
                          style={[styles.accBadgeText, accCard.isSaving ? styles.savingBadgeText : styles.checkingBadgeText]}
                          numberOfLines={1}
                        >
                          {accCard.name} ({accCard.isSaving ? 'Sav' : 'Chk'})
                        </Text>
                      </View>
                    ) : (
                      <Text style={[styles.monoText, { color: '#94a3b8', fontSize: 11 }]}>
                        {item.acc || 'No Acc'}
                      </Text>
                    )}
                  </View>
                  <View style={styles.billMobileActions}>
                    <TouchableOpacity
                      style={styles.btnActionExecute}
                      onPress={() => handleExecuteBill(item)}
                      accessibilityLabel="Execute bill"
                      accessibilityHint="Log bill transaction into account on today's date"
                    >
                      <Text style={styles.btnActionExecuteText}>⚡</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.btnActionEdit}
                      onPress={() => handleOpenEditBillModal(item)}
                      accessibilityLabel="Edit bill"
                    >
                      <Text style={styles.btnActionEditText}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.btnDangerSmall}
                      onPress={() => handleDeleteBill(item)}
                      accessibilityLabel="Delete bill"
                    >
                      <Text style={styles.btnDangerSmallText}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>

      <ScheduledBillModal
        visible={billModalVisible}
        onClose={() => setBillModalVisible(false)}
        onSave={handleSaveBill}
        initialBill={editingBill}
        cards={cards}
      />

      
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  contentContainer: { padding: 16, paddingBottom: Platform.OS === 'web' ? 24 : 48 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#0f172a', marginBottom: 12 },
  sheetGrid: { borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#ffffff', borderRadius: 4, overflow: 'hidden' },
  sheetHeaderRow: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderBottomWidth: 1, borderBottomColor: '#cbd5e1' },
  sheetHeaderCell: { fontSize: 12, fontWeight: 'bold', color: '#334155', paddingVertical: 8, paddingHorizontal: 8 },
  sheetRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#cbd5e1', alignItems: 'center' },
  sheetCell: { fontSize: 13, color: '#334155', paddingVertical: 6, paddingHorizontal: 8 },
  monoText: { fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  inlineFormRow: { flexDirection: 'row', backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#cbd5e1', padding: 6, gap: 6, alignItems: 'center' },
  formInput: { borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#ffffff', paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, color: '#0f172a', height: 32, borderRadius: 4 },
  tableSubHeader: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderBottomWidth: 1, borderBottomColor: '#cbd5e1' },
  subHeaderCell: { fontSize: 11, fontWeight: 'bold', color: '#475569', paddingVertical: 6, paddingHorizontal: 8 },
  btnPrimary: { backgroundColor: '#0f172a', paddingVertical: 9, paddingHorizontal: 16, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryText: { color: '#ffffff', fontSize: 13, fontWeight: 'bold' },
  btnPrimarySmall: { backgroundColor: '#0f172a', width: 34, height: 32, justifyContent: 'center', alignItems: 'center', borderRadius: 6 },
  btnPrimarySmallText: { fontSize: 13, color: '#ffffff' },
  btnSmall: { backgroundColor: '#0f172a', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, alignItems: 'center' },
  btnSmallText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  btnDangerSmall: { backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fca5a5', width: 28, height: 26, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  btnDangerSmallText: { fontSize: 12 },
  btnAddBillHeader: { backgroundColor: '#0f172a', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4, marginRight: 6 },
  btnAddBillHeaderText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  accBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, maxWidth: '100%' },
  checkingBadge: { backgroundColor: '#dcfce7' },
  checkingBadgeText: { color: '#15803d', fontSize: 11, fontWeight: '700' },
  savingBadge: { backgroundColor: '#dbeafe' },
  savingBadgeText: { color: '#1e40af', fontSize: 11, fontWeight: '700' },
  accBadgeText: { fontSize: 11, fontWeight: '700' },
  btnActionExecute: { backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fde047', width: 28, height: 26, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  btnActionExecuteText: { fontSize: 12 },
  btnActionEdit: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1', width: 28, height: 26, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  btnActionEditText: { fontSize: 12 },
  billMobileCard: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#cbd5e1', backgroundColor: '#ffffff' },
  billMobileLine1: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  billMobileDesc: { fontSize: 14, fontWeight: '700', color: '#0f172a', flex: 1, marginRight: 10 },
  billMobileAmount: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  billMobileLine2: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  billMobileMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap' },
  billMobileDueDate: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  billMobileActions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8 },
  emptyWelcomeBanner: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac', borderRadius: 8, padding: 16, marginBottom: 16 },
  emptyWelcomeTitle: { fontSize: 16, fontWeight: '800', color: '#15803d', marginBottom: 4 },
  emptyWelcomeSub: { fontSize: 13, color: '#334155', lineHeight: 18, marginBottom: 12 },
  emptyWelcomeActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emptyCardRow: { padding: 14, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyCardText: { fontSize: 13, color: '#64748b', textAlign: 'center' },
  analyticsSection: { marginTop: 20 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  sectionHeading: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  sectionSubtitle: { fontSize: 12, color: '#64748b', marginTop: 2 },
  statsBadgeRow: { flexDirection: 'row', gap: 8 },
  statBadge: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 10, alignItems: 'flex-end' },
  statBadgeLabel: { fontSize: 10, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  statBadgeValue: { fontSize: 13, fontWeight: '800', color: '#0f172a', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  barChartCard: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 14, overflow: 'hidden', alignItems: 'center' },
  barChartScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', minWidth: '100%', paddingVertical: 4 },
  barChartGrid: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 170, gap: 8, width: '100%', minWidth: 540, maxWidth: 960, alignSelf: 'center', paddingTop: 16, paddingBottom: 4 },
  barColumn: { flex: 1, maxWidth: 64, minWidth: 36, alignItems: 'center', justifyContent: 'flex-end', height: '100%', paddingHorizontal: 2, paddingVertical: 4, borderRadius: 6 },
  barColumnSelected: { backgroundColor: '#eff6ff' },
  barAmountLabel: { fontSize: 10, fontWeight: '700', color: '#64748b', marginBottom: 6, textAlign: 'center', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  barAmountLabelSelected: { color: '#2563eb', fontWeight: '800' },
  barTrackVertical: { width: 22, flex: 1, backgroundColor: '#f1f5f9', borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0', alignSelf: 'center' },
  barFillVertical: { width: '100%', borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  barFillDefault: { backgroundColor: '#94a3b8' },
  barFillSelected: { backgroundColor: '#0f172a' },
  barMonthLabel: { fontSize: 11, fontWeight: '700', color: '#475569', marginTop: 6, textAlign: 'center' },
  barMonthLabelSelected: { color: '#0f172a', fontWeight: '800' },
  barYearLabel: { fontSize: 9, color: '#94a3b8', textAlign: 'center' },
  barYearLabelSelected: { color: '#2563eb', fontWeight: 'bold' },
  monthSelectorRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1', paddingHorizontal: 12, height: 38, borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  monthSelectorLabel: { fontSize: 12, fontWeight: 'bold', color: '#64748b', marginRight: 8, textTransform: 'uppercase' },
  monthSelectorScroll: { alignItems: 'flex-end', height: '100%' },
  monthTab: { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#e2e8f0', borderTopLeftRadius: 4, borderTopRightRadius: 4, borderWidth: 1, borderColor: '#cbd5e1', borderBottomWidth: 0, marginRight: 6, bottom: -1 },
  activeMonthTab: { backgroundColor: '#ffffff', borderBottomColor: '#ffffff' },
  monthTabText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  activeMonthTabText: { color: '#0f172a', fontWeight: 'bold' },
  distributionCard: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderBottomLeftRadius: 6, borderBottomRightRadius: 6, padding: 16 },
  distributionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 10 },
  distributionTitle: { fontSize: 15, fontWeight: 'bold', color: '#0f172a' },
  distributionTotalText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  emptyDistributionBox: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 13, color: '#64748b', textAlign: 'center' },
  distributionBody: { gap: 20, alignItems: 'center' },
  distributionBodyWeb: { flexDirection: 'row', alignItems: 'center' },
  distributionBodyMobile: { flexDirection: 'column', alignItems: 'center' },
  wheelWrapper: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  donutSvgContainer: { position: 'relative', width: 160, height: 160, alignItems: 'center', justifyContent: 'center' },
  donutCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  donutCenterLabel: { fontSize: 11, color: '#64748b', fontWeight: '700', textTransform: 'uppercase' },
  donutCenterAmount: { fontSize: 16, fontWeight: '800', color: '#0f172a', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  categoryLegendList: { flex: 1, width: '100%', gap: 10 },
  legendRow: { paddingVertical: 4 },
  legendTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  legendNameBox: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colorDot: { width: 10, height: 10, borderRadius: 3 },
  legendCategoryName: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  legendAmountBox: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendAmountText: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  legendPercentText: { fontSize: 11, color: '#64748b', fontWeight: '700', width: 44, textAlign: 'right' },
  categoryBarTrack: { height: 5, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden' },
  categoryBarFill: { height: '100%', borderRadius: 3 },
  twoLineTxRow: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  txLine1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  txDate: {
    fontSize: 11,
    color: '#64748b',
    width: 44,
  },
  txAccount: {
    flex: 1,
    marginLeft: 6,
    marginRight: 8,
    fontSize: 10,
    fontWeight: '600',
    color: '#5d5d5d',
  },
  txAmount: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  txLine2: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  txDateSpacer: {
    width: 44,
  },
  txDesc: {
    flex: 1,
    marginLeft: 6,
    marginRight: 8,
    fontSize: 13,
    color: '#000000',
  },
  showAllFooterBtn: {
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#cbd5e1',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  showAllFooterBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
});
