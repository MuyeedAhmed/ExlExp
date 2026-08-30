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
import { Expense, CreditCard, Category, FutureExpense } from './src/types';
import {
  getExpenses,
  saveExpenses,
  getCreditCards,
  saveCreditCards,
  getCategories,
  saveCategories,
  getFutureExpenses,
  saveFutureExpenses,
} from './src/storage';
import { Dashboard } from './src/components/Dashboard';
import { ExpenseForm } from './src/components/ExpenseForm';
import { CheckingTab } from './src/components/CheckingTab';
import { CreditCardsTab } from './src/components/CreditCardsTab';
import { Settings } from './src/components/Settings';

type TabType = 'dashboard' | 'checking' | 'credit_cards' | 'add' | 'settings';

export default function App() {
  const { width } = useWindowDimensions();
  const isWeb = width > 768;

  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [futureExpenses, setFutureExpenses] = useState<FutureExpense[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
        const loadedExpenses = await getExpenses();
        const loadedCards = await getCreditCards();
        const loadedCategories = await getCategories();
        const loadedFutureExpenses = await getFutureExpenses();
        
        setExpenses(loadedExpenses);
        setCards(loadedCards);
        setCategories(loadedCategories);
        setFutureExpenses(loadedFutureExpenses);
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
    const isChecking = cards.find(c => c.id === expenseData.creditCardId)?.isChecking;
    if (isChecking) {
      setActiveTab('checking');
    } else {
      setActiveTab('credit_cards');
    }
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
    const isChecking = editingExpense && cards.find(c => c.id === editingExpense.creditCardId)?.isChecking;
    setEditingExpense(null);
    if (isChecking) {
      setActiveTab('checking');
    } else {
      setActiveTab('credit_cards');
    }
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

  const handleFutureExpenseAdd = async (newFuture: Omit<FutureExpense, 'id'>) => {
    const updated = [
      {
        ...newFuture,
        id: 'future-' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
      },
      ...futureExpenses,
    ];
    setFutureExpenses(updated);
    await saveFutureExpenses(updated);
  };

  const handleFutureExpenseDelete = async (id: string) => {
    const updated = futureExpenses.filter(f => f.id !== id);
    setFutureExpenses(updated);
    await saveFutureExpenses(updated);
  };

  // Render correct screen component based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            expenses={expenses}
            cards={cards}
            categories={categories}
            futureExpenses={futureExpenses}
            onAddFutureExpense={handleFutureExpenseAdd}
            onDeleteFutureExpense={handleFutureExpenseDelete}
          />
        );
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
      case 'checking':
        return (
          <CheckingTab
            expenses={expenses}
            cards={cards}
            onDelete={handleExpenseDelete}
            onEdit={handleExpenseEditRequest}
          />
        );
      case 'credit_cards':
        return (
          <CreditCardsTab
            expenses={expenses}
            cards={cards}
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
        return (
          <Dashboard
            expenses={expenses}
            cards={cards}
            categories={categories}
            futureExpenses={futureExpenses}
            onAddFutureExpense={handleFutureExpenseAdd}
            onDeleteFutureExpense={handleFutureExpenseDelete}
          />
        );
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#000000" />
        <Text style={styles.loadingText}>Loading Spending Tracker...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ExlExp</Text>
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
          <Text style={[styles.tabText, activeTab === 'dashboard' && styles.activeTabText]}>Analytics</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'checking' && styles.activeTabButton]}
          onPress={() => {
            setEditingExpense(null);
            setActiveTab('checking');
          }}
        >
          <Text style={[styles.tabText, activeTab === 'checking' && styles.activeTabText]}>Checking</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'credit_cards' && styles.activeTabButton]}
          onPress={() => {
            setEditingExpense(null);
            setActiveTab('credit_cards');
          }}
        >
          <Text style={[styles.tabText, activeTab === 'credit_cards' && styles.activeTabText]}>Credit Cards</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'add' && styles.activeTabButton]}
          onPress={() => setActiveTab('add')}
        >
          <Text style={[styles.tabText, activeTab === 'add' && styles.activeTabText]}>
            {editingExpense ? 'Edit Item' : 'Log Spend'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'settings' && styles.activeTabButton]}
          onPress={() => {
            setEditingExpense(null);
            setActiveTab('settings');
          }}
        >
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
    color: '#0f172a',
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
    height: 48,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingBottom: 0,
  },
  tabBarWeb: {
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginBottom: 16,
    height: 44,
  },
  tabButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeTabButton: {
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 2,
    borderBottomColor: '#0f172a',
  },
  tabText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#0f172a',
    fontWeight: '700',
  },
});
