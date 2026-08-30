const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://vpwkzljngftfuyatqjzi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DsezTQetaxTLqNLqrvl4sQ_c8nTnTmC';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const DB_PATH = path.join(__dirname, 'db.json');

async function runMigration() {
  console.log('Reading db.json...');
  if (!fs.existsSync(DB_PATH)) {
    console.error('db.json not found in the workspace root.');
    return;
  }

  const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

  try {
    // 1. Migrate Cards
    if (data.cards && data.cards.length > 0) {
      console.log(`Migrating ${data.cards.length} cards...`);
      // Delete any existing first to avoid duplicate primary keys
      await supabase.from('cards').delete().neq('id', '');
      const cardsToInsert = data.cards.map(({ isChecking, ...rest }) => rest);
      const { error: err } = await supabase.from('cards').insert(cardsToInsert);
      if (err) throw err;
      console.log('Cards migrated successfully.');
    }

    // 2. Migrate Categories
    if (data.categories && data.categories.length > 0) {
      console.log(`Migrating ${data.categories.length} categories...`);
      await supabase.from('categories').delete().neq('id', '');
      const { error: err } = await supabase.from('categories').insert(data.categories);
      if (err) throw err;
      console.log('Categories migrated successfully.');
    }

    // 3. Migrate Expenses (Transactions)
    if (data.expenses && data.expenses.length > 0) {
      console.log(`Migrating ${data.expenses.length} transactions...`);
      await supabase.from('expenses').delete().neq('id', '');
      const expensesToInsert = data.expenses.map(e => {
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
      const { error: err } = await supabase.from('expenses').insert(expensesToInsert);
      if (err) throw err;
      console.log('Transactions migrated successfully.');
    }

    // 4. Migrate Future Expenses (Scheduled Bills)
    const futureExpenses = data.futureExpenses || [];
    if (futureExpenses.length > 0) {
      console.log(`Migrating ${futureExpenses.length} upcoming bills...`);
      await supabase.from('future_expenses').delete().neq('id', '');
      const { error: err } = await supabase.from('future_expenses').insert(futureExpenses);
      if (err) throw err;
      console.log('Upcoming bills migrated successfully.');
    }

    console.log('--- Migration Completed Successfully! ---');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

runMigration();
