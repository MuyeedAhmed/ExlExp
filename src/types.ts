export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  creditCardId: string; // references CreditCard.id
  date: string; // format YYYY-MM-DD
}

export interface CreditCard {
  id: string;
  name: string;
  lastFour?: string; // Optional last 4 digits
}

export interface Category {
  id: string;
  name: string;
  icon?: string; // Optional icon name from expo vector icons
}

export interface FutureExpense {
  id: string;
  description: string;
  amount: number;
  dueDate?: string; // YYYY-MM-DD (optional)
}
