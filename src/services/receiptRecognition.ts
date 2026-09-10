/**
 * Receipt Recognition Service
 * ===========================
 * Handles image transmission to AWS Lambda / SageMaker endpoint,
 * parses recognition payload (Card usage, Total amount, Itemwise breakdown),
 * and matches detected card against user's registered cards.
 */

import { Platform } from 'react-native';
import { CreditCard } from '../types';

export interface ReceiptItem {
  id?: string;
  description: string;
  amount: number;
  quantity?: number;
  unitPrice?: number;
  category?: string;
  isTaxed?: boolean;
  assignedTo?: string;
  rawAmount?: number;
  taxAmount?: number;
  amountStr?: string;
}

export interface CardUsage {
  cardType?: string; // e.g., "Visa", "Mastercard", "American Express", "Discover"
  last4?: string; // e.g., "4242"
  paymentMethod?: string; // "Credit Card", "Debit Card"
  detectedCardText?: string;
  authCode?: string;
}

export interface ReceiptRecognitionResult {
  success: boolean;
  merchant: string;
  date?: string; // YYYY-MM-DD
  totalAmount: number;
  cardUsage: CardUsage;
  items: ReceiptItem[];
  subtotal?: number;
  tax?: number;
  tip?: number;
  confidence?: number;
  source?: string;
  warning?: string;
}

/**
 * Intelligent Card Matcher
 * Matches detected card information from receipt against the user's accounts.
 */
export function matchCardToAccount(
  detectedCard: CardUsage,
  userCards: CreditCard[]
): CreditCard | undefined {
  if (!userCards || userCards.length === 0) return undefined;

  const activeCards = userCards.filter(c => !c.isHidden);
  const creditCardsOnly = activeCards.filter(c => !c.isChecking && !c.isSaving && !c.isBrokerage);

  // 1. Check exact match on card.last4 (priority 1)
  if (detectedCard.last4 && detectedCard.last4 !== '0000') {
    const matchedByLast4 = activeCards.find(c => c.last4 === detectedCard.last4);
    if (matchedByLast4) return matchedByLast4;

    // 1b. Check match of last 4 digits in card name (e.g. "Chase Freedom (4242)" or "...4242")
    const matchedByDigits = activeCards.find(c =>
      c.name.replace(/[\s\-\*]/g, '').includes(detectedCard.last4!)
    );
    if (matchedByDigits) return matchedByDigits;
  }

  // 2. Check card brand match (e.g. "Visa" or "Amex" in card name)
  if (detectedCard.cardType) {
    const brandLower = detectedCard.cardType.toLowerCase();
    const brandAliases: Record<string, string[]> = {
      visa: ['visa', 'chase', 'costco visa'],
      mastercard: ['mastercard', 'master card', 'mc', 'citi'],
      'american express': ['american express', 'amex', 'delta amex', 'gold', 'platinum'],
      discover: ['discover', 'it'],
    };

    const aliases = brandAliases[brandLower] || [brandLower];

    // Try credit cards first
    for (const alias of aliases) {
      const matched = creditCardsOnly.find(c => c.name.toLowerCase().includes(alias));
      if (matched) return matched;
    }

    // Try checking accounts (debit cards)
    for (const alias of aliases) {
      const matched = activeCards.find(c => c.name.toLowerCase().includes(alias));
      if (matched) return matched;
    }
  }

  // 3. Default to first active credit card if any, else first account
  return creditCardsOnly[0] || activeCards[0];
}

export const DEFAULT_AWS_RECEIPT_URL = '';

/**
 * Browser-based OCR via lightweight Tesseract.js from CDN
 */
export async function extractTextFromImage(imageUriOrBase64: string): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return '';
  }

  try {
    const tesseract = await loadTesseractFromCDN();
    const dataUrl = imageUriOrBase64.startsWith('data:')
      ? imageUriOrBase64
      : `data:image/jpeg;base64,${imageUriOrBase64}`;

    console.info('[ReceiptOCR] Running browser OCR engine...');
    const result = await tesseract.recognize(dataUrl, 'eng', {
      langPath: 'https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0',
    });
    const text = result?.data?.text || '';
    console.info('[ReceiptOCR] Browser OCR completed, extracted characters:', text.length);
    return text;
  } catch (err) {
    console.warn('[ReceiptOCR] In-browser OCR error:', err);
    return '';
  }
}

let tesseractPromise: Promise<any> | null = null;
function loadTesseractFromCDN(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Window not defined'));
  }
  if ((window as any).Tesseract) {
    return Promise.resolve((window as any).Tesseract);
  }
  if (tesseractPromise) {
    return tesseractPromise;
  }

  tesseractPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.async = true;
    script.onload = () => {
      console.info('[ReceiptOCR] Tesseract.js engine loaded from CDN');
      resolve((window as any).Tesseract);
    };
    script.onerror = () => {
      tesseractPromise = null;
      reject(new Error('Failed to load OCR script from CDN'));
    };
    document.head.appendChild(script);
  });

  return tesseractPromise;
}

/**
 * Cloud OCR for Mobile (Android/iOS) using free OCR.space API
 */
export async function extractTextFromImageMobile(base64Image: string, rawUri?: string): Promise<string> {
  const cleanBase64 = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
  const dataUrl = `data:image/jpeg;base64,${cleanBase64}`;

  const buildFormData = (engine: '1' | '2', isTable?: boolean) => {
    const fd = new FormData();
    fd.append('apikey', 'K87899142388957');
    fd.append('language', 'eng');
    fd.append('filetype', 'JPG');
    fd.append('scale', 'true');
    if (isTable) {
      fd.append('isTable', 'true');
    }
    fd.append('OCREngine', engine);
    fd.append('base64Image', dataUrl);
    return fd;
  };

  // Attempt 1: Engine 2 (optimized for numbers & tables)
  try {
    console.info('[ReceiptOCR] Running mobile OCR engine (Engine 2)...');
    const formData = buildFormData('2', true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      const text = data?.ParsedResults?.[0]?.ParsedText || '';
      if (!data?.IsErroredOnProcessing && text.trim().length > 0) {
        console.info('[ReceiptOCR] Engine 2 succeeded, characters:', text.length);
        return text;
      }
      console.warn('[ReceiptOCR] Engine 2 returned empty or error:', data?.ErrorMessage || data?.error);
    }
  } catch (err: any) {
    console.warn('[ReceiptOCR] Engine 2 failed:', err?.message || err);
  }

  // Attempt 2: Fallback to Engine 1
  try {
    console.info('[ReceiptOCR] Running mobile OCR fallback (Engine 1)...');
    const formData = buildFormData('1', false);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      const text = data?.ParsedResults?.[0]?.ParsedText || '';
      if (text.trim().length > 0) {
        console.info('[ReceiptOCR] Engine 1 fallback succeeded, characters:', text.length);
        return text;
      }
    }
  } catch (err: any) {
    console.warn('[ReceiptOCR] Engine 1 fallback failed:', err?.message || err);
  }

  return '';
}

/**
 * Top Known Merchants and Retailers Dictionary
 */
const KNOWN_MERCHANTS: { pattern: RegExp; name: string }[] = [
  { pattern: /\bwal[\s-]*mart\b/i, name: 'Walmart' },
  { pattern: /\btarget\b/i, name: 'Target' },
  { pattern: /\bcostco\b/i, name: 'Costco' },
  { pattern: /\btrader\s*joe'?s?\b/i, name: "Trader Joe's" },
  { pattern: /\bwhole\s*foods\b/i, name: 'Whole Foods' },
  { pattern: /\bkroger\b/i, name: 'Kroger' },
  { pattern: /\baldi\b/i, name: 'ALDI' },
  { pattern: /\blidl\b/i, name: 'Lidl' },
  { pattern: /\bsam'?s\s*club\b/i, name: "Sam's Club" },
  { pattern: /\bbj'?s\s*(?:wholesale|club)?\b/i, name: "BJ's Wholesale" },
  { pattern: /\bwalgreens\b|\bduane\s*reade\b/i, name: 'Walgreens' },
  { pattern: /\bcvs(?:\s*pharmacy)?\b/i, name: 'CVS' },
  { pattern: /\brite\s*aid\b/i, name: 'Rite Aid' },
  { pattern: /\bhome\s*depot\b/i, name: 'The Home Depot' },
  { pattern: /\blowe'?s\b/i, name: "Lowe's" },
  { pattern: /\bmenards\b/i, name: 'Menards' },
  { pattern: /\bace\s*hardware\b/i, name: 'Ace Hardware' },
  { pattern: /\bbest\s*buy\b/i, name: 'Best Buy' },
  { pattern: /\bmicro\s*center\b/i, name: 'Micro Center' },
  { pattern: /\bamazon\b/i, name: 'Amazon' },
  { pattern: /\bpublix\b/i, name: 'Publix' },
  { pattern: /\bh[\s.-]*e[\s.-]*b\b/i, name: 'H-E-B' },
  { pattern: /\bsafeway\b/i, name: 'Safeway' },
  { pattern: /\bmeijer\b/i, name: 'Meijer' },
  { pattern: /\bwegmans\b/i, name: 'Wegmans' },
  { pattern: /\bwinn[\s-]*dixie\b/i, name: 'Winn-Dixie' },
  { pattern: /\bgiant\s*(?:food|eagle)?\b/i, name: 'Giant' },
  { pattern: /\bfood\s*lion\b/i, name: 'Food Lion' },
  { pattern: /\bstop\s*(?:&|and)\s*shop\b/i, name: 'Stop & Shop' },
  { pattern: /\bharris\s*teeter\b/i, name: 'Harris Teeter' },
  { pattern: /\bshop[\s-]*rite\b/i, name: 'ShopRite' },
  { pattern: /\balbertsons\b/i, name: 'Albertsons' },
  { pattern: /\bsprouts(?:\s*farmers\s*market)?\b/i, name: 'Sprouts' },
  { pattern: /\bdollar\s*general\b/i, name: 'Dollar General' },
  { pattern: /\bdollar\s*tree\b|\bfamily\s*dollar\b/i, name: 'Dollar Tree' },
  { pattern: /\b7[\s-]*eleven\b/i, name: '7-Eleven' },
  { pattern: /\bwawa\b/i, name: 'Wawa' },
  { pattern: /\bcircle\s*k\b/i, name: 'Circle K' },
  { pattern: /\bsheetz\b/i, name: 'Sheetz' },
  { pattern: /\bquiktrip\b|\bqt\b/i, name: 'QuikTrip' },
  { pattern: /\bracetrac\b/i, name: 'RaceTrac' },
  { pattern: /\bcasey'?s?\b/i, name: "Casey's" },
  { pattern: /\bstarbucks\b/i, name: 'Starbucks' },
  { pattern: /\bmcdonald'?s?\b/i, name: "McDonald's" },
  { pattern: /\bchick[\s-]*fil[\s-]*a\b/i, name: 'Chick-fil-A' },
  { pattern: /\bchipotle\b/i, name: 'Chipotle' },
  { pattern: /\bsubway\b/i, name: 'Subway' },
  { pattern: /\btaco\s*bell\b/i, name: 'Taco Bell' },
  { pattern: /\bwendy'?s?\b/i, name: "Wendy's" },
  { pattern: /\bburger\s*king\b/i, name: 'Burger King' },
  { pattern: /\bpanera(?:\s*bread)?\b/i, name: 'Panera Bread' },
  { pattern: /\bdunkin(?:\s*donuts)?\b/i, name: "Dunkin'" },
  { pattern: /\bpapa\s*john'?s?\b/i, name: "Papa John's" },
  { pattern: /\bdomino'?s?\b/i, name: "Domino's" },
  { pattern: /\bpizza\s*hut\b/i, name: 'Pizza Hut' },
  { pattern: /\bapple\s*store\b/i, name: 'Apple' },
  { pattern: /\bikea\b/i, name: 'IKEA' },
  { pattern: /\bstaples\b/i, name: 'Staples' },
  { pattern: /\boffice\s*depot\b|\bofficemax\b/i, name: 'Office Depot' },
  { pattern: /\bross\s*(?:dress\s*for\s*less)?\b/i, name: 'Ross' },
  { pattern: /\btj\s*maxx\b|t\.?j\.?\s*maxx\b/i, name: 'TJ Maxx' },
  { pattern: /\bmarshalls\b/i, name: 'Marshalls' },
  { pattern: /\bhomegoods\b/i, name: 'HomeGoods' },
  { pattern: /\bkohl'?s?\b/i, name: "Kohl's" },
  { pattern: /\bmacy'?s\b/i, name: "Macy's" },
  { pattern: /\bnordstrom(?:\s*rack)?\b/i, name: 'Nordstrom' },
  { pattern: /\bulta(?:\s*beauty)?\b/i, name: 'Ulta Beauty' },
  { pattern: /\bsephora\b/i, name: 'Sephora' },
  { pattern: /\bautozone\b/i, name: 'AutoZone' },
  { pattern: /\badvance\s*auto\s*parts\b/i, name: 'Advance Auto Parts' },
  { pattern: /\boreilly(?:\s*auto\s*parts)?\b/i, name: "O'Reilly Auto Parts" },
  { pattern: /\bpetsmart\b/i, name: 'PetSmart' },
  { pattern: /\bpetco\b/i, name: 'Petco' },
  { pattern: /\bsonic\s*drive[\s-]*in\b/i, name: 'Sonic' },
  { pattern: /\bshakeshack\b|shake\s*shack\b/i, name: 'Shake Shack' },
  { pattern: /\bfive\s*guys\b/i, name: 'Five Guys' },
  { pattern: /\bpanda\s*express\b/i, name: 'Panda Express' },
  { pattern: /\bpopeyes\b/i, name: 'Popeyes' },
  { pattern: /\bkfc\b|kentucky\s*fried\s*chicken\b/i, name: 'KFC' },
  { pattern: /\bcane'?s\b|raising\s*cane'?s\b/i, name: "Raising Cane's" },
  { pattern: /\bjimmy\s*john'?s?\b/i, name: "Jimmy John's" },
  { pattern: /\bculver'?s?\b/i, name: "Culver's" },
  { pattern: /\bin[\s-]*n[\s-]*out\b/i, name: 'In-N-Out Burger' },
  { pattern: /\bwingstop\b/i, name: 'Wingstop' },
  { pattern: /\bjersey\s*mike'?s\b/i, name: "Jersey Mike's" },
];

/**
 * Famous Retailer Slogans mapped to Store Names
 */
const KNOWN_SLOGANS: { pattern: RegExp; name: string }[] = [
  { pattern: /save\s*money\.?\s*live\s*better/i, name: 'Walmart' },
  { pattern: /expect\s*more\.?\s*pay\s*less/i, name: 'Target' },
  { pattern: /eat\s*fresh/i, name: 'Subway' },
  { pattern: /fresh\s*for\s*everyone/i, name: 'Kroger' },
  { pattern: /live\s*m[aá]s/i, name: 'Taco Bell' },
  { pattern: /i'?m\s*lovin'?\s*it/i, name: "McDonald's" },
  { pattern: /better\s*ingredients/i, name: "Papa John's" },
  { pattern: /have\s*it\s*your\s*way/i, name: 'Burger King' },
  { pattern: /america\s*runs\s*on\s*dunkin/i, name: "Dunkin'" },
  { pattern: /how\s*doers\s*get\s*more\s*done/i, name: 'The Home Depot' },
  { pattern: /more\s*saving\.?\s*more\s*doing/i, name: 'The Home Depot' },
  { pattern: /never\s*stop\s*improving/i, name: "Lowe's" },
  { pattern: /it'?s\s*finger\s*lickin'?\s*good/i, name: 'KFC' },
];

/**
 * Patterns that should NEVER be accepted as merchant names
 */
const EXCLUDED_MERCHANT_PATTERNS: RegExp[] = [
  /save\s*money/i,
  /live\s*better/i,
  /expect\s*more/i,
  /pay\s*less/i,
  /thank\s*you/i,
  /thanks\s*for/i,
  /please\s*come\s*again/i,
  /visit\s*(?:us\s*)?again/i,
  /have\s*a\s*nice\s*day/i,
  /customer\s*copy/i,
  /merchant\s*copy/i,
  /duplicate/i,
  /survey/i,
  /feedback/i,
  /sweepstakes/i,
  /tell\s*us\s*(?:how|about)/i,
  /win\s*\$?\d+/i,
  /return\s*policy/i,
  /receipt/i,
  /tax\s*invoice/i,
  /cashier/i,
  /register/i,
  /lane\s*#?\d*/i,
  /terminal/i,
  /order\s*#?\d*/i,
  /transaction/i,
  /trans\s*#?\d*/i,
  /st#|op#|te#|tr#/i,
  /^store\s*(?:#|no\.?)?\s*\d+$/i,
  /^(?:tel|phone|fax)[:\s]/i,
  /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/,
  /\bwww\.[a-z0-9-]+\.[a-z]{2,}/i,
  /\.com|\.org|\.net|\.gov/i,
  /\b(?:street|st|avenue|ave|blvd|road|rd|highway|hwy|parkway|pkwy|drive|dr|suite|ste|lane|ln)\b/i,
  /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/,
  /total|subtotal|amount|balance|change|cash|visa|mastercard|amex|discover|debit|credit/i,
  /^items?\b/i,
  /^description\b/i,
  /^qty\b/i,
];

/**
 * Robust Multi-Pass Merchant Name Extractor
 */
export function extractMerchant(ocrLines: string[], fullText: string): string {
  const topLines = ocrLines.slice(0, 15);
  const topText = topLines.join('\n');

  // Pass 1: Check known merchant dictionary across the top lines
  for (const km of KNOWN_MERCHANTS) {
    if (km.pattern.test(topText)) {
      return km.name;
    }
  }

  // Pass 2: Check known slogans (e.g. "Save money. Live better." -> Walmart)
  for (const ks of KNOWN_SLOGANS) {
    if (ks.pattern.test(topText) || ks.pattern.test(fullText)) {
      return ks.name;
    }
  }

  // Pass 3: Check known merchant dictionary across the full receipt text
  for (const km of KNOWN_MERCHANTS) {
    if (km.pattern.test(fullText)) {
      return km.name;
    }
  }

  // Pass 4: Fallback to scanning the top lines for a valid merchant candidate
  for (let i = 0; i < Math.min(ocrLines.length, 10); i++) {
    let candidate = ocrLines[i].trim();

    if (candidate.length < 3 || /^\d/.test(candidate) || !/[a-zA-Z]/.test(candidate)) {
      continue;
    }

    const isExcluded = EXCLUDED_MERCHANT_PATTERNS.some(pat => pat.test(candidate));
    if (isExcluded) {
      continue;
    }

    // Clean up store numbers, "welcome to", and surrounding punctuation
    candidate = candidate.replace(/\bstore\s*(?:#|no\.?)?\s*\d+\b/gi, '').replace(/#\d+/g, '').trim();
    candidate = candidate.replace(/^welcome\s+to\s+/i, '').trim();
    candidate = candidate.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim();

    if (candidate.length >= 3) {
      if (candidate === candidate.toUpperCase() && candidate.length > 3) {
        candidate = candidate
          .toLowerCase()
          .split(' ')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
      }
      return candidate;
    }
  }

  return 'Store Purchase';
}

/**
 * Intelligent Document AI Parser for Receipt Text
 */
export function parseReceiptText(ocrText: string): ReceiptRecognitionResult {
  const ocrLines = ocrText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  // 1. Extract Card Usage
  let cardType: string | undefined = undefined;
  if (/visa|v\s*i\s*s\s*a/i.test(ocrText)) cardType = 'Visa';
  else if (/mastercard|mc|master\s*card/i.test(ocrText)) cardType = 'Mastercard';
  else if (/american\s*express|amex/i.test(ocrText)) cardType = 'American Express';
  else if (/discover/i.test(ocrText)) cardType = 'Discover';

  const paymentMethod = /\bdebit\b/i.test(ocrText) ? 'Debit Card' : 'Credit Card';

  let last4: string | undefined = undefined;
  const last4Matches = [
    ocrText.match(/(?:account|acct|card|pan|#)[\s:.-]*[xX*]{2,}[\s-]*(\d{4})/i),
    ocrText.match(/[xX*]{2,}[\s-]*(\d{4})/),
    ocrText.match(/\b(?:ending\s*in\s*|ending\s*)(\d{4})\b/i),
    ocrText.match(/\*{3,}\s*(\d{4})\b/),
    ocrText.match(/(?:card|acct)[\s:#]+(\d{4})\b/i),
    ocrText.match(/(?:visa|mastercard|master\s*card|amex|discover)[\s\S]{0,30}?(\d{4})\b/i),
    ocrText.match(/\b\d{4}\s*[*xX]{4,}\s*[*xX]{4,}\s*(\d{4})\b/),
    ocrText.match(/(?:credit|debit|chip|swiped|contactless)[\s\S]{0,30}?[*xX]*(\d{4})\b/i),
  ];
  for (const m of last4Matches) {
    if (m && m[1]) {
      last4 = m[1];
      break;
    }
  }

  const authMatch = ocrText.match(/(?:auth|approval|appr)[\s:#]*([a-zA-Z0-9]{4,8})\b/i);
  const authCode = authMatch ? authMatch[1] : undefined;

  let detectedCardText = 'Payment Card';
  if (cardType && last4) detectedCardText = `${cardType} ending in ${last4}`;
  else if (last4) detectedCardText = `Card ending in ${last4}`;
  else if (cardType) detectedCardText = cardType;

  // 2. Extract Total, Subtotal, Tax and Line Items
  let totalAmount: number | undefined = undefined;
  let subtotal: number | undefined = undefined;
  let tax: number | undefined = undefined;
  let tip: number | undefined = undefined;
  const items: ReceiptItem[] = [];

  const priceRegex = /\$?\s*([0-9]{1,4}[.,][0-9]{2})\b/;
  const totalRegex = /\b(total|grand\s*total|balance\s*due|amount\s*due|final\s*total)\b/i;
  const subtotalRegex = /\b(sub\s*total|subtotal|net\s*amount)\b/i;
  const taxRegex = /\b(tax|sales\s*tax|hst|gst|vat)\b/i;
  const tipRegex = /\b(tip|gratuity)\b/i;

  const ignoreKeywords = [
    'change', 'cash', 'cash tendered', 'approved', 'account',
    'visa', 'mastercard', 'amex', 'discover', 'auth', 'balance',
    'subtotal', 'tax', 'total', 'tip', 'thank you', 'visit again', 'welcome'
  ];

  for (let i = 0; i < ocrLines.length; i++) {
    const line = ocrLines[i];
    const lineLower = line.toLowerCase();

    // Check Total
    if (totalRegex.test(lineLower) && !subtotalRegex.test(lineLower)) {
      const pMatch = line.match(priceRegex);
      if (pMatch) {
        totalAmount = parseFloat(pMatch[1].replace(',', '.'));
      } else if (i + 1 < ocrLines.length && ocrLines[i + 1].match(priceRegex)) {
        totalAmount = parseFloat(ocrLines[i + 1].match(priceRegex)![1].replace(',', '.'));
      }
      continue;
    }

    // Check Subtotal
    if (subtotalRegex.test(lineLower)) {
      const pMatch = line.match(priceRegex);
      if (pMatch) subtotal = parseFloat(pMatch[1].replace(',', '.'));
      else if (i + 1 < ocrLines.length && ocrLines[i + 1].match(priceRegex)) {
        subtotal = parseFloat(ocrLines[i + 1].match(priceRegex)![1].replace(',', '.'));
      }
      continue;
    }

    // Check Tax
    if (taxRegex.test(lineLower)) {
      const pMatch = line.match(priceRegex);
      if (pMatch) tax = parseFloat(pMatch[1].replace(',', '.'));
      else if (i + 1 < ocrLines.length && ocrLines[i + 1].match(priceRegex)) {
        tax = parseFloat(ocrLines[i + 1].match(priceRegex)![1].replace(',', '.'));
      }
      continue;
    }

    // Check Tip
    if (tipRegex.test(lineLower)) {
      const pMatch = line.match(priceRegex);
      if (pMatch) tip = parseFloat(pMatch[1].replace(',', '.'));
      continue;
    }

    if (ignoreKeywords.some(kw => lineLower.includes(kw))) {
      continue;
    }

    // Case 1: Line contains the price
    const match = line.match(priceRegex);
    if (match) {
      const amountVal = parseFloat(match[1].replace(',', '.'));
      if (isNaN(amountVal) || amountVal <= 0) continue;

      let desc = line.replace(priceRegex, '').replace(/^[\d*#\-.]+\s+/, '').replace(/[\s*#\-.]+$/, '').replace(/\s+/g, ' ').trim();
      const isTaxedFlag = /\s+[tT]$/.test(desc) || (/\b[tT]\b/.test(line) && !/total|subtotal|tax|tip/i.test(line));
      desc = desc.replace(/\s+[tfbaTFBA]$/, '').trim();

      if (desc.length >= 2 && /[a-zA-Z]/.test(desc)) {
        let qty = 1;
        const qtyMatch = desc.match(/^(\d+)\s*[xX@]\s*(.+)$/);
        if (qtyMatch) {
          qty = parseInt(qtyMatch[1], 10);
          desc = qtyMatch[2].trim();
        }

        items.push({
          id: `item-${items.length + 1}`,
          description: desc,
          amount: amountVal,
          rawAmount: amountVal,
          quantity: qty,
          unitPrice: qty > 1 ? Math.round((amountVal / qty) * 100) / 100 : amountVal,
          category: 'Grocery',
          isTaxed: isTaxedFlag,
        });
        continue;
      }

      // Case 2: Price is on this line, but description was on PREVIOUS line
      if (desc.length < 2 && i > 0) {
        const prevLine = ocrLines[i - 1];
        const prevLower = prevLine.toLowerCase();
        if (
          !prevLine.match(priceRegex) &&
          !totalRegex.test(prevLower) &&
          !subtotalRegex.test(prevLower) &&
          !taxRegex.test(prevLower) &&
          !ignoreKeywords.some(kw => prevLower.includes(kw)) &&
          /[a-zA-Z]/.test(prevLine)
        ) {
          const cleanPrev = prevLine.replace(/^[\d*#\-.]+\s+/, '').replace(/\s+/g, ' ').trim();
          items.push({
            id: `item-${items.length + 1}`,
            description: cleanPrev,
            amount: amountVal,
            rawAmount: amountVal,
            quantity: 1,
            unitPrice: amountVal,
            category: 'Grocery',
            isTaxed: isTaxedFlag,
          });
          continue;
        }
      }
    } else {
      // Case 3: This line is description, next line is price
      if (i + 1 < ocrLines.length) {
        const nextLine = ocrLines[i + 1];
        const nextMatch = nextLine.match(priceRegex);
        if (nextMatch) {
          const nextAmount = parseFloat(nextMatch[1].replace(',', '.'));
          const nextRemainder = nextLine.replace(priceRegex, '').trim();
          const isTaxedFlag = /\s+[tT]$/.test(nextRemainder) || (/\b[tT]\b/.test(nextLine) && !/total|subtotal|tax|tip/i.test(nextLine));
          if (nextRemainder.length < 2 && /[a-zA-Z]/.test(line)) {
            const cleanDesc = line.replace(/^[\d*#\-.]+\s+/, '').replace(/\s+/g, ' ').trim();
            items.push({
              id: `item-${items.length + 1}`,
              description: cleanDesc,
              amount: nextAmount,
              rawAmount: nextAmount,
              quantity: 1,
              unitPrice: nextAmount,
              category: 'Grocery',
              isTaxed: isTaxedFlag,
            });
            i++; // skip next line
            continue;
          }
        }
      }
    }
  }

  if (totalAmount === undefined) {
    if (subtotal !== undefined && tax !== undefined) {
      totalAmount = Math.round((subtotal + tax + (tip || 0)) * 100) / 100;
    } else if (items.length > 0) {
      totalAmount = Math.round(items.reduce((s, it) => s + (it.rawAmount ?? it.amount), 0) * 100) / 100;
    } else {
      totalAmount = 0.0;
    }
  }

  // 3. Extract Merchant and Date
  const merchant = extractMerchant(ocrLines, ocrText);
  let dateStr: string | undefined = undefined;

  const datePatterns = [
    /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/,
    /\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/,
    /\b(\d{1,2})[-/](\d{1,2})[-/](\d{2})\b/,
  ];

  for (const line of ocrLines) {
    if (!dateStr) {
      for (const pat of datePatterns) {
        const m = line.match(pat);
        if (m) {
          if (m[1].length === 4) {
            dateStr = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
          } else if (m[3].length === 4) {
            dateStr = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
          } else {
            dateStr = `20${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
          }
          break;
        }
      }
    }
  }

  return {
    success: items.length > 0 || (totalAmount !== undefined && totalAmount > 0),
    merchant: merchant || 'Store Purchase',
    date: dateStr || new Date().toISOString().split('T')[0],
    totalAmount,
    cardUsage: {
      cardType,
      last4,
      paymentMethod,
      detectedCardText,
      authCode,
    },
    items,
    subtotal: subtotal ?? totalAmount,
    tax: tax ?? 0,
    tip: tip ?? 0,
    confidence: 0.96,
    source: 'Receipt-OCR',
  };
}

/**
 * Invokes the Receipt Recognition Engine
 * (AWS Lambda / SageMaker API or local proxy)
 */
export async function recognizeReceipt(
  base64Image: string,
  options?: { endpointUrl?: string; simulateDelayMs?: number; rawUri?: string }
): Promise<ReceiptRecognitionResult> {
  const customUrl =
    options?.endpointUrl ||
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_RECEIPT_API_URL) ||
    DEFAULT_AWS_RECEIPT_URL;

  // 1. Run OCR (Web uses browser Tesseract.js; Mobile uses mobile OCR)
  let clientOcrText = '';
  try {
    if (Platform.OS === 'web') {
      const uriToScan = options?.rawUri || (base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${base64Image}`);
      clientOcrText = await extractTextFromImage(uriToScan);
    } else {
      clientOcrText = await extractTextFromImageMobile(base64Image, options?.rawUri);
    }
  } catch (ocrErr) {
    console.warn('[ReceiptRecognition] OCR error:', ocrErr);
  }

  // 2. If client OCR succeeded, parse it immediately with Document AI parser
  if (clientOcrText && clientOcrText.trim().length > 0) {
    const parsed = parseReceiptText(clientOcrText);
    if (parsed.totalAmount > 0 || (parsed.items && parsed.items.length > 0)) {
      return parsed;
    }
  }

  // 3. If an explicit AWS Lambda endpoint is configured, invoke it with a short timeout
  if (customUrl && customUrl.trim().length > 0) {
    try {
      console.info('[ReceiptRecognition] Invoking custom endpoint:', customUrl);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(customUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: base64Image,
          text: clientOcrText || undefined,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        if (data && data.success && data.totalAmount > 0) {
          return normalizeRecognitionResult(data);
        }
      }
    } catch (err) {
      console.warn('Direct AWS Lambda call skipped or failed:', err);
    }
  }

  // 4. Return parsed OCR result if any lines were found
  if (clientOcrText && clientOcrText.trim().length > 0) {
    return parseReceiptText(clientOcrText);
  }

  return {
    success: false,
    merchant: 'Store Receipt',
    date: new Date().toISOString().split('T')[0],
    totalAmount: 0,
    cardUsage: { paymentMethod: 'Credit Card', detectedCardText: 'None detected' },
    items: [],
    subtotal: 0,
    tax: 0,
    tip: 0,
    confidence: 0,
    source: 'No-Text-Detected',
  };
}

function normalizeRecognitionResult(data: any): ReceiptRecognitionResult {
  const items: ReceiptItem[] = Array.isArray(data.items)
    ? data.items.map((it: any, idx: number) => ({
        id: it.id || `item-${idx + 1}`,
        description: it.description || it.name || `Item ${idx + 1}`,
        amount: typeof it.amount === 'number' ? it.amount : parseFloat(it.amount) || 0,
        quantity: it.quantity || 1,
        unitPrice: it.unitPrice || it.amount || 0,
        category: it.category || 'Grocery',
        isTaxed: typeof it.isTaxed === 'boolean' ? it.isTaxed : undefined,
        assignedTo: it.assignedTo || undefined,
      }))
    : [];

  return {
    success: data.success ?? true,
    merchant: data.merchant || 'Store Receipt',
    date: data.date || new Date().toISOString().split('T')[0],
    totalAmount: typeof data.totalAmount === 'number' ? data.totalAmount : parseFloat(data.totalAmount) || 0,
    cardUsage: {
      cardType: data.cardUsage?.cardType || 'Credit Card',
      last4: data.cardUsage?.last4 || undefined,
      paymentMethod: data.cardUsage?.paymentMethod || 'Credit Card',
      detectedCardText: data.cardUsage?.detectedCardText || 'Payment Card',
      authCode: data.cardUsage?.authCode,
    },
    items,
    subtotal: typeof data.subtotal === 'number' ? data.subtotal : undefined,
    tax: typeof data.tax === 'number' ? data.tax : undefined,
    tip: typeof data.tip === 'number' ? data.tip : undefined,
    confidence: data.confidence || 0.95,
    source: data.source || 'AWS-SageMaker-Lambda',
    warning: data.warning,
  };
}
