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
  isInterest?: boolean; // interest marker for savings accounts
  category?: string; // transaction category (defaults to 'Others')
  username?: string; // foreign key referencing users.username
}

export interface CreditCard {
  id: string;
  name: string;
  isChecking?: boolean; // Optional flag to indicate checking account
  isSaving?: boolean; // Optional flag to indicate saving account
  isBrokerage?: boolean; // Optional flag to indicate brokerage account
  isHidden?: boolean; // Optional flag to hide/unhide cards in logs
  priority?: number; // Optional flag to save priority order of cards
  openDate?: string; // Date of account opening in YYYY-MM-DD format
  username?: string; // foreign key referencing users.username
  last4?: string; // Last 4 digits of card (e.g. '4242', defaults to '0000')
}

export interface FutureExpense {
  id: string;
  description: string;
  amount: number;
  dueDate?: string; // YYYY-MM-DD (optional)
  acc?: string; // Account ID (Checking/Saving account)
  username?: string; // foreign key referencing users.username
}

export interface User {
  username: string;
}

export type PerkCadence = 'monthly' | 'semi_annually' | 'annually' | 'anniversary';

export interface CardPerk {
  id: string;
  cardId: string; // references CreditCard.id
  name: string; // e.g. "Dunkin' Credit", "Dining Credit", "Airline Incidentals"
  amount: number; // total allowance per cycle e.g. 7.00
  cadence: PerkCadence;
  matchKeywords?: string; // comma-separated search terms e.g. "dunkin, dunkin donuts"
  manualRedeemedAmount?: number; // manual adjustment / already redeemed amount
  notes?: string;
  username?: string; // foreign key referencing users.username
}

