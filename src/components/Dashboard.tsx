import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TextInput, TouchableOpacity, useWindowDimensions, DimensionValue, Platform } from 'react-native';
import { Expense, CreditCard, FutureExpense } from '../types';

interface DashboardProps {
  expenses: Expense[];
  cards: CreditCard[];
  futureExpenses: FutureExpense[];
  onAddFutureExpense: (expense: Omit<FutureExpense, 'id'>) => void;
  onDeleteFutureExpense: (id: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  expenses,
  cards,
  futureExpenses,
  onAddFutureExpense,
  onDeleteFutureExpense,
}) => {
  const { width } = useWindowDimensions();
  const isWeb = width > 768;

  // Future Expense Form State
  const [futureDesc, setFutureDesc] = useState('');
  const [futureAmount, setFutureAmount] = useState('');
  const [futureDate, setFutureDate] = useState('');

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

  const checkingAccounts = useMemo(() => {
    return cards.filter(c => c.isChecking || c.isSaving);
  }, [cards]);

  const creditCardsOnly = useMemo(() => {
    return cards.filter(c => !c.isChecking && !c.isSaving);
  }, [cards]);

  const checkingBalance = useMemo(() => {
    return checkingAccounts.reduce((sum, account) => {
      const bal = cardBalances[account.id] || 0;
      return sum + bal; // Now deposits are positive, withdrawals are negative. So balance = sum(amount)
    }, 0);
  }, [cardBalances, checkingAccounts]);

  const creditCardDebt = useMemo(() => {
    return creditCardsOnly.reduce((sum, card) => {
      const bal = cardBalances[card.id] || 0;
      return sum + bal;
    }, 0);
  }, [cardBalances, creditCardsOnly]);

  const netBalance = useMemo(() => {
    return checkingBalance - creditCardDebt;
  }, [checkingBalance, creditCardDebt]);

  // Statistics for breakdown tables (monthly spending by card/account)
  const stats = useMemo(() => {
    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let total = 0;
    let thisMonthTotal = 0;
    const cardTotals: { [key: string]: number } = {};

    expenses.forEach(e => {
      const amount = Number(e.amount) || 0;
      const card = cardMap.get(e.creditCardId);
      if (!card) return;

      let amountToCount = 0;
      if (card.isChecking || card.isSaving) {
        if (amount < 0) { // checking/saving withdrawal (spending)
          amountToCount = Math.abs(amount);
        }
      } else { // credit card standard spend
        if (amount > 0 && !e.isFee && !e.isReward) {
          amountToCount = amount;
        }
      }

      if (amountToCount > 0) {
        total += amountToCount;
        if (e.date.startsWith(currentMonthStr)) {
          thisMonthTotal += amountToCount;
        }
        const cardName = card.name;
        cardTotals[cardName] = (cardTotals[cardName] || 0) + amountToCount;
      }
    });

    const cardBreakdown = Object.keys(cardTotals)
      .map(name => ({ name, value: cardTotals[name] }))
      .sort((a, b) => b.value - a.value);

    return {
      total,
      thisMonthTotal,
      cardBreakdown,
    };
  }, [expenses, cardMap]);

  const maxCardValue = useMemo(() => {
    return stats.cardBreakdown.length > 0 ? stats.cardBreakdown[0].value : 1;
  }, [stats.cardBreakdown]);

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
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
            ${checkingBalance.toFixed(2)}
          </Text>
        </View>

        <View style={styles.sheetRow}>
          <Text style={[styles.sheetCell, { flex: 2 }]}>Total Credit Card Debt</Text>
          <Text style={[styles.sheetCell, { flex: 1, textAlign: 'right' }, styles.monoText, creditCardDebt > 0 && { color: '#dc2626' }]}>
            ${creditCardDebt.toFixed(2)}
          </Text>
        </View>

        <View style={[styles.sheetRow, { backgroundColor: '#f8fafc' }]}>
          <Text style={[styles.sheetCell, { flex: 2, fontWeight: 'bold' }]}>Net Financial Position</Text>
          <Text style={[styles.sheetCell, { flex: 1, textAlign: 'right', fontWeight: 'bold' }, styles.monoText]}>
            ${netBalance.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* Checking Accounts List - Spreadsheet Grid Style */}
      <View style={[styles.sheetGrid, { marginTop: 12 }]}>
        <View style={styles.sheetHeaderRow}>
          <Text style={[styles.sheetHeaderCell, { flex: 2 }]}>Checking Accounts Registry</Text>
          <Text style={[styles.sheetHeaderCell, { flex: 1, textAlign: 'right' }]}>Current Balance</Text>
        </View>
        {checkingAccounts.length === 0 ? (
          <View style={styles.sheetRow}>
            <Text style={[styles.sheetCell, { flex: 3, textAlign: 'center', color: '#64748b' }]}>
              No checking accounts configured.
            </Text>
          </View>
        ) : (
          checkingAccounts.map(account => {
            const bal = cardBalances[account.id] || 0.0;
            return (
              <View key={account.id} style={styles.sheetRow}>
                <Text style={[styles.sheetCell, { flex: 2 }]}>{account.name}</Text>
                <Text style={[styles.sheetCell, { flex: 1, textAlign: 'right' }, styles.monoText, bal >= 0 ? { color: '#16a34a' } : { color: '#dc2626' }]}>
                  ${bal.toFixed(2)}
                </Text>
              </View>
            );
          })
        )}
      </View>

      {/* Credit Card List - Spreadsheet Grid Style */}
      <View style={[styles.sheetGrid, { marginTop: 12 }]}>
        <View style={styles.sheetHeaderRow}>
          <Text style={[styles.sheetHeaderCell, { flex: 2 }]}>Credit Card Registry</Text>
          <Text style={[styles.sheetHeaderCell, { flex: 1, textAlign: 'right' }]}>Owed Balance</Text>
        </View>
        {creditCardsOnly.length === 0 ? (
          <View style={styles.sheetRow}>
            <Text style={[styles.sheetCell, { flex: 3, textAlign: 'center', color: '#64748b' }]}>
              No credit cards configured.
            </Text>
          </View>
        ) : (
          creditCardsOnly.map(card => {
            const bal = cardBalances[card.id] || 0.0;
            return (
              <View key={card.id} style={styles.sheetRow}>
                <Text style={[styles.sheetCell, { flex: 2 }]}>{card.name}</Text>
                <Text style={[styles.sheetCell, { flex: 1, textAlign: 'right' }, styles.monoText, bal > 0 && { color: '#dc2626' }]}>
                  {bal >= 0 ? `$${bal.toFixed(2)}` : `-$${Math.abs(bal).toFixed(2)}`}
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
          <TouchableOpacity style={styles.formAddBtn} onPress={handleAddFutureExpense}>
            <Text style={styles.formAddBtnText}>Add</Text>
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
                <TouchableOpacity onPress={() => onDeleteFutureExpense(item.id)}>
                  <Text style={styles.delBtnText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Breakdowns */}
      <View style={[styles.sheetGrid, { marginTop: 12 }]}>
        <View style={styles.sheetHeaderRow}>
          <Text style={styles.sheetHeaderCell}>Month Spending by Card/Account</Text>
        </View>
        {stats.cardBreakdown.length === 0 ? (
          <Text style={styles.emptyText}>No data available.</Text>
        ) : (
          stats.cardBreakdown.map((item, idx) => {
            const percentage = stats.total > 0 ? (item.value / stats.total) * 100 : 0;
            const fillWidth = `${(item.value / maxCardValue) * 100}%` as DimensionValue;
            return (
              <View key={idx} style={styles.barItem}>
                <View style={styles.barHeader}>
                  <Text style={styles.barName} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.barValue, styles.monoText]}>
                    ${item.value.toFixed(2)} ({percentage.toFixed(0)}%)
                  </Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: fillWidth, backgroundColor: '#475569' }]} />
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 12,
  },
  sheetGrid: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
  },
  sheetHeaderCell: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#334155',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  sheetRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    alignItems: 'center',
  },
  sheetCell: {
    fontSize: 13,
    color: '#334155',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  monoText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  inlineFormRow: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    padding: 6,
    gap: 6,
    alignItems: 'center',
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontSize: 12,
    color: '#0f172a',
    height: 28,
  },
  formAddBtn: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    height: 28,
  },
  formAddBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  tableSubHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
  },
  subHeaderCell: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#475569',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  delBtnText: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '600',
  },
  breakdownRow: {
    flexDirection: 'column',
    gap: 16,
  },
  breakdownRowWeb: {
    flexDirection: 'row',
  },
  sectionCardWeb: {
    flex: 1,
  },
  emptyText: {
    padding: 16,
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  barItem: {
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  barName: {
    fontSize: 13,
    color: '#475569',
    flex: 1,
    marginRight: 8,
  },
  barValue: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '500',
  },
  barTrack: {
    height: 6,
    backgroundColor: '#f1f5f9',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
  },
});
