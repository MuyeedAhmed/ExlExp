import AsyncStorage from '@react-native-async-storage/async-storage';
import { Expense, CreditCard, FutureExpense } from './types';
import { supabase } from './supabaseClient';

const EXPENSES_KEY = '@ExlExp:expenses';
const CARDS_KEY = '@ExlExp:credit_cards';
const FUTURE_EXPENSES_KEY = '@ExlExp:future_expenses';



export const getExpenses = async (username: string): Promise<Expense[]> => {
  try {
    let allExpenses: any[] = [];
    let from = 0;
    const limit = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('username', username)
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
      const data = await AsyncStorage.getItem(`@ExlExp:${username}:expenses`);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error fetching expenses from AsyncStorage:', e);
      return [];
    }
  }
};

export const saveExpenses = async (expenses: Expense[], username: string): Promise<void> => {
  // 1. Fetch previous expenses from local AsyncStorage to compute delta
  let oldExpenses: Expense[] = [];
  try {
    const data = await AsyncStorage.getItem(`@ExlExp:${username}:expenses`);
    oldExpenses = data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Error fetching old expenses from AsyncStorage:', e);
  }

  // 2. Save new list to local AsyncStorage
  try {
    await AsyncStorage.setItem(`@ExlExp:${username}:expenses`, JSON.stringify(expenses));
  } catch (e) {
    console.error('Error saving expenses to AsyncStorage:', e);
  }

  // 3. Perform targeted CRUD delta sync to Supabase (avoid downloading the DB!)
  try {
    // Map expenses to database format
    const mapExpense = (e: Expense) => {
      const { fromTo, details, ...rest } = e;
      let desc = e.description;
      if (fromTo || details) {
        desc = `${fromTo || ''} // ${details || ''}`;
      }
      return {
        ...rest,
        description: desc,
        category: e.isTransfer ? 'Transfer' : (e.category || 'Others'),
        username: username
      };
    };

    const newExpensesMapped = expenses.map(mapExpense);
    const oldExpensesMapped = oldExpenses.map(mapExpense);

    const newIds = new Set(expenses.map(e => e.id));
    const oldIds = new Set(oldExpenses.map(e => e.id));

    // Deletes: Present in old but missing in new
    const toDeleteIds = oldExpenses.filter(e => !newIds.has(e.id)).map(e => e.id);

    // Upserts (Inserts/Updates): Present in new, but either absent from old or changed
    const toUpsert = newExpensesMapped.filter(e => {
      const oldItem = oldExpensesMapped.find(o => o.id === e.id);
      if (!oldItem) return true; // New transaction (Insert)
      // Check if any fields changed (Update)
      return (
        oldItem.description !== e.description ||
        oldItem.amount !== e.amount ||
        oldItem.date !== e.date ||
        oldItem.creditCardId !== e.creditCardId ||
        !!oldItem.isFee !== !!e.isFee ||
        !!oldItem.isReward !== !!e.isReward ||
        !!oldItem.isTransfer !== !!e.isTransfer ||
        oldItem.transferLinkId !== e.transferLinkId ||
        oldItem.category !== e.category ||
        !!oldItem.isInterest !== !!e.isInterest
      );
    });

    // Execute deletes in chunks of 100
    if (toDeleteIds.length > 0) {
      for (let i = 0; i < toDeleteIds.length; i += 100) {
        const chunk = toDeleteIds.slice(i, i + 100);
        const { error } = await supabase
          .from('expenses')
          .delete()
          .eq('username', username)
          .in('id', chunk);
        if (error) throw error;
      }
    }

    // Execute upserts in chunks of 100
    if (toUpsert.length > 0) {
      for (let i = 0; i < toUpsert.length; i += 100) {
        const chunk = toUpsert.slice(i, i + 100);
        const { error } = await supabase
          .from('expenses')
          .upsert(chunk);
        if (error) throw error;
      }
    }
  } catch (error) {
    console.log('Supabase offline or error, could not sync expenses delta to cloud database:', error);
  }
};

export const getCreditCards = async (username: string): Promise<CreditCard[]> => {
  try {
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .eq('username', username);

    if (error) throw error;

    // Return empty if user has no cards configured yet
    const cardsData = (data && data.length > 0) ? data : [];

    // Fetch local user settings (priority order & visibility & openDate) from AsyncStorage
    let localCards: CreditCard[] = [];
    try {
      const localData = await AsyncStorage.getItem(`@ExlExp:${username}:credit_cards`);
      if (localData) {
        localCards = JSON.parse(localData);
      }
    } catch (e) {
      console.log('No local card settings found:', e);
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const CHECKING_IDS = ['card-chase', 'card-santander', 'card-sofi', 'card-upgrade', 'card-citizens'];
    const mapped = cardsData.map(c => {
      const local = localCards.find(lc => lc.id === c.id);
      return {
        ...c,
        isChecking: CHECKING_IDS.some(p => c.id.includes(p)) || c.id.includes('checking') || !!c.isChecking,
        isSaving: !!c.isSaving,
        isBrokerage: !!c.isBrokerage,
        isHidden: local ? !!local.isHidden : !!c.isHidden,
        openDate: c.openDate || c.opendate || c.open_date || (local && local.openDate) || todayStr,
        priority: local && typeof local.priority === 'number'
          ? local.priority
          : (typeof c.priority === 'number' ? c.priority : 9999)
      };
    });

    return mapped.sort((a, b) => a.priority - b.priority);
  } catch (error) {
    console.log('Supabase offline or error, using local AsyncStorage for credit cards:', error);
    try {
      const data = await AsyncStorage.getItem(`@ExlExp:${username}:credit_cards`);
      if (!data) {
        return [];
      }
      const todayStr = new Date().toISOString().split('T')[0];
      const parsed: CreditCard[] = JSON.parse(data);
      const sorted = parsed.map((c, index) => ({
        ...c,
        isHidden: !!c.isHidden,
        openDate: c.openDate || todayStr,
        priority: typeof c.priority === 'number' ? c.priority : index
      }));
      return sorted.sort((a, b) => a.priority - b.priority);
    } catch (e) {
      console.error('Error fetching credit cards from AsyncStorage:', e);
      return [];
    }
  }
};

export const saveCreditCards = async (cards: CreditCard[], username: string): Promise<void> => {
  const todayStr = new Date().toISOString().split('T')[0];
  // 1. Save priority order, visibility, and openDate locally in AsyncStorage
  try {
    const mapped = cards.map((c, index) => ({
      ...c,
      priority: index,
      isHidden: !!c.isHidden,
      openDate: c.openDate || todayStr,
    }));
    await AsyncStorage.setItem(`@ExlExp:${username}:credit_cards`, JSON.stringify(mapped));
  } catch (e) {
    console.error('Error saving credit cards settings to AsyncStorage:', e);
  }

  // 2. Write changes to Supabase cards table
  try {
    // Fetch existing cards from Supabase to perform delta sync
    const { data: dbCards, error: getError } = await supabase
      .from('cards')
      .select('*')
      .eq('username', username);
    if (getError) throw getError;

    const cardsToInsert = cards.map(({ isChecking, ...rest }, index) => ({
      ...rest,
      priority: index,
      isHidden: !!rest.isHidden,
      openDate: rest.openDate || todayStr,
      username: username
    }));

    const dbIds = new Set(dbCards.map(c => c.id));
    const clientIds = new Set(cards.map(c => c.id));

    // Delete cards in DB but not in Client
    const toDeleteIds = dbCards.filter(c => !clientIds.has(c.id)).map(c => c.id);
    if (toDeleteIds.length > 0) {
      const { error } = await supabase.from('cards').delete().eq('username', username).in('id', toDeleteIds);
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
      const dbOpenDate = dbCard.openDate || dbCard.opendate || dbCard.open_date;
      return (
        dbCard.name !== c.name ||
        dbCard.priority !== c.priority ||
        !!dbCard.isHidden !== !!c.isHidden ||
        !!dbCard.isSaving !== !!c.isSaving ||
        !!dbCard.isBrokerage !== !!c.isBrokerage ||
        dbOpenDate !== c.openDate
      );
    });

    if (toUpdate.length > 0) {
      for (const item of toUpdate) {
        const dbCard = dbCards.find(dc => dc.id === item.id);
        const updatePayload: any = {
          name: item.name,
          priority: item.priority,
          isHidden: item.isHidden,
          isSaving: item.isSaving,
          isBrokerage: item.isBrokerage,
          username: username,
        };

        if (dbCard && 'opendate' in dbCard) {
          updatePayload.opendate = item.openDate;
        } else if (dbCard && 'open_date' in dbCard) {
          updatePayload.open_date = item.openDate;
        } else {
          updatePayload.openDate = item.openDate;
        }

        const { error } = await supabase.from('cards').update(updatePayload).eq('username', username).eq('id', item.id);
        if (error) {
          console.warn('Update card error:', error);
          // Fallback update without specific openDate if column differs
          await supabase.from('cards').update({
            name: item.name,
            priority: item.priority,
            isHidden: item.isHidden,
            isSaving: item.isSaving,
            isBrokerage: item.isBrokerage,
          }).eq('username', username).eq('id', item.id);
        }
      }
    }
  } catch (error) {
    console.log('Supabase offline or error, could not sync credit cards to cloud database:', error);
  }
};

export const getFutureExpenses = async (username: string): Promise<FutureExpense[]> => {
  try {
    const { data, error } = await supabase
      .from('future_expenses')
      .select('*')
      .eq('username', username);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.log('Supabase offline or error, using local AsyncStorage for future expenses:', error);
    try {
      const data = await AsyncStorage.getItem(`@ExlExp:${username}:future_expenses`);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error fetching future expenses from AsyncStorage:', e);
      return [];
    }
  }
};

export const saveFutureExpenses = async (futureExpenses: FutureExpense[], username: string): Promise<void> => {
  try {
    const { error: delError } = await supabase
      .from('future_expenses')
      .delete()
      .eq('username', username)
      .neq('id', '');
    if (delError) throw delError;

    if (futureExpenses.length > 0) {
      const mapped = futureExpenses.map(f => ({ ...f, username }));
      const { error: insError } = await supabase.from('future_expenses').insert(mapped);
      if (insError) throw insError;
    }
  } catch (error) {
    console.log('Supabase offline or error, saving future expenses to local AsyncStorage:', error);
    try {
      await AsyncStorage.setItem(`@ExlExp:${username}:future_expenses`, JSON.stringify(futureExpenses));
    } catch (e) {
      console.error('Error saving future expenses to AsyncStorage:', e);
    }
  }
};

export const updatePassword = async (
  username: string,
  currentPass: string,
  newPass: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const trimmedUsername = username.trim().toLowerCase();
    const { data: user, error: fetchErr } = await supabase
      .from('users')
      .select('*')
      .eq('username', trimmedUsername)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!user || user.password !== currentPass) {
      return { success: false, error: 'Incorrect current password.' };
    }

    const { error: updateErr } = await supabase
      .from('users')
      .update({ password: newPass })
      .eq('username', trimmedUsername);

    if (updateErr) throw updateErr;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update password.' };
  }
};

export const updateUsername = async (
  oldUsername: string,
  newUsername: string,
  currentPass: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const trimmedOld = oldUsername.trim().toLowerCase();
    const trimmedNew = newUsername.trim().toLowerCase();

    if (!trimmedNew) {
      return { success: false, error: 'New username cannot be empty.' };
    }
    if (trimmedOld === trimmedNew) {
      return { success: false, error: 'New username must be different from current username.' };
    }

    // 1. Verify current password
    const { data: user, error: fetchErr } = await supabase
      .from('users')
      .select('*')
      .eq('username', trimmedOld)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!user || user.password !== currentPass) {
      return { success: false, error: 'Incorrect current password.' };
    }

    // 2. Check if new username is already taken
    const { data: existing, error: checkErr } = await supabase
      .from('users')
      .select('username')
      .eq('username', trimmedNew)
      .maybeSingle();

    if (checkErr) throw checkErr;
    if (existing) {
      return { success: false, error: 'Username is already taken.' };
    }

    // 3. Create new user entry with new username and same password
    const { error: insertErr } = await supabase
      .from('users')
      .insert([{ username: trimmedNew, password: currentPass }]);

    if (insertErr) throw insertErr;

    // 4. Update expenses, credit_cards, future_expenses to new username
    await Promise.all([
      supabase.from('expenses').update({ username: trimmedNew }).eq('username', trimmedOld),
      supabase.from('credit_cards').update({ username: trimmedNew }).eq('username', trimmedOld),
      supabase.from('future_expenses').update({ username: trimmedNew }).eq('username', trimmedOld),
    ]);

    // 5. Delete old user entry
    await supabase.from('users').delete().eq('username', trimmedOld);

    // 6. Migrate AsyncStorage local cache
    try {
      const [exp, cards, future] = await Promise.all([
        AsyncStorage.getItem(`@ExlExp:${trimmedOld}:expenses`),
        AsyncStorage.getItem(`@ExlExp:${trimmedOld}:credit_cards`),
        AsyncStorage.getItem(`@ExlExp:${trimmedOld}:future_expenses`),
      ]);
      if (exp) await AsyncStorage.setItem(`@ExlExp:${trimmedNew}:expenses`, exp);
      if (cards) await AsyncStorage.setItem(`@ExlExp:${trimmedNew}:credit_cards`, cards);
      if (future) await AsyncStorage.setItem(`@ExlExp:${trimmedNew}:future_expenses`, future);
      await AsyncStorage.setItem('@ExlExp:currentUser', trimmedNew);
    } catch (e) {
      console.warn('AsyncStorage migration error:', e);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update username.' };
  }
};


