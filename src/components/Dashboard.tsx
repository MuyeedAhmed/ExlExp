import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TextInput, TouchableOpacity, useWindowDimensions, DimensionValue, Platform } from 'react-native';
import { Expense, CreditCard, FutureExpense } from '../types';

const formatCurrency = (val: number): string => {
  if (Math.abs(val) < 0.005) return '0.00';
  return val.toFixed(2);
};

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

      {/* Checking Accounts List - Spreadsheet Grid Style */}
      <View style={[styles.sheetGrid, { marginTop: 12 }]}>
        <View style={styles.sheetHeaderRow}>
          <Text style={[styles.sheetHeaderCell, { flex: 2 }]}>Checking Accounts Registry (Active)</Text>
          <Text style={[styles.sheetHeaderCell, { flex: 1, textAlign: 'right' }]}>Current Balance</Text>
        </View>
        {activeCheckingAccounts.length === 0 ? (
          <View style={styles.sheetRow}>
            <Text style={[styles.sheetCell, { flex: 3, textAlign: 'center', color: '#64748b' }]}>
              No checking accounts with active balance.
            </Text>
          </View>
        ) : (
          activeCheckingAccounts.map(account => {
            const bal = cardBalances[account.id] || 0.0;
            return (
              <View key={account.id} style={styles.sheetRow}>
                <Text style={[styles.sheetCell, { flex: 2 }]}>{account.name}</Text>
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
          <View style={styles.sheetRow}>
            <Text style={[styles.sheetCell, { flex: 3, textAlign: 'center', color: '#64748b' }]}>
              No credit cards with active balance.
            </Text>
          </View>
        ) : (
          activeCreditCards.map(card => {
            const bal = cardBalances[card.id] || 0.0;
            return (
              <View key={card.id} style={styles.sheetRow}>
                <Text style={[styles.sheetCell, { flex: 2 }]}>{card.name}</Text>
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
