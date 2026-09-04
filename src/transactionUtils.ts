import { Expense, CreditCard } from './types';

export interface UnifiedTransaction {
  id: string; // unique key for rendering
  primaryExpense: Expense; // expense reference for edit / delete
  linkedExpense?: Expense; // the other leg if transfer
  date: string; // YYYY-MM-DD
  isTransfer: boolean;
  senderAccountName?: string;
  senderAccountIcon?: string;
  receiverAccountName?: string;
  receiverAccountIcon?: string;
  accountName: string;
  accountIcon: string;
  displayAccount: string; // e.g. "🏛️ Chase Checking" or "🏛️ Chase Checking → 💳 Amex Gold"
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
 * Consolidates expenses so that transfers with two legs (withdrawal + deposit/payment)
 * appear as a single transaction: "Sender → Receiver"
 */
export function consolidateTransactions(
  expenses: Expense[],
  cards: CreditCard[]
): UnifiedTransaction[] {
  const cardMap = new Map<string, CreditCard>();
  cards.forEach(c => cardMap.set(c.id, c));

  // Sort expenses by date descending, with id tie-breaker
  const sorted = [...expenses].sort((a, b) => {
    const d = (b.date || '').localeCompare(a.date || '');
    if (d !== 0) return d;
    return (b.id || '').localeCompare(a.id || '');
  });

  const processedIds = new Set<string>();
  const result: UnifiedTransaction[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    if (processedIds.has(item.id)) continue;

    const isTransfer = Boolean(item.isTransfer || item.category === 'Transfer' || item.transferLinkId);

    if (isTransfer) {
      // Find paired leg if any
      let pair: Expense | undefined;

      if (item.transferLinkId) {
        pair = sorted.find(
          other => other.id !== item.id && other.transferLinkId === item.transferLinkId
        );
      } else {
        pair = sorted.find(other => {
          if (other.id === item.id || processedIds.has(other.id)) return false;
          if (!other.isTransfer && other.category !== 'Transfer') return false;
          if (other.date !== item.date) return false;
          if (Math.abs(other.amount) !== Math.abs(item.amount)) return false;

          const itemDesc = (item.description || '').toLowerCase();
          const otherDesc = (other.description || '').toLowerCase();
          if (
            (itemDesc.startsWith('transfer to') && otherDesc.startsWith('transfer from')) ||
            (itemDesc.startsWith('transfer from') && otherDesc.startsWith('transfer to'))
          ) {
            return true;
          }
          return false;
        });
      }

      processedIds.add(item.id);
      if (pair) processedIds.add(pair.id);

      // Determine sender (source) vs receiver (target)
      let senderExpense = item;
      let receiverExpense = pair;

      const itemDesc = (item.description || '').toLowerCase();
      const pairDesc = pair ? (pair.description || '').toLowerCase() : '';

      if (itemDesc.startsWith('transfer to')) {
        senderExpense = item;
        receiverExpense = pair;
      } else if (itemDesc.startsWith('transfer from')) {
        if (pair) {
          senderExpense = pair;
          receiverExpense = item;
        } else {
          senderExpense = item;
          receiverExpense = undefined;
        }
      } else if (pair && pairDesc.startsWith('transfer to')) {
        senderExpense = pair;
        receiverExpense = item;
      } else if (pair && pairDesc.startsWith('transfer from')) {
        senderExpense = item;
        receiverExpense = pair;
      } else {
        // Fallback based on card types & amount sign
        const itemCard = cardMap.get(item.creditCardId);
        const pairCard = pair ? cardMap.get(pair.creditCardId) : undefined;
        const itemIsDeposit = itemCard?.isChecking || itemCard?.isSaving || itemCard?.isBrokerage;
        const pairIsDeposit = pairCard?.isChecking || pairCard?.isSaving || pairCard?.isBrokerage;

        if (itemIsDeposit && !pairIsDeposit) {
          senderExpense = item;
          receiverExpense = pair;
        } else if (!itemIsDeposit && pairIsDeposit && pair) {
          senderExpense = pair;
          receiverExpense = item;
        } else if (item.amount < 0) {
          senderExpense = item;
          receiverExpense = pair;
        } else if (pair && pair.amount < 0) {
          senderExpense = pair;
          receiverExpense = item;
        }
      }

      let senderCard = cardMap.get(senderExpense.creditCardId);
      let receiverCard = receiverExpense ? cardMap.get(receiverExpense.creditCardId) : undefined;

      let senderName = senderCard?.name;
      if (!senderName) {
        if (senderExpense.description?.startsWith('Transfer from ')) {
          senderName = senderExpense.fromTo || 'Account';
        } else {
          senderName = 'Account';
        }
      }

      let receiverName = receiverCard?.name;
      if (!receiverName) {
        if (senderExpense.description?.startsWith('Transfer to ')) {
          receiverName = senderExpense.fromTo || 'Account';
        } else if (receiverExpense?.fromTo) {
          receiverName = receiverExpense.fromTo;
        } else {
          receiverName = 'Account';
        }
      }

      const senderIcon = getAccountIcon(senderCard);
      const receiverIcon = getAccountIcon(receiverCard);

      const absAmount = Math.abs(senderExpense.amount || receiverExpense?.amount || 0);
      const formattedAmount = `$${absAmount.toFixed(2)}`;

      let desc = (senderExpense.details && senderExpense.details.trim()) ||
                 (receiverExpense?.details && receiverExpense.details.trim()) ||
                 '';
      if (!desc) {
        desc = 'Account Transfer';
      }

      result.push({
        id: senderExpense.id,
        primaryExpense: senderExpense,
        linkedExpense: receiverExpense,
        date: senderExpense.date || receiverExpense?.date || '',
        isTransfer: true,
        senderAccountName: senderName,
        senderAccountIcon: senderIcon,
        receiverAccountName: receiverName,
        receiverAccountIcon: receiverIcon,
        accountName: `${senderName} → ${receiverName}`,
        accountIcon: '🔄',
        displayAccount: `${senderIcon} ${senderName} → ${receiverIcon} ${receiverName}`,
        description: desc,
        amount: absAmount,
        formattedAmount,
        amountColor: '#334155', // neutral dark slate
      });
    } else {
      // Standard transaction
      processedIds.add(item.id);
      const card = cardMap.get(item.creditCardId);
      const isDepositAcc = Boolean(card?.isChecking || card?.isSaving || card?.isBrokerage);
      const icon = getAccountIcon(card);
      const name = card?.name || 'Unknown';

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
        if (item.amount < 0) {
          formattedAmount = `-$${Math.abs(item.amount).toFixed(2)}`;
          amountColor = '#16a34a'; // Card payment / credit
        } else {
          formattedAmount = `$${Number(item.amount).toFixed(2)}`;
          amountColor = '#0f172a'; // Card charge
        }
      }

      const desc = item.description || item.fromTo || item.details || 'Transaction';

      result.push({
        id: item.id,
        primaryExpense: item,
        date: item.date || '',
        isTransfer: false,
        accountName: name,
        accountIcon: icon,
        displayAccount: `${icon} ${name}`,
        description: desc,
        amount: item.amount,
        formattedAmount,
        amountColor,
      });
    }
  }

  return result;
}
