import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  Platform,
  Alert,
  BackHandler,
} from 'react-native';
import { Expense, CreditCard } from '../types';
import { consolidateTransactions, UnifiedTransaction } from '../transactionUtils';

interface TransactionRowProps {
  item: UnifiedTransaction;
  isWeb: boolean;
  onEdit?: (expense: Expense) => void;
  onDelete?: (id: string) => void;
}

const TransactionRow = React.memo<TransactionRowProps>(({ item, isWeb, onEdit, onDelete }) => {
  const dateStr = item.date ? (isWeb ? item.date : item.date.substring(5)) : '';

  return (
    <View style={styles.twoLineTxRow}>
      {/* Line 1: Date, Card/Account, Amount + Actions */}
      <View style={styles.txLine1}>
        <Text style={[styles.txDate, styles.monoText]}>{dateStr}</Text>
        <Text style={styles.txAccount} numberOfLines={1} ellipsizeMode="tail">
          {item.displayAccount}
        </Text>
        <View style={styles.txRightCol}>
          <Text
            style={[
              styles.txAmount,
              styles.monoText,
              styles.boldText,
              { color: item.amountColor },
            ]}
          >
            {item.formattedAmount}
          </Text>
          {(onEdit || onDelete) && (
            <View style={styles.actionsRow}>
              {onEdit && (
                <TouchableOpacity
                  style={styles.actionIconButton}
                  onPress={() => onEdit(item.primaryExpense)}
                  accessibilityLabel="Edit transaction"
                >
                  <Text style={styles.actionIconText}>✏️</Text>
                </TouchableOpacity>
              )}
              {onDelete && (
                <TouchableOpacity
                  style={styles.actionIconButton}
                  onPress={() => onDelete(item.primaryExpense.id)}
                  accessibilityLabel="Delete transaction"
                >
                  <Text style={styles.actionIconText}>🗑️</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Line 2: Empty under date, Desc */}
      <View style={styles.txLine2}>
        <View style={[styles.txDateSpacer, { width: isWeb ? 78 : 46 }]} />
        <Text style={styles.txDesc} numberOfLines={1} ellipsizeMode="tail">
          {item.description}
        </Text>
      </View>
    </View>
  );
});

interface AllTransactionsPageProps {
  expenses: Expense[];
  cards: CreditCard[];
  onBack: () => void;
  onEditExpense?: (expense: Expense) => void;
  onDeleteExpense?: (id: string) => void;
}

export const AllTransactionsPage: React.FC<AllTransactionsPageProps> = ({
  expenses,
  cards,
  onBack,
  onEditExpense,
  onDeleteExpense,
}) => {
  const isWeb = Platform.OS === 'web';

  // Handle Android hardware back press to return to dashboard
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const handleHardwareBack = () => {
      onBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', handleHardwareBack);
    return () => sub.remove();
  }, [onBack]);

  const [visibleCount, setVisibleCount] = useState<number>(50);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'deposits' | 'credit' | 'transfers'>('all');

  // Debounce search query (150ms) to keep keystrokes and typing at 60 FPS
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 150);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Map of cards by id for fast lookup
  const cardMap = useMemo(() => {
    const map = new Map<string, CreditCard>();
    cards.forEach(c => map.set(c.id, c));
    return map;
  }, [cards]);

  // Consolidate transfers into 1 transaction (Sender -> Receiver)
  const unifiedTransactions = useMemo(() => {
    return consolidateTransactions(expenses, cards);
  }, [expenses, cards]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    const query = debouncedQuery.trim().toLowerCase();
    return unifiedTransactions.filter(item => {
      const card = cardMap.get(item.primaryExpense.creditCardId);
      const isDeposit = Boolean(card?.isChecking || card?.isSaving || card?.isBrokerage);

      // Filter by type
      if (filterType === 'deposits') {
        if (item.isTransfer || !isDeposit) return false;
      } else if (filterType === 'credit') {
        if (item.isTransfer || isDeposit) return false;
      } else if (filterType === 'transfers') {
        if (!item.isTransfer) return false;
      }

      // Filter by search query
      if (query) {
        const descMatch = (item.description || '').toLowerCase().includes(query);
        const accountMatch = item.displayAccount.toLowerCase().includes(query);
        const amountMatch =
          item.formattedAmount.includes(query) || String(item.amount).includes(query);
        const dateMatch = item.date.includes(query);

        if (!descMatch && !accountMatch && !amountMatch && !dateMatch) {
          return false;
        }
      }

      return true;
    });
  }, [unifiedTransactions, cardMap, filterType, debouncedQuery]);

  const displayedTransactions = useMemo(() => {
    return filteredTransactions.slice(0, visibleCount);
  }, [filteredTransactions, visibleCount]);

  const handleLoadMore = React.useCallback(() => {
    setVisibleCount(prev => prev + 50);
  }, []);

  const confirmDelete = React.useCallback((id: string) => {
    if (!onDeleteExpense) return;
    if (Platform.OS === 'web') {
      if (confirm('Are you sure you want to delete this transaction?')) {
        onDeleteExpense(id);
      }
    } else {
      Alert.alert(
        'Delete Transaction',
        'Are you sure you want to delete this transaction?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => onDeleteExpense(id) },
        ]
      );
    }
  }, [onDeleteExpense]);

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} accessibilityLabel="Back to Analytics">
          <Text style={styles.backButtonIcon}>‹</Text>
          <Text style={styles.backButtonText}>Analytics</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>All Transactions</Text>
        <Text style={styles.pageSubtitle}>
          Showing {displayedTransactions.length} of {filteredTransactions.length} entries ({unifiedTransactions.length} total)
        </Text>
      </View>

      {/* Search & Filter Controls */}
      <View style={styles.controlsCard}>
        {/* Search Bar */}
        <View style={styles.searchBarContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search transactions (description, account, amount, date)..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={text => {
              setSearchQuery(text);
              setVisibleCount(50); // Reset pagination on search
            }}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity style={styles.clearSearchBtn} onPress={() => setSearchQuery('')}>
              <Text style={styles.clearSearchBtnText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Pills */}
        <View style={styles.filterPillsRow}>
          <TouchableOpacity
            style={[styles.filterPill, filterType === 'all' && styles.filterPillActive]}
            onPress={() => {
              setFilterType('all');
              setVisibleCount(50);
            }}
          >
            <Text style={[styles.filterPillText, filterType === 'all' && styles.filterPillTextActive]}>
              All ({unifiedTransactions.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, filterType === 'deposits' && styles.filterPillActive]}
            onPress={() => {
              setFilterType('deposits');
              setVisibleCount(50);
            }}
          >
            <Text style={[styles.filterPillText, filterType === 'deposits' && styles.filterPillTextActive]}>
              🏛️ Bank & Invest
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, filterType === 'credit' && styles.filterPillActive]}
            onPress={() => {
              setFilterType('credit');
              setVisibleCount(50);
            }}
          >
            <Text style={[styles.filterPillText, filterType === 'credit' && styles.filterPillTextActive]}>
              💳 Credit Cards
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, filterType === 'transfers' && styles.filterPillActive]}
            onPress={() => {
              setFilterType('transfers');
              setVisibleCount(50);
            }}
          >
            <Text style={[styles.filterPillText, filterType === 'transfers' && styles.filterPillTextActive]}>
              🔄 Transfers
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Transactions List */}
      <FlatList
        data={displayedTransactions}
        keyExtractor={useCallback((item: UnifiedTransaction) => item.id, [])}
        renderItem={useCallback(
          ({ item }: { item: UnifiedTransaction }) => (
            <TransactionRow
              item={item}
              isWeb={isWeb}
              onEdit={onEditExpense}
              onDelete={confirmDelete}
            />
          ),
          [isWeb, onEditExpense, confirmDelete]
        )}
        initialNumToRender={20}
        maxToRenderPerBatch={15}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        style={styles.verticalRowsScroll}
        contentContainerStyle={[styles.rowsContentContainer, !isWeb && styles.rowsContentContainerMobile]}
        onEndReached={() => {
          if (filteredTransactions.length > visibleCount) {
            setVisibleCount(prev => prev + 50);
          }
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No matching transactions found.</Text>
          </View>
        }
        ListFooterComponent={
          filteredTransactions.length > visibleCount ? (
            <TouchableOpacity style={styles.loadMoreButton} onPress={handleLoadMore}>
              <Text style={styles.loadMoreButtonText}>
                Load 50 More (Showing {displayedTransactions.length} of {filteredTransactions.length})
              </Text>
            </TouchableOpacity>
          ) : filteredTransactions.length > 0 ? (
            <View style={styles.allLoadedBox}>
              <Text style={styles.allLoadedText}>
                All {filteredTransactions.length} transactions loaded
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  topHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
  },
  backButtonIcon: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: -2,
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  pageSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  controlsCard: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 8,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  clearSearchBtn: {
    position: 'absolute',
    right: 10,
    padding: 4,
  },
  clearSearchBtnText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: 'bold',
  },
  filterPillsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  filterPill: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterPillActive: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  filterPillTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  verticalRowsScroll: {
    flex: 1,
  },
  rowsContentContainer: {
    paddingBottom: 24,
  },
  rowsContentContainerMobile: {
    paddingBottom: 48, // Button height clearance
  },
  twoLineTxRow: {
    paddingVertical: 10,
    paddingHorizontal: 16,
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
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    width: 46,
  },
  txAccount: {
    flex: 1,
    marginLeft: 8,
    marginRight: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  txRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  txAmount: {
    fontSize: 14,
    textAlign: 'right',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionIconButton: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: '#f8fafc',
  },
  actionIconText: {
    fontSize: 12,
  },
  txLine2: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  txDateSpacer: {
    width: 46,
  },
  txDesc: {
    flex: 1,
    marginLeft: 8,
    marginRight: 8,
    fontSize: 12,
    color: '#64748b',
  },
  loadMoreButton: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingVertical: 12,
    margin: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMoreButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  allLoadedBox: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  allLoadedText: {
    fontSize: 11,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#64748b',
  },
  monoText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  boldText: {
    fontWeight: '700',
  },
});
