const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json());

// Helper to read database
function readDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      // Initialize if empty
      const initial = { categories: [], cards: [], expenses: [] };
      fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
      return initial;
    }
    const data = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(data);
    if (!parsed.futureExpenses) {
      parsed.futureExpenses = [];
    }
    return parsed;
  } catch (error) {
    console.error('Error reading db.json:', error);
    return { categories: [], cards: [], expenses: [], futureExpenses: [] };
  }
}

// Helper to write database
function writeDb(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error writing to db.json:', error);
  }
}

// REST API Routes

// Get all data
app.get('/api/data', (req, res) => {
  res.json(readDb());
});

// Save or Update Expense
app.post('/api/expenses', (req, res) => {
  const db = readDb();
  const newExpense = req.body;
  
  if (!newExpense.id) {
    return res.status(400).json({ error: 'Expense must have an id' });
  }

  const existingIdx = db.expenses.findIndex(e => e.id === newExpense.id);
  if (existingIdx !== -1) {
    // Update
    db.expenses[existingIdx] = newExpense;
  } else {
    // Add new
    db.expenses.unshift(newExpense);
  }
  
  writeDb(db);
  res.json({ success: true, expense: newExpense });
});

// Delete Expense
app.delete('/api/expenses/:id', (req, res) => {
  const db = readDb();
  const { id } = req.params;
  
  const initialLen = db.expenses.length;
  db.expenses = db.expenses.filter(e => e.id !== id);
  
  if (db.expenses.length === initialLen) {
    return res.status(404).json({ error: 'Expense not found' });
  }
  
  writeDb(db);
  res.json({ success: true });
});

// Save or Update Card
app.post('/api/cards', (req, res) => {
  const db = readDb();
  const newCard = req.body;
  
  if (!newCard.id) {
    return res.status(400).json({ error: 'Card must have an id' });
  }

  const existingIdx = db.cards.findIndex(c => c.id === newCard.id);
  if (existingIdx !== -1) {
    db.cards[existingIdx] = newCard;
  } else {
    db.cards.push(newCard);
  }
  
  writeDb(db);
  res.json({ success: true, card: newCard });
});

// Delete Card
app.delete('/api/cards/:id', (req, res) => {
  const db = readDb();
  const { id } = req.params;
  
  db.cards = db.cards.filter(c => c.id !== id);
  
  writeDb(db);
  res.json({ success: true });
});

// Save or Update Category
app.post('/api/categories', (req, res) => {
  const db = readDb();
  const newCategory = req.body;
  
  if (!newCategory.id) {
    return res.status(400).json({ error: 'Category must have an id' });
  }

  const existingIdx = db.categories.findIndex(cat => cat.id === newCategory.id);
  if (existingIdx !== -1) {
    db.categories[existingIdx] = newCategory;
  } else {
    db.categories.push(newCategory);
  }
  
  writeDb(db);
  res.json({ success: true, category: newCategory });
});

// Delete Category
app.delete('/api/categories/:id', (req, res) => {
  const db = readDb();
  const { id } = req.params;
  
  db.categories = db.categories.filter(cat => cat.id !== id);
  
  writeDb(db);
  res.json({ success: true });
});

// Bulk Sync Expense List
app.post('/api/expenses/sync', (req, res) => {
  const db = readDb();
  if (Array.isArray(req.body)) {
    db.expenses = req.body;
    writeDb(db);
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Body must be an array of expenses' });
  }
});

// Bulk Sync Card List
app.post('/api/cards/sync', (req, res) => {
  const db = readDb();
  if (Array.isArray(req.body)) {
    db.cards = req.body;
    writeDb(db);
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Body must be an array of cards' });
  }
});

// Bulk Sync Category List
app.post('/api/categories/sync', (req, res) => {
  const db = readDb();
  if (Array.isArray(req.body)) {
    db.categories = req.body;
    writeDb(db);
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Body must be an array of categories' });
  }
});

// Bulk Sync Future Expense List
app.post('/api/future-expenses/sync', (req, res) => {
  const db = readDb();
  if (Array.isArray(req.body)) {
    db.futureExpenses = req.body;
    writeDb(db);
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Body must be an array of future expenses' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`ExlExp API server running at http://localhost:${PORT}`);
});
