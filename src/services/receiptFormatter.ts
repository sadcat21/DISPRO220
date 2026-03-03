/**
 * ESC/POS Receipt Formatter for 80mm thermal printers
 * Professional POS receipt design for distribution systems
 * Algerian accounting compliance (Facture 1/2, stamp tax, etc.)
 */

import { ReceiptItem, ReceiptType } from '@/types/receipt';

const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

// 80mm printer ≈ 42 chars per line (monospace)
const LINE_WIDTH = 42;

// --- Arabic to Latin transliteration ---
const ARABIC_TO_LATIN: Record<string, string> = {
  'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th',
  'ج': 'dj', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z',
  'س': 's', 'ش': 'ch', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'dh', 'ع': 'a',
  'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  'ه': 'h', 'و': 'ou', 'ي': 'i', 'ى': 'a', 'ة': 'a', 'ئ': 'i', 'ؤ': 'ou',
  'ء': '', 'ﻻ': 'la', 'ﻷ': 'la', 'ﻹ': 'li', 'ﻵ': 'la',
  '\u064B': '', '\u064C': '', '\u064D': '', '\u064E': '', '\u064F': '',
  '\u0650': '', '\u0651': '', '\u0652': '',
};

function transliterateArabic(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    result += ARABIC_TO_LATIN[char] !== undefined ? ARABIC_TO_LATIN[char] : char;
  }
  return result.replace(/\b\w/g, c => c.toUpperCase()).replace(/\s+/g, ' ').trim();
}

function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

function sanitizeForPrint(text: string): string {
  let result = hasArabic(text) ? transliterateArabic(text) : text;
  result = result.replace(/\u00A0/g, ' ').replace(/°/g, 'o');
  return result;
}

function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(sanitizeForPrint(text));
}

function cmd(...bytes: number[]): Uint8Array {
  return new Uint8Array(bytes);
}

// ESC/POS Commands
const INIT = cmd(ESC, 0x40);
const ALIGN_CENTER = cmd(ESC, 0x61, 0x01);
const ALIGN_LEFT = cmd(ESC, 0x61, 0x00);
const BOLD_ON = cmd(ESC, 0x45, 0x01);
const BOLD_OFF = cmd(ESC, 0x45, 0x00);
const DOUBLE_HEIGHT = cmd(GS, 0x21, 0x01);
const NORMAL_SIZE = cmd(GS, 0x21, 0x00);
const CUT_PAPER = cmd(GS, 0x56, 0x00);
const FEED_LINES = (n: number) => cmd(ESC, 0x64, n);

function padRight(str: string, len: number): string {
  return str.length >= len ? str.substring(0, len) : str + ' '.repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str.substring(0, len) : ' '.repeat(len - str.length) + str;
}

function centerText(str: string, width: number = LINE_WIDTH): string {
  if (str.length >= width) return str.substring(0, width);
  const pad = Math.floor((width - str.length) / 2);
  return ' '.repeat(pad) + str;
}

function separator(char: string = '-'): string {
  return char.repeat(LINE_WIDTH);
}

function doubleSeparator(): string {
  return '='.repeat(LINE_WIDTH);
}

function formatAmount(amount: number): string {
  const parts = amount.toFixed(2).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${intPart},${parts[1]}`;
}

function formatQty(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.0+$/, '').replace(/(\.[1-9]*)0+$/, '$1');
}

function getReceiptTypeName(type: ReceiptType): string {
  switch (type) {
    case 'direct_sale': return 'BON DE VENTE';
    case 'delivery': return 'BON DE LIVRAISON';
    case 'debt_payment': return 'RECU DE PAIEMENT';
    default: return 'BON';
  }
}

function getInvoiceType(data: ReceiptData): string {
  if (data.orderPaymentType === 'with_invoice') return 'Facture 1';
  if (data.orderPaymentType === 'without_invoice') return 'Facture 2 / Bon';
  return '';
}

function getPaymentLabel(data: ReceiptData): string | null {
  const parts: string[] = [];
  if (data.orderPaymentType === 'with_invoice') {
    const methodMap: Record<string, string> = { cash: 'Especes', check: 'Cheque', transfer: 'Virement', receipt: 'Versement' };
    const method = data.orderInvoicePaymentMethod ? (methodMap[data.orderInvoicePaymentMethod] || data.orderInvoicePaymentMethod) : '';
    parts.push(`F-1 : ${method}`.trim());
  } else if (data.orderPaymentType === 'without_invoice') {
    const subtypeMap: Record<string, string> = { super_gros: 'SG', gros: 'Gros', retail: 'Detail' };
    const sub = data.orderPriceSubtype ? (subtypeMap[data.orderPriceSubtype] || data.orderPriceSubtype) : '';
    parts.push(`F-2 : ${sub}`.trim());
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

function resolveGiftDisplay(item: ReceiptItem): { paidQuantity: number; giftBoxes: number; giftPieces: number } {
  const rawGiftBoxes = Math.max(0, Number(item.giftQuantity || 0));
  const rawGiftPieces = Math.max(0, Number(item.giftPieces || 0));
  const paidFromTotal = item.unitPrice > 0 ? Number((item.totalPrice / item.unitPrice).toFixed(3)) : null;
  const inferredGiftBoxes = paidFromTotal !== null ? Math.max(0, Number((item.quantity - paidFromTotal).toFixed(3))) : 0;

  const looksLikeGiftPiecesInGiftQuantity =
    rawGiftBoxes > 0 && rawGiftPieces === 0 && inferredGiftBoxes <= 0.001 && (item.piecesPerBox || 0) > 1;

  if (looksLikeGiftPiecesInGiftQuantity) {
    return { paidQuantity: paidFromTotal ?? item.quantity, giftBoxes: 0, giftPieces: rawGiftBoxes };
  }

  const giftBoxes = inferredGiftBoxes > 0.001 ? inferredGiftBoxes : rawGiftBoxes;
  const paidQuantity = paidFromTotal ?? Math.max(0, item.quantity - giftBoxes);
  return { paidQuantity, giftBoxes, giftPieces: rawGiftPieces };
}

function getUnitLabel(item: ReceiptItem): string {
  if (item.pricingUnit === 'kg') return 'KG';
  if (item.pricingUnit === 'unit' && item.piecesPerBox && item.piecesPerBox > 1) return 'PCS';
  return 'BTS';
}

function getUnitPrice(item: ReceiptItem): string {
  if (item.pricingUnit === 'kg' && item.weightPerBox && item.weightPerBox > 0) {
    const perKg = item.unitPrice / item.weightPerBox;
    return `${Math.round(perKg)}{${item.weightPerBox}kg}`;
  }
  if (item.pricingUnit === 'unit' && item.piecesPerBox && item.piecesPerBox > 1) {
    const perUnit = item.unitPrice / item.piecesPerBox;
    return `${Math.round(perUnit)}{${item.piecesPerBox}pcs}`;
  }
  return `${Math.round(item.unitPrice)}`;
}

// ─────────── Data Interfaces ───────────

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
  companyPhone?: string;
  // Payment/pricing info
  orderPaymentType?: string;
  orderPriceSubtype?: string;
  orderInvoicePaymentMethod?: string;
  // Stamp info
  stampAmount?: number;
  stampPercentage?: number;
  // Debt-specific fields
  debtTotalAmount?: number;
  debtPaidBefore?: number;
  collectorName?: string;
  nextCollectionDate?: string | null;
  nextCollectionTime?: string | null;
  // Advanced distribution features (optional toggles)
  advancedOptions?: AdvancedReceiptOptions;
}

export interface AdvancedReceiptOptions {
  showWorkerStockBeforeAfter?: boolean;
  showDeliveryStatus?: boolean;
  deliveryStatusValue?: 'full' | 'partial' | 'refused';
  showRouteCode?: boolean;
  routeCode?: string;
  showTruckId?: boolean;
  truckId?: string;
  showSessionId?: boolean;
  sessionId?: string;
  showAccountingLink?: boolean;
  accountingSessionId?: string;
  // Stock before/after data
  stockBefore?: Record<string, number>;
  stockAfter?: Record<string, number>;
}

// ─────────── THERMAL PRINT FORMAT ───────────

export function formatReceiptForPrint(data: ReceiptData): Uint8Array {
  const parts: Uint8Array[] = [];
  const add = (bytes: Uint8Array) => parts.push(bytes);
  const addText = (text: string) => { add(textToBytes(text)); add(cmd(LF)); };

  add(INIT);

  // ═══════ HEADER ═══════
  add(ALIGN_CENTER);
  add(BOLD_ON);
  add(DOUBLE_HEIGHT);
  addText(data.companyName || 'Laser Food');
  add(NORMAL_SIZE);
  add(BOLD_OFF);

  if (data.companyPhone) addText(`Tel: ${data.companyPhone}`);
  if (data.companyAddress) addText(data.companyAddress);
  addText('');

  // Receipt type
  add(BOLD_ON);
  addText(getReceiptTypeName(data.receiptType));
  add(BOLD_OFF);

  // Invoice type + number
  const payLabel = getPaymentLabel(data);
  const receiptNum = String(data.receiptNumber).padStart(6, '0');
  const invoiceType = getInvoiceType(data);
  if (payLabel) {
    add(BOLD_ON);
    addText(`${payLabel} - N: ${receiptNum}`);
    add(BOLD_OFF);
  } else {
    addText(`N: ${receiptNum}`);
  }
  if (invoiceType && !payLabel) {
    addText(invoiceType);
  }

  // Date & time
  const dateStr = data.date.toLocaleDateString('fr-FR');
  const timeStr = data.date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  addText(`Date: ${dateStr}  ${timeStr}`);

  // Seller
  const workerLine = data.workerPhone ? `Vendeur: ${data.workerName} | ${data.workerPhone}` : `Vendeur: ${data.workerName}`;
  addText(workerLine);

  // Print count
  if (data.printCount > 0) {
    addText(`(Copie ${data.printCount + 1})`);
  }

  addText(doubleSeparator());

  // ═══════ CLIENT SECTION ═══════
  add(ALIGN_LEFT);
  addText(`Client : ${data.customerName}`);
  if (data.customerPhone) addText(`Tel    : ${data.customerPhone}`);
  addText(separator());

  // ═══════ DEBT PAYMENT ═══════
  if (data.receiptType === 'debt_payment') {
    add(ALIGN_CENTER);
    add(BOLD_ON);
    if (data.debtTotalAmount != null) addText(`DETTE TOTALE  : ${formatAmount(data.debtTotalAmount)} DA`);
    if (data.debtPaidBefore != null) addText(`DEJA PAYE     : ${formatAmount(data.debtPaidBefore)} DA`);
    addText(separator());
    addText(`PAIEMENT      : ${formatAmount(data.paidAmount)} DA`);
    addText(separator());
    addText(`RESTANT       : ${formatAmount(data.remainingAmount)} DA`);
    add(BOLD_OFF);

    if (data.collectorName) addText(`Collecteur: ${data.collectorName}`);
    if (data.paymentMethod) {
      const ml: Record<string, string> = { cash: 'Especes', check: 'Cheque', transfer: 'Virement', receipt: 'Versement' };
      addText(`Mode: ${ml[data.paymentMethod] || data.paymentMethod}`);
    }
    if (data.nextCollectionDate) {
      addText(separator());
      addText(`PROCHAIN RDV: ${data.nextCollectionDate}${data.nextCollectionTime ? ' ' + data.nextCollectionTime : ''}`);
    }
  } else {
    // ═══════ ITEMS TABLE ═══════
    // Column header: Produit | QTE | Unite | Prix U | Total
    add(ALIGN_LEFT);
    add(BOLD_ON);
    addText(padRight('Produit', 14) + padLeft('QTE', 5) + padLeft('U', 4) + padLeft('PxU', 8) + padLeft('Total', 11));
    add(BOLD_OFF);
    addText(separator());

    let totalBoxes = 0;
    let totalProducts = 0;

    for (const item of data.items) {
      const { paidQuantity, giftBoxes, giftPieces } = resolveGiftDisplay(item);
      const unitLabel = getUnitLabel(item);
      const unitPrice = getUnitPrice(item);
      const totalStr = formatAmount(item.totalPrice);

      // Product name (truncate to fit)
      const nameStr = sanitizeForPrint(item.productName);
      const displayName = nameStr.length > 14 ? nameStr.substring(0, 13) + '.' : nameStr;

      let qtyStr = formatQty(item.quantity);

      addText(padRight(displayName, 14) + padLeft(qtyStr, 5) + padLeft(unitLabel, 4) + padLeft(unitPrice, 8) + padLeft(totalStr, 11));

      // Gift line
      if (giftBoxes > 0 || giftPieces > 0) {
        let giftStr = '  +CADEAU: ';
        if (giftBoxes > 0) giftStr += `${formatQty(giftBoxes)} BTS`;
        if (giftPieces > 0) giftStr += `${giftBoxes > 0 ? ' + ' : ''}${formatQty(giftPieces)} PCS`;
        addText(giftStr);
      }

      if (item.offerNote) {
        addText(`  ${sanitizeForPrint(item.offerNote)}`);
      }

      totalBoxes += item.quantity;
      totalProducts++;
    }

    addText(separator());
    addText(`Articles: ${totalProducts}  |  Collisage: ${formatQty(totalBoxes)}`);
    addText(doubleSeparator());

    // ═══════ TOTALS ═══════
    add(ALIGN_LEFT);
    if (data.discountAmount > 0) {
      addText(padRight('SOUS-TOTAL', 22) + padLeft(`${formatAmount(data.totalAmount + data.discountAmount - (data.stampAmount || 0))} DA`, 20));
      addText(padRight('REMISE', 22) + padLeft(`-${formatAmount(data.discountAmount)} DA`, 20));
    }

    if (data.stampAmount && data.stampAmount > 0) {
      const pct = data.stampPercentage ? ` (${data.stampPercentage}%)` : '';
      addText(padRight(`TIMBRE${pct}`, 22) + padLeft(`${formatAmount(data.stampAmount)} DA`, 20));
    }

    add(BOLD_ON);
    add(DOUBLE_HEIGHT);
    addText(padRight('NET A PAYER', 20) + padLeft(`${formatAmount(data.totalAmount)} DA`, 22));
    add(NORMAL_SIZE);
    add(BOLD_OFF);

    addText(separator());
    addText(padRight('MONTANT PAYE', 22) + padLeft(`${formatAmount(data.paidAmount)} DA`, 20));
    addText(padRight('RESTANT', 22) + padLeft(`${formatAmount(data.remainingAmount)} DA`, 20));
  }

  // ═══════ ADVANCED DISTRIBUTION SECTION ═══════
  const opts = data.advancedOptions;
  if (opts) {
    const hasAdvanced = opts.showDeliveryStatus || opts.showRouteCode || opts.showTruckId || opts.showSessionId;
    if (hasAdvanced) {
      addText(separator());
      add(ALIGN_LEFT);
      if (opts.showDeliveryStatus && opts.deliveryStatusValue) {
        const statusMap: Record<string, string> = { full: 'COMPLET', partial: 'PARTIEL', refused: 'REFUSE' };
        addText(`Livraison : ${statusMap[opts.deliveryStatusValue] || opts.deliveryStatusValue}`);
      }
      if (opts.showRouteCode && opts.routeCode) addText(`Route     : ${opts.routeCode}`);
      if (opts.showTruckId && opts.truckId) addText(`Camion    : ${opts.truckId}`);
      if (opts.showSessionId && opts.sessionId) addText(`Session   : ${opts.sessionId}`);
    }

    // Stock before/after
    if (opts.showWorkerStockBeforeAfter && opts.stockBefore && opts.stockAfter) {
      addText(separator());
      addText(centerText('--- STOCK VENDEUR ---'));
      addText(padRight('Produit', 18) + padLeft('Avant', 8) + padLeft('Apres', 8) + padLeft('Diff', 8));
      for (const [productId, before] of Object.entries(opts.stockBefore)) {
        const after = opts.stockAfter[productId] ?? before;
        const diff = after - before;
        const item = data.items.find(i => i.productId === productId);
        const name = item ? sanitizeForPrint(item.productName).substring(0, 16) : productId.substring(0, 16);
        addText(padRight(name, 18) + padLeft(String(before), 8) + padLeft(String(after), 8) + padLeft(String(diff), 8));
      }
    }
  }

  // ═══════ NOTES ═══════
  if (data.notes) {
    add(ALIGN_LEFT);
    addText(separator());
    addText(`Note: ${sanitizeForPrint(data.notes)}`);
  }

  // ═══════ FOOTER ═══════
  add(ALIGN_CENTER);
  addText('');
  addText(separator());

  // Signatures
  add(ALIGN_LEFT);
  addText(padRight('Vendeur:', 21) + padRight('Client:', 21));
  addText('');
  addText(padRight('___________', 21) + padRight('___________', 21));
  addText('');

  add(ALIGN_CENTER);
  addText('Merci pour votre confiance');
  addText('Retour sous 48h avec bon d\'achat');

  add(FEED_LINES(3));
  add(CUT_PAPER);

  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

// ─────────── HTML PREVIEW FORMAT ───────────

export function formatReceiptForPreview(data: ReceiptData): string {
  const typeName = getReceiptTypeName(data.receiptType);
  const dateStr = data.date.toLocaleDateString('fr-FR');
  const timeStr = data.date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const payLabel = getPaymentLabel(data);
  const receiptNum = String(data.receiptNumber).padStart(6, '0');
  const invoiceType = getInvoiceType(data);

  // ── Items table rows ──
  let itemsHtml = '';
  let totalBoxes = 0;
  let totalProducts = 0;

  for (const item of data.items) {
    const { paidQuantity, giftBoxes, giftPieces } = resolveGiftDisplay(item);
    const unitLabel = getUnitLabel(item);
    const unitPrice = getUnitPrice(item);

    let giftHtml = '';
    if (giftBoxes > 0 || giftPieces > 0) {
      let giftText = '';
      if (giftBoxes > 0) giftText += `${formatQty(giftBoxes)} BTS`;
      if (giftPieces > 0) giftText += `${giftBoxes > 0 ? ' + ' : ''}${formatQty(giftPieces)} PCS`;
      giftHtml = `<div style="color:#16a34a;font-size:9px;text-align:center;">🎁 +CADEAU: ${giftText}</div>`;
    }

    const noteHtml = item.offerNote ? `<div style="font-size:8px;color:#d97706;padding-left:4px;">${item.offerNote}</div>` : '';

    itemsHtml += `
      <tr style="border-bottom:1px dotted #ddd;">
        <td style="padding:3px 2px;font-size:10px;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.productName}</td>
        <td style="text-align:center;font-size:10px;padding:3px 1px;">${formatQty(item.quantity)}</td>
        <td style="text-align:center;font-size:9px;padding:3px 1px;">${unitLabel}</td>
        <td style="text-align:right;font-size:10px;padding:3px 1px;">${unitPrice}</td>
        <td style="text-align:right;font-size:10px;font-weight:bold;padding:3px 2px;">${Math.round(item.totalPrice).toLocaleString()}</td>
      </tr>
      ${(giftHtml || noteHtml) ? `<tr><td colspan="5">${giftHtml}${noteHtml}</td></tr>` : ''}`;

    totalBoxes += item.quantity;
    totalProducts++;
  }

  // ── Advanced distribution section ──
  let advancedHtml = '';
  const opts = data.advancedOptions;
  if (opts) {
    const advRows: string[] = [];
    if (opts.showDeliveryStatus && opts.deliveryStatusValue) {
      const sm: Record<string, string> = { full: '✅ Complet', partial: '⚠️ Partiel', refused: '❌ Refusé' };
      advRows.push(`<div>Livraison: <strong>${sm[opts.deliveryStatusValue] || opts.deliveryStatusValue}</strong></div>`);
    }
    if (opts.showRouteCode && opts.routeCode) advRows.push(`<div>Route: <strong>${opts.routeCode}</strong></div>`);
    if (opts.showTruckId && opts.truckId) advRows.push(`<div>Camion: <strong>${opts.truckId}</strong></div>`);
    if (opts.showSessionId && opts.sessionId) advRows.push(`<div>Session: <strong>${opts.sessionId}</strong></div>`);

    if (advRows.length > 0) {
      advancedHtml = `
        <div style="border-top:1px dashed #999;margin-top:6px;padding-top:4px;font-size:9px;color:#555;">
          ${advRows.join('')}
        </div>`;
    }

    if (opts.showWorkerStockBeforeAfter && opts.stockBefore && opts.stockAfter) {
      let stockRows = '';
      for (const [productId, before] of Object.entries(opts.stockBefore)) {
        const after = opts.stockAfter[productId] ?? before;
        const diff = after - before;
        const it = data.items.find(i => i.productId === productId);
        const name = it ? it.productName : productId.substring(0, 16);
        const diffColor = diff < 0 ? '#dc2626' : diff > 0 ? '#16a34a' : '#666';
        stockRows += `<tr><td style="font-size:9px;">${name}</td><td style="text-align:center;font-size:9px;">${before}</td><td style="text-align:center;font-size:9px;">${after}</td><td style="text-align:center;font-size:9px;color:${diffColor};">${diff}</td></tr>`;
      }
      advancedHtml += `
        <div style="border-top:1px dashed #999;margin-top:4px;padding-top:4px;">
          <div style="text-align:center;font-size:9px;font-weight:bold;margin-bottom:2px;">STOCK VENDEUR</div>
          <table style="width:100%;border-collapse:collapse;font-size:9px;">
            <tr style="border-bottom:1px solid #ccc;"><th>Produit</th><th>Avant</th><th>Après</th><th>Diff</th></tr>
            ${stockRows}
          </table>
        </div>`;
    }
  }

  // ── Debt payment ──
  if (data.receiptType === 'debt_payment') {
    const methodLabels: Record<string, string> = { cash: 'Espèces', check: 'Chèque', transfer: 'Virement', receipt: 'Versement' };
    return `
      <div style="font-family:'Courier New',monospace;max-width:300px;margin:0 auto;font-size:11px;line-height:1.4;color:#1a1a1a;">
        <!-- Header -->
        <div style="text-align:center;padding-bottom:6px;">
          <div style="font-size:16px;font-weight:bold;letter-spacing:1px;">${data.companyName || 'Laser Food'}</div>
          ${data.companyPhone ? `<div style="font-size:10px;">Tel: ${data.companyPhone}</div>` : ''}
          ${data.companyAddress ? `<div style="font-size:10px;">${data.companyAddress}</div>` : ''}
          <div style="font-size:12px;font-weight:bold;margin-top:4px;padding:2px;background:#f0f0f0;">${typeName}</div>
          <div style="font-size:10px;margin-top:2px;">N: ${receiptNum} | ${dateStr} ${timeStr}</div>
          <div style="font-size:10px;">Vendeur: ${data.workerName}${data.workerPhone ? ' | ' + data.workerPhone : ''}</div>
          ${data.printCount > 0 ? `<div style="font-size:9px;color:#888;">(Copie ${data.printCount + 1})</div>` : ''}
        </div>
        <div style="border-top:2px solid #000;border-bottom:1px dashed #000;padding:4px 0;margin-bottom:4px;">
          <div>Client: <strong>${data.customerName}</strong></div>
          ${data.customerPhone ? `<div>Tel: ${data.customerPhone}</div>` : ''}
        </div>
        <div style="text-align:center;font-weight:bold;padding:6px 0;">
          ${data.debtTotalAmount != null ? `<div>DETTE TOTALE: ${formatAmount(data.debtTotalAmount)} DA</div>` : ''}
          ${data.debtPaidBefore != null ? `<div>DÉJÀ PAYÉ: ${formatAmount(data.debtPaidBefore)} DA</div>` : ''}
          <div style="border-top:1px dashed #000;margin:4px 0;padding-top:4px;color:#16a34a;font-size:13px;">PAIEMENT: ${formatAmount(data.paidAmount)} DA</div>
          <div style="border-top:1px dashed #000;margin:4px 0;padding-top:4px;color:#dc2626;font-size:13px;">RESTANT: ${formatAmount(data.remainingAmount)} DA</div>
        </div>
        ${data.collectorName ? `<div style="text-align:center;">Collecteur: ${data.collectorName}</div>` : ''}
        ${data.paymentMethod ? `<div style="text-align:center;">Mode: ${methodLabels[data.paymentMethod] || data.paymentMethod}</div>` : ''}
        ${data.nextCollectionDate ? `<div style="border-top:1px dashed #000;margin-top:4px;padding-top:4px;text-align:center;font-weight:bold;">PROCHAIN RDV: ${data.nextCollectionDate}${data.nextCollectionTime ? ' ' + data.nextCollectionTime : ''}</div>` : ''}
        ${data.notes ? `<div style="border-top:1px dashed #000;margin-top:4px;padding-top:4px;">Note: ${data.notes}</div>` : ''}
        ${advancedHtml}
        <div style="border-top:2px solid #000;margin-top:8px;padding-top:6px;">
          <div style="display:flex;justify-content:space-between;font-size:9px;"><span>Vendeur: ___________</span><span>Client: ___________</span></div>
        </div>
        <div style="text-align:center;margin-top:8px;font-size:10px;color:#555;">Merci pour votre confiance</div>
      </div>`;
  }

  // ── SALE / DELIVERY RECEIPT ──
  return `
    <div style="font-family:'Courier New',monospace;max-width:300px;margin:0 auto;font-size:11px;line-height:1.4;color:#1a1a1a;">
      <!-- Header -->
      <div style="text-align:center;padding-bottom:6px;">
        <div style="font-size:16px;font-weight:bold;letter-spacing:1px;">${data.companyName || 'Laser Food'}</div>
        ${data.companyPhone ? `<div style="font-size:10px;">Tel: ${data.companyPhone}</div>` : ''}
        ${data.companyAddress ? `<div style="font-size:10px;">${data.companyAddress}</div>` : ''}
        <div style="font-size:12px;font-weight:bold;margin-top:4px;padding:2px;background:#f0f0f0;">${typeName}</div>
        ${payLabel ? `<div style="font-size:11px;font-weight:bold;margin-top:2px;">${payLabel} - N: ${receiptNum}</div>` : `<div style="font-size:10px;margin-top:2px;">N: ${receiptNum}</div>`}
        ${invoiceType && !payLabel ? `<div style="font-size:10px;color:#666;">${invoiceType}</div>` : ''}
        <div style="font-size:10px;">${dateStr}  ${timeStr}</div>
        <div style="font-size:10px;">Vendeur: ${data.workerName}${data.workerPhone ? ' | ' + data.workerPhone : ''}</div>
        ${data.printCount > 0 ? `<div style="font-size:9px;color:#888;">(Copie ${data.printCount + 1})</div>` : ''}
      </div>

      <!-- Client -->
      <div style="border-top:2px solid #000;border-bottom:1px dashed #000;padding:4px 0;margin-bottom:4px;">
        <div>Client: <strong>${data.customerName}</strong></div>
        ${data.customerPhone ? `<div>Tel: ${data.customerPhone}</div>` : ''}
      </div>

      <!-- Items Table -->
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:2px solid #000;font-size:9px;font-weight:bold;">
            <th style="text-align:left;padding:2px;">Produit</th>
            <th style="text-align:center;padding:2px;">QTE</th>
            <th style="text-align:center;padding:2px;">U</th>
            <th style="text-align:right;padding:2px;">PxU</th>
            <th style="text-align:right;padding:2px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <!-- Article count -->
      <div style="border-top:1px dashed #000;padding:3px 0;font-size:10px;text-align:center;">
        Articles: ${totalProducts}  |  Collisage: ${formatQty(totalBoxes)}
      </div>

      <!-- Totals -->
      <div style="border-top:2px solid #000;padding:4px 0;">
        ${data.discountAmount > 0 ? `
          <div style="display:flex;justify-content:space-between;font-size:10px;"><span>SOUS-TOTAL</span><span>${formatAmount(data.totalAmount + data.discountAmount - (data.stampAmount || 0))} DA</span></div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:#dc2626;"><span>REMISE</span><span>-${formatAmount(data.discountAmount)} DA</span></div>
        ` : ''}
        ${data.stampAmount && data.stampAmount > 0 ? `
          <div style="display:flex;justify-content:space-between;font-size:10px;color:#d97706;"><span>TIMBRE${data.stampPercentage ? ` (${data.stampPercentage}%)` : ''}</span><span>${formatAmount(data.stampAmount)} DA</span></div>
        ` : ''}
        <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:13px;padding:4px 0;border-top:1px dashed #000;border-bottom:1px dashed #000;margin:3px 0;background:#f5f5f5;">
          <span>NET A PAYER</span><span>${formatAmount(data.totalAmount)} DA</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;padding:2px 0;"><span>MONTANT PAYÉ</span><span>${formatAmount(data.paidAmount)} DA</span></div>
        <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:bold;padding:2px 0;${data.remainingAmount > 0 ? 'color:#dc2626;' : ''}"><span>RESTANT</span><span>${formatAmount(data.remainingAmount)} DA</span></div>
      </div>

      ${data.paymentMethod && !payLabel ? `<div style="text-align:center;font-size:10px;padding:2px 0;">Mode: ${{ cash: 'Espèces', check: 'Chèque', transfer: 'Virement', receipt: 'Versement' }[data.paymentMethod] || data.paymentMethod}</div>` : ''}
      ${data.notes ? `<div style="border-top:1px dashed #000;padding-top:4px;font-size:10px;">Note: ${data.notes}</div>` : ''}

      ${advancedHtml}

      <!-- Footer -->
      <div style="border-top:2px solid #000;margin-top:8px;padding-top:6px;">
        <div style="display:flex;justify-content:space-between;font-size:9px;"><span>Vendeur: ___________</span><span>Client: ___________</span></div>
      </div>
      <div style="text-align:center;margin-top:8px;font-size:10px;color:#555;">
        <div>Merci pour votre confiance</div>
        <div style="font-size:8px;margin-top:2px;">Retour sous 48h avec bon d'achat</div>
      </div>
    </div>`;
}
