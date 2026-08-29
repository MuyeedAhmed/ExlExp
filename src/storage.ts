import AsyncStorage from '@react-native-async-storage/async-storage';
import { Expense, CreditCard, Category } from './types';

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

export const getExpenses = async (): Promise<Expense[]> => {
  try {
    const data = await AsyncStorage.getItem(EXPENSES_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error fetching expenses:', error);
    return [];
  }
};

export const saveExpenses = async (expenses: Expense[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses));
  } catch (error) {
    console.error('Error saving expenses:', error);
  }
};

export const getCreditCards = async (): Promise<CreditCard[]> => {
  try {
    const data = await AsyncStorage.getItem(CARDS_KEY);
    if (!data) {
      // First run: save and return default cards
      await saveCreditCards(DEFAULT_CARDS);
      return DEFAULT_CARDS;
    }
    return JSON.parse(data);
  } catch (error) {
    console.error('Error fetching credit cards:', error);
    return DEFAULT_CARDS;
  }
};

export const saveCreditCards = async (cards: CreditCard[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(CARDS_KEY, JSON.stringify(cards));
  } catch (error) {
    console.error('Error saving credit cards:', error);
  }
};

export const getCategories = async (): Promise<Category[]> => {
  try {
    const data = await AsyncStorage.getItem(CATEGORIES_KEY);
    if (!data) {
      // First run: save and return default categories
      await saveCategories(DEFAULT_CATEGORIES);
      return DEFAULT_CATEGORIES;
    }
    return JSON.parse(data);
  } catch (error) {
    console.error('Error fetching categories:', error);
    return DEFAULT_CATEGORIES;
  }
};

export const saveCategories = async (categories: Category[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
  } catch (error) {
    console.error('Error saving categories:', error);
  }
};
