import AsyncStorage from '@react-native-async-storage/async-storage';
import { Expense, CreditCard, Category, FutureExpense } from './types';

const API_BASE = 'http://localhost:3000/api';

const EXPENSES_KEY = '@ExlExp:expenses';
const CARDS_KEY = '@ExlExp:credit_cards';
const CATEGORIES_KEY = '@ExlExp:categories';

const DEFAULT_CARDS: CreditCard[] = [
  { id: '1', name: 'Chase Freedom', lastFour: '1234' },
  { id: '2', name: 'Amex Gold', lastFour: '9876' },
  { id: '3', name: 'Citi Double Cash', lastFour: '5555' },
];

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-food', name: 'Food & Dining' },
  { id: 'cat-groceries', name: 'Groceries' },
  { id: 'cat-transport', name: 'Transportation' },
  { id: 'cat-utilities', name: 'Rent & Utilities' },
  { id: 'cat-shopping', name: 'Shopping' },
  { id: 'cat-entertainment', name: 'Entertainment' },
  { id: 'cat-others', name: 'Others' },
];

// Helper to make API requests with a short timeout
const requestApi = async (endpoint: string, options?: RequestInit) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1000); // 1-second timeout

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      throw new Error(`Server returned ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
};

export const getExpenses = async (): Promise<Expense[]> => {
  try {
    const data = await requestApi('/data');
    return data.expenses || [];
  } catch (error) {
    console.log('API Server offline, using local AsyncStorage for expenses');
    try {
      const data = await AsyncStorage.getItem(EXPENSES_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error fetching expenses from AsyncStorage:', e);
      return [];
    }
  }
};

export const saveExpenses = async (expenses: Expense[]): Promise<void> => {
  try {
    await requestApi('/expenses/sync', {
      method: 'POST',
      body: JSON.stringify(expenses),
    });
  } catch (error) {
    console.log('API Server offline, saving expenses to local AsyncStorage');
    try {
      await AsyncStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses));
    } catch (e) {
      console.error('Error saving expenses to AsyncStorage:', e);
    }
  }
};

export const getCreditCards = async (): Promise<CreditCard[]> => {
  try {
    const data = await requestApi('/data');
    if (!data.cards || data.cards.length === 0) {
      await saveCreditCards(DEFAULT_CARDS);
      return DEFAULT_CARDS;
    }
    return data.cards;
  } catch (error) {
    console.log('API Server offline, using local AsyncStorage for credit cards');
    try {
      const data = await AsyncStorage.getItem(CARDS_KEY);
      if (!data) {
        await saveCreditCards(DEFAULT_CARDS);
        return DEFAULT_CARDS;
      }
      return JSON.parse(data);
    } catch (e) {
      console.error('Error fetching credit cards from AsyncStorage:', e);
      return DEFAULT_CARDS;
    }
  }
};

export const saveCreditCards = async (cards: CreditCard[]): Promise<void> => {
  try {
    await requestApi('/cards/sync', {
      method: 'POST',
      body: JSON.stringify(cards),
    });
  } catch (error) {
    console.log('API Server offline, saving credit cards to local AsyncStorage');
    try {
      await AsyncStorage.setItem(CARDS_KEY, JSON.stringify(cards));
    } catch (e) {
      console.error('Error saving credit cards to AsyncStorage:', e);
    }
  }
};

export const getCategories = async (): Promise<Category[]> => {
  try {
    const data = await requestApi('/data');
    if (!data.categories || data.categories.length === 0) {
      await saveCategories(DEFAULT_CATEGORIES);
      return DEFAULT_CATEGORIES;
    }
    return data.categories;
  } catch (error) {
    console.log('API Server offline, using local AsyncStorage for categories');
    try {
      const data = await AsyncStorage.getItem(CATEGORIES_KEY);
      if (!data) {
        await saveCategories(DEFAULT_CATEGORIES);
        return DEFAULT_CATEGORIES;
      }
      return JSON.parse(data);
    } catch (e) {
      console.error('Error fetching categories from AsyncStorage:', e);
      return DEFAULT_CATEGORIES;
    }
  }
};

export const saveCategories = async (categories: Category[]): Promise<void> => {
  try {
    await requestApi('/categories/sync', {
      method: 'POST',
      body: JSON.stringify(categories),
    });
  } catch (error) {
    console.log('API Server offline, saving categories to local AsyncStorage');
    try {
      await AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
    } catch (e) {
      console.error('Error saving categories to AsyncStorage:', e);
    }
  }
};

const FUTURE_EXPENSES_KEY = '@ExlExp:future_expenses';

export const getFutureExpenses = async (): Promise<FutureExpense[]> => {
  try {
    const data = await requestApi('/data');
    return data.futureExpenses || [];
  } catch (error) {
    console.log('API Server offline, using local AsyncStorage for future expenses');
    try {
      const data = await AsyncStorage.getItem(FUTURE_EXPENSES_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error fetching future expenses from AsyncStorage:', e);
      return [];
    }
  }
};

export const saveFutureExpenses = async (futureExpenses: FutureExpense[]): Promise<void> => {
  try {
    await requestApi('/future-expenses/sync', {
      method: 'POST',
      body: JSON.stringify(futureExpenses),
    });
  } catch (error) {
    console.log('API Server offline, saving future expenses to local AsyncStorage');
    try {
      await AsyncStorage.setItem(FUTURE_EXPENSES_KEY, JSON.stringify(futureExpenses));
    } catch (e) {
      console.error('Error saving future expenses to AsyncStorage:', e);
    }
  }
};
