/**
 * ESC/POS Receipt Formatter for 58mm thermal printers
 * Generates binary commands for thermal printing
 * Uses Windows-1256 codepage for Arabic text support
 */

import { ReceiptItem, ReceiptType } from '@/types/receipt';

const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

// 58mm printer ≈ 32 chars per line (monospace)
const LINE_WIDTH = 32;

/**
 * Arabic to Latin (French) transliteration map
 */
const ARABIC_TO_LATIN: Record<string, string> = {
  'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th',
  'ج': 'dj', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z',
  'س': 's', 'ش': 'ch', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'dh', 'ع': 'a',
  'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  'ه': 'h', 'و': 'ou', 'ي': 'i', 'ى': 'a', 'ة': 'a', 'ئ': 'i', 'ؤ': 'ou',
  'ء': '', 'ﻻ': 'la', 'ﻷ': 'la', 'ﻹ': 'li', 'ﻵ': 'la',
  // Diacritics - remove
  '\u064B': '', '\u064C': '', '\u064D': '', '\u064E': '', '\u064F': '',
  '\u0650': '', '\u0651': '', '\u0652': '',
};

/**
 * Transliterate Arabic text to Latin (French-style)
 * Non-Arabic characters are kept as-is
 */
function transliterateArabic(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (ARABIC_TO_LATIN[char] !== undefined) {
      result += ARABIC_TO_LATIN[char];
    } else {
      result += char;
    }
  }
  // Capitalize first letter of each word
  return result.replace(/\b\w/g, c => c.toUpperCase()).replace(/\s+/g, ' ').trim();
}

/**
 * Check if text contains Arabic characters
 */
function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

/**
 * Prepare text for thermal printing: transliterate Arabic to Latin,
 * replace special chars that printers can't handle
 */
function sanitizeForPrint(text: string): string {
  let result = hasArabic(text) ? transliterateArabic(text) : text;
  // Replace non-breaking space with regular space
  result = result.replace(/\u00A0/g, ' ');
  // Replace ° with o
  result = result.replace(/°/g, 'o');
  return result;
}

function textToBytes(text: string): Uint8Array {
  // Sanitize for print: transliterate Arabic, fix special chars
  const sanitized = sanitizeForPrint(text);
  return new TextEncoder().encode(sanitized);
}

function cmd(...bytes: number[]): Uint8Array {
  return new Uint8Array(bytes);
}

// ESC/POS Commands
const INIT = cmd(ESC, 0x40); // Initialize printer
const ALIGN_CENTER = cmd(ESC, 0x61, 0x01);
const ALIGN_LEFT = cmd(ESC, 0x61, 0x00);
const ALIGN_RIGHT = cmd(ESC, 0x61, 0x02);
const BOLD_ON = cmd(ESC, 0x45, 0x01);
const BOLD_OFF = cmd(ESC, 0x45, 0x00);
const DOUBLE_HEIGHT = cmd(GS, 0x21, 0x01);
const NORMAL_SIZE = cmd(GS, 0x21, 0x00);
const CUT_PAPER = cmd(GS, 0x56, 0x00);
const FEED_LINES = (n: number) => cmd(ESC, 0x64, n);

function padRight(str: string, len: number): string {
  if (str.length >= len) return str.substring(0, len);
  return str + ' '.repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  if (str.length >= len) return str.substring(0, len);
  return ' '.repeat(len - str.length) + str;
}

function centerText(str: string, width: number = LINE_WIDTH): string {
  if (str.length >= width) return str.substring(0, width);
  const pad = Math.floor((width - str.length) / 2);
  return ' '.repeat(pad) + str;
}

function line(char: string = '-', width: number = LINE_WIDTH): string {
  return char.repeat(width);
}

function formatAmount(amount: number): string {
  // Use plain formatting without locale-specific separators that printers can't handle
  const parts = amount.toFixed(2).split('.');
  // Add space as thousands separator (ASCII space, not non-breaking)
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${intPart},${parts[1]}`;
}

function getReceiptTypeName(type: ReceiptType): string {
  switch (type) {
    case 'direct_sale': return 'BON DE VENTE';
    case 'delivery': return 'BON DE LIVRAISON';
    case 'debt_payment': return 'RECU DE PAIEMENT';
    default: return 'BON';
  }
}

/**
 * Build a short payment/pricing label for the receipt
 * e.g. "F-1 Especes" or "F-2 Cheque" or "SG" or "Gros"
 */
function getPaymentLabel(data: ReceiptData): string | null {
  const parts: string[] = [];
  if (data.orderPaymentType === 'with_invoice') {
    const methodMap: Record<string, string> = { cash: 'Especes', check: 'Cheque', transfer: 'Virement', receipt: 'Recu' };
    const method = data.orderInvoicePaymentMethod ? (methodMap[data.orderInvoicePaymentMethod] || data.orderInvoicePaymentMethod) : '';
    parts.push(`F-1 ${method}`.trim());
  } else if (data.orderPaymentType === 'without_invoice') {
    const subtypeMap: Record<string, string> = { super_gros: 'SG', gros: 'Gros', retail: 'Detail' };
    const sub = data.orderPriceSubtype ? (subtypeMap[data.orderPriceSubtype] || data.orderPriceSubtype) : '';
    parts.push(`F-2 ${sub}`.trim());
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

export interface ReceiptData {
  receiptNumber: number;
  receiptType: ReceiptType;
  customerName: string;
  customerPhone?: string | null;
  workerName: string;
  workerPhone?: string | null;
  items: ReceiptItem[];
  totalAmount: number;
  discountAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentMethod?: string | null;
  notes?: string | null;
  date: Date;
  printCount: number;
  companyName?: string;
  companyAddress?: string;
  // Payment/pricing info
  orderPaymentType?: string;
  orderPriceSubtype?: string;
  orderInvoicePaymentMethod?: string;
  // Debt-specific fields
  debtTotalAmount?: number;
  debtPaidBefore?: number;
  collectorName?: string;
  nextCollectionDate?: string | null;
  nextCollectionTime?: string | null;
}

export function formatReceiptForPrint(data: ReceiptData): Uint8Array {
  const parts: Uint8Array[] = [];
  const add = (bytes: Uint8Array) => parts.push(bytes);
  const addText = (text: string) => { add(textToBytes(text)); add(cmd(LF)); };

  // Initialize printer
  add(INIT);

  // Header - Company name
  add(ALIGN_CENTER);
  add(BOLD_ON);
  add(DOUBLE_HEIGHT);
  addText(data.companyName || 'Laser Food');
  add(NORMAL_SIZE);
  add(BOLD_OFF);

  // Worker name + receipt number on same line
  const receiptNum = String(data.receiptNumber).padStart(6, '0');
  addText(`${data.workerName} No ${receiptNum}`);
  if (data.companyAddress) addText(data.companyAddress);

  // Date
  const dateStr = data.date.toLocaleDateString('fr-FR');
  const timeStr = data.date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  addText(`${dateStr} ${timeStr}`);

  // Client
  addText(`CLIENT: ${data.customerName}`);
  if (data.customerPhone) addText(`TEL: ${data.customerPhone}`);

  // Print count
  if (data.printCount > 0) {
    addText(`(Copie ${data.printCount + 1})`);
  }

  // Payment type label (without "TYPE:" prefix)
  const payLabel = getPaymentLabel(data);
  if (payLabel) {
    add(BOLD_ON);
    addText(payLabel);
    add(BOLD_OFF);
  }

  add(ALIGN_LEFT);
  addText(line('-'));

  // Debt payment receipt - different format
  if (data.receiptType === 'debt_payment') {
    add(ALIGN_CENTER);
    add(BOLD_ON);

    if (data.debtTotalAmount != null) {
      addText(`DETTE TOTALE: ${formatAmount(data.debtTotalAmount)} DA`);
    }
    if (data.debtPaidBefore != null) {
      addText(`DEJA PAYE: ${formatAmount(data.debtPaidBefore)} DA`);
    }
    addText(line('-'));
    addText(`PAIEMENT: ${formatAmount(data.paidAmount)} DA`);
    addText(line('-'));
    addText(`RESTANT: ${formatAmount(data.remainingAmount)} DA`);
    add(BOLD_OFF);

    if (data.collectorName) {
      addText(`COLLECTEUR: ${data.collectorName}`);
    }

    if (data.paymentMethod) {
      const methodLabels: Record<string, string> = {
        cash: 'Especes', check: 'Cheque', transfer: 'Virement', receipt: 'Recu',
      };
      addText(`Mode: ${methodLabels[data.paymentMethod] || data.paymentMethod}`);
    }

    if (data.nextCollectionDate) {
      addText(line('-'));
      addText(`PROCHAIN RDV: ${data.nextCollectionDate}${data.nextCollectionTime ? ' ' + data.nextCollectionTime : ''}`);
    }
  } else {
    // Items header (for sale/delivery receipts)
    // Adjusted column widths: Article(12) Qte(7) PU(6) Total(7)
    const hdrArticle = padRight('Article', 12);
    const hdrQte = padRight('Qte', 7);
    const hdrPU = padRight('P.U', 6);
    const hdrTotal = padLeft('Total', 7);
    addText(`${hdrArticle}${hdrQte}${hdrPU}${hdrTotal}`);
    addText(line('.'));

    // Items
    let totalBoxes = 0;
    let totalProducts = 0;
    for (const item of data.items) {
      let qtyStr = String(item.quantity);
      if (item.giftQuantity && item.giftQuantity > 0) {
        const paid = item.quantity - item.giftQuantity;
        qtyStr = `${paid}+${item.giftQuantity}`;
      }

      const pricePart = padRight(String(Math.round(item.unitPrice)), 6);
      const totalPart = padLeft(String(Math.round(item.totalPrice)), 7);

      // Always print product name on its own line, then details below
      if (item.productName.length > 12) {
        addText(item.productName);
        addText(`${padRight('', 12)}${padRight(qtyStr, 7)}${pricePart}${totalPart}`);
      } else {
        addText(`${padRight(item.productName, 12)}${padRight(qtyStr, 7)}${pricePart}${totalPart}`);
      }

      if (item.giftQuantity && item.giftQuantity > 0) {
        addText(`  [PROMO: ${item.giftQuantity}]`);
      }
      if ((!item.giftQuantity || item.giftQuantity === 0) && item.giftPieces && item.giftPieces > 0) {
        addText(`  [PROMO: ${item.giftPieces} pcs]`);
      }

      totalBoxes += item.quantity;
      totalProducts++;
    }

    addText(line('-'));
    addText(`N COLLISAGE: ${totalBoxes}  NBR ART: ${totalProducts}`);
    addText(line('-'));

    // Totals
    add(ALIGN_CENTER);
    add(BOLD_ON);

    if (data.discountAmount > 0) {
      addText(`SOUS-TOTAL: ${formatAmount(data.totalAmount + data.discountAmount)} DA`);
      addText(`REMISE: -${formatAmount(data.discountAmount)} DA`);
    }

    addText(`NET A PAYER: ${formatAmount(data.totalAmount)} DA`);
    addText(line('-'));
    addText(`MONTANT PAYE: ${formatAmount(data.paidAmount)} DA`);
    addText(line('-'));

    if (data.remainingAmount > 0) {
      addText(`MONTANT RESTANT: ${formatAmount(data.remainingAmount)} DA`);
    } else {
      addText(`MONTANT RESTANT: 0.00 DA`);
    }

    add(BOLD_OFF);

  }

  if (data.notes) {
    add(ALIGN_LEFT);
    addText(line('-'));
    addText(`Note: ${data.notes}`);
  }

  // Footer
  add(ALIGN_CENTER);
  addText('');
  addText('Merci pour votre confiance');
  add(FEED_LINES(2));
  add(CUT_PAPER);

  // Concatenate all parts
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/**
 * Generate HTML preview of the receipt (for on-screen display)
 */
export function formatReceiptForPreview(data: ReceiptData): string {
  const typeName = getReceiptTypeName(data.receiptType);
  const dateStr = data.date.toLocaleDateString('fr-FR');
  const timeStr = data.date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  let itemsHtml = '';
  let totalBoxes = 0;
  for (const item of data.items) {
    let qtyStr = String(item.quantity);
    const badges: string[] = [];
    if (item.giftQuantity && item.giftQuantity > 0) {
      const paid = item.quantity - item.giftQuantity;
      qtyStr = `${paid}+${item.giftQuantity}`;
      badges.push('🎁 PROMO');
    }
    if ((!item.giftQuantity || item.giftQuantity === 0) && item.giftPieces && item.giftPieces > 0) {
      badges.push(`🎁 PROMO ${item.giftPieces} pcs`);
    }
    
    itemsHtml += `
      <tr>
        <td style="text-align:left;padding:2px 0;">${item.productName} ${badges.join(' ')}</td>
        <td style="text-align:center;">${qtyStr}</td>
        <td style="text-align:right;">${Math.round(item.unitPrice)}</td>
        <td style="text-align:right;">${Math.round(item.totalPrice).toLocaleString()}</td>
      </tr>`;
    totalBoxes += item.quantity;
  }

  const payLabel = getPaymentLabel(data);

  return `
    <div style="font-family:monospace;max-width:280px;margin:0 auto;font-size:12px;line-height:1.4;">
      <div style="text-align:center;margin-bottom:8px;">
        <div style="font-size:16px;font-weight:bold;">${data.companyName || 'Laser Food'}</div>
        <div>${data.workerName} N° ${String(data.receiptNumber).padStart(6, '0')}</div>
        ${data.companyAddress ? `<div>${data.companyAddress}</div>` : ''}
        <div>${dateStr} ${timeStr}</div>
        <div>CLIENT: ${data.customerName}</div>
        ${data.customerPhone ? `<div>TEL: ${data.customerPhone}</div>` : ''}
        ${data.printCount > 0 ? `<div style="color:#888;">(Copie ${data.printCount + 1})</div>` : ''}
        ${payLabel ? `<div style="font-weight:bold;margin-top:2px;">${payLabel}</div>` : ''}
      </div>
      <hr style="border:none;border-top:1px dashed #000;"/>
      ${data.receiptType === 'debt_payment' ? `
        <div style="text-align:center;font-weight:bold;">
          ${data.debtTotalAmount != null ? `<div>DETTE TOTALE: ${formatAmount(data.debtTotalAmount)} DA</div>` : ''}
          ${data.debtPaidBefore != null ? `<div>DEJA PAYE: ${formatAmount(data.debtPaidBefore)} DA</div>` : ''}
          <hr style="border:none;border-top:1px dashed #000;"/>
          <div style="color:#16a34a;">PAIEMENT: ${formatAmount(data.paidAmount)} DA</div>
          <hr style="border:none;border-top:1px dashed #000;"/>
          <div style="color:#dc2626;">RESTANT: ${formatAmount(data.remainingAmount)} DA</div>
        </div>
        ${data.collectorName ? `<div style="text-align:center;margin-top:4px;">COLLECTEUR: ${data.collectorName}</div>` : ''}
        ${data.paymentMethod ? `<div style="text-align:center;">Mode: ${{cash:'Especes',check:'Cheque',transfer:'Virement',receipt:'Recu'}[data.paymentMethod] || data.paymentMethod}</div>` : ''}
        ${data.nextCollectionDate ? `
          <hr style="border:none;border-top:1px dashed #000;"/>
          <div style="text-align:center;font-weight:bold;">PROCHAIN RDV: ${data.nextCollectionDate}${data.nextCollectionTime ? ' ' + data.nextCollectionTime : ''}</div>
        ` : ''}
      ` : `
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:1px dotted #000;">
              <th style="text-align:left;">Article</th>
              <th style="text-align:center;">Qte</th>
              <th style="text-align:right;">P.U</th>
              <th style="text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <hr style="border:none;border-top:1px dashed #000;"/>
        <div style="text-align:center;">
          <div>N COLLISAGE: ${totalBoxes} | NBR ART: ${data.items.length}</div>
        </div>
        <hr style="border:none;border-top:1px dashed #000;"/>
        <div style="text-align:center;font-weight:bold;">
          ${data.discountAmount > 0 ? `
            <div>SOUS-TOTAL: ${formatAmount(data.totalAmount + data.discountAmount)} DA</div>
            <div>REMISE: -${formatAmount(data.discountAmount)} DA</div>
          ` : ''}
          <div>NET A PAYER: ${formatAmount(data.totalAmount)} DA</div>
          <hr style="border:none;border-top:1px dashed #000;"/>
          <div>MONTANT PAYE: ${formatAmount(data.paidAmount)} DA</div>
          <hr style="border:none;border-top:1px dashed #000;"/>
          <div>MONTANT RESTANT: ${formatAmount(data.remainingAmount)} DA</div>
        </div>
        ${data.paymentMethod && !payLabel ? `<div style="text-align:center;">Mode: ${{cash:'Especes',check:'Cheque',transfer:'Virement',receipt:'Recu'}[data.paymentMethod] || data.paymentMethod}</div>` : ''}
      `}
      ${data.notes ? `<div style="text-align:left;margin-top:4px;">Note: ${data.notes}</div>` : ''}
      <div style="text-align:center;margin-top:8px;">
        <div>Merci pour votre confiance</div>
      </div>
    </div>`;
}
