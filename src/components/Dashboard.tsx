import React, { useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, Dimensions, useWindowDimensions, DimensionValue } from 'react-native';
import { Expense, CreditCard, Category } from '../types';

interface DashboardProps {
  expenses: Expense[];
  cards: CreditCard[];
  categories: Category[];
}

export const Dashboard: React.FC<DashboardProps> = ({ expenses, cards, categories }) => {
  const { width } = useWindowDimensions();
  const isWeb = width > 768;

  // Helpers to get card name or category name by ID
  const cardMap = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);
  const categoryMap = useMemo(() => new Map(categories.map(c => [c.name, c])), [categories]); // Fallback check or ID mapping

  // Calculate statistics
  const stats = useMemo(() => {
    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let total = 0;
    let thisMonthTotal = 0;
    const categoryTotals: { [key: string]: number } = {};
    const cardTotals: { [key: string]: number } = {};

    expenses.forEach(e => {
      const amount = Number(e.amount) || 0;
      total += amount;

      // Check if it falls in the current month
      if (e.date.startsWith(currentMonthStr)) {
        thisMonthTotal += amount;
      }

      // Category breakdown
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + amount;

      // Card breakdown
      const card = cardMap.get(e.creditCardId);
      const cardName = card ? `${card.name} (*${card.lastFour})` : 'Unknown Card';
      cardTotals[cardName] = (cardTotals[cardName] || 0) + amount;
    });

    // Format breakdowns as sorted arrays
    const categoryBreakdown = Object.keys(categoryTotals)
      .map(name => ({ name, value: categoryTotals[name] }))
      .sort((a, b) => b.value - a.value);

    const cardBreakdown = Object.keys(cardTotals)
      .map(name => ({ name, value: cardTotals[name] }))
      .sort((a, b) => b.value - a.value);

    return {
      total,
      thisMonthTotal,
      categoryBreakdown,
      cardBreakdown,
    };
  }, [expenses, cardMap, categories]);

  // Max value helper for progress bar scaling
  const maxCategoryValue = useMemo(() => {
    return stats.categoryBreakdown.length > 0 ? stats.categoryBreakdown[0].value : 1;
  }, [stats.categoryBreakdown]);

  const maxCardValue = useMemo(() => {
    return stats.cardBreakdown.length > 0 ? stats.cardBreakdown[0].value : 1;
  }, [stats.cardBreakdown]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Spending Analytics</Text>
 
      {/* Summary Cards */}
      <View style={[styles.summaryRow, isWeb && styles.summaryRowWeb]}>
        <View style={[styles.summaryCard, isWeb && styles.summaryCardWeb]}>
          <Text style={styles.cardLabel}>Total Spending</Text>
          <Text style={styles.cardValue}>${stats.total.toFixed(2)}</Text>
        </View>
 
        <View style={[styles.summaryCard, isWeb && styles.summaryCardWeb]}>
          <Text style={styles.cardLabel}>This Month's Spending</Text>
          <Text style={styles.cardValue}>${stats.thisMonthTotal.toFixed(2)}</Text>
          <Text style={styles.cardSubtext}>{new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
        </View>
      </View>
 
      {/* Breakdowns */}
      <View style={[styles.breakdownRow, isWeb && styles.breakdownRowWeb]}>
        {/* Category Breakdown */}
        <View style={[styles.sectionCard, isWeb && styles.sectionCardWeb]}>
          <Text style={styles.sectionTitle}>Spending by Category</Text>
          {stats.categoryBreakdown.length === 0 ? (
            <Text style={styles.emptyText}>No data available. Add some expenses to see a breakdown.</Text>
          ) : (
            stats.categoryBreakdown.map((item, idx) => {
              const percentage = stats.total > 0 ? (item.value / stats.total) * 100 : 0;
              const fillWidth = `${(item.value / maxCategoryValue) * 100}%` as DimensionValue;
              return (
                <View key={idx} style={styles.barItem}>
                  <View style={styles.barHeader}>
                    <Text style={styles.barName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.barValue}>
                      ${item.value.toFixed(2)} ({percentage.toFixed(0)}%)
                    </Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: fillWidth, backgroundColor: '#0f172a' }]} />
                  </View>
                </View>
              );
            })
          )}
        </View>
 
        {/* Credit Card Breakdown */}
        <View style={[styles.sectionCard, isWeb && styles.sectionCardWeb]}>
          <Text style={styles.sectionTitle}>Spending by Credit Card</Text>
          {stats.cardBreakdown.length === 0 ? (
            <Text style={styles.emptyText}>No data available. Add some expenses to see a breakdown.</Text>
          ) : (
            stats.cardBreakdown.map((item, idx) => {
              const percentage = stats.total > 0 ? (item.value / stats.total) * 100 : 0;
              const fillWidth = `${(item.value / maxCardValue) * 100}%` as DimensionValue;
              return (
                <View key={idx} style={styles.barItem}>
                  <View style={styles.barHeader}>
                    <Text style={styles.barName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.barValue}>
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 20,
  },
  summaryRow: {
    flexDirection: 'column',
    gap: 16,
    marginBottom: 24,
  },
  summaryRowWeb: {
    flexDirection: 'row',
  },
  summaryCard: {
    flex: 1,
    padding: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
  },
  summaryCardWeb: {
    maxWidth: '50%',
  },
  cardLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#0f172a',
    marginTop: 8,
  },
  cardSubtext: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  breakdownRow: {
    flexDirection: 'column',
    gap: 20,
  },
  breakdownRowWeb: {
    flexDirection: 'row',
  },
  sectionCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 20,
  },
  sectionCardWeb: {
    maxWidth: '50%',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 8,
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  barItem: {
    marginBottom: 16,
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  barName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
    flex: 1,
    marginRight: 8,
  },
  barValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
  },
  barTrack: {
    height: 8,
    backgroundColor: '#e2e8f0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
});
