import React, { useMemo, useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, Platform, TextInput } from 'react-native';
import { Expense, CreditCard } from '../types';

interface CheckingTabProps {
  expenses: Expense[];
  cards: CreditCard[];
  onDelete: (id: string) => void;
  onEdit: (expense: Expense) => void;
  onBrokerageBalanceUpdate?: (brokerageCardId: string, newBalance: number) => void;
}

export const CheckingTab: React.FC<CheckingTabProps> = ({
  expenses,
  cards,
  onDelete,
  onEdit,
  onBrokerageBalanceUpdate,
}) => {
  // Filter cards to get checking, saving, and brokerage accounts
  const checkingOnly = useMemo(() => {
    return cards.filter(c => c.isChecking);
  }, [cards]);

  const savingsOnly = useMemo(() => {
    return cards.filter(c => c.isSaving);
  }, [cards]);

  const hasBrokerage = useMemo(() => {
    return cards.some(c => c.isBrokerage);
  }, [cards]);

  const brokerageAccounts = useMemo(() => {
    return cards.filter(c => c.isBrokerage);
  }, [cards]);

  // Active checking account sheet state
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  // Pagination state for transactions
  const [visibleCount, setVisibleCount] = useState<number>(25);

  // Editing state for Brokerage inline balance updates
  const [editingBrokerageId, setEditingBrokerageId] = useState<string | null>(null);
  const [editingBrokerageValue, setEditingBrokerageValue] = useState<string>('');

  // Sync state if checking/savings accounts load or change
  useEffect(() => {
    const allTabIds = [...checkingOnly.map(a => a.id), ...savingsOnly.map(a => a.id), ...(hasBrokerage ? ['brokerage'] : [])];
    if (allTabIds.length > 0 && (!selectedAccountId || !allTabIds.includes(selectedAccountId))) {
      setSelectedAccountId(allTabIds[0]);
    }
  }, [checkingOnly, savingsOnly, hasBrokerage, selectedAccountId]);

  // Reset pagination count when account tab changes
  useEffect(() => {
    setVisibleCount(25);
  }, [selectedAccountId]);

  const activeAccount = useMemo(() => {
    if (selectedAccountId === 'brokerage') return null;
    return [...checkingOnly, ...savingsOnly].find(c => c.id === selectedAccountId) || null;
  }, [checkingOnly, savingsOnly, selectedAccountId]);

  // Filter checking transactions for the selected account
  const checkingExpenses = useMemo(() => {
    if (!selectedAccountId || selectedAccountId === 'brokerage') return [];
    return expenses
      .filter(e => e.creditCardId === selectedAccountId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, selectedAccountId]);

  // Calculate current balance (Deposits are positive, Withdrawals are negative)
  const balance = useMemo(() => {
    const sum = checkingExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return sum;
  }, [checkingExpenses]);

  // Calculate total brokerage balance
  const totalBrokerageBalance = useMemo(() => {
    return brokerageAccounts.reduce((sum, account) => {
      const bal = expenses
        .filter(e => e.creditCardId === account.id)
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
      return sum + bal;
    }, 0);
  }, [brokerageAccounts, expenses]);

  const getAccountBalance = (accountId: string) => {
    return expenses
      .filter(e => e.creditCardId === accountId)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  };

  const handleStartEditBrokerage = (accountId: string, currentVal: number) => {
    setEditingBrokerageId(accountId);
    setEditingBrokerageValue(currentVal.toString());
  };

  const handleSaveBrokerage = (accountId: string) => {
    const val = parseFloat(editingBrokerageValue);
    if (isNaN(val)) {
      Alert.alert('Error', 'Please enter a valid numeric balance.');
      return;
    }
    if (onBrokerageBalanceUpdate) {
      onBrokerageBalanceUpdate(accountId, val);
    }
    setEditingBrokerageId(null);
  };

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

  if (checkingOnly.length === 0 && savingsOnly.length === 0 && !hasBrokerage) {
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sheetTabsScroll}>
          {checkingOnly.length > 0 && (
            <>
              <Text style={styles.sheetGroupLabel}>Checking</Text>
              {checkingOnly.map(account => (
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
            </>
          )}

          {savingsOnly.length > 0 && (
            <>
              <View style={styles.groupSeparator} />
              <Text style={styles.sheetGroupLabel}>Savings</Text>
              {savingsOnly.map(account => (
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
            </>
          )}

          {hasBrokerage && (
            <>
              <View style={styles.groupSeparator} />
              <Text style={styles.sheetGroupLabel}>Brokerage</Text>
              <TouchableOpacity
                style={[
                  styles.sheetTab,
                  selectedAccountId === 'brokerage' && styles.activeSheetTab,
                ]}
                onPress={() => setSelectedAccountId('brokerage')}
              >
                <Text
                  style={[
                    styles.sheetTabText,
                    selectedAccountId === 'brokerage' && styles.activeSheetTabText,
                  ]}
                >
                  Portfolio List
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>

      {/* Account Balance Banner */}
      {activeAccount && (
        <View style={styles.headerBanner}>
          <Text style={styles.headerLabel}>
            Account: {activeAccount.name}
          </Text>
          <Text style={styles.headerBalance}>
            Current Balance: <Text style={styles.monoBalance}>${balance.toFixed(2)}</Text>
          </Text>
        </View>
      )}
      {selectedAccountId === 'brokerage' && (
        <View style={styles.headerBanner}>
          <Text style={styles.headerLabel}>
            Account: Brokerage Portfolio
          </Text>
          <Text style={styles.headerBalance}>
            Current Balance: <Text style={styles.monoBalance}>${totalBrokerageBalance.toFixed(2)}</Text>
          </Text>
        </View>
      )}

      {/* Spreadsheet grid */}
      <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.tableScroll} contentContainerStyle={styles.tableScrollContent}>
        <View style={[styles.tableContainer, selectedAccountId === 'brokerage' ? styles.tableContainerBrokerage : (activeAccount?.isSaving ? styles.tableContainerSaving : styles.tableContainerChecking)]}>
          {selectedAccountId === 'brokerage' ? (
            <>
              {/* Brokerage Table Headers */}
              <View style={styles.tableRowHeader}>
                <Text style={[styles.headerCell, styles.colBrokName]}>Account Name</Text>
                <Text style={[styles.headerCell, styles.colBrokBalance]}>Current Balance</Text>
                <Text style={[styles.headerCell, styles.colBrokActions]}>Actions</Text>
              </View>
              {/* Brokerage Table Rows */}
              <ScrollView style={styles.rowsScroll}>
                {brokerageAccounts.length === 0 ? (
                  <Text style={styles.emptyText}>No brokerage accounts configured.</Text>
                ) : (
                  brokerageAccounts.map(item => (
                    <View key={item.id} style={styles.tableRow}>
                      <Text style={[styles.cell, styles.colBrokName]}>{item.name}</Text>
                      {editingBrokerageId === item.id ? (
                        <TextInput
                          style={[
                            styles.cell,
                            styles.colBrokBalance,
                            {
                              fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
                              borderWidth: 1,
                              borderColor: '#3b82f6',
                              backgroundColor: '#eff6ff',
                              paddingVertical: 2,
                              paddingHorizontal: 4,
                            }
                          ]}
                          value={editingBrokerageValue}
                          onChangeText={setEditingBrokerageValue}
                          keyboardType="decimal-pad"
                          autoFocus
                        />
                      ) : (
                        <Text style={[styles.cell, styles.colBrokBalance, styles.monoText]}>
                          ${getAccountBalance(item.id).toFixed(2)}
                        </Text>
                      )}
                      <View style={[styles.cellActions, styles.colBrokActions]}>
                        {editingBrokerageId === item.id ? (
                          <>
                            <TouchableOpacity style={styles.actionBtn} onPress={() => handleSaveBrokerage(item.id)}>
                              <Text style={styles.editBtnText}>Save</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionBtn} onPress={() => setEditingBrokerageId(null)}>
                              <Text style={styles.deleteBtnText}>Cancel</Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <TouchableOpacity style={styles.actionBtn} onPress={() => handleStartEditBrokerage(item.id, getAccountBalance(item.id))}>
                            <Text style={styles.editBtnText}>Edit</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </>
          ) : (
            <>
               {/* Table Headers */}
              <View style={styles.tableRowHeader}>
                <Text style={[styles.headerCell, styles.colDate]}>Date</Text>
                <Text style={[styles.headerCell, activeAccount?.isSaving ? styles.colFromToSaving : styles.colFromTo]}>From/To</Text>
                {activeAccount?.isSaving ? (
                  <>
                    <Text style={[styles.headerCell, styles.colAmount]}>Amount</Text>
                    <Text style={[styles.headerCell, styles.colInterest]}>Interest</Text>
                    <Text style={[styles.headerCell, styles.colDetailsSaving]}>Details</Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.headerCell, styles.colAmount]}>Amount</Text>
                    <Text style={[styles.headerCell, styles.colDetailsChecking]}>Details</Text>
                  </>
                )}
                <Text style={[styles.headerCell, styles.colCategory]}>Category</Text>
                <Text style={[styles.headerCell, styles.colActions]}>Actions</Text>
              </View>

              {/* Table Rows */}
              <ScrollView style={styles.rowsScroll}>
                {checkingExpenses.length === 0 ? (
                  <Text style={styles.emptyText}>No transactions recorded.</Text>
                ) : (
                  <>
                    {checkingExpenses.slice(0, visibleCount).map(item => {
                      const isDeposit = item.amount >= 0;
                      const formattedAmount = isDeposit
                        ? `+$${item.amount.toFixed(2)}`
                        : `-$${Math.abs(item.amount).toFixed(2)}`;

                      return (
                        <View key={item.id} style={styles.tableRow}>
                          <Text style={[styles.cell, styles.colDate, styles.monoText]}>{item.date ? item.date.substring(5) : ''}</Text>
                          <Text style={[styles.cell, activeAccount?.isSaving ? styles.colFromToSaving : styles.colFromTo]} numberOfLines={1}>
                            {item.fromTo || item.description || ''}
                          </Text>
                          {activeAccount?.isSaving ? (
                            <>
                              <Text
                                style={[
                                  styles.cell,
                                  styles.colAmount,
                                  styles.monoText,
                                  item.isInterest ? { color: '#94a3b8' } : (isDeposit ? styles.depositText : styles.withdrawText),
                                ]}
                              >
                                {item.isInterest ? '-' : formattedAmount}
                              </Text>
                              <Text
                                style={[
                                  styles.cell,
                                  styles.colInterest,
                                  styles.monoText,
                                  item.isInterest ? styles.depositText : { color: '#94a3b8' },
                                ]}
                              >
                                {item.isInterest ? formattedAmount : '-'}
                              </Text>
                              <Text style={[styles.cell, styles.colDetailsSaving]} numberOfLines={1}>
                                {item.details || ''}
                              </Text>
                            </>
                          ) : (
                            <>
                              <Text
                                style={[
                                  styles.cell,
                                  styles.colAmount,
                                  styles.monoText,
                                  isDeposit ? styles.depositText : styles.withdrawText,
                                ]}
                              >
                                {formattedAmount}
                              </Text>
                              <Text style={[styles.cell, styles.colDetailsChecking]} numberOfLines={1}>
                                {item.details || ''}
                              </Text>
                            </>
                          )}
                          <Text style={[styles.cell, styles.colCategory]} numberOfLines={1}>
                            {item.category || 'Others'}
                          </Text>
                          <View style={[styles.cellActions, styles.colActions]}>
                            <TouchableOpacity style={styles.actionBtn} onPress={() => onEdit(item)}>
                              <Text style={styles.editBtnText}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.actionBtn} onPress={() => confirmDelete(item.id)}>
                              <Text style={styles.deleteBtnText}>Del</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                    {checkingExpenses.length > visibleCount && (
                      <TouchableOpacity
                        style={styles.loadMoreRow}
                        onPress={() => setVisibleCount(prev => prev + 25)}
                      >
                        <Text style={styles.loadMoreText}>
                          Show More (showing {visibleCount} of {checkingExpenses.length})
                        </Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </ScrollView>
            </>
          )}
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
  sheetGroupLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#64748b',
    marginRight: 8,
    marginLeft: 8,
    textTransform: 'uppercase',
    alignSelf: 'center',
    marginBottom: 8,
  },
  groupSeparator: {
    width: 1,
    height: 18,
    backgroundColor: '#cbd5e1',
    marginHorizontal: 8,
    alignSelf: 'center',
    marginBottom: 8,
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
  tableScrollContent: {
    minWidth: '100%',
    flexGrow: 1,
  },
  tableContainer: {
    flexDirection: 'column',
    width: '100%',
  },
  tableContainerChecking: {
    minWidth: 790,
  },
  tableContainerSaving: {
    minWidth: 820,
  },
  tableContainerBrokerage: {
    minWidth: 500,
  },
  tableRowHeader: {
    flexDirection: 'row',
    width: '100%',
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
    width: '100%',
  },
  tableRow: {
    flexDirection: 'row',
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    alignItems: 'center',
  },
  colDate: {
    flex: 0.9,
    minWidth: 85,
  },
  colFromTo: {
    flex: 2.2,
    minWidth: 160,
  },
  colFromToSaving: {
    flex: 2,
    minWidth: 150,
  },
  colAmount: {
    flex: 1.2,
    minWidth: 100,
    textAlign: 'right',
  },
  colInterest: {
    flex: 1.2,
    minWidth: 100,
    textAlign: 'right',
  },
  colDetailsChecking: {
    flex: 2.5,
    minWidth: 180,
  },
  colDetailsSaving: {
    flex: 1.6,
    minWidth: 120,
  },
  colCategory: {
    flex: 1.3,
    minWidth: 100,
  },
  colActions: {
    flex: 1,
    minWidth: 90,
    textAlign: 'center',
  },
  colBrokName: {
    flex: 3,
    minWidth: 200,
  },
  colBrokBalance: {
    flex: 1.5,
    minWidth: 140,
    textAlign: 'right',
  },
  colBrokActions: {
    flex: 1.5,
    minWidth: 140,
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
  loadMoreRow: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
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
});
