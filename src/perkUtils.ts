import { CardPerk, CreditCard, Expense, PerkCadence } from './types';

export interface PerkPeriod {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (expiration / due date)
  daysRemaining: number;
  periodLabel: string;
  cadenceLabel: string;
}

export interface PerkUsageResult {
  perk: CardPerk;
  period: PerkPeriod;
  matchingExpenses: Expense[];
  autoMatchedAmount: number;
  manualRedeemedAmount: number;
  usedAmount: number;
  remainingAmount: number;
  percentUsed: number;
  isFilled: boolean;
  isExpiringSoon: boolean; // true if !isFilled && daysRemaining <= 5
}

/**
 * Returns the effective dollar value of an expense towards a statement credit or perk.
 * Handles standard spends (>0), statement credits / refunds (<0), and rewards (isReward with rewardValue).
 */
export const getExpenseValueForPerk = (e: Expense): number => {
  if (e.isReward) {
    const rVal = Number(e.rewardValue);
    if (rVal && rVal > 0) return rVal;
    const aVal = Math.abs(Number(e.amount) || 0);
    if (aVal > 0) return aVal;
    return 0;
  }
  if (Number(e.amount) < 0) {
    return Math.abs(Number(e.amount));
  }
  return Number(e.amount) || 0;
};

export const CADENCE_LABELS: Record<PerkCadence, string> = {
  monthly: 'Monthly',
  semi_annually: '6 Months',
  annually: 'Yearly (Calendar)',
  anniversary: 'Card Anniversary',
};

const pad = (n: number) => String(n).padStart(2, '0');

export const formatDateStr = (d: Date): string => {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const formatShortDate = (d: Date): string => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
};

/**
 * Calculates the active cycle/period for a given perk cadence.
 */
export const getPerkPeriod = (
  cadence: PerkCadence,
  card?: CreditCard,
  refDate: Date = new Date()
): PerkPeriod => {
  const now = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
  const year = now.getFullYear();
  const month = now.getMonth();

  let start: Date;
  let end: Date;

  switch (cadence) {
    case 'monthly': {
      start = new Date(year, month, 1);
      end = new Date(year, month + 1, 0); // Last day of current month
      break;
    }
    case 'semi_annually': {
      if (month < 6) {
        start = new Date(year, 0, 1); // Jan 1
        end = new Date(year, 5, 30); // Jun 30
      } else {
        start = new Date(year, 6, 1); // Jul 1
        end = new Date(year, 11, 31); // Dec 31
      }
      break;
    }
    case 'annually': {
      start = new Date(year, 0, 1); // Jan 1
      end = new Date(year, 11, 31); // Dec 31
      break;
    }
    case 'anniversary': {
      let openY = year;
      let openM = 0;
      let openD = 1;

      if (card?.openDate && /^\d{4}-\d{2}-\d{2}$/.test(card.openDate)) {
        const parts = card.openDate.split('-').map(Number);
        openY = parts[0];
        openM = parts[1] - 1;
        openD = parts[2];
      }

      const anniversaryThisYear = new Date(year, openM, openD);
      if (now.getTime() < anniversaryThisYear.getTime()) {
        start = new Date(year - 1, openM, openD);
        end = new Date(year, openM, openD - 1);
      } else {
        start = new Date(year, openM, openD);
        end = new Date(year + 1, openM, openD - 1);
      }
      break;
    }
    default: {
      start = new Date(year, month, 1);
      end = new Date(year, month + 1, 0);
    }
  }

  const startDate = formatDateStr(start);
  const endDate = formatDateStr(end);

  const diffMs = end.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  const periodLabel = `${formatShortDate(start)} - ${formatShortDate(end)}, ${end.getFullYear()}`;

  return {
    startDate,
    endDate,
    daysRemaining,
    periodLabel,
    cadenceLabel: CADENCE_LABELS[cadence] || 'Monthly',
  };
};

/**
 * Extracts searchable keywords from perk's matchKeywords or name.
 */
export const extractKeywords = (perk: CardPerk): string[] => {
  if (perk.matchKeywords && perk.matchKeywords.trim().length > 0) {
    return perk.matchKeywords
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 0);
  }

  // Fallback: extract terms from perk name
  const cleaned = perk.name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(credit|benefit|rewards?|card|fee|allowance|monthly|annual|yearly)\b/g, '')
    .trim();

  const words = cleaned.split(/\s+/).filter(w => w.length >= 3);
  return words.length > 0 ? words : [perk.name.toLowerCase().trim()];
};

/**
 * Computes perk usage by matching expenses within the current period.
 */
export const calculatePerkUsage = (
  perk: CardPerk,
  card: CreditCard | undefined,
  expenses: Expense[],
  refDate: Date = new Date()
): PerkUsageResult => {
  const period = getPerkPeriod(perk.cadence, card, refDate);
  const keywords = extractKeywords(perk);

  const matchingExpenses = expenses.filter(e => {
    // 1. Must belong to this credit card (matches by card ID or card Name)
    const matchesCard =
      e.creditCardId === perk.cardId ||
      (card && (
        e.creditCardId === card.id ||
        (e.creditCardId && card.name && e.creditCardId.toLowerCase() === card.name.toLowerCase()) ||
        (e.creditCardId && card.id && e.creditCardId.trim() === card.id.trim())
      ));
    if (!matchesCard) return false;

    // 2. Must not be a fee or transfer
    if (e.isFee || e.isTransfer) return false;

    // 3. Must have positive effective perk value (handles spend >0, credit <0, or isReward with rewardValue)
    const txVal = getExpenseValueForPerk(e);
    if (txVal <= 0) return false;

    // 4. Must be within the current cycle/period
    const eDate = (e.date || '').slice(0, 10);
    if (eDate < period.startDate || eDate > period.endDate) return false;

    // 5. Keyword match against description, details, or fromTo
    const desc = (e.description || '').toLowerCase();
    const details = (e.details || '').toLowerCase();
    const fromTo = (e.fromTo || '').toLowerCase();

    return keywords.some(kw => desc.includes(kw) || details.includes(kw) || fromTo.includes(kw));
  });

  // Sort matching expenses newest first
  matchingExpenses.sort((a, b) => b.date.localeCompare(a.date));

  const autoMatchedAmount = matchingExpenses.reduce((sum, e) => sum + getExpenseValueForPerk(e), 0);
  const manualRedeemedAmount = Number(perk.manualRedeemedAmount) || 0;
  const usedAmount = autoMatchedAmount + manualRedeemedAmount;
  const remainingAmount = Math.max(0, perk.amount - usedAmount);
  const percentUsed = perk.amount > 0 ? Math.min(100, Math.round((usedAmount / perk.amount) * 100)) : 100;
  const isFilled = usedAmount >= perk.amount;
  const isExpiringSoon = !isFilled && period.daysRemaining <= 5 && period.daysRemaining >= 0;

  return {
    perk,
    period,
    matchingExpenses,
    autoMatchedAmount,
    manualRedeemedAmount,
    usedAmount,
    remainingAmount,
    percentUsed,
    isFilled,
    isExpiringSoon,
  };
};

export interface PerkPresetTemplate {
  name: string;
  amount: number;
  cadence: PerkCadence;
  keywords: string;
  notes?: string;
}

export const POPULAR_PERK_PRESETS: PerkPresetTemplate[] = [
  {
    name: "Dunkin' Credit",
    amount: 7.0,
    cadence: 'monthly',
    keywords: 'dunkin',
    notes: 'AmEx Gold monthly Dunkin credit ($7/month)',
  },
  {
    name: 'Dining Credit',
    amount: 10.0,
    cadence: 'monthly',
    keywords: 'grubhub, cheesecake, five guys, goldbelly, wine.com',
    notes: 'AmEx Gold monthly dining credit ($10/month)',
  },
  {
    name: 'Resy Credit',
    amount: 50.0,
    cadence: 'semi_annually',
    keywords: 'resy',
    notes: 'AmEx Gold semi-annual Resy credit ($50 every 6 months)',
  },
  {
    name: 'Uber Cash',
    amount: 10.0,
    cadence: 'monthly',
    keywords: 'uber, uber eats',
    notes: 'AmEx Gold monthly Uber Cash ($10/month)',
  },
  {
    name: 'Saks Fifth Avenue',
    amount: 50.0,
    cadence: 'semi_annually',
    keywords: 'saks',
    notes: 'AmEx Platinum semi-annual Saks credit ($50 Jan-Jun & Jul-Dec)',
  },
  {
    name: 'Airline Fee Credit',
    amount: 200.0,
    cadence: 'annually',
    keywords: 'delta, united, american airlines, southwest, jetblue, airline',
    notes: 'AmEx Platinum annual airline incidentals ($200/year)',
  },
  {
    name: 'Digital Entertainment',
    amount: 20.0,
    cadence: 'monthly',
    keywords: 'disney, hulu, espn, peacock, nytimes, wall street journal',
    notes: 'AmEx Platinum monthly streaming credit ($20/month)',
  },
  {
    name: 'Travel Credit',
    amount: 300.0,
    cadence: 'anniversary',
    keywords: 'travel, flight, airline, hotel',
    notes: 'CSR or Venture X annual travel credit ($300/year)',
  },
];
