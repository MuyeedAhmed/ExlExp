import React, { useMemo, useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { Expense, CreditCard } from '../types';

interface CreditCardsTabProps {
  expenses: Expense[];
  cards: CreditCard[];
  onDelete: (id: string) => void;
  onEdit: (expense: Expense) => void;
}

export const CreditCardsTab: React.FC<CreditCardsTabProps> = ({
  expenses,
  cards,
  onDelete,
  onEdit,
}) => {
  // Filter out the Checking account (Chase)
  const creditCardsOnly = useMemo(() => {
    return cards.filter(c => c.id !== 'card-chase');
  }, [cards]);

  // Active card tab state
  const [selectedCardId, setSelectedCardId] = useState<string>('');

  // Sync state if cards load or change
  useEffect(() => {
    if (creditCardsOnly.length > 0 && (!selectedCardId || !creditCardsOnly.some(c => c.id === selectedCardId))) {
      setSelectedCardId(creditCardsOnly[0].id);
    }
  }, [creditCardsOnly, selectedCardId]);

  const activeCard = useMemo(() => {
    return creditCardsOnly.find(c => c.id === selectedCardId) || null;
  }, [creditCardsOnly, selectedCardId]);

  // Filter transactions for the selected card
  const cardExpenses = useMemo(() => {
    if (!selectedCardId) return [];
    return expenses
      .filter(e => e.creditCardId === selectedCardId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, selectedCardId]);

  // Calculate specific totals for active card
  const totals = useMemo(() => {
    let spent = 0;
    let paid = 0;
    let rewards = 0;
    let fees = 0;

    cardExpenses.forEach(e => {
      const amt = Number(e.amount) || 0;
      const desc = e.description.toLowerCase();

      if (amt > 0) {
        if (desc.includes('fee')) {
          fees += amt;
        } else {
          spent += amt;
        }
      } else if (amt < 0) {
        const absAmt = Math.abs(amt);
        if (desc.includes('payment')) {
          paid += absAmt;
        } else {
          rewards += absAmt;
        }
      }
    });

    const owed = spent + fees - paid - rewards;

    return { spent, paid, rewards, fees, owed };
  }, [cardExpenses]);

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
      {/* Excel Sheet style Card Toggles */}
      <View style={styles.sheetTabsContainer}>
        <Text style={styles.sheetSelectorLabel}>Sheets:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sheetTabsScroll}>
          {creditCardsOnly.map(card => (
            <TouchableOpacity
              key={card.id}
              style={[
                styles.sheetTab,
                selectedCardId === card.id && styles.activeSheetTab,
              ]}
              onPress={() => setSelectedCardId(card.id)}
            >
              <Text
                style={[
                  styles.sheetTabText,
                  selectedCardId === card.id && styles.activeSheetTabText,
                ]}
              >
                {card.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Card Info Banner with Split Totals */}
      {activeCard && (
        <View style={styles.headerBanner}>
          <Text style={styles.headerLabel}>
            Card: {activeCard.name} (*{activeCard.lastFour || '----'})
          </Text>
          <View style={styles.statsContainer}>
            <Text style={styles.bannerStat}>
              Spent: <Text style={styles.monoStat}>${totals.spent.toFixed(2)}</Text>
            </Text>
            <Text style={styles.bannerStat}>
              Paid: <Text style={[styles.monoStat, { color: '#16a34a' }]}>${totals.paid.toFixed(2)}</Text>
            </Text>
            <Text style={styles.bannerStat}>
              Rewards: <Text style={[styles.monoStat, { color: '#16a34a' }]}>${totals.rewards.toFixed(2)}</Text>
            </Text>
            <Text style={styles.bannerStat}>
              Fees: <Text style={styles.monoStat}>${totals.fees.toFixed(2)}</Text>
            </Text>
            <Text style={styles.bannerStat}>
              Owed: <Text style={[styles.monoStat, styles.boldMono, totals.owed > 0 && { color: '#dc2626' }]}>${totals.owed.toFixed(2)}</Text>
            </Text>
          </View>
        </View>
      )}

      {/* Spreadsheet Grid */}
      <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.tableScroll}>
        <View style={styles.tableContainer}>
          {/* Table Headers */}
          <View style={styles.tableRowHeader}>
            <Text style={[styles.headerCell, { width: 90 }]}>Date</Text>
            <Text style={[styles.headerCell, { width: 180 }]}>Description</Text>
            <Text style={[styles.headerCell, { width: 80, textAlign: 'right' }]}>Spend</Text>
            <Text style={[styles.headerCell, { width: 80, textAlign: 'right' }]}>Paid</Text>
            <Text style={[styles.headerCell, { width: 80, textAlign: 'right' }]}>Rewards</Text>
            <Text style={[styles.headerCell, { width: 80, textAlign: 'right' }]}>Fee</Text>
            <Text style={[styles.headerCell, { width: 120 }]}>Category</Text>
            <Text style={[styles.headerCell, { width: 100, textAlign: 'center' }]}>Actions</Text>
          </View>

          {/* Table Rows */}
          <ScrollView style={styles.rowsScroll}>
            {cardExpenses.length === 0 ? (
              <Text style={styles.emptyText}>No transactions recorded for this card.</Text>
            ) : (
              cardExpenses.map(item => {
                const amt = Number(item.amount) || 0;
                const desc = item.description.toLowerCase();

                let spendVal = '-';
                let paidVal = '-';
                let rewardsVal = '-';
                let feeVal = '-';

                if (amt > 0) {
                  if (desc.includes('fee')) {
                    feeVal = `$${amt.toFixed(2)}`;
                  } else {
                    spendVal = `$${amt.toFixed(2)}`;
                  }
                } else if (amt < 0) {
                  const absAmt = Math.abs(amt);
                  if (desc.includes('payment')) {
                    paidVal = `$${absAmt.toFixed(2)}`;
                  } else {
                    rewardsVal = `$${absAmt.toFixed(2)}`;
                  }
                }

                return (
                  <View key={item.id} style={styles.tableRow}>
                    <Text style={[styles.cell, { width: 90 }, styles.monoText]}>{item.date}</Text>
                    <Text style={[styles.cell, { width: 180 }]} numberOfLines={1}>
                      {item.description}
                    </Text>
                    
                    {/* Columns matching spreadsheet values */}
                    <Text style={[styles.cell, { width: 80, textAlign: 'right' }, styles.monoText]}>
                      {spendVal}
                    </Text>
                    <Text style={[styles.cell, { width: 80, textAlign: 'right' }, styles.monoText, paidVal !== '-' && { color: '#16a34a' }]}>
                      {paidVal}
                    </Text>
                    <Text style={[styles.cell, { width: 80, textAlign: 'right' }, styles.monoText, rewardsVal !== '-' && { color: '#16a34a' }]}>
                      {rewardsVal}
                    </Text>
                    <Text style={[styles.cell, { width: 80, textAlign: 'right' }, styles.monoText, feeVal !== '-' && { color: '#dc2626' }]}>
                      {feeVal}
                    </Text>

                    <Text style={[styles.cell, { width: 120 }]} numberOfLines={1}>
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
  headerBanner: {
    flexDirection: 'column',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    gap: 8,
  },
  headerLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  bannerStat: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  monoStat: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '600',
    color: '#0f172a',
  },
  boldMono: {
    fontWeight: 'bold',
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
