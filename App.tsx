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
  Keyboard,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Expense, CreditCard, FutureExpense } from './src/types';
import {
  getExpenses,
  saveExpenses,
  getCreditCards,
  saveCreditCards,
  getFutureExpenses,
  saveFutureExpenses,
} from './src/storage';
import { Dashboard } from './src/components/Dashboard';
import { ExpenseForm } from './src/components/ExpenseForm';
import { CheckingTab } from './src/components/CheckingTab';
import { CreditCardsTab } from './src/components/CreditCardsTab';
import { Settings } from './src/components/Settings';
import { LoginScreen } from './src/components/LoginScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';

type TabType = 'dashboard' | 'checking' | 'credit_cards' | 'add' | 'settings';

export default function App() {
  const { width } = useWindowDimensions();
  const isWeb = width > 768;

  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [futureExpenses, setFutureExpenses] = useState<FutureExpense[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [selectedCheckingAccountId, setSelectedCheckingAccountId] = useState<string>('');
  const [selectedCreditCardId, setSelectedCreditCardId] = useState<string>('');

  // Check user session on startup
  useEffect(() => {
    async function checkSession() {
      try {
        const storedUser = await AsyncStorage.getItem('@ExlExp:currentUser');
        if (storedUser) {
          setCurrentUser(storedUser);
        } else {
          setLoading(false);
        }
      } catch (e) {
        console.error('Failed to check user session:', e);
        setLoading(false);
      }
    }
    checkSession();
  }, []);

  // Load user data when currentUser changes (SWR caching + background sync)
  useEffect(() => {
    if (!currentUser) {
      setExpenses([]);
      setCards([]);
      setFutureExpenses([]);
      setLoading(false);
      return;
    }

    const username = currentUser;

    async function loadData() {
      // 1. Load cached data from AsyncStorage first for instant startup
      let cachedExpenses: Expense[] = [];
      let cachedCards: CreditCard[] = [];
      let cachedFutureExpenses: FutureExpense[] = [];
      
      try {
        const [expData, cardData, futureData] = await Promise.all([
          AsyncStorage.getItem(`@ExlExp:${username}:expenses`),
          AsyncStorage.getItem(`@ExlExp:${username}:credit_cards`),
          AsyncStorage.getItem(`@ExlExp:${username}:future_expenses`),
        ]);

        if (expData) cachedExpenses = JSON.parse(expData);
        if (cardData) cachedCards = JSON.parse(cardData);
        if (futureData) cachedFutureExpenses = JSON.parse(futureData);

        if (expData || cardData || futureData) {
          setExpenses(cachedExpenses);
          setCards(cachedCards);
          setFutureExpenses(cachedFutureExpenses);
          setLoading(false); // Render dashboard instantly
        }
      } catch (cacheError) {
        console.warn('Failed to load cached data from AsyncStorage:', cacheError);
      }

      // 2. Perform background sync from Supabase
      try {
        const [freshExpenses, freshCards, freshFutureExpenses] = await Promise.all([
          getExpenses(username),
          getCreditCards(username),
          getFutureExpenses(username),
        ]);

        setExpenses(freshExpenses);
        setCards(freshCards);
        setFutureExpenses(freshFutureExpenses);

        // Update local cache
        await Promise.all([
          AsyncStorage.setItem(`@ExlExp:${username}:expenses`, JSON.stringify(freshExpenses)),
          AsyncStorage.setItem(`@ExlExp:${username}:credit_cards`, JSON.stringify(freshCards)),
          AsyncStorage.setItem(`@ExlExp:${username}:future_expenses`, JSON.stringify(freshFutureExpenses)),
        ]);
      } catch (syncError) {
        console.error('Background sync from Supabase failed:', syncError);
      } finally {
        setLoading(false); // Ensure loading is dismissed
      }
    }
    loadData();
  }, [currentUser]);

  // Expense Handlers
  const handleExpenseSubmit = async (
    expenseData:
      | (Omit<Expense, 'id'> & { id?: string })
      | (Omit<Expense, 'id'> & { id?: string })[],
    targetAccountCardId?: string,
    stayInLogPage?: boolean
  ) => {
    let updatedExpenses: Expense[];
    const isArray = Array.isArray(expenseData);

    if (editingExpense) {
      // Editing mode
      if (editingExpense.transferLinkId) {
        // Was previously a transfer
        // Filter out all transactions linked to this transfer
        const filtered = expenses.filter(e => e.transferLinkId !== editingExpense.transferLinkId);
        if (isArray) {
          // Saving as edited transfer
          const transferLinkId = editingExpense.transferLinkId;
          const newItems = (expenseData as Omit<Expense, 'id'>[]).map(item => ({
            ...item,
            id: 'exp-' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
            transferLinkId,
          }));
          updatedExpenses = [...newItems, ...filtered];
        } else {
          // Saving as standard transaction (converted from transfer)
          const newExpense: Expense = {
            ...(expenseData as Omit<Expense, 'id'> & { id?: string }),
            id: editingExpense.id, // keep same ID
          };
          updatedExpenses = [newExpense, ...filtered];
        }
      } else {
        // Was previously a standard transaction
        if (isArray) {
          // Saving as transfer (converted from standard transaction)
          // Filter out the old standard transaction
          const filtered = expenses.filter(e => e.id !== editingExpense.id);
          const transferLinkId = 'tr-' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
          const newItems = (expenseData as Omit<Expense, 'id'>[]).map(item => ({
            ...item,
            id: 'exp-' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
            transferLinkId,
          }));
          updatedExpenses = [...newItems, ...filtered];
        } else {
          // Saving as standard transaction
          updatedExpenses = expenses.map(e =>
            e.id === editingExpense.id ? (expenseData as Expense) : e
          );
        }
      }
      setEditingExpense(null);
    } else {
      // Adding mode
      if (isArray) {
        // Adding a new transfer
        const transferLinkId = 'tr-' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        const newItems = (expenseData as Omit<Expense, 'id'>[]).map(item => ({
          ...item,
          id: 'exp-' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
          transferLinkId,
        }));
        updatedExpenses = [...newItems, ...expenses];
      } else {
        // Adding a new standard transaction
        const newExpense: Expense = {
          ...(expenseData as Omit<Expense, 'id'>),
          id: 'exp-' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
        };
        updatedExpenses = [newExpense, ...expenses];
      }
    }

    setExpenses(updatedExpenses);
    await saveExpenses(updatedExpenses, currentUser!);

    // If multiple log creation is NOT requested, navigate to the target account
    if (!stayInLogPage && targetAccountCardId) {
      const targetCard = cards.find(c => c.id === targetAccountCardId);
      if (targetCard) {
        if (targetCard.isChecking || targetCard.isSaving || targetCard.isBrokerage) {
          setSelectedCheckingAccountId(targetCard.isBrokerage ? 'brokerage' : targetCard.id);
          setActiveTab('checking');
        } else {
          setSelectedCreditCardId(targetCard.id);
          setActiveTab('credit_cards');
        }
      }
    }
  };

  const handleExpenseDelete = async (id: string) => {
    const target = expenses.find(e => e.id === id);
    let updatedExpenses: Expense[];
    if (target && target.transferLinkId) {
      updatedExpenses = expenses.filter(e => e.transferLinkId !== target.transferLinkId);
    } else {
      updatedExpenses = expenses.filter(e => e.id !== id);
    }
    setExpenses(updatedExpenses);
    await saveExpenses(updatedExpenses, currentUser!);
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
    let idPrefix = 'card-';
    if (cardData.isChecking) {
      idPrefix = 'card-checking-';
    } else if (cardData.isSaving) {
      idPrefix = 'card-saving-';
    } else if (cardData.isBrokerage) {
      idPrefix = 'card-brokerage-';
    }
    const newCard: CreditCard = {
      ...cardData,
      id: idPrefix + Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
    };
    const updatedCards = [...cards, newCard];
    setCards(updatedCards);
    await saveCreditCards(updatedCards, currentUser!);
  };

  const handleCardDelete = async (id: string) => {
    const updatedCards = cards.filter(c => c.id !== id);
    setCards(updatedCards);
    await saveCreditCards(updatedCards, currentUser!);
  };

  const handleCardUpdate = async (updatedCard: CreditCard) => {
    const updatedCards = cards.map(c => 
      c.id === updatedCard.id ? updatedCard : c
    );
    setCards(updatedCards);
    await saveCreditCards(updatedCards, currentUser!);
  };

  const handleCardRename = async (id: string, newName: string) => {
    const updatedCards = cards.map(c => 
      c.id === id ? { ...c, name: newName } : c
    );
    setCards(updatedCards);
    await saveCreditCards(updatedCards, currentUser!);
  };

  const handleMoveCard = async (id: string, direction: 'up' | 'down') => {
    const card = cards.find(c => c.id === id);
    if (!card) return;

    // Filter cards of the same group to find the correct swap target
    const isDepositGroup = !!(card.isChecking || card.isSaving || card.isBrokerage);
    const sameGroupCards = cards.filter(c => 
      isDepositGroup === !!(c.isChecking || c.isSaving || c.isBrokerage)
    );

    const indexInGroup = sameGroupCards.findIndex(c => c.id === id);
    if (indexInGroup === -1) return;

    const newIndexInGroup = direction === 'up' ? indexInGroup - 1 : indexInGroup + 1;
    if (newIndexInGroup < 0 || newIndexInGroup >= sameGroupCards.length) return;

    const targetCard = sameGroupCards[newIndexInGroup];

    // Swap in the original array
    const originalIndex = cards.findIndex(c => c.id === id);
    const targetOriginalIndex = cards.findIndex(c => c.id === targetCard.id);

    const updatedCards = [...cards];
    updatedCards[originalIndex] = targetCard;
    updatedCards[targetOriginalIndex] = card;

    setCards(updatedCards);
    await saveCreditCards(updatedCards, currentUser!);
  };

  const handleToggleCardVisibility = async (id: string) => {
    const updatedCards = cards.map(c =>
      c.id === id ? { ...c, isHidden: !c.isHidden } : c
    );
    setCards(updatedCards);
    await saveCreditCards(updatedCards, currentUser!);
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
    await saveFutureExpenses(updated, currentUser!);
  };

  const handleFutureExpenseDelete = async (id: string) => {
    const updated = futureExpenses.filter(f => f.id !== id);
    setExpenses(expenses); // force reload dependencies if needed
    setFutureExpenses(updated);
    await saveFutureExpenses(updated, currentUser!);
  };

  const handleBrokerageBalanceUpdate = async (brokerageCardId: string, newBalance: number) => {
    // Check if there is an existing transaction for this brokerage card
    const existingIdx = expenses.findIndex(e => e.creditCardId === brokerageCardId);
    let updatedExpenses: Expense[];
    if (existingIdx !== -1) {
      // Update existing transaction amount and set date to today
      updatedExpenses = expenses.map((e, idx) => 
        idx === existingIdx ? { ...e, amount: newBalance, date: new Date().toISOString().split('T')[0] } : e
      );
    } else {
      // Create a new transaction representing the current balance
      const newTx: Expense = {
        id: 'exp-' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36),
        description: 'Current Balance',
        amount: newBalance,
        creditCardId: brokerageCardId,
        date: new Date().toISOString().split('T')[0],
        fromTo: 'Imported Balance',
        details: 'Calculated from transfer logs'
      };
      updatedExpenses = [newTx, ...expenses];
    }
    setExpenses(updatedExpenses);
    await saveExpenses(updatedExpenses, currentUser!);
  };

  const handleLoginSuccess = async (username: string) => {
    try {
      await AsyncStorage.setItem('@ExlExp:currentUser', username);
      setCurrentUser(username);
    } catch (e) {
      console.error('Failed to save session:', e);
    }
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('@ExlExp:currentUser');
      setCurrentUser(null);
    } catch (e) {
      console.error('Failed to log out:', e);
    }
  };

  // Render correct screen component based on active tab
  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            expenses={expenses}
            cards={cards}
            futureExpenses={futureExpenses}
            onAddFutureExpense={handleFutureExpenseAdd}
            onDeleteFutureExpense={handleFutureExpenseDelete}
          />
        );
      case 'add':
        return (
          <ExpenseForm
            cards={cards}
            expenses={expenses}
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
            onBrokerageBalanceUpdate={handleBrokerageBalanceUpdate}
            selectedAccountId={selectedCheckingAccountId}
            onSelectAccount={setSelectedCheckingAccountId}
          />
        );
      case 'credit_cards':
        return (
          <CreditCardsTab
            expenses={expenses}
            cards={cards}
            onDelete={handleExpenseDelete}
            onEdit={handleExpenseEditRequest}
            selectedCardId={selectedCreditCardId}
            onSelectCard={setSelectedCreditCardId}
            onUpdateCard={handleCardUpdate}
          />
        );
      case 'settings':
        return (
          <Settings
            cards={cards}
            onAddCard={handleCardAdd}
            onDeleteCard={handleCardDelete}
            onRenameCard={handleCardRename}
            onMoveCard={handleMoveCard}
            onToggleCardVisibility={handleToggleCardVisibility}
            onUpdateCard={handleCardUpdate}
            username={currentUser!}
            onLogout={handleLogout}
            onUsernameChange={setCurrentUser}
          />
        );
      default:
        return (
          <Dashboard
            expenses={expenses}
            cards={cards}
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

  if (!currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
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
            Keyboard.dismiss();
            setEditingExpense(null);
            setActiveTab('dashboard');
          }}
        >
          <Text style={[styles.tabText, activeTab === 'dashboard' && styles.activeTabText]}>Analytics</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'checking' && styles.activeTabButton]}
          onPress={() => {
            Keyboard.dismiss();
            setEditingExpense(null);
            setActiveTab('checking');
          }}
        >
          <Text style={[styles.tabText, activeTab === 'checking' && styles.activeTabText]}>Accounts</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'credit_cards' && styles.activeTabButton]}
          onPress={() => {
            Keyboard.dismiss();
            setEditingExpense(null);
            setActiveTab('credit_cards');
          }}
        >
          <Text style={[styles.tabText, activeTab === 'credit_cards' && styles.activeTabText]}>Credit Cards</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'add' && styles.activeTabButton]}
          onPress={() => {
            Keyboard.dismiss();
            setActiveTab('add');
          }}
        >
          <Text style={[styles.tabText, activeTab === 'add' && styles.activeTabText]}>
            {editingExpense ? 'Edit Item' : 'Log'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'settings' && styles.activeTabButton]}
          onPress={() => {
            Keyboard.dismiss();
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
    height: Platform.OS === 'android' ? 96 : 48,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'flex-start',
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
    height: 48,
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
