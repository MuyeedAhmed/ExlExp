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
  initializeLocalDefaults,
  migrateLocalDataToCloud,
  DEFAULT_LOCAL_CARDS,
} from './src/storage';
import { Dashboard } from './src/components/Dashboard';
import { ExpenseForm } from './src/components/ExpenseForm';
import { CheckingTab } from './src/components/CheckingTab';
import { CreditCardsTab } from './src/components/CreditCardsTab';
import { Settings } from './src/components/Settings';
import { LoginScreen } from './src/components/LoginScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';

// @ts-ignore
if (typeof ErrorUtils !== 'undefined') {
  // @ts-ignore
  const originalHandler = ErrorUtils.getGlobalHandler && ErrorUtils.getGlobalHandler();
  // @ts-ignore
  ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    console.error('GLOBAL JS RUNTIME ERROR:', error, isFatal);
    if (originalHandler) {
      originalHandler(error, isFatal);
    }
  });
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('CRITICAL ERROR CAUGHT BY ERRORBOUNDARY:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff', padding: 24, justifyContent: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#dc2626', marginBottom: 12 }}>
            App Runtime Error
          </Text>
          <Text style={{ fontSize: 14, color: '#334155', lineHeight: 20, marginBottom: 12 }}>
            {this.state.error?.message || String(this.state.error)}
          </Text>
          <Text style={{ fontSize: 11, color: '#64748b' }}>
            {this.state.error?.stack}
          </Text>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

type TabType = 'dashboard' | 'checking' | 'credit_cards' | 'add' | 'settings';

function MainApp() {
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
  const [showAuthScreen, setShowAuthScreen] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Track keyboard visibility for floating action button
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Check user session on startup
  useEffect(() => {
    async function checkSession() {
      try {
        const storedUser = await AsyncStorage.getItem('@ExlExp:currentUser');
        if (storedUser) {
          setCurrentUser(storedUser);
        } else {
          // First launch / Guest: default to local-first mode
          await AsyncStorage.setItem('@ExlExp:currentUser', 'local');
          await initializeLocalDefaults('local');
          setCurrentUser('local');
        }
      } catch (e) {
        console.error('Failed to check user session:', e);
        setCurrentUser('local');
        setLoading(false);
      }
    }
    checkSession();
  }, []);

  // Reload data helper
  const reloadUserData = async (username: string) => {
    try {
      const [freshExpenses, freshCards, freshFutureExpenses] = await Promise.all([
        getExpenses(username),
        getCreditCards(username),
        getFutureExpenses(username),
      ]);
      setExpenses(freshExpenses);
      if (freshCards.length === 0 && username === 'local') {
        await initializeLocalDefaults('local');
        setCards(DEFAULT_LOCAL_CARDS);
      } else {
        setCards(freshCards);
      }
      setFutureExpenses(freshFutureExpenses);
    } catch (e) {
      console.error('Failed to reload data:', e);
    }
  };

  // Load user data when currentUser changes
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
      // 1. If local mode, load directly from local storage and ensure defaults exist
      if (username === 'local') {
        try {
          await initializeLocalDefaults('local');
          const [localExpenses, localCards, localFuture] = await Promise.all([
            getExpenses('local'),
            getCreditCards('local'),
            getFutureExpenses('local'),
          ]);
          setExpenses(localExpenses);
          setCards(localCards.length > 0 ? localCards : DEFAULT_LOCAL_CARDS);
          setFutureExpenses(localFuture);
        } catch (e) {
          console.error('Error loading local data:', e);
        } finally {
          setLoading(false);
        }
        return;
      }

      // 2. If cloud user, load cached data from AsyncStorage first for instant startup if non-empty
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

        const hasNonEmptyCache = cachedExpenses.length > 0 || cachedCards.length > 0;
        if (hasNonEmptyCache) {
          setExpenses(cachedExpenses);
          setCards(cachedCards);
          setFutureExpenses(cachedFutureExpenses);
          setLoading(false); // Render dashboard instantly only if real data was cached
        }
      } catch (cacheError) {
        console.warn('Failed to load cached data from AsyncStorage:', cacheError);
      }

      // 3. Perform sync from Supabase with smooth delay to avoid 0's glance
      try {
        const [freshExpenses, freshCards, freshFutureExpenses] = await Promise.all([
          getExpenses(username),
          getCreditCards(username),
          getFutureExpenses(username),
          // Smooth minimum delay of 500ms so loading screen displays cleanly without abrupt flicker
          new Promise(resolve => setTimeout(resolve, 500)),
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
        console.error('Sync from Supabase failed:', syncError);
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
      setLoading(true);
      // Migrate local guest data to cloud account if any exists
      await migrateLocalDataToCloud(username);
      await AsyncStorage.setItem('@ExlExp:currentUser', username);
      setCurrentUser(username);
      setShowAuthScreen(false);
    } catch (e) {
      console.error('Failed to save session or migrate data:', e);
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      setLoading(true);
      // Switch back to local mode seamlessly
      await AsyncStorage.setItem('@ExlExp:currentUser', 'local');
      setCurrentUser('local');
    } catch (e) {
      console.error('Failed to log out and switch to local mode:', e);
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    if (!currentUser || currentUser === 'local') return;
    await Promise.all([
      saveExpenses(expenses, currentUser),
      saveCreditCards(cards, currentUser),
      saveFutureExpenses(futureExpenses, currentUser),
    ]);
  };



  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0f172a" />
        <Text style={styles.loadingText}>Fetching your accounts & expenses...</Text>
      </View>
    );
  }

  if (showAuthScreen) {
    return (
      <LoginScreen
        onLoginSuccess={handleLoginSuccess}
        onCancel={() => setShowAuthScreen(false)}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.container, isWeb && styles.containerWeb]}>
      <StatusBar style="dark" />

      {/* Web Sidebar Navigation (Instagram web style) */}
      {isWeb && (
        <View style={styles.webSidebar}>
          {/* Brand / Logo */}
          <View style={styles.webSidebarBrand}>
            <Text style={styles.webSidebarBrandTitle}>ExlExp</Text>
            <Text style={styles.webSidebarBrandSub}>Personal Finance</Text>
          </View>

          {/* Eye-catching Highlighted Log Expense Button (Over Analytics) */}
          <TouchableOpacity
            style={[
              styles.webLogButton,
              activeTab === 'add' && styles.webLogButtonActive,
            ]}
            onPress={() => {
              Keyboard.dismiss();
              setActiveTab('add');
            }}
            activeOpacity={0.85}
            accessibilityLabel="Log Expense"
          >
            <View style={styles.webLogButtonContent}>
              <Text style={styles.webLogButtonIcon}>{editingExpense ? '✏️' : '➕'}</Text>
              <Text style={styles.webLogButtonText}>
                {editingExpense ? 'Edit Item' : 'Log Expense'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Nav Menu */}
          <View style={styles.webSidebarNav}>
            <TouchableOpacity
              style={[styles.webNavItem, activeTab === 'dashboard' && styles.webNavItemActive]}
              onPress={() => {
                Keyboard.dismiss();
                setEditingExpense(null);
                setActiveTab('dashboard');
              }}
            >
              <Text style={styles.webNavIcon}>📊</Text>
              <Text style={[styles.webNavText, activeTab === 'dashboard' && styles.webNavTextActive]}>
                Analytics
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.webNavItem, activeTab === 'checking' && styles.webNavItemActive]}
              onPress={() => {
                Keyboard.dismiss();
                setEditingExpense(null);
                setActiveTab('checking');
              }}
            >
              <Text style={styles.webNavIcon}>🏛️</Text>
              <Text style={[styles.webNavText, activeTab === 'checking' && styles.webNavTextActive]}>
                Accounts
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.webNavItem, activeTab === 'credit_cards' && styles.webNavItemActive]}
              onPress={() => {
                Keyboard.dismiss();
                setEditingExpense(null);
                setActiveTab('credit_cards');
              }}
            >
              <Text style={styles.webNavIcon}>💳</Text>
              <Text style={[styles.webNavText, activeTab === 'credit_cards' && styles.webNavTextActive]}>
                Credit Cards
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.webNavItem, activeTab === 'settings' && styles.webNavItemActive]}
              onPress={() => {
                Keyboard.dismiss();
                setEditingExpense(null);
                setActiveTab('settings');
              }}
            >
              <Text style={styles.webNavIcon}>⚙️</Text>
              <Text style={[styles.webNavText, activeTab === 'settings' && styles.webNavTextActive]}>
                Settings
              </Text>
            </TouchableOpacity>
          </View>

          {/* Sidebar Footer / User Profile */}
          <TouchableOpacity
            style={styles.webSidebarFooter}
            onPress={() => {
              Keyboard.dismiss();
              setEditingExpense(null);
              setActiveTab('settings');
            }}
          >
            <View style={styles.webSidebarUserAvatar}>
              <Text style={styles.webSidebarUserAvatarText}>
                {currentUser === 'local' ? '👤' : currentUser?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
            <View style={styles.webSidebarUserInfo}>
              <Text style={styles.webSidebarUserName} numberOfLines={1}>
                {currentUser === 'local' ? 'Local Mode' : `@${currentUser}`}
              </Text>
              <Text style={styles.webSidebarUserStatus}>
                {currentUser === 'local' ? 'Offline Storage' : 'Cloud Synced'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Main Content Area */}
      <View style={[styles.content, isWeb && styles.contentWeb]}>
        {/* Header - Mobile only */}
        {!isWeb && (
          <View style={styles.header}>
            <Text style={styles.headerTitle}>ExlExp</Text>
          </View>
        )}

        {activeTab === 'dashboard' && (
          <Dashboard
            expenses={expenses}
            cards={cards}
            futureExpenses={futureExpenses}
            onAddFutureExpense={handleFutureExpenseAdd}
            onDeleteFutureExpense={handleFutureExpenseDelete}
            onNavigateToSettings={() => setActiveTab('settings')}
            onEditExpense={handleExpenseEditRequest}
            onDeleteExpense={handleExpenseDelete}
          />
        )}

        {activeTab === 'checking' && (
          <CheckingTab
            expenses={expenses}
            cards={cards}
            onDelete={handleExpenseDelete}
            onEdit={handleExpenseEditRequest}
            onBrokerageBalanceUpdate={handleBrokerageBalanceUpdate}
            selectedAccountId={selectedCheckingAccountId}
            onSelectAccount={setSelectedCheckingAccountId}
            onNavigateToSettings={() => setActiveTab('settings')}
          />
        )}

        {activeTab === 'credit_cards' && (
          <CreditCardsTab
            expenses={expenses}
            cards={cards}
            onDelete={handleExpenseDelete}
            onEdit={handleExpenseEditRequest}
            selectedCardId={selectedCreditCardId}
            onSelectCard={setSelectedCreditCardId}
            onUpdateCard={handleCardUpdate}
            onNavigateToSettings={() => setActiveTab('settings')}
          />
        )}

        {activeTab === 'settings' && (
          <Settings
            cards={cards}
            onAddCard={handleCardAdd}
            onDeleteCard={handleCardDelete}
            onRenameCard={handleCardRename}
            onMoveCard={handleMoveCard}
            onToggleCardVisibility={handleToggleCardVisibility}
            onUpdateCard={handleCardUpdate}
            username={currentUser || 'local'}
            onLogout={handleLogout}
            onUsernameChange={setCurrentUser}
            onOpenAuth={() => setShowAuthScreen(true)}
            onSyncNow={handleManualSync}
            onDataReload={() => reloadUserData(currentUser || 'local')}
          />
        )}

        {activeTab === 'add' && (
          <ExpenseForm
            cards={cards}
            expenses={expenses}
            onSubmit={handleExpenseSubmit}
            editingExpense={editingExpense}
            onCancelEditing={handleCancelEditing}
            onNavigateToSettings={() => setActiveTab('settings')}
          />
        )}
      </View>

      {/* Floating Action Button for Mobile App */}
      {!isWeb && activeTab !== 'add' && !isKeyboardVisible && (
        <View style={styles.floatingButtonContainer} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.floatingLogButton}
            onPress={() => {
              Keyboard.dismiss();
              setEditingExpense(null);
              setActiveTab('add');
            }}
            activeOpacity={0.85}
            accessibilityLabel="Log Expense"
          >
            <Text style={styles.floatingLogIcon}>➕</Text>
            <Text style={styles.floatingLogText}>Log Expense</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Mobile Tab Navigation Bar - Mobile only */}
      {!isWeb && (
        <View style={styles.tabBar}>
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
      )}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight || 0) : 0,
  },
  containerWeb: {
    flexDirection: 'row',
    height: '100%',
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
  content: {
    flex: 1,
  },
  contentWeb: {
    flex: 1,
    height: '100%',
  },
  webSidebar: {
    width: 240,
    height: '100%',
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 24,
    justifyContent: 'space-between',
  },
  webSidebarBrand: {
    paddingHorizontal: 10,
    marginBottom: 16,
  },
  webSidebarBrandTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  webSidebarBrandSub: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  webLogButton: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 20,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1.5,
    borderColor: '#1e293b',
  },
  webLogButtonActive: {
    backgroundColor: '#1e293b',
    borderColor: '#38bdf8',
    shadowOpacity: 0.4,
  },
  webLogButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  webLogButtonIcon: {
    fontSize: 16,
    color: '#ffffff',
  },
  webLogButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.4,
  },
  webSidebarNav: {
    flex: 1,
    gap: 4,
  },
  webNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  webNavItemActive: {
    backgroundColor: '#f1f5f9',
  },
  webNavIcon: {
    fontSize: 18,
    width: 24,
    textAlign: 'center',
  },
  webNavText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
  },
  webNavTextActive: {
    color: '#0f172a',
    fontWeight: '700',
  },
  webSidebarFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  webSidebarUserAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  webSidebarUserAvatarText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  webSidebarUserInfo: {
    flex: 1,
    minWidth: 0,
  },
  webSidebarUserName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  webSidebarUserStatus: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  floatingButtonContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Platform.OS === 'android' ? 106 : 58,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  floatingLogButton: {
    backgroundColor: '#0f172a',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  floatingLogIcon: {
    fontSize: 16,
    color: '#ffffff',
  },
  floatingLogText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  tabBar: {
    flexDirection: 'row',
    height: Platform.OS === 'android' ? 96 : 48,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    alignItems: 'flex-start',
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
