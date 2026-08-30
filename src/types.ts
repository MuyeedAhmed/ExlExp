export interface Expense {
  id: string;
  description: string;
  amount: number;
  creditCardId: string; // references CreditCard.id
  date: string; // format YYYY-MM-DD
  fromTo?: string; // From/To for checking/saving accounts
  details?: string; // Details for checking/saving accounts
  isFee?: boolean; // annual fee marker for CC
  isReward?: boolean; // reward marker for CC
  rewardType?: 'cashback' | 'other'; // cashback statement credit vs other (miles/points)
  rewardValue?: number; // cashback dollars or miles/points value
  isTransfer?: boolean; // transfer marker
  transferLinkId?: string; // linked transfer transaction ID
}

export interface CreditCard {
  id: string;
  name: string;
  lastFour?: string; // Optional last 4 digits
  isChecking?: boolean; // Optional flag to indicate checking account
  isSaving?: boolean; // Optional flag to indicate saving account
}

export interface FutureExpense {
  id: string;
  description: string;
  amount: number;
  dueDate?: string; // YYYY-MM-DD (optional)
}
