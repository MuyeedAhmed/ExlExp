import AsyncStorage from '@react-native-async-storage/async-storage';
import { Expense, CreditCard, FutureExpense } from './types';
import { supabase } from './supabaseClient';

const EXPENSES_KEY = '@ExlExp:expenses';
const CARDS_KEY = '@ExlExp:credit_cards';
const FUTURE_EXPENSES_KEY = '@ExlExp:future_expenses';

const DEFAULT_CARDS: CreditCard[] = [
  { id: 'card-citidb', name: 'Citi Double Cash' },
  { id: 'card-citistrata', name: 'Citi Strata' },
  { id: 'card-bofa', name: 'BofA Premium' },
  { id: 'card-chase', name: 'Chase Checking', isChecking: true }
];

export const getExpenses = async (): Promise<Expense[]> => {
  try {
    const { data, error } = await supabase
      .from('expenses')
      .select('*');
    
    if (error) throw error;
    const loaded = data || [];
    return loaded.map(e => {
      if (e.description && e.description.includes(' // ')) {
        const parts = e.description.split(' // ');
        return {
          ...e,
          description: parts[0],
          fromTo: parts[0],
          details: parts[1] || ''
        };
      }
      return e;
    });
  } catch (error) {
    console.log('Supabase offline or error, using local AsyncStorage for expenses:', error);
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
    // Delete all then insert in bulk to sync client state
    const { error: delError } = await supabase.from('expenses').delete().neq('id', '');
    if (delError) throw delError;

    if (expenses.length > 0) {
      const expensesToInsert = expenses.map(e => {
        const { fromTo, details, ...rest } = e;
        let desc = e.description;
        if (fromTo || details) {
          desc = `${fromTo || ''} // ${details || ''}`;
        }
        return {
          ...rest,
          description: desc
        };
      });
      const { error: insError } = await supabase.from('expenses').insert(expensesToInsert);
      if (insError) throw insError;
    }
  } catch (error) {
    console.log('Supabase offline or error, saving expenses to local AsyncStorage:', error);
    try {
      await AsyncStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses));
    } catch (e) {
      console.error('Error saving expenses to AsyncStorage:', e);
    }
  }
};

export const getCreditCards = async (): Promise<CreditCard[]> => {
  try {
    const { data, error } = await supabase
      .from('cards')
      .select('*');

    if (error) throw error;
    if (!data || data.length === 0) {
      await saveCreditCards(DEFAULT_CARDS);
      return DEFAULT_CARDS;
    }
    return data.map(c => ({
      ...c,
      isChecking: !c.isSaving && !c.isBrokerage && (
        c.id === 'card-chase' ||
        c.name.toLowerCase().includes('checking') ||
        c.id.toLowerCase().includes('checking') ||
        ['chase', 'santander', 'sofi', 'upgrade', 'citizens'].some(name => c.name.toLowerCase().includes(name))
      )
    }));
  } catch (error) {
    console.log('Supabase offline or error, using local AsyncStorage for credit cards:', error);
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
    const { error: delError } = await supabase.from('cards').delete().neq('id', '');
    if (delError) throw delError;

    if (cards.length > 0) {
      const cardsToInsert = cards.map(({ isChecking, ...rest }) => rest);
      const { error: insError } = await supabase.from('cards').insert(cardsToInsert);
      if (insError) throw insError;
    }
  } catch (error) {
    console.log('Supabase offline or error, saving credit cards to local AsyncStorage:', error);
    try {
      await AsyncStorage.setItem(CARDS_KEY, JSON.stringify(cards));
    } catch (e) {
      console.error('Error saving credit cards to AsyncStorage:', e);
    }
  }
};


export const getFutureExpenses = async (): Promise<FutureExpense[]> => {
  try {
    const { data, error } = await supabase
      .from('future_expenses')
      .select('*');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.log('Supabase offline or error, using local AsyncStorage for future expenses:', error);
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
    const { error: delError } = await supabase.from('future_expenses').delete().neq('id', '');
    if (delError) throw delError;

    if (futureExpenses.length > 0) {
      const { error: insError } = await supabase.from('future_expenses').insert(futureExpenses);
      if (insError) throw insError;
    }
  } catch (error) {
    console.log('Supabase offline or error, saving future expenses to local AsyncStorage:', error);
    try {
      await AsyncStorage.setItem(FUTURE_EXPENSES_KEY, JSON.stringify(futureExpenses));
    } catch (e) {
      console.error('Error saving future expenses to AsyncStorage:', e);
    }
  }
};
