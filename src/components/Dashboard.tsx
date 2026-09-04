import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Expense, CreditCard, FutureExpense } from '../types';

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
  rent: '#6366f1', // Indigo
  housing: '#6366f1',
  utilities: '#0284c7', // Sky Blue
  utility: '#0284c7',
  'car payment': '#8b5cf6', // Purple
  transportation: '#8b5cf6', // Violet
  transport: '#8b5cf6',
  gas: '#ec4899',
  grocery: '#10b981', // Emerald Green
  groceries: '#10b981',
  'grocery / food': '#10b981',
  food: '#f59e0b', // Amber
  'eating out': '#f59e0b', // Amber
  dining: '#f59e0b',
  restaurant: '#f59e0b',
  'necessary purchases': '#14b8a6', // Teal
  necessary: '#14b8a6',
  'luxary purchases': '#ec4899', // Pink
  'luxury purchases': '#ec4899',
  luxury: '#ec4899',
  shopping: '#ec4899',
  bills: '#0284c7',
  entertainment: '#f97316', // Orange
  subscriptions: '#a855f7', // Purple
  subscription: '#a855f7',
  health: '#ef4444', // Red
  healthcare: '#ef4444',
  medical: '#ef4444',
  travel: '#06b6d4', // Cyan
  personal: '#14b8a6',
  fee: '#b45309', // Amber Brown
  'annual fee': '#b45309',
  fees: '#b45309',
  others: '#64748b', // Slate Gray
  other: '#64748b',
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
  const clean = name.trim().toLowerCase();
  if (CATEGORY_COLORS[clean]) {
    return CATEGORY_COLORS[clean];
  }
  // Deterministic string hash fallback so colors never change across months
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = clean.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
};

interface DashboardProps {
  expenses: Expense[];
  cards: CreditCard[];
  futureExpenses: FutureExpense[];
  onAddFutureExpense: (expense: Omit<FutureExpense, 'id'>) => void;
  onDeleteFutureExpense: (id: string) => void;
  onNavigateToSettings?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  expenses,
  cards,
  futureExpenses,
  onAddFutureExpense,
  onDeleteFutureExpense,
  onNavigateToSettings,
}) => {
  const { width } = useWindowDimensions();
  const isWeb = width > 768;

  // Future Expense Form State
  const [futureDesc, setFutureDesc] = useState('');
  const [futureAmount, setFutureAmount] = useState('');
  const [futureDate, setFutureDate] = useState('');

  // Month selector states
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    const today = new Date();
    const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    monthsSet.add(currentMonthStr);
    expenses.forEach(e => {
      if (e.date && e.date.length >= 7) {
        monthsSet.add(e.date.substring(0, 7));
      }
    });
    return Array.from(monthsSet).sort().reverse();
  }, [expenses]);

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

  // 12-Month Rolling Spending Trend
  const monthlySpendingTrend = useMemo(() => {
    const today = new Date();
    const months: {
      key: string;
      label: string;
      year: string;
      fullLabel: string;
      totalSpending: number;
    }[] = [];

    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      const year = `'${String(d.getFullYear()).slice(-2)}`;
      const fullLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      let monthSpend = 0;
      expenses.forEach(e => {
        if (e.isTransfer || e.category === 'Transfer' || e.category === 'Salary') return;
        if (!e.date || !e.date.startsWith(key)) return;

        const card = cardMap.get(e.creditCardId);
        const isDeposit = card?.isChecking || card?.isSaving || card?.isBrokerage;

        if (isDeposit) {
          if (e.amount < 0 && !e.isInterest) {
            monthSpend += Math.abs(e.amount);
          } else if (e.amount > 0) {
            monthSpend -= e.amount;
          }
        } else {
          if (e.amount > 0 && !e.isReward) {
            monthSpend += e.amount;
          } else if (e.amount < 0) {
            monthSpend += e.amount;
          }
        }
      });

      months.push({
        key,
        label,
        year,
        fullLabel,
        totalSpending: Math.max(0, monthSpend),
      });
    }

    const total12Months = months.reduce((s, m) => s + m.totalSpending, 0);
    const avgMonthly = total12Months / 12;
    const maxSpending = Math.max(...months.map(m => m.totalSpending), 1);

    return {
      months,
      total12Months,
      avgMonthly,
      maxSpending,
    };
  }, [expenses, cardMap]);

  // Category Spending Breakdown for the active month
  const categorySpending = useMemo(() => {
    const sums: { [category: string]: number } = {};
    expenses.forEach(e => {
      // Exclude transfers and salaries from spending analytics
      if (e.isTransfer || e.category === 'Transfer' || e.category === 'Salary') return;

      // Filter by selected month
      if (!e.date || !e.date.startsWith(activeMonth)) return;

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
        if (e.amount > 0 && !e.isFee && !e.isReward) {
          spendAmt = e.amount;
        } else if (e.isFee && e.amount > 0) {
          spendAmt = e.amount;
        } else if (e.amount < 0) {
          spendAmt = e.amount;
        }
      }

      if (spendAmt !== 0) {
        const cat = e.category || 'Others';
        sums[cat] = (sums[cat] || 0) + spendAmt;
      }
    });

    const totalMonthSpend = Math.max(
      0.001,
      Object.values(sums).reduce((acc, curr) => acc + (curr > 0 ? curr : 0), 0)
    );

    return Object.entries(sums)
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
  }, [expenses, cardMap, activeMonth]);

  const totalActiveMonthSpending = useMemo(() => {
    return categorySpending.reduce((sum, item) => sum + Math.max(0, item.amount), 0);
  }, [categorySpending]);

  const handleAddFutureExpense = () => {
    if (!futureDesc.trim()) return alert('Please enter a description');
    const amt = parseFloat(futureAmount);
    if (isNaN(amt) || amt <= 0) return alert('Please enter a valid amount');

    onAddFutureExpense({
      description: futureDesc.trim(),
      amount: amt,
      dueDate: futureDate.trim() || undefined,
    });

    setFutureDesc('');
    setFutureAmount('');
    setFutureDate('');
  };

  // Donut SVG Parameters
  const donutSize = 160;
  const strokeWidth = 24;
  const radius = (donutSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

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
          <Text style={[styles.sheetHeaderCell, { flex: 2 }]}>Checking Accounts Registry (Active)</Text>
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
          <Text style={[styles.sheetHeaderCell, { flex: 2 }]}>Credit Card Registry (Active)</Text>
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
        <View style={styles.sheetHeaderRow}>
          <Text style={[styles.sheetHeaderCell, { flex: 3 }]}>Upcoming Scheduled Bills (Future Expenses)</Text>
        </View>

        {/* Inline Add Row Form */}
        <View style={styles.inlineFormRow}>
          <TextInput
            style={[styles.formInput, { flex: 2 }]}
            value={futureDesc}
            onChangeText={setFutureDesc}
            placeholder="Bill Name (e.g. Rent)"
            placeholderTextColor="#94a3b8"
          />
          <TextInput
            style={[styles.formInput, { flex: 1 }]}
            value={futureAmount}
            onChangeText={setFutureAmount}
            placeholder="Amount"
            placeholderTextColor="#94a3b8"
            keyboardType="decimal-pad"
          />
          <TextInput
            style={[styles.formInput, { flex: 1 }]}
            value={futureDate}
            onChangeText={setFutureDate}
            placeholder="Due Date"
            placeholderTextColor="#94a3b8"
          />
          <TouchableOpacity style={styles.btnPrimarySmall} onPress={handleAddFutureExpense} accessibilityLabel="Add">
            <Text style={styles.btnPrimarySmallText}>➕</Text>
          </TouchableOpacity>
        </View>

        {/* Future Bills Table Headers */}
        <View style={styles.tableSubHeader}>
          <Text style={[styles.subHeaderCell, { flex: 2 }]}>Bill Item</Text>
          <Text style={[styles.subHeaderCell, { flex: 1, textAlign: 'right' }]}>Amount</Text>
          <Text style={[styles.subHeaderCell, { flex: 1.2, textAlign: 'center' }]}>Due Date</Text>
          <Text style={[styles.subHeaderCell, { flex: 1, textAlign: 'center' }]}>Action</Text>
        </View>

        {/* Future Bills Rows */}
        {futureExpenses.length === 0 ? (
          <View style={styles.sheetRow}>
            <Text style={[styles.sheetCell, { flex: 5, textAlign: 'center', color: '#64748b' }]}>
              No upcoming scheduled bills logged.
            </Text>
          </View>
        ) : (
          futureExpenses.map(item => (
            <View key={item.id} style={styles.sheetRow}>
              <Text style={[styles.sheetCell, { flex: 2 }]}>{item.description}</Text>
              <Text style={[styles.sheetCell, { flex: 1, textAlign: 'right' }, styles.monoText]}>
                ${Number(item.amount).toFixed(2)}
              </Text>
              <Text style={[styles.sheetCell, { flex: 1.2, textAlign: 'center' }, styles.monoText]}>{item.dueDate || '-'}</Text>
              <View style={[styles.sheetCell, { flex: 1, alignItems: 'center', paddingVertical: 2 }]}>
                <TouchableOpacity style={styles.btnDangerSmall} onPress={() => onDeleteFutureExpense(item.id)} accessibilityLabel="Delete">
                  <Text style={styles.btnDangerSmallText}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  contentContainer: { padding: 16, paddingBottom: 100 },
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
});
