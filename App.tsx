import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StatusBar as RNStatusBar,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Expense, CreditCard, Category } from './src/types';
import {
  getExpenses,
  saveExpenses,
  getCreditCards,
  saveCreditCards,
  getCategories,
  saveCategories,
} from './src/storage';
import { Dashboard } from './src/components/Dashboard';
import { ExpenseForm } from './src/components/ExpenseForm';
import { History } from './src/components/History';
import { Settings } from './src/components/Settings';

type TabType = 'dashboard' | 'add' | 'history' | 'settings';

export default function App() {
  const { width } = useWindowDimensions();
  const isWeb = width > 768;

  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        const loadedExpenses = await getExpenses();
        const loadedCards = await getCreditCards();
        const loadedCategories = await getCategories();
        
        setExpenses(loadedExpenses);
        setCards(loadedCards);
        setCategories(loadedCategories);
      } catch (error) {
        console.error('Failed to load initial data:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Expense Handlers
  const handleExpenseSubmit = async (expenseData: Omit<Expense, 'id'> & { id?: string }) => {
    let updatedExpenses: Expense[];

    if (expenseData.id) {
      // Editing existing expense
      updatedExpenses = expenses.map(e =>
        e.id === expenseData.id ? (expenseData as Expense) : e
      );
      setEditingExpense(null);
    } else {
      // Adding new expense
      const newExpense: Expense = {
        ...expenseData,
        id: Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
      };
      updatedExpenses = [newExpense, ...expenses];
    }

    setExpenses(updatedExpenses);
    await saveExpenses(updatedExpenses);
    setActiveTab('history'); // Navigate to history to see the entry
  };

  const handleExpenseDelete = async (id: string) => {
    const updatedExpenses = expenses.filter(e => e.id !== id);
    setExpenses(updatedExpenses);
    await saveExpenses(updatedExpenses);
  };

  const handleExpenseEditRequest = (expense: Expense) => {
    setEditingExpense(expense);
    setActiveTab('add'); // Switch to form tab
  };

  const handleCancelEditing = () => {
    setEditingExpense(null);
    setActiveTab('history');
  };

  // Credit Card Handlers
  const handleCardAdd = async (cardData: Omit<CreditCard, 'id'>) => {
    const newCard: CreditCard = {
      ...cardData,
      id: 'card-' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
    };
    const updatedCards = [...cards, newCard];
    setCards(updatedCards);
    await saveCreditCards(updatedCards);
  };

  const handleCardDelete = async (id: string) => {
    const updatedCards = cards.filter(c => c.id !== id);
    setCards(updatedCards);
    await saveCreditCards(updatedCards);
  };

  // Category Handlers
  const handleCategoryAdd = async (categoryData: Omit<Category, 'id'>) => {
    const newCategory: Category = {
      ...categoryData,
      id: 'cat-' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
    };
    const updatedCategories = [...categories, newCategory];
    setCategories(updatedCategories);
    await saveCategories(updatedCategories);
  };

  const handleCategoryDelete = async (id: string) => {
    const updatedCategories = categories.filter(c => c.id !== id);
    setCategories(updatedCategories);
    await saveCategories(updatedCategories);
  };

  // Render correct screen component based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard expenses={expenses} cards={cards} categories={categories} />;
      case 'add':
        return (
          <ExpenseForm
            cards={cards}
            categories={categories}
            onSubmit={handleExpenseSubmit}
            editingExpense={editingExpense}
            onCancelEditing={handleCancelEditing}
          />
        );
      case 'history':
        return (
          <History
            expenses={expenses}
            cards={cards}
            categories={categories}
            onDelete={handleExpenseDelete}
            onEdit={handleExpenseEditRequest}
          />
        );
      case 'settings':
        return (
          <Settings
            cards={cards}
            categories={categories}
            onAddCard={handleCardAdd}
            onDeleteCard={handleCardDelete}
            onAddCategory={handleCategoryAdd}
            onDeleteCategory={handleCategoryDelete}
          />
        );
      default:
        return <Dashboard expenses={expenses} cards={cards} categories={categories} />;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4f46e5" />
        <Text style={styles.loadingText}>Loading Spending Tracker...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>💳 ExlExp</Text>
        <Text style={styles.headerSubtitle}>Personal Spending Tracker</Text>
      </View>

      {/* Main Content Area */}
      <View style={styles.content}>
        {renderContent()}
      </View>

      {/* Tab Navigation Bar */}
      <View style={[styles.tabBar, isWeb && styles.tabBarWeb]}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'dashboard' && styles.activeTabButton]}
          onPress={() => {
            setEditingExpense(null);
            setActiveTab('dashboard');
          }}
        >
          <Text style={[styles.tabIcon, activeTab === 'dashboard' && styles.activeTabIcon]}>📊</Text>
          <Text style={[styles.tabText, activeTab === 'dashboard' && styles.activeTabText]}>Analytics</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'add' && styles.activeTabButton]}
          onPress={() => setActiveTab('add')}
        >
          <Text style={[styles.tabIcon, activeTab === 'add' && styles.activeTabIcon]}>
            {editingExpense ? '✏️' : '➕'}
          </Text>
          <Text style={[styles.tabText, activeTab === 'add' && styles.activeTabText]}>
            {editingExpense ? 'Edit Item' : 'Log Spend'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'history' && styles.activeTabButton]}
          onPress={() => {
            setEditingExpense(null);
            setActiveTab('history');
          }}
        >
          <Text style={[styles.tabIcon, activeTab === 'history' && styles.activeTabIcon]}>📜</Text>
          <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>History</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'settings' && styles.activeTabButton]}
          onPress={() => {
            setEditingExpense(null);
            setActiveTab('settings');
          }}
        >
          <Text style={[styles.tabIcon, activeTab === 'settings' && styles.activeTabIcon]}>⚙️</Text>
          <Text style={[styles.tabText, activeTab === 'settings' && styles.activeTabText]}>Settings</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#4f46e5',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  content: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    height: 64,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#ffffff',
    paddingBottom: Platform.OS === 'ios' ? 8 : 0,
  },
  tabBarWeb: {
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 16,
    height: 60,
  },
  tabButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  activeTabButton: {
    backgroundColor: '#f8fafc',
  },
  tabIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  activeTabIcon: {
    transform: [{ scale: 1.1 }],
  },
  tabText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#4f46e5',
    fontWeight: '700',
  },
});
