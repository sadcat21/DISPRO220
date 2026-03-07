import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Printer, Package, Bluetooth } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import logoImage from '@/assets/logo.png';
import { useBluetoothPrinter } from '@/hooks/useBluetoothPrinter';

interface SessionPrintViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  workerName: string;
}

interface SessionData {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  notes: string | null;
  worker_id: string;
  manager: { full_name: string } | null;
  worker: { full_name: string } | null;
}

interface SessionItem {
  id: string;
  product_id: string;
  quantity: number;
  gift_quantity: number;
  gift_unit: string | null;
  previous_quantity: number;
  surplus_quantity: number;
  notes: string | null;
  product: { name: string; pieces_per_box: number } | null;
}

// Extended stock info per product for load sessions
interface ProductStockInfo {
  currentStock: number; // الكلي (worker_stock quantity)
  loadedLastSession: number; // شحن (previous + qty + gift from last session)
  loadedSinceAccounting: number; // بدون محاسبة
  pendingOrders: number; // طلبات
}

const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;
const LINE_WIDTH = 32;

function cmd(...bytes: number[]): Uint8Array { return new Uint8Array(bytes); }
const INIT = cmd(ESC, 0x40);
const ALIGN_CENTER = cmd(ESC, 0x61, 0x01);
const ALIGN_LEFT = cmd(ESC, 0x61, 0x00);
const BOLD_ON = cmd(ESC, 0x45, 0x01);
const BOLD_OFF = cmd(ESC, 0x45, 0x00);
const DOUBLE_HEIGHT = cmd(GS, 0x21, 0x01);
const NORMAL_SIZE = cmd(GS, 0x21, 0x00);
const CUT_PAPER = cmd(GS, 0x56, 0x00);
const FEED_LINES = (n: number) => cmd(ESC, 0x64, n);

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

function transliterate(text: string): string {
  let r = '';
  for (const c of text) r += ARABIC_TO_LATIN[c] !== undefined ? ARABIC_TO_LATIN[c] : c;
  return r.replace(/\b\w/g, c => c.toUpperCase()).replace(/\s+/g, ' ').trim();
}

function sanitize(text: string): string {
  return /[\u0600-\u06FF]/.test(text) ? transliterate(text) : text;
}

function textToBytes(t: string): Uint8Array { return new TextEncoder().encode(sanitize(t)); }
function padRight(s: string, n: number) { return s.length >= n ? s.substring(0, n) : s + ' '.repeat(n - s.length); }
function padLeft(s: string, n: number) { return s.length >= n ? s.substring(0, n) : ' '.repeat(n - s.length) + s; }
function centerText(s: string, w = LINE_WIDTH) { const p = Math.max(0, Math.floor((w - s.length) / 2)); return ' '.repeat(p) + s; }
function separator(c = '-') { return c.repeat(LINE_WIDTH); }

const SessionPrintView: React.FC<SessionPrintViewProps> = ({
  open, onOpenChange, sessionId, workerName,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [session, setSession] = useState<SessionData | null>(null);
  const [items, setItems] = useState<SessionItem[]>([]);
  const [discrepancies, setDiscrepancies] = useState<any[]>([]);
  const [stockInfo, setStockInfo] = useState<Record<string, ProductStockInfo>>({});
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const { isConnected, scanAndConnect, status: printerStatus } = useBluetoothPrinter();
  const [isThermalPrinting, setIsThermalPrinting] = useState(false);

  useEffect(() => {
    const div = document.createElement('div');
    div.id = 'session-print-portal';
    document.body.appendChild(div);
    setContainer(div);
    return () => { document.body.removeChild(div); };
  }, []);

  useEffect(() => {
    if (!open || !sessionId) return;
    fetchData();
  }, [open, sessionId]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [sessionRes, itemsRes] = await Promise.all([
        supabase.from('loading_sessions').select(`
          id, status, created_at, completed_at, notes, worker_id,
          manager:workers!loading_sessions_manager_id_fkey(full_name),
          worker:workers!loading_sessions_worker_id_fkey(full_name)
        `).eq('id', sessionId).single(),
        supabase.from('loading_session_items').select(`
          id, product_id, quantity, gift_quantity, gift_unit, previous_quantity, surplus_quantity, notes,
          product:products(name, pieces_per_box)
        `).eq('session_id', sessionId).order('created_at', { ascending: true }),
      ]);

      const s = sessionRes.data as unknown as SessionData;
      const itemsList = (itemsRes.data || []) as unknown as SessionItem[];
      setSession(s);
      setItems(itemsList);

      if (s?.status === 'review') {
        const { data: discData } = await supabase
          .from('stock_discrepancies')
          .select('id, product_id, discrepancy_type, quantity, product:products(name)')
          .eq('source_session_id', sessionId);
        setDiscrepancies(discData || []);
      } else {
        setDiscrepancies([]);
      }

      // For load sessions, fetch extra stock info
      const isLoad = s && (s.status === 'open' || s.status === 'completed');
      if (isLoad && s.worker_id) {
        await fetchStockInfo(s.worker_id, itemsList);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStockInfo = async (wId: string, sessionItems: SessionItem[]) => {
    try {
      const productIds = sessionItems.map(i => i.product_id);
      if (productIds.length === 0) return;

      // Fetch in parallel: worker_stock, pending orders, last accounting date
      const [stockRes, ordersRes, accountingRes] = await Promise.all([
        supabase.from('worker_stock').select('product_id, quantity').eq('worker_id', wId).in('product_id', productIds),
        supabase.from('orders').select('order_items(product_id, quantity)')
          .eq('assigned_worker_id', wId)
          .in('status', ['pending', 'assigned', 'in_progress']),
        supabase.from('accounting_sessions').select('completed_at')
          .eq('worker_id', wId).eq('status', 'completed')
          .order('completed_at', { ascending: false }).limit(1).maybeSingle(),
      ]);

      // Current stock
      const currentStockMap: Record<string, number> = {};
      for (const ws of (stockRes.data || [])) {
        currentStockMap[ws.product_id] = ws.quantity || 0;
      }

      // Pending orders
      const pendingMap: Record<string, number> = {};
      for (const order of (ordersRes.data || [])) {
        for (const oi of ((order as any).order_items || [])) {
          pendingMap[oi.product_id] = (pendingMap[oi.product_id] || 0) + (oi.quantity || 0);
        }
      }

      // Loaded since last accounting
      const sinceDate = accountingRes.data?.completed_at || null;
      let sessionsQ = supabase.from('loading_sessions').select('id')
        .eq('worker_id', wId).in('status', ['completed', 'open']);
      if (sinceDate) sessionsQ = sessionsQ.gte('created_at', sinceDate);
      const { data: loadSessions } = await sessionsQ;

      const sinceAccountingMap: Record<string, number> = {};
      if (loadSessions && loadSessions.length > 0) {
        const sIds = loadSessions.map(ls => ls.id);
        const { data: allItems } = await supabase.from('loading_session_items')
          .select('product_id, quantity, gift_quantity').in('session_id', sIds);
        for (const item of (allItems || [])) {
          sinceAccountingMap[item.product_id] = (sinceAccountingMap[item.product_id] || 0) + (item.quantity || 0) + (item.gift_quantity || 0);
        }
      }

      // Build info map
      const info: Record<string, ProductStockInfo> = {};
      for (const pid of productIds) {
        const si = sessionItems.find(i => i.product_id === pid);
        // "شحن" = previous_quantity + quantity + gift from this session (total loaded including prior)
        const loaded = si ? (si.previous_quantity || 0) + si.quantity + (si.gift_quantity || 0) : 0;
        info[pid] = {
          currentStock: currentStockMap[pid] || 0,
          loadedLastSession: loaded,
          loadedSinceAccounting: sinceAccountingMap[pid] || 0,
          pendingOrders: pendingMap[pid] || 0,
        };
      }
      setStockInfo(info);
    } catch (err) {
      console.error('Error fetching stock info:', err);
    }
  };

  const getSessionTitle = () => {
    if (!session) return 'جلسة';
    switch (session.status) {
      case 'open': case 'completed': return 'كشف الشحن';
      case 'unloaded': return 'كشف التفريغ';
      case 'review': return 'كشف المراجعة';
      case 'exchange': return 'كشف الاستبدال';
      default: return 'كشف الجلسة';
    }
  };

  const getSessionTitleFr = () => {
    if (!session) return '';
    switch (session.status) {
      case 'open': case 'completed': return 'Fiche de Chargement';
      case 'unloaded': return 'Fiche de Dechargement';
      case 'review': return 'Fiche de Verification';
      case 'exchange': return "Fiche d'Echange";
      default: return 'Fiche de Session';
    }
  };

  const isReview = session?.status === 'review';
  const isUnload = session?.status === 'unloaded';
  const isLoad = session?.status === 'open' || session?.status === 'completed';

  const handlePrint = () => { window.print(); };

  const fmtQty = (n: number) => {
    const rounded = Math.round(n * 100) / 100;
    return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  };

  // Thermal 48mm print
  const handleThermalPrint = async () => {
    if (!session || items.length === 0) return;

    let connected = isConnected;
    if (!connected) {
      connected = await scanAndConnect();
      if (!connected) return;
    }

    setIsThermalPrinting(true);
    try {
      const parts: Uint8Array[] = [INIT];

      // Header
      parts.push(ALIGN_CENTER, DOUBLE_HEIGHT);
      parts.push(textToBytes(centerText(getSessionTitleFr())));
      parts.push(cmd(LF));
      parts.push(NORMAL_SIZE);
      parts.push(textToBytes(centerText(getSessionTitle())));
      parts.push(cmd(LF));
      parts.push(textToBytes(separator('=')));
      parts.push(cmd(LF));

      // Worker + date
      parts.push(ALIGN_LEFT);
      const wName = sanitize(session.worker?.full_name || workerName);
      parts.push(textToBytes(padRight(wName, LINE_WIDTH)));
      parts.push(cmd(LF));
      parts.push(textToBytes(padRight(format(new Date(session.created_at), 'dd/MM/yyyy HH:mm'), LINE_WIDTH)));
      parts.push(cmd(LF));
      parts.push(textToBytes(separator()));
      parts.push(cmd(LF));

      if (isLoad) {
        // Load session: print each product with all fields in 2-line format
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const pName = sanitize(item.product?.name || '---');
          const info = stockInfo[item.product_id];

          // Line 1: N° + Product name (bold)
          parts.push(BOLD_ON);
          parts.push(textToBytes(`${i + 1}. ${pName}`));
          parts.push(cmd(LF));
          parts.push(BOLD_OFF);

          // Line 2: Prev -> Loaded = Total
          const prev = fmtQty(item.previous_quantity || 0);
          const loaded = fmtQty(item.quantity);
          const gift = item.gift_quantity > 0 ? fmtQty(item.gift_quantity) : '';
          const total = info ? fmtQty(info.currentStock) : fmtQty((item.previous_quantity || 0) + item.quantity + (item.gift_quantity || 0));

          parts.push(textToBytes(`Prec:${padLeft(prev, 4)} Charg:${padLeft(loaded, 4)} Tot:${padLeft(total, 4)}`));
          parts.push(cmd(LF));

          // Line 3: Orders, Surplus, Sans compta
          if (info) {
            const orders = fmtQty(info.pendingOrders);
            const surplus = fmtQty(Math.max(0, info.currentStock - info.pendingOrders));
            const noAcc = fmtQty(info.loadedSinceAccounting);
            parts.push(textToBytes(`Cmd:${padLeft(orders, 4)} Surp:${padLeft(surplus, 4)} SC:${padLeft(noAcc, 4)}`));
            parts.push(cmd(LF));
          }

          // Gift line if any
          if (gift) {
            parts.push(textToBytes(`+PROMO: ${gift} ${item.gift_unit === 'box' ? 'BOX' : 'PCS'}`));
            parts.push(cmd(LF));
          }

          parts.push(textToBytes(separator('.')));
          parts.push(cmd(LF));
        }
      } else {
        // Review/Unload: simple table format
        // Header
        parts.push(BOLD_ON);
        if (isReview) {
          parts.push(textToBytes(padRight('Produit', 14) + padLeft('Sys', 5) + padLeft('Reel', 5) + padLeft('Diff', 5)));
        } else if (isUnload) {
          parts.push(textToBytes(padRight('Produit', 14) + padLeft('Prec', 6) + padLeft('Ret', 6) + padLeft('Surp', 6)));
        } else {
          parts.push(textToBytes(padRight('Produit', 14) + padLeft('Prec', 6) + padLeft('Charg', 6) + padLeft('Cad', 6)));
        }
        parts.push(cmd(LF));
        parts.push(BOLD_OFF);
        parts.push(textToBytes(separator()));
        parts.push(cmd(LF));

        if (isReview) {
          for (const disc of discrepancies) {
            const item = items.find(i => i.product_id === disc.product_id);
            const name = sanitize(disc.product?.name || '---').substring(0, 14);
            const sys = item ? fmtQty(item.previous_quantity || 0) : '-';
            const real = item ? fmtQty(item.quantity || 0) : '-';
            const diff = (disc.discrepancy_type === 'deficit' ? '-' : '+') + fmtQty(disc.quantity);
            parts.push(textToBytes(padRight(name, 14) + padLeft(sys, 5) + padLeft(real, 5) + padLeft(diff, 5)));
            parts.push(cmd(LF));
          }
          const matchedItems = items.filter(item => !new Set(discrepancies.map((d: any) => d.product_id)).has(item.product_id));
          for (const item of matchedItems) {
            const name = sanitize(item.product?.name || '---').substring(0, 14);
            parts.push(textToBytes(padRight(name, 14) + padLeft(fmtQty(item.previous_quantity || 0), 5) + padLeft(fmtQty(item.quantity || 0), 5) + padLeft('OK', 5)));
            parts.push(cmd(LF));
          }
        } else {
          for (const item of items) {
            const name = sanitize(item.product?.name || '---').substring(0, 14);
            const prev = fmtQty(item.previous_quantity || 0);
            const qty = fmtQty(item.quantity);
            const extra = isUnload ? fmtQty(item.surplus_quantity || 0) : (item.gift_quantity > 0 ? fmtQty(item.gift_quantity) : '-');
            parts.push(textToBytes(padRight(name, 14) + padLeft(prev, 6) + padLeft(qty, 6) + padLeft(extra, 6)));
            parts.push(cmd(LF));
          }
        }
      }

      // Footer
      parts.push(textToBytes(separator('=')));
      parts.push(cmd(LF));
      parts.push(ALIGN_CENTER);
      parts.push(textToBytes(`Produits: ${items.length}`));
      parts.push(cmd(LF));
      parts.push(textToBytes(format(new Date(), 'dd/MM/yyyy HH:mm')));
      parts.push(cmd(LF));
      parts.push(textToBytes('Laser Food'));
      parts.push(FEED_LINES(4));
      parts.push(CUT_PAPER);

      // Combine and print
      const totalLen = parts.reduce((s, p) => s + p.length, 0);
      const result = new Uint8Array(totalLen);
      let offset = 0;
      for (const p of parts) { result.set(p, offset); offset += p.length; }

      const { bluetoothPrinter } = await import('@/services/bluetoothPrinter');
      await bluetoothPrinter.print(result);
      const { toast } = await import('sonner');
      toast.success('تمت الطباعة الحرارية بنجاح');
    } catch (err: any) {
      const { toast } = await import('sonner');
      toast.error('فشل الطباعة: ' + (err.message || ''));
    } finally {
      setIsThermalPrinting(false);
    }
  };

  // For review: merge discrepancies with items
  const discrepancyProductIds = new Set(discrepancies.map((d: any) => d.product_id));
  const matchedItems = items.filter(item => !discrepancyProductIds.has(item.product_id));

  const printContent = session && (
    <div ref={printRef} className="print-container" dir="rtl" style={{ display: 'none' }}>
      <div style={{ position: 'fixed', top: '45%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 0, opacity: 0.15, pointerEvents: 'none' }}>
        <img src={logoImage} alt="" style={{ width: '280px', height: 'auto' }} />
      </div>

      <div className="print-header-with-logo" style={{ position: 'relative', zIndex: 1 }}>
        <div className="print-logo"><img src={logoImage} alt="Logo" /></div>
        <div className="print-title-section">
          <h1>{getSessionTitleFr()}</h1>
          <p style={{ fontSize: '11pt', fontWeight: 600, marginTop: '4px' }}>{getSessionTitle()}</p>
        </div>
        <div className="print-logo"><img src={logoImage} alt="Logo" /></div>
      </div>

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', margin: '8px 0', fontSize: '9pt' }}>
        <div><strong>العامل:</strong> {session.worker?.full_name || workerName} {' | '} <strong>المدير:</strong> {session.manager?.full_name || '—'}</div>
        <div><strong>التاريخ:</strong> {format(new Date(session.created_at), 'dd/MM/yyyy HH:mm')}</div>
      </div>

      <table className="word-table" style={{ position: 'relative', zIndex: 1 }}>
        <thead>
          <tr>
            <th style={{ width: '30px' }}>N°</th>
            <th>المنتج / Produit</th>
            {isReview ? (
              <>
                <th style={{ width: '70px' }}>رصيد النظام</th>
                <th style={{ width: '70px' }}>الكمية الفعلية</th>
                <th style={{ width: '60px' }}>الحالة</th>
                <th style={{ width: '60px' }}>الفارق</th>
              </>
            ) : isUnload ? (
              <>
                <th style={{ width: '70px' }}>الرصيد السابق</th>
                <th style={{ width: '70px' }}>المُرجع</th>
                <th style={{ width: '60px' }}>الفائض</th>
              </>
            ) : (
              <>
                <th style={{ width: '50px' }}>سابق</th>
                <th style={{ width: '50px' }}>مشحون</th>
                <th style={{ width: '50px' }}>هدايا</th>
                <th style={{ width: '50px' }}>الكلي</th>
                <th style={{ width: '50px' }}>طلبات</th>
                <th style={{ width: '50px' }}>فائض</th>
                <th style={{ width: '55px' }}>بدون محاسبة</th>
              </>
            )}
            <th style={{ width: '70px' }}>ملاحظات</th>
          </tr>
        </thead>
        <tbody>
          {isReview ? (
            <>
              {discrepancies.map((disc: any, idx: number) => {
                const item = items.find(i => i.product_id === disc.product_id);
                return (
                  <tr key={disc.id}>
                    <td className="center">{idx + 1}</td>
                    <td>{disc.product?.name || '—'}</td>
                    <td className="center">{item ? fmtQty(item.previous_quantity || 0) : '—'}</td>
                    <td className="center bold">{item ? fmtQty(item.quantity || 0) : '—'}</td>
                    <td className="center" style={{ fontWeight: 'bold', color: disc.discrepancy_type === 'deficit' ? '#c00' : '#e65100' }}>
                      {disc.discrepancy_type === 'deficit' ? 'عجز' : 'فائض'}
                    </td>
                    <td className="center bold" style={{ color: disc.discrepancy_type === 'deficit' ? '#c00' : '#e65100' }}>{fmtQty(disc.quantity)}</td>
                    <td className="small-text">{item?.notes || ''}</td>
                  </tr>
                );
              })}
              {matchedItems.map((item, idx) => (
                <tr key={item.id}>
                  <td className="center">{discrepancies.length + idx + 1}</td>
                  <td>{item.product?.name || '—'}</td>
                  <td className="center">{fmtQty(item.previous_quantity || 0)}</td>
                  <td className="center bold">{fmtQty(item.quantity || 0)}</td>
                  <td className="center" style={{ color: '#2e7d32', fontWeight: 'bold' }}>مطابق</td>
                  <td className="center">—</td>
                  <td className="small-text">{item.notes || ''}</td>
                </tr>
              ))}
            </>
          ) : isLoad ? (
            items.map((item, idx) => {
              const info = stockInfo[item.product_id];
              const total = info ? info.currentStock : (item.previous_quantity || 0) + item.quantity + (item.gift_quantity || 0);
              const orders = info ? info.pendingOrders : 0;
              const surplus = Math.max(0, total - orders);
              const noAcc = info ? info.loadedSinceAccounting : 0;
              return (
                <tr key={item.id}>
                  <td className="center">{idx + 1}</td>
                  <td>{item.product?.name || '—'}</td>
                  <td className="center">{fmtQty(item.previous_quantity || 0)}</td>
                  <td className="center bold">{fmtQty(item.quantity)}</td>
                  <td className="center">{item.gift_quantity > 0 ? `${fmtQty(item.gift_quantity)} ${item.gift_unit === 'box' ? 'صندوق' : 'قطعة'}` : '—'}</td>
                  <td className="center bold">{fmtQty(total)}</td>
                  <td className="center">{fmtQty(orders)}</td>
                  <td className="center">{fmtQty(surplus)}</td>
                  <td className="center" style={{ color: noAcc > 0 ? '#e65100' : undefined }}>{fmtQty(noAcc)}</td>
                  <td className="small-text">{item.notes || ''}</td>
                </tr>
              );
            })
          ) : (
            items.map((item, idx) => (
              <tr key={item.id}>
                <td className="center">{idx + 1}</td>
                <td>{item.product?.name || '—'}</td>
                <td className="center">{fmtQty(item.previous_quantity || 0)}</td>
                <td className="center bold">{fmtQty(item.quantity)}</td>
                <td className="center" style={{ color: item.surplus_quantity > 0 ? '#e65100' : undefined }}>{fmtQty(item.surplus_quantity || 0)}</td>
                <td className="small-text">{item.notes || ''}</td>
              </tr>
            ))
          )}

          {/* Totals row */}
          <tr className="totals-row">
            <td colSpan={2} className="totals-label">الإجمالي</td>
            {isReview ? (
              <>
                <td className="center bold">{fmtQty(items.reduce((s, i) => s + (i.previous_quantity || 0), 0))}</td>
                <td className="center bold">{fmtQty(items.reduce((s, i) => s + (i.quantity || 0), 0))}</td>
                <td className="center bold">{discrepancies.length > 0 ? `${discrepancies.length} فوارق` : 'مطابق'}</td>
                <td className="center">—</td>
              </>
            ) : isLoad ? (
              <>
                <td className="center bold">{fmtQty(items.reduce((s, i) => s + (i.previous_quantity || 0), 0))}</td>
                <td className="center bold">{fmtQty(items.reduce((s, i) => s + i.quantity, 0))}</td>
                <td className="center bold">{fmtQty(items.reduce((s, i) => s + (i.gift_quantity || 0), 0))}</td>
                <td className="center bold">{fmtQty(items.reduce((s, i) => s + (stockInfo[i.product_id]?.currentStock || ((i.previous_quantity || 0) + i.quantity + (i.gift_quantity || 0))), 0))}</td>
                <td className="center bold">{fmtQty(items.reduce((s, i) => s + (stockInfo[i.product_id]?.pendingOrders || 0), 0))}</td>
                <td className="center bold">{fmtQty(items.reduce((s, i) => {
                  const info = stockInfo[i.product_id];
                  const total = info ? info.currentStock : (i.previous_quantity || 0) + i.quantity + (i.gift_quantity || 0);
                  return s + Math.max(0, total - (info?.pendingOrders || 0));
                }, 0))}</td>
                <td className="center bold" style={{ color: '#e65100' }}>{fmtQty(items.reduce((s, i) => s + (stockInfo[i.product_id]?.loadedSinceAccounting || 0), 0))}</td>
              </>
            ) : isUnload ? (
              <>
                <td className="center bold">{fmtQty(items.reduce((s, i) => s + (i.previous_quantity || 0), 0))}</td>
                <td className="center bold">{fmtQty(items.reduce((s, i) => s + i.quantity, 0))}</td>
                <td className="center bold">{fmtQty(items.reduce((s, i) => s + (i.surplus_quantity || 0), 0))}</td>
              </>
            ) : (
              <>
                <td className="center bold">{fmtQty(items.reduce((s, i) => s + (i.previous_quantity || 0), 0))}</td>
                <td className="center bold">{fmtQty(items.reduce((s, i) => s + i.quantity, 0))}</td>
                <td className="center bold">{fmtQty(items.reduce((s, i) => s + (i.gift_quantity || 0), 0))}</td>
              </>
            )}
            <td></td>
          </tr>
        </tbody>
      </table>

      {session.notes && (
        <div style={{ position: 'relative', zIndex: 1, marginTop: '8px', fontSize: '9pt', borderTop: '1px solid #ccc', paddingTop: '4px' }}>
          <strong>ملاحظات:</strong> {session.notes}
        </div>
      )}

      <div className="print-footer" style={{ marginTop: '10px' }}>
        <span>Date d'impression: {format(new Date(), 'dd/MM/yyyy HH:mm')}</span>
        <span>Nombre de produits: {items.length}</span>
        <span>Laser Food</span>
      </div>
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Printer className="w-4 h-4" />
              {getSessionTitle()} - {workerName}
            </DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : !session ? (
            <div className="text-center py-8 text-muted-foreground">لم يتم العثور على الجلسة</div>
          ) : (
            <>
              {/* Info bar */}
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">{session.worker?.full_name || workerName}</Badge>
                <Badge variant="outline">{format(new Date(session.created_at), 'dd/MM/yyyy HH:mm')}</Badge>
                <Badge variant="outline">{items.length} منتج</Badge>
              </div>

              {/* Preview table */}
              <ScrollArea className="max-h-[55vh]">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-muted">
                        <th className="border border-border p-1 text-center w-8">N°</th>
                        <th className="border border-border p-1.5 text-right">المنتج</th>
                        {isReview ? (
                          <>
                            <th className="border border-border p-1 text-center">نظام</th>
                            <th className="border border-border p-1 text-center">فعلي</th>
                            <th className="border border-border p-1 text-center">الحالة</th>
                          </>
                        ) : isLoad ? (
                          <>
                            <th className="border border-border p-1 text-center text-[9px]">سابق</th>
                            <th className="border border-border p-1 text-center text-[9px]">مشحون</th>
                            <th className="border border-border p-1 text-center text-[9px]">هدايا</th>
                            <th className="border border-border p-1 text-center text-[9px]">الكلي</th>
                            <th className="border border-border p-1 text-center text-[9px]">طلبات</th>
                            <th className="border border-border p-1 text-center text-[9px]">فائض</th>
                            <th className="border border-border p-1 text-center text-[9px]">بدون محاسبة</th>
                          </>
                        ) : isUnload ? (
                          <>
                            <th className="border border-border p-1 text-center">سابق</th>
                            <th className="border border-border p-1 text-center">مُرجع</th>
                            <th className="border border-border p-1 text-center">فائض</th>
                          </>
                        ) : (
                          <>
                            <th className="border border-border p-1 text-center">سابق</th>
                            <th className="border border-border p-1 text-center">مشحون</th>
                            <th className="border border-border p-1 text-center">هدايا</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {isReview ? (
                        <>
                          {discrepancies.map((disc: any, idx: number) => {
                            const item = items.find(i => i.product_id === disc.product_id);
                            return (
                              <tr key={disc.id} className={disc.discrepancy_type === 'deficit' ? 'bg-destructive/5' : 'bg-amber-50/50 dark:bg-amber-950/10'}>
                                <td className="border border-border p-1 text-center text-[10px]">{idx + 1}</td>
                                <td className="border border-border p-1.5 text-right font-medium">{disc.product?.name || '—'}</td>
                                <td className="border border-border p-1 text-center">{item ? fmtQty(item.previous_quantity || 0) : '—'}</td>
                                <td className="border border-border p-1 text-center font-bold">{item ? fmtQty(item.quantity || 0) : '—'}</td>
                                <td className="border border-border p-1 text-center">
                                  <Badge className={`text-[9px] ${disc.discrepancy_type === 'deficit' ? 'bg-destructive text-destructive-foreground' : 'bg-amber-500 text-white'}`}>
                                    {disc.discrepancy_type === 'deficit' ? 'عجز' : 'فائض'} {fmtQty(disc.quantity)}
                                  </Badge>
                                </td>
                              </tr>
                            );
                          })}
                          {matchedItems.map((item, idx) => (
                            <tr key={item.id} className={idx % 2 === 0 ? '' : 'bg-muted/30'}>
                              <td className="border border-border p-1 text-center text-[10px]">{discrepancies.length + idx + 1}</td>
                              <td className="border border-border p-1.5 text-right">{item.product?.name || '—'}</td>
                              <td className="border border-border p-1 text-center">{fmtQty(item.previous_quantity || 0)}</td>
                              <td className="border border-border p-1 text-center font-bold">{fmtQty(item.quantity || 0)}</td>
                              <td className="border border-border p-1 text-center">
                                <Badge className="bg-primary/80 text-primary-foreground text-[9px]">مطابق</Badge>
                              </td>
                            </tr>
                          ))}
                        </>
                      ) : isLoad ? (
                        items.map((item, idx) => {
                          const info = stockInfo[item.product_id];
                          const total = info ? info.currentStock : (item.previous_quantity || 0) + item.quantity + (item.gift_quantity || 0);
                          const orders = info ? info.pendingOrders : 0;
                          const surplus = Math.max(0, total - orders);
                          const noAcc = info ? info.loadedSinceAccounting : 0;
                          return (
                            <tr key={item.id} className={idx % 2 === 0 ? '' : 'bg-muted/30'}>
                              <td className="border border-border p-1 text-center text-[10px]">{idx + 1}</td>
                              <td className="border border-border p-1.5 text-right font-medium">{item.product?.name || '—'}</td>
                              <td className="border border-border p-1 text-center">{fmtQty(item.previous_quantity || 0)}</td>
                              <td className="border border-border p-1 text-center font-bold">{fmtQty(item.quantity)}</td>
                              <td className="border border-border p-1 text-center">{item.gift_quantity > 0 ? fmtQty(item.gift_quantity) : '—'}</td>
                              <td className="border border-border p-1 text-center font-bold">{fmtQty(total)}</td>
                              <td className="border border-border p-1 text-center">{fmtQty(orders)}</td>
                              <td className="border border-border p-1 text-center">{fmtQty(surplus)}</td>
                              <td className="border border-border p-1 text-center text-orange-600 dark:text-orange-400">{fmtQty(noAcc)}</td>
                            </tr>
                          );
                        })
                      ) : (
                        items.map((item, idx) => (
                          <tr key={item.id} className={idx % 2 === 0 ? '' : 'bg-muted/30'}>
                            <td className="border border-border p-1 text-center text-[10px]">{idx + 1}</td>
                            <td className="border border-border p-1.5 text-right font-medium">{item.product?.name || '—'}</td>
                            <td className="border border-border p-1 text-center">{fmtQty(item.previous_quantity || 0)}</td>
                            <td className="border border-border p-1 text-center font-bold">{fmtQty(item.quantity)}</td>
                            {isUnload ? (
                              <td className="border border-border p-1 text-center">{fmtQty(item.surplus_quantity || 0)}</td>
                            ) : (
                              <td className="border border-border p-1 text-center">
                                {item.gift_quantity > 0 ? fmtQty(item.gift_quantity) : '—'}
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>

              <div className="flex gap-2">
                <Button onClick={handlePrint} className="flex-1 gap-2">
                  <Printer className="w-4 h-4" />
                  طباعة الكشف
                </Button>
                <Button
                  variant="outline"
                  onClick={handleThermalPrint}
                  disabled={isThermalPrinting}
                  className="gap-2"
                >
                  {isThermalPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bluetooth className="w-4 h-4" />}
                  48mm
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {container && printContent && open && createPortal(printContent, container)}
    </>
  );
};

export default SessionPrintView;
