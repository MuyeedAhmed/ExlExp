export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  creditCardId: string; // references CreditCard.id
  date: string; // format YYYY-MM-DD
  fromTo?: string; // From/To for checking accounts
  details?: string; // Details for checking accounts
}

export interface CreditCard {
  id: string;
  name: string;
  lastFour?: string; // Optional last 4 digits
  isChecking?: boolean; // Optional flag to indicate checking account
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
