import AsyncStorage from '@react-native-async-storage/async-storage';
import { Expense, CreditCard, FutureExpense } from './types';
import { supabase } from './supabaseClient';

const EXPENSES_KEY = '@ExlExp:expenses';
const CARDS_KEY = '@ExlExp:credit_cards';
const FUTURE_EXPENSES_KEY = '@ExlExp:future_expenses';

const DEFAULT_CARDS: CreditCard[] = [
  { id: 'card-citidb', name: 'Citi Double Cash', priority: 0, isHidden: false },
  { id: 'card-citistrata', name: 'Citi Strata', priority: 1, isHidden: false },
  { id: 'card-bofa', name: 'BofA Premium', priority: 2, isHidden: false },
  { id: 'card-chase', name: 'Chase Checking', isChecking: true, priority: 3, isHidden: false }
];

export const getExpenses = async (): Promise<Expense[]> => {
  try {
    let allExpenses: any[] = [];
    let from = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .range(from, from + limit - 1);
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        allExpenses = [...allExpenses, ...data];
        from += limit;
        if (data.length < limit) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    return allExpenses.map(e => {
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
  // 1. Save to local AsyncStorage first
  try {
    await AsyncStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses));
  } catch (e) {
    console.error('Error saving expenses to AsyncStorage:', e);
  }

  // 2. Perform delta sync to Supabase (no table wipes!)
  try {
    // Fetch current expenses in Supabase to compare
    let dbExpenses: any[] = [];
    let from = 0;
    const limit = 1000;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase.from('expenses').select('*').range(from, from + limit - 1);
      if (error) throw error;
      if (data && data.length > 0) {
        dbExpenses = [...dbExpenses, ...data];
        from += limit;
        if (data.length < limit) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    // Map new client expenses for insertion/comparison
    const clientExpensesMapped = expenses.map(e => {
      const { fromTo, details, ...rest } = e;
      let desc = e.description;
      if (fromTo || details) {
        desc = `${fromTo || ''} // ${details || ''}`;
      }
      return {
        ...rest,
        description: desc,
        category: e.isTransfer ? 'Transfer' : (e.category || 'Others')
      };
    });

    // Find items to delete: in DB but not in Client
    const clientIds = new Set(expenses.map(e => e.id));
    const toDeleteIds = dbExpenses.filter(e => !clientIds.has(e.id)).map(e => e.id);

    // Find items to insert: in Client but not in DB
    const dbIds = new Set(dbExpenses.map(e => e.id));
    const toInsert = clientExpensesMapped.filter(e => !dbIds.has(e.id));

    // Find items to update: in both, but content changed
    const toUpdate = clientExpensesMapped.filter(e => {
      const dbItem = dbExpenses.find(d => d.id === e.id);
      if (!dbItem) return false;
      return (
        dbItem.description !== e.description ||
        dbItem.amount !== e.amount ||
        dbItem.date !== e.date ||
        dbItem.creditCardId !== e.creditCardId ||
        !!dbItem.isFee !== !!e.isFee ||
        !!dbItem.isReward !== !!e.isReward ||
        !!dbItem.isTransfer !== !!e.isTransfer ||
        dbItem.transferLinkId !== e.transferLinkId ||
        dbItem.category !== e.category ||
        !!dbItem.isInterest !== !!e.isInterest
      );
    });

    // Execute deletes in chunks of 100
    if (toDeleteIds.length > 0) {
      for (let i = 0; i < toDeleteIds.length; i += 100) {
        const chunk = toDeleteIds.slice(i, i + 100);
        const { error } = await supabase.from('expenses').delete().in('id', chunk);
        if (error) throw error;
      }
    }

    // Execute inserts in chunks of 100
    if (toInsert.length > 0) {
      for (let i = 0; i < toInsert.length; i += 100) {
        const chunk = toInsert.slice(i, i + 100);
        const { error } = await supabase.from('expenses').insert(chunk);
        if (error) throw error;
      }
    }

    // Execute updates
    if (toUpdate.length > 0) {
      for (const item of toUpdate) {
        const { error } = await supabase.from('expenses').update(item).eq('id', item.id);
        if (error) throw error;
      }
    }

  } catch (error) {
    console.log('Supabase offline or error, saving expenses to local AsyncStorage:', error);
  }
};

export const getCreditCards = async (): Promise<CreditCard[]> => {
  try {
    const { data, error } = await supabase
      .from('cards')
      .select('*');

    if (error) throw error;

    // Fallback to DEFAULT_CARDS if Supabase is empty, but DO NOT write it to Supabase automatically
    const cardsData = (data && data.length > 0) ? data : DEFAULT_CARDS;

    // Fetch local user settings (priority order & visibility) from AsyncStorage
    let localCards: CreditCard[] = [];
    try {
      const localData = await AsyncStorage.getItem(CARDS_KEY);
      if (localData) {
        localCards = JSON.parse(localData);
      }
    } catch (e) {
      console.log('No local card settings found:', e);
    }

    const CHECKING_IDS = ['card-chase', 'card-santander', 'card-sofi', 'card-upgrade', 'card-citizens'];
    const mapped = cardsData.map(c => {
      const local = localCards.find(lc => lc.id === c.id);
      return {
        ...c,
        isChecking: CHECKING_IDS.includes(c.id) || c.id.startsWith('card-checking-'),
        isHidden: local ? !!local.isHidden : !!c.isHidden,
        priority: local && typeof local.priority === 'number'
          ? local.priority
          : (typeof c.priority === 'number' ? c.priority : 9999)
      };
    });

    return mapped.sort((a, b) => a.priority - b.priority);
  } catch (error) {
    console.log('Supabase offline or error, using local AsyncStorage for credit cards:', error);
    try {
      const data = await AsyncStorage.getItem(CARDS_KEY);
      if (!data) {
        return DEFAULT_CARDS;
      }
      const parsed: CreditCard[] = JSON.parse(data);
      const sorted = parsed.map((c, index) => ({
        ...c,
        isHidden: !!c.isHidden,
        priority: typeof c.priority === 'number' ? c.priority : index
      }));
      return sorted.sort((a, b) => a.priority - b.priority);
    } catch (e) {
      console.error('Error fetching credit cards from AsyncStorage:', e);
      return DEFAULT_CARDS;
    }
  }
};

export const saveCreditCards = async (cards: CreditCard[]): Promise<void> => {
  // 1. Save priority order and visibility locally in AsyncStorage
  try {
    const mapped = cards.map((c, index) => ({
      ...c,
      priority: index,
      isHidden: !!c.isHidden
    }));
    await AsyncStorage.setItem(CARDS_KEY, JSON.stringify(mapped));
  } catch (e) {
    console.error('Error saving credit cards settings to AsyncStorage:', e);
  }

  // 2. Write changes to Supabase cards table (only triggered by explicit user actions, never automatically on startup)
  try {
    // Fetch existing cards from Supabase to perform delta sync
    const { data: dbCards, error: getError } = await supabase.from('cards').select('*');
    if (getError) throw getError;

    const cardsToInsert = cards.map(({ isChecking, ...rest }, index) => ({
      ...rest,
      priority: index,
      isHidden: !!rest.isHidden
    }));

    const dbIds = new Set(dbCards.map(c => c.id));
    const clientIds = new Set(cards.map(c => c.id));

    // Delete cards in DB but not in Client
    const toDeleteIds = dbCards.filter(c => !clientIds.has(c.id)).map(c => c.id);
    if (toDeleteIds.length > 0) {
      const { error } = await supabase.from('cards').delete().in('id', toDeleteIds);
      if (error) throw error;
    }

    // Insert new cards
    const toInsert = cardsToInsert.filter(c => !dbIds.has(c.id));
    if (toInsert.length > 0) {
      const { error } = await supabase.from('cards').insert(toInsert);
      if (error) throw error;
    }

    // Update modified cards
    const toUpdate = cardsToInsert.filter(c => {
      const dbCard = dbCards.find(dc => dc.id === c.id);
      if (!dbCard) return false;
      return (
        dbCard.name !== c.name ||
        dbCard.priority !== c.priority ||
        !!dbCard.isHidden !== !!c.isHidden ||
        !!dbCard.isSaving !== !!c.isSaving ||
        !!dbCard.isBrokerage !== !!c.isBrokerage
      );
    });

    if (toUpdate.length > 0) {
      for (const item of toUpdate) {
        const { error } = await supabase.from('cards').update(item).eq('id', item.id);
        if (error) throw error;
      }
    }
  } catch (error) {
    console.log('Supabase offline or error, could not sync credit cards to cloud database:', error);
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
