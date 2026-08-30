import React, { useMemo, useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { Expense, CreditCard } from '../types';

interface CheckingTabProps {
  expenses: Expense[];
  cards: CreditCard[];
  onDelete: (id: string) => void;
  onEdit: (expense: Expense) => void;
}

export const CheckingTab: React.FC<CheckingTabProps> = ({
  expenses,
  cards,
  onDelete,
  onEdit,
}) => {
  // Filter cards to get only checking accounts
  const checkingAccounts = useMemo(() => {
    return cards.filter(c => c.isChecking);
  }, [cards]);

  // Active checking account sheet state
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  // Sync state if checking accounts load or change
  useEffect(() => {
    if (checkingAccounts.length > 0 && (!selectedAccountId || !checkingAccounts.some(c => c.id === selectedAccountId))) {
      setSelectedAccountId(checkingAccounts[0].id);
    }
  }, [checkingAccounts, selectedAccountId]);

  const activeAccount = useMemo(() => {
    return checkingAccounts.find(c => c.id === selectedAccountId) || null;
  }, [checkingAccounts, selectedAccountId]);

  // Filter checking transactions for the selected account
  const checkingExpenses = useMemo(() => {
    if (!selectedAccountId) return [];
    return expenses
      .filter(e => e.creditCardId === selectedAccountId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, selectedAccountId]);

  // Calculate current balance (Deposits are positive, Withdrawals are negative)
  const balance = useMemo(() => {
    const sum = checkingExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return sum;
  }, [checkingExpenses]);

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

  if (checkingAccounts.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyCenterContainer}>
          <Text style={styles.emptyText}>No checking accounts configured.</Text>
          <Text style={styles.emptySubText}>Please add a checking account in the Settings tab.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Excel Sheet style Account Toggles */}
      <View style={styles.sheetTabsContainer}>
        <Text style={styles.sheetSelectorLabel}>Sheets:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sheetTabsScroll}>
          {checkingAccounts.map(account => (
            <TouchableOpacity
              key={account.id}
              style={[
                styles.sheetTab,
                selectedAccountId === account.id && styles.activeSheetTab,
              ]}
              onPress={() => setSelectedAccountId(account.id)}
            >
              <Text
                style={[
                  styles.sheetTabText,
                  selectedAccountId === account.id && styles.activeSheetTabText,
                ]}
              >
                {account.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Account Balance Banner */}
      {activeAccount && (
        <View style={styles.headerBanner}>
          <Text style={styles.headerLabel}>
            Account: {activeAccount.name} {activeAccount.lastFour ? `(*${activeAccount.lastFour})` : ''}
          </Text>
          <Text style={styles.headerBalance}>
            Current Balance: <Text style={styles.monoBalance}>${balance.toFixed(2)}</Text>
          </Text>
        </View>
      )}

      {/* Spreadsheet grid */}
      <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.tableScroll}>
        <View style={styles.tableContainer}>
          {/* Table Headers (Date, From/To, Amount, Details, Category) */}
          <View style={styles.tableRowHeader}>
            <Text style={[styles.headerCell, { width: 90 }]}>Date</Text>
            <Text style={[styles.headerCell, { width: 150 }]}>From/To</Text>
            <Text style={[styles.headerCell, { width: 100, textAlign: 'right' }]}>Amount</Text>
            <Text style={[styles.headerCell, { width: 240 }]}>Details</Text>
            <Text style={[styles.headerCell, { width: 150 }]}>Category</Text>
            <Text style={[styles.headerCell, { width: 100, textAlign: 'center' }]}>Actions</Text>
          </View>

          {/* Table Rows */}
          <ScrollView style={styles.rowsScroll}>
            {checkingExpenses.length === 0 ? (
              <Text style={styles.emptyText}>No checking transactions recorded.</Text>
            ) : (
              checkingExpenses.map(item => {
                const isDeposit = item.amount >= 0;
                const formattedAmount = isDeposit
                  ? `+$${item.amount.toFixed(2)}`
                  : `-$${Math.abs(item.amount).toFixed(2)}`;

                return (
                  <View key={item.id} style={styles.tableRow}>
                    <Text style={[styles.cell, { width: 90 }, styles.monoText]}>{item.date}</Text>
                    <Text style={[styles.cell, { width: 150 }]} numberOfLines={1}>
                      {item.fromTo || item.description || ''}
                    </Text>
                    <Text
                      style={[
                        styles.cell,
                        { width: 100, textAlign: 'right' },
                        styles.monoText,
                        isDeposit ? styles.depositText : styles.withdrawText,
                      ]}
                    >
                      {formattedAmount}
                    </Text>
                    <Text style={[styles.cell, { width: 240 }]} numberOfLines={1}>
                      {item.details || ''}
                    </Text>
                    <Text style={[styles.cell, { width: 150 }]} numberOfLines={1}>
                      {item.category}
                    </Text>
                    <View style={[styles.cellActions, { width: 100 }]}>
                      <TouchableOpacity style={styles.actionBtn} onPress={() => onEdit(item)}>
                        <Text style={styles.editBtnText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actionBtn} onPress={() => confirmDelete(item.id)}>
                        <Text style={styles.deleteBtnText}>Del</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
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
  emptyCenterContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptySubText: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 8,
  },
  headerBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  headerLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  headerBalance: {
    fontSize: 14,
    color: '#475569',
  },
  monoBalance: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: 'bold',
    color: '#0f172a',
  },
  tableScroll: {
    flex: 1,
  },
  tableContainer: {
    flexDirection: 'column',
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
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    alignItems: 'center',
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
  depositText: {
    color: '#16a34a',
    fontWeight: '500',
  },
  withdrawText: {
    color: '#0f172a',
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
    paddingHorizontal: 6,
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
  emptyText: {
    padding: 20,
    color: '#64748b',
    textAlign: 'center',
    fontSize: 14,
  },
});
