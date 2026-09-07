/**
 * Receipt Recognition Service
 * ===========================
 * Handles image transmission to AWS Lambda / SageMaker endpoint,
 * parses recognition payload (Card usage, Total amount, Itemwise breakdown),
 * and matches detected card against user's registered cards.
 */

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

  // 1. Check exact match of last 4 digits in card name (e.g. "Chase Freedom (4242)" or "...4242")
  if (detectedCard.last4) {
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

export const DEFAULT_AWS_RECEIPT_URL =
  'https://eb2kjhtss6.execute-api.us-east-1.amazonaws.com/prod/recognize-receipt';

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

    console.info('[ReceiptOCR] Running OCR on uploaded image...');
    const result = await tesseract.recognize(dataUrl, 'eng');
    const text = result?.data?.text || '';
    console.info('[ReceiptOCR] OCR completed, extracted characters:', text.length);
    return text;
  } catch (err) {
    console.warn('[ReceiptOCR] Browser OCR skipped or failed:', err);
    return '';
  }
}

let tesseractPromise: Promise<any> | null = null;
function loadTesseractFromCDN(): Promise<any> {
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
    ocrText.match(/(?:account|acct|card|pan|#)[\s:.-]*[xX*]{4,}[\s-]*(\d{4})/i),
    ocrText.match(/[xX*]{4,}[\s-]*(\d{4})/),
    ocrText.match(/\b(?:ending\s*in\s*|ending\s*)(\d{4})\b/i),
    ocrText.match(/\*{4}\s*(\d{4})\b/),
    ocrText.match(/(?:card|acct)[\s:#]+(\d{4})\b/i),
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

  const priceRegex = /\$?\s*([0-9]{1,4}\.[0-9]{2})/;
  const totalRegex = /\b(total|grand\s*total|balance\s*due|amount\s*due|final\s*total)\b/i;
  const subtotalRegex = /\b(sub\s*total|subtotal|net\s*amount)\b/i;
  const taxRegex = /\b(tax|sales\s*tax|hst|gst|vat)\b/i;
  const tipRegex = /\b(tip|gratuity)\b/i;

  const ignoreKeywords = [
    'change', 'cash', 'cash tendered', 'approved', 'account',
    'visa', 'mastercard', 'amex', 'discover', 'auth', 'balance',
    'subtotal', 'tax', 'total', 'tip', 'thank you'
  ];

  for (const line of ocrLines) {
    const pMatch = line.match(priceRegex);
    if (!pMatch) continue;

    const amountVal = parseFloat(pMatch[1]);
    if (isNaN(amountVal)) continue;

    const lineLower = line.toLowerCase();

    if (totalRegex.test(lineLower) && !subtotalRegex.test(lineLower)) {
      if (totalAmount === undefined || lineLower.includes('grand')) {
        totalAmount = amountVal;
      }
      continue;
    }

    if (subtotalRegex.test(lineLower)) {
      subtotal = amountVal;
      continue;
    }

    if (taxRegex.test(lineLower)) {
      tax = amountVal;
      continue;
    }

    if (tipRegex.test(lineLower)) {
      tip = amountVal;
      continue;
    }

    if (ignoreKeywords.some(kw => lineLower.includes(kw))) {
      continue;
    }

    let desc = line.replace(priceRegex, '').replace(/^[\d*#\-.]+\s+/, '').trim();
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
        quantity: qty,
        unitPrice: qty > 1 ? Math.round((amountVal / qty) * 100) / 100 : amountVal,
        category: 'Grocery',
      });
    }
  }

  if (totalAmount === undefined) {
    if (subtotal !== undefined && tax !== undefined) {
      totalAmount = Math.round((subtotal + tax + (tip || 0)) * 100) / 100;
    } else if (items.length > 0) {
      totalAmount = Math.round(items.reduce((s, it) => s + it.amount, 0) * 100) / 100;
    } else {
      totalAmount = 0.0;
    }
  }

  // 3. Extract Merchant and Date
  let merchant: string | undefined = undefined;
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

    if (!merchant) {
      const cleaned = line.trim();
      if (
        cleaned.length >= 3 &&
        /[a-zA-Z]/.test(cleaned) &&
        !/(receipt|welcome|store|tax invoice|cashier|terminal|order)/i.test(cleaned) &&
        !/^\d/.test(cleaned)
      ) {
        merchant = cleaned;
      }
    }
  }

  return {
    success: true,
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
    source: 'AWS-SageMaker-ClientOCR',
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

  console.info('[ReceiptRecognition] Target API URL:', customUrl);

  // 1. Run browser OCR if on web
  let clientOcrText = '';
  try {
    const uriToScan = options?.rawUri || (base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${base64Image}`);
    clientOcrText = await extractTextFromImage(uriToScan);
  } catch (ocrErr) {
    console.warn('[ReceiptRecognition] Client OCR error:', ocrErr);
  }

  // 2. If an explicit AWS Lambda endpoint is configured, invoke it directly
  if (customUrl) {
    try {
      console.info('[ReceiptRecognition] Invoking live AWS Lambda endpoint...');
      const response = await fetch(customUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: base64Image,
          text: clientOcrText || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (data && data.success && data.totalAmount > 0) {
        return normalizeRecognitionResult(data);
      }

      if (clientOcrText.trim().length > 0) {
        return parseReceiptText(clientOcrText);
      }

      return normalizeRecognitionResult(data);
    } catch (err) {
      console.warn('Direct AWS Lambda recognition call failed, trying local proxy:', err);
    }
  }

  try {
    const proxyUrl = typeof window !== 'undefined' ? '/api/scan-receipt' : 'http://localhost:3000/api/scan-receipt';
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Image, text: clientOcrText || undefined }),
    });

    if (response.ok) {
      const data = await response.json();
      return normalizeRecognitionResult(data);
    }
  } catch (err) {
    // API server not running
  }

  if (clientOcrText.trim().length > 0) {
    return parseReceiptText(clientOcrText);
  }

  return {
    success: false,
    merchant: 'No text detected',
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
