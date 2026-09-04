import { Expense, CreditCard } from './types';

export interface DisplayTransaction {
  id: string;
  originalExpense: Expense;
  primaryExpense: Expense;
  date: string;
  isTransfer: boolean;
  accountName: string;
  accountIcon: string;
  displayAccount: string;
  description: string;
  amount: number;
  formattedAmount: string;
  amountColor: string;
}

export const getAccountIcon = (card?: CreditCard): string => {
  if (!card) return '💳';
  if (card.isSaving) return '💰';
  if (card.isBrokerage) return '📈';
  if (card.isChecking) return '🏛️';
  return '💳';
};

/**
 * Checks if a transaction is an incoming transfer.
 * For transfers, we only show outgoing money (e.g. checking account paying a bill).
 * Incoming transfer legs (e.g. the credit card that got paid or deposit received) are excluded.
 */
export const isIncomingTransfer = (item: Expense): boolean => {
  const isTransfer = Boolean(item.isTransfer || item.category === 'Transfer');
  if (!isTransfer) return false;

  const desc = (item.description || '').toLowerCase();
  if (desc.startsWith('transfer from')) {
    return true;
  }
  // On checking/savings/brokerage, a positive transfer amount is money received (incoming)
  if (item.amount > 0) {
    return true;
  }

  return false;
};

export const formatDisplayTransaction = (
  item: Expense,
  cardMap: Map<string, CreditCard>
): DisplayTransaction => {
  const card = cardMap.get(item.creditCardId);
  const isDepositAcc = Boolean(card?.isChecking || card?.isSaving || card?.isBrokerage);
  const icon = getAccountIcon(card);
  const name = card?.name || 'Unknown';
  const isTransfer = Boolean(item.isTransfer || item.category === 'Transfer');

  let formattedAmount = '';
  let amountColor = '#0f172a';

  if (isDepositAcc) {
    if (item.amount >= 0) {
      formattedAmount = `+$${Math.abs(item.amount).toFixed(2)}`;
      amountColor = '#16a34a';
    } else {
      formattedAmount = `-$${Math.abs(item.amount).toFixed(2)}`;
      amountColor = '#dc2626';
    }
  } else {
    // Credit card
    if (item.amount < 0) {
      formattedAmount = `-$${Math.abs(item.amount).toFixed(2)}`;
      amountColor = '#16a34a'; // Payment / credit
    } else {
      formattedAmount = `$${Number(item.amount).toFixed(2)}`;
      amountColor = '#0f172a'; // Charge
    }
  }

  // Description: prefer details if present (e.g. "Credit Card Bill Pay - Discover CC"), else description
  const desc = item.details?.trim() || item.description?.trim() || item.fromTo?.trim() || 'Transaction';

  return {
    id: item.id,
    originalExpense: item,
    primaryExpense: item,
    date: item.date || '',
    isTransfer,
    accountName: name,
    accountIcon: icon,
    displayAccount: `${icon} ${name}`,
    description: desc,
    amount: item.amount,
    formattedAmount,
    amountColor,
  };
};

function isNewer(a: Expense, b: Expense): boolean {
  const aDate = a.date || '';
  const bDate = b.date || '';
  if (aDate !== bDate) return aDate > bDate;
  return (a.id || '') > (b.id || '');
}

/**
 * Returns displayable transactions, filtering out incoming transfer legs.
 * For transfers, shows only the outgoing money.
 * For all other transactions, shows both +/- as normal.
 * If limit is provided, uses fast top-K selection in a single pass without sorting the entire dataset.
 */
export function getDisplayableTransactions(
  expenses: Expense[],
  cards: CreditCard[],
  limit?: number
): DisplayTransaction[] {
  const cardMap = new Map<string, CreditCard>();
  cards.forEach(c => cardMap.set(c.id, c));

  // If a small limit is requested (e.g. 10 recent transactions on Dashboard),
  // use top-K insertion to avoid sorting the entire expenses array.
  if (limit && limit > 0) {
    const top: Expense[] = [];
    for (let i = 0; i < expenses.length; i++) {
      const item = expenses[i];
      if (isIncomingTransfer(item)) continue; // Drop incoming transfer

      if (top.length < limit) {
        let idx = top.length;
        while (idx > 0 && isNewer(item, top[idx - 1])) {
          idx--;
        }
        top.splice(idx, 0, item);
      } else if (isNewer(item, top[top.length - 1])) {
        top.pop();
        let idx = top.length;
        while (idx > 0 && isNewer(item, top[idx - 1])) {
          idx--;
        }
        top.splice(idx, 0, item);
      }
    }
    return top.map(item => formatDisplayTransaction(item, cardMap));
  }

  // Fast primitive string sort (avoids slow Intl localeCompare)
  const sorted = [...expenses].sort((a, b) => {
    const bDate = b.date || '';
    const aDate = a.date || '';
    if (bDate > aDate) return 1;
    if (bDate < aDate) return -1;
    const bId = b.id || '';
    const aId = a.id || '';
    return bId > aId ? 1 : (bId < aId ? -1 : 0);
  });

  const result: DisplayTransaction[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    if (isIncomingTransfer(item)) continue; // Drop incoming transfer
    result.push(formatDisplayTransaction(item, cardMap));
  }

  return result;
}

// Alias for backwards compatibility
export const consolidateTransactions = getDisplayableTransactions;
export type UnifiedTransaction = DisplayTransaction;
