import React, { useMemo } from 'react';
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
  // Filter expenses belonging to Chase checking (ID: card-chase)
  const checkingExpenses = useMemo(() => {
    return expenses
      .filter(e => e.creditCardId === 'card-chase')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses]);

  // Calculate current balance (Deposits - Withdrawals)
  const balance = useMemo(() => {
    // deposits are negative in db, withdrawals are positive.
    // balance = - sum(all transactions)
    const sum = checkingExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return -sum;
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

  return (
    <View style={styles.container}>
      {/* Account Balance Banner */}
      <View style={styles.headerBanner}>
        <Text style={styles.headerLabel}>Account: Chase Checking</Text>
        <Text style={styles.headerBalance}>
          Current Balance: <Text style={styles.monoBalance}>${balance.toFixed(2)}</Text>
        </Text>
      </View>

      {/* Spreadsheet grid */}
      <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.tableScroll}>
        <View style={styles.tableContainer}>
          {/* Table Headers */}
          <View style={styles.tableRowHeader}>
            <Text style={[styles.headerCell, { width: 100 }]}>Date</Text>
            <Text style={[styles.headerCell, { width: 220 }]}>Description</Text>
            <Text style={[styles.headerCell, { width: 140 }]}>Category</Text>
            <Text style={[styles.headerCell, { width: 100, textAlign: 'right' }]}>Amount</Text>
            <Text style={[styles.headerCell, { width: 120, textAlign: 'center' }]}>Actions</Text>
          </View>

          {/* Table Rows */}
          <ScrollView style={styles.rowsScroll}>
            {checkingExpenses.length === 0 ? (
              <Text style={styles.emptyText}>No checking transactions recorded.</Text>
            ) : (
              checkingExpenses.map(item => {
                const isDeposit = item.amount < 0;
                const formattedAmount = isDeposit
                  ? `+$${Math.abs(item.amount).toFixed(2)}`
                  : `-$${item.amount.toFixed(2)}`;

                return (
                  <View key={item.id} style={styles.tableRow}>
                    <Text style={[styles.cell, { width: 100 }, styles.monoText]}>{item.date}</Text>
                    <Text style={[styles.cell, { width: 220 }]} numberOfLines={1}>
                      {item.description}
                    </Text>
                    <Text style={[styles.cell, { width: 140 }]} numberOfLines={1}>
                      {item.category}
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
                    <View style={[styles.cellActions, { width: 120 }]}>
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
