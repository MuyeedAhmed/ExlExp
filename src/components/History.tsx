import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { Expense, CreditCard, Category } from '../types';

interface HistoryProps {
  expenses: Expense[];
  cards: CreditCard[];
  categories: Category[];
  onDelete: (id: string) => void;
  onEdit: (expense: Expense) => void;
}

export const History: React.FC<HistoryProps> = ({
  expenses,
  cards,
  categories,
  onDelete,
  onEdit,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);
  const [selectedCardFilter, setSelectedCardFilter] = useState<string | null>(null);

  // Map card ID to name helper
  const cardMap = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);

  // Filter expenses based on search and selected filters
  const filteredExpenses = useMemo(() => {
    return expenses
      .filter(e => {
        const matchesSearch = e.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = selectedCategoryFilter ? e.category === selectedCategoryFilter : true;
        const matchesCard = selectedCardFilter ? e.creditCardId === selectedCardFilter : true;
        return matchesSearch && matchesCategory && matchesCard;
      })
      // Sort newest first
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, searchQuery, selectedCategoryFilter, selectedCardFilter]);

  // Group by date
  const groupedExpenses = useMemo(() => {
    const groups: { [key: string]: Expense[] } = {};
    filteredExpenses.forEach(e => {
      if (!groups[e.date]) {
        groups[e.date] = [];
      }
      groups[e.date].push(e);
    });
    return Object.keys(groups).map(date => ({
      date,
      data: groups[date],
    }));
  }, [filteredExpenses]);

  const confirmDelete = (id: string) => {
    const performDelete = () => onDelete(id);

    if (Platform.OS === 'web') {
      if (confirm('Are you sure you want to delete this expense?')) {
        performDelete();
      }
    } else {
      Alert.alert(
        'Delete Expense',
        'Are you sure you want to delete this expense?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: performDelete },
        ]
      );
    }
  };

  const formatDateLabel = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    
    // Quick today/yesterday label
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isSameDate = (d1: Date, d2: Date) =>
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();

    if (isSameDate(dateObj, today)) return 'Today';
    if (isSameDate(dateObj, yesterday)) return 'Yesterday';

    return dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <View style={styles.container}>
      {/* Search Input */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="🔍 Search by merchant/item..."
          placeholderTextColor="#94a3b8"
        />
        {(searchQuery || selectedCategoryFilter || selectedCardFilter) && (
          <TouchableOpacity
            style={styles.clearFiltersButton}
            onPress={() => {
              setSearchQuery('');
              setSelectedCategoryFilter(null);
              setSelectedCardFilter(null);
            }}
          >
            <Text style={styles.clearFiltersText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Horizontal Scroll */}
      <View style={styles.filtersSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {/* Category Filters */}
          <Text style={styles.filterGroupLabel}>Category:</Text>
          <TouchableOpacity
            style={[styles.filterTag, !selectedCategoryFilter && styles.activeFilterTag]}
            onPress={() => setSelectedCategoryFilter(null)}
          >
            <Text style={[styles.filterTagText, !selectedCategoryFilter && styles.activeFilterTagText]}>All</Text>
          </TouchableOpacity>
          {categories.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.filterTag, selectedCategoryFilter === cat.name && styles.activeFilterTag]}
              onPress={() => setSelectedCategoryFilter(cat.name)}
            >
              <Text style={[styles.filterTagText, selectedCategoryFilter === cat.name && styles.activeFilterTagText]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {/* Card Filters */}
          <Text style={styles.filterGroupLabel}>Card:</Text>
          <TouchableOpacity
            style={[styles.filterTag, !selectedCardFilter && styles.activeFilterTag]}
            onPress={() => setSelectedCardFilter(null)}
          >
            <Text style={[styles.filterTagText, !selectedCardFilter && styles.activeFilterTagText]}>All</Text>
          </TouchableOpacity>
          {cards.map(card => (
            <TouchableOpacity
              key={card.id}
              style={[styles.filterTag, selectedCardFilter === card.id && styles.activeFilterTag]}
              onPress={() => setSelectedCardFilter(card.id)}
            >
              <Text style={[styles.filterTagText, selectedCardFilter === card.id && styles.activeFilterTagText]}>
                {card.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Transactions List */}
      {groupedExpenses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No matching transactions found.</Text>
        </View>
      ) : (
        <FlatList
          data={groupedExpenses}
          keyExtractor={item => item.date}
          contentContainerStyle={styles.listContent}
          renderItem={({ item: group }) => (
            <View style={styles.groupContainer}>
              {/* Date Header */}
              <Text style={styles.dateHeader}>{formatDateLabel(group.date)}</Text>
              
              {/* Transactions in Date Group */}
              {group.data.map(expense => {
                const card = cardMap.get(expense.creditCardId);
                return (
                  <View key={expense.id} style={styles.expenseCard}>
                    <View style={styles.expenseInfo}>
                      <Text style={styles.expenseDesc}>{expense.description}</Text>
                      <View style={styles.subInfoRow}>
                        <Text style={styles.expenseMetaBadge}>{expense.category}</Text>
                        <Text style={styles.expenseCardName}>
                          💳 {card ? `${card.name} (*${card.lastFour || '----'})` : 'Unknown Card'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.expenseActions}>
                      <Text style={styles.expenseAmount}>-${Number(expense.amount).toFixed(2)}</Text>
                      <View style={styles.actionButtons}>
                        <TouchableOpacity
                          style={styles.editButton}
                          onPress={() => onEdit(expense)}
                        >
                          <Text style={styles.editButtonText}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.deleteButton}
                          onPress={() => confirmDelete(expense.id)}
                        >
                          <Text style={styles.deleteButtonText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    backgroundColor: '#f8fafc',
  },
  clearFiltersButton: {
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  clearFiltersText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 14,
  },
  filtersSection: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 8,
  },
  filterScroll: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    alignItems: 'center',
    gap: 8,
  },
  filterGroupLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginRight: 4,
    textTransform: 'uppercase',
  },
  filterTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  activeFilterTag: {
    backgroundColor: '#4f46e5',
    borderColor: '#4f46e5',
  },
  filterTagText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  activeFilterTagText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 16,
  },
  groupContainer: {
    marginBottom: 20,
  },
  dateHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  expenseCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  expenseInfo: {
    flex: 2,
    justifyContent: 'space-between',
  },
  expenseDesc: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 6,
  },
  subInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  expenseMetaBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: 'hidden',
  },
  expenseCardName: {
    fontSize: 12,
    color: '#64748b',
  },
  expenseActions: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#e11d48',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  editButton: {
    paddingVertical: 4,
  },
  editButtonText: {
    color: '#2563eb',
    fontSize: 13,
    fontWeight: '600',
  },
  deleteButton: {
    paddingVertical: 4,
  },
  deleteButtonText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '600',
  },
});
