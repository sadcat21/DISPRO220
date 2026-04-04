import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTreasurySummary, useManagerTreasury, useManagerHandovers, useCreateHandover, useAddTreasuryEntry } from '@/hooks/useManagerTreasury';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PaymentMethodDetailsDialog from '@/components/treasury/PaymentMethodDetailsDialog';
import StampDetailsDialog from '@/components/treasury/StampDetailsDialog';
import UncollectedDebtsDialog from '@/components/treasury/UncollectedDebtsDialog';
import HandoverItemPickerDialog, { PickedItem } from '@/components/treasury/HandoverItemPickerDialog';
import HandoverPrintView from '@/components/treasury/HandoverPrintView';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Banknote, CreditCard, Receipt, ArrowUpRight, FilePlus, Send, Coins, TrendingUp, AlertCircle, CheckCircle, AlertTriangle, Info, RefreshCw, Printer, Eye, Pencil, Trash2, Settings, Download, Image, Table2 } from 'lucide-react';
import { generatePDF } from '@/utils/generatePDF';
import { generateImage } from '@/utils/generateImage';
import { toast } from 'sonner';
import InvoiceOCRScanner from '@/components/treasury/InvoiceOCRScanner';
import { format } from 'date-fns';
import { ar, fr, enUS } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import TreasurySettingsDialog from '@/components/treasury/TreasurySettingsDialog';
import CoinExchangeDialog from '@/components/treasury/CoinExchangeDialog';
import InvoiceRequestDialog from '@/components/treasury/InvoiceRequestDialog';
import { useTreasuryContacts } from '@/hooks/useTreasuryContacts';
import { isTransferPaidByCash, resolveReceiptBucket } from '@/utils/treasuryDocumentClassification';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useIsElementHidden } from '@/hooks/useUIOverrides';

const TreasuryCard = ({ icon, label, total, handed, colorClass, borderClass, onClick, currency, showDetails, badgeText }: {
  icon: React.ReactNode; label: string; total: number; handed: number; colorClass: string; borderClass: string; onClick: () => void; currency: string; showDetails: boolean; badgeText?: string;
}) => {
  const { t } = useLanguage();
  const remaining = total - handed;
  return (
    <Card className={`${borderClass} cursor-pointer hover:shadow-md transition-shadow`} onClick={onClick}>
      <CardContent className="p-3 text-center space-y-1">
        <div className="mx-auto mb-1">{icon}</div>
        <p className="text-xs text-muted-foreground">{label}</p>
        {badgeText && <p dir="rtl" className="text-[10px] font-medium text-muted-foreground">{badgeText}</p>}
        <p dir="ltr" className={`text-lg font-bold text-${colorClass} truncate`}>{remaining.toLocaleString()} {currency}</p>
        {showDetails && (
          <div className="flex justify-between text-[10px] px-1">
            <span dir="ltr" className="text-muted-foreground">{t('treasury.total')}: {total.toLocaleString()} {currency}</span>
            <span dir="ltr" className="text-green-600">{t('treasury.handed')}: {handed.toLocaleString()} {currency}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const MoneyValue = ({ value, currency, className = '' }: { value: number; currency: string; className?: string }) => (
  <span dir="ltr" className={`inline-block whitespace-nowrap ${className}`.trim()}>
    {value.toLocaleString()} {currency}
  </span>
);

const ManagerTreasury = () => {
  const { t, language, dir } = useLanguage();
  const { activeBranch, workerId } = useAuth();
  const queryClient = useQueryClient();
  const { data: summary, isLoading: summaryLoading } = useTreasurySummary();
  const isInvoiceRequestHidden = useIsElementHidden('button', 'treasury_invoice_request');
  const isSettingsHidden = useIsElementHidden('button', 'treasury_settings');
  const { data: entries } = useManagerTreasury();
  const { data: handovers } = useManagerHandovers();
  const createHandover = useCreateHandover();
  const addEntry = useAddTreasuryEntry();

  const cur = t('treasury.currency');
  const dateLocale = language === 'ar' ? ar : language === 'fr' ? fr : enUS;
  const paymentMethodLabels: Record<string, { label: string; icon: any }> = {
    cash_invoice1: { label: t('treasury.cash_invoice1'), icon: Banknote },
    cash_invoice2: { label: t('treasury.cash_invoice2'), icon: Coins },
    check: { label: t('treasury.check'), icon: CreditCard },
    bank_receipt_cash: { label: 'Versement Cash', icon: Receipt },
    bank_receipt: { label: 'Versement Doc', icon: Receipt },
    bank_transfer: { label: t('treasury.virement'), icon: ArrowUpRight },
    cash: { label: 'Espèces', icon: Banknote },
    receipt: { label: 'Versement Doc', icon: Receipt },
    transfer: { label: t('treasury.virement'), icon: ArrowUpRight },
  };

  const getItemTypeLabel = (key: string) => {
    const tKey = `treasury.item.${key}`;
    const translated = t(tKey);
    return translated !== tKey ? translated : key;
  };

  // Fetch session discrepancies
  const { data: discrepancies } = useQuery({
    queryKey: ['treasury-discrepancies', activeBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('accounting_session_items')
        .select('item_type, expected_amount, actual_amount, difference, accounting_sessions!inner(branch_id, status)')
        .neq('difference', 0)
        .not('item_type', 'in', '(coin_amount,expenses)');
      if (activeBranch?.id) query = query.eq('accounting_sessions.branch_id', activeBranch.id);
      const { data } = await query;
      return (data || []).map((d: any) => ({
        item_type: d.item_type,
        expected: Number(d.expected_amount),
        actual: Number(d.actual_amount),
        difference: Number(d.difference),
      }));
    },
  });

  const [addOpen, setAddOpen] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('handovers');
  const [showCardDetails, setShowCardDetails] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [stampOpen, setStampOpen] = useState(false);
  const [detailsCategory, setDetailsCategory] = useState<'cash_invoice1' | 'cash_invoice2' | 'check' | 'bank_receipt_cash' | 'bank_receipt' | 'bank_transfer' | null>(null);
  const [uncollectedDebtsOpen, setUncollectedDebtsOpen] = useState(false);
  const [addForm, setAddForm] = useState({ payment_method: 'cash_invoice1', amount: '', customer_name: '', invoice_number: '', invoice_date: '', check_number: '', check_bank: '', check_date: '', receipt_number: '', transfer_reference: '', notes: '' });
  const [handoverForm, setHandoverForm] = useState({ cash_invoice1: '', cash_invoice2: '', cash_delivered: '', notes: '', delivery_method: 'direct', intermediary_name: '', bank_transfer_reference: '', received_by: '', bank_account_id: '', receipt_image_url: '' });
  const [pickedChecks, setPickedChecks] = useState<PickedItem[]>([]);
  const [pickedCash, setPickedCash] = useState<PickedItem[]>([]);
  const [pickedReceiptCash, setPickedReceiptCash] = useState<PickedItem[]>([]);
  const [pickedReceipts, setPickedReceipts] = useState<PickedItem[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [coinExchangeOpen, setCoinExchangeOpen] = useState(false);
  const [invoiceRequestOpen, setInvoiceRequestOpen] = useState(false);
  const { data: contacts } = useTreasuryContacts();
  const { data: bankAccounts } = useQuery({
    queryKey: ['treasury-bank-accounts', activeBranch?.id],
    queryFn: async () => {
      let q = supabase.from('treasury_bank_accounts').select('*').eq('is_active', true).order('bank_name');
      if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });
  const [pickedTransfers, setPickedTransfers] = useState<PickedItem[]>([]);
  const [pickerType, setPickerType] = useState<'check' | 'receipt' | 'receipt_cash' | 'transfer' | 'cash' | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [printHandover, setPrintHandover] = useState<string | null>(null);
  const [viewHandover, setViewHandover] = useState<string | null>(null);
  const [editHandover, setEditHandover] = useState<string | null>(null);
  const [editCash1, setEditCash1] = useState(0);
  const [editCash2, setEditCash2] = useState(0);
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editItems, setEditItems] = useState<{checks: PickedItem[], receipts: PickedItem[], transfers: PickedItem[]}>({ checks: [], receipts: [], transfers: [] });
  const [editDeliveryMethod, setEditDeliveryMethod] = useState('direct');
  const [editIntermediaryName, setEditIntermediaryName] = useState('');
  const [editReceivedBy, setEditReceivedBy] = useState('');
  const printRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const { data: remainingCounts } = useQuery({
    queryKey: ['treasury-remaining-counts', activeBranch?.id],
    enabled: !!activeBranch?.id,
    queryFn: async () => {
      const [{ data: handovers, error: handoversError }, { data: handedItems, error: handedItemsError }, { data: orders, error: ordersError }] = await Promise.all([
        supabase
          .from('manager_handovers')
          .select('cash_invoice1, cash_invoice2, checks_amount, receipts_amount, transfers_amount')
          .eq('branch_id', activeBranch!.id),
        supabase
          .from('handover_items')
          .select('order_id, payment_method, handover:manager_handovers!inner(branch_id)')
          .eq('handover.branch_id', activeBranch!.id),
        supabase
          .from('orders')
          .select('id, customer_id, total_amount, partial_amount, payment_status, payment_type, invoice_payment_method, document_verification')
          .eq('status', 'delivered')
          .eq('branch_id', activeBranch!.id),
      ]);

      if (handoversError) throw handoversError;
      if (handedItemsError) throw handedItemsError;
      if (ordersError) throw ordersError;

      const handedByOrder = new Map<string, Set<string>>();
      for (const item of handedItems || []) {
        if (!item.order_id) continue;
        if (!handedByOrder.has(item.order_id)) handedByOrder.set(item.order_id, new Set());
        handedByOrder.get(item.order_id)!.add(String(item.payment_method || ''));
      }

      const buckets = {
        cash_invoice1: [] as Array<{ id: string; amount: number; customerId: string | null }>,
        cash_invoice2: [] as Array<{ id: string; amount: number; customerId: string | null }>,
        check: [] as Array<{ id: string; amount: number; customerId: string | null }>,
        receipt_cash: [] as Array<{ id: string; amount: number; customerId: string | null }>,
        receipt: [] as Array<{ id: string; amount: number; customerId: string | null }>,
        transfer: [] as Array<{ id: string; amount: number; customerId: string | null }>,
      };

      for (const order of orders || []) {
        let amount = Number(order.total_amount || 0);
        if (order.payment_status === 'partial') amount = Number(order.partial_amount || 0);
        else if (order.payment_status === 'debt') amount = 0;
        if (amount <= 0) continue;

        const handedMethods = handedByOrder.get(order.id) || new Set<string>();
        const receiptBucket = resolveReceiptBucket(order.document_verification);
        const transferByCash = isTransferPaidByCash(order.document_verification);

        if (order.payment_type === 'without_invoice') {
          buckets.cash_invoice2.push({ id: order.id, amount, customerId: order.customer_id || null });
          continue;
        }

        switch (order.invoice_payment_method) {
          case 'cash':
            if (!handedMethods.has('cash')) buckets.cash_invoice1.push({ id: order.id, amount, customerId: order.customer_id || null });
            break;
          case 'check':
            if (!handedMethods.has('check')) buckets.check.push({ id: order.id, amount, customerId: order.customer_id || null });
            break;
          case 'receipt':
            if (receiptBucket === 'cash') {
              if (!handedMethods.has('receipt_cash') && !handedMethods.has('cash') && !handedMethods.has('receipt')) {
                buckets.receipt_cash.push({ id: order.id, amount, customerId: order.customer_id || null });
              }
            } else if (!handedMethods.has('receipt')) {
              buckets.receipt.push({ id: order.id, amount, customerId: order.customer_id || null });
            }
            break;
          case 'transfer':
            if (!transferByCash && !handedMethods.has('transfer')) buckets.transfer.push({ id: order.id, amount, customerId: order.customer_id || null });
            break;
          default:
            break;
        }
      }

      const applyAmountFallback = (items: Array<{ id: string; amount: number; customerId: string | null }>, handedAmount: number) => {
        let remainingHanded = Math.max(0, handedAmount);
        return items
          .slice()
          .sort((a, b) => a.id.localeCompare(b.id))
          .flatMap((item) => {
            if (remainingHanded <= 0) return [item];
            if (remainingHanded >= item.amount) {
              remainingHanded -= item.amount;
              return [];
            }
            const rest = item.amount - remainingHanded;
            remainingHanded = 0;
            return rest > 1 ? [{ ...item, amount: rest }] : [];
          });
      };

      const handedCash2 = (handovers || []).reduce((sum, handover: any) => sum + Number(handover.cash_invoice2 || 0), 0);
      const countSummary = (items: Array<{ id: string; amount: number; customerId: string | null }>) => ({
        operations: items.length,
        clients: new Set(items.map((item) => item.customerId).filter(Boolean)).size,
      });

      const cashInvoice1Items = buckets.cash_invoice1;
      const cashInvoice2Items = applyAmountFallback(buckets.cash_invoice2, handedCash2);
      const checkItems = buckets.check;
      const receiptCashItems = buckets.receipt_cash;
      const receiptDocItems = buckets.receipt;
      const transferItems = buckets.transfer;

      return {
        cash_invoice1: countSummary(cashInvoice1Items),
        cash_invoice2: countSummary(cashInvoice2Items),
        check: countSummary(checkItems),
        receipt_cash: countSummary(receiptCashItems),
        receipt: countSummary(receiptDocItems),
        transfer: countSummary(transferItems),
      };
    },
  });

  const openEditHandover = async (h: any) => {
    setEditCash1(Number(h.cash_invoice1 ?? 0));
    setEditCash2(Number(h.cash_invoice2 ?? 0));
    setEditNotes(h.notes || '');
    setEditDeliveryMethod(h.delivery_method || 'direct');
    setEditIntermediaryName(h.intermediary_name || '');
    setEditReceivedBy(h.receiver_name || h.received_by || '');
    setEditHandover(h.id);
    // Load existing handover items
    const { data: items } = await supabase
      .from('handover_items')
      .select('order_id, payment_method, amount, customer_name')
      .eq('handover_id', h.id);
    if (items) {
      setEditItems({
        checks: items.filter(i => i.payment_method === 'check').map(i => ({ order_id: i.order_id || '', amount: Number(i.amount), customer_name: i.customer_name || '' })),
        receipts: items.filter(i => i.payment_method === 'receipt').map(i => ({ order_id: i.order_id || '', amount: Number(i.amount), customer_name: i.customer_name || '' })),
        transfers: items.filter(i => i.payment_method === 'transfer').map(i => ({ order_id: i.order_id || '', amount: Number(i.amount), customer_name: i.customer_name || '' })),
      });
    }
  };

  const saveEditHandover = async () => {
    if (!editHandover) return;
    setEditSaving(true);
    try {
      const h = handovers?.find(ho => ho.id === editHandover);
      if (!h) return;
      const newTotal = editCash1 + editCash2 + Number(h.checks_amount ?? 0) + Number(h.receipts_amount ?? 0) + Number(h.transfers_amount ?? 0);
      const { error } = await supabase
        .from('manager_handovers')
        .update({
          cash_invoice1: editCash1,
          cash_invoice2: editCash2,
          notes: editNotes || null,
          amount: newTotal,
          delivery_method: editDeliveryMethod !== 'direct' ? 'intermediary' : 'direct',
          intermediary_name: editDeliveryMethod !== 'direct' ? editIntermediaryName || null : null,
          received_by: null,
          receiver_name: editReceivedBy || null,
        })
        .eq('id', editHandover);
      if (error) throw error;
      toast.success(t('common.saved'));
      queryClient.invalidateQueries({ queryKey: ['manager-handovers'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-summary'] });
      setEditHandover(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setEditSaving(false);
    }
  };

  const deleteHandover = async (id: string) => {
    try {
      await supabase.from('handover_items').delete().eq('handover_id', id);
      const { error } = await supabase.from('manager_handovers').delete().eq('id', id);
      if (error) throw error;
      toast.success(t('common.deleted'));
      queryClient.invalidateQueries({ queryKey: ['manager-handovers'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-summary'] });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const syncOldSessions = async () => {
    setSyncing(true);
    try {
      // Get all completed sessions
      let sessQ = supabase.from('accounting_sessions').select('id, branch_id, manager_id').eq('status', 'completed');
      if (activeBranch?.id) sessQ = sessQ.eq('branch_id', activeBranch.id);
      const { data: sessions } = await sessQ;
      if (!sessions?.length) { toast.info(t('treasury.no_sessions_sync')); setSyncing(false); return; }

      // Get existing treasury entries linked to sessions
      const { data: existing } = await supabase.from('manager_treasury').select('session_id').eq('source_type', 'accounting_session');
      const existingSessionIds = new Set((existing || []).map((e: any) => e.session_id));

      const unsynced = sessions.filter(s => !existingSessionIds.has(s.id));
      if (!unsynced.length) { toast.info(t('treasury.all_synced')); setSyncing(false); return; }

      let totalInserted = 0;
      for (const sess of unsynced) {
        const { data: items } = await supabase.from('accounting_session_items').select('item_type, actual_amount').eq('session_id', sess.id);
        if (!items?.length) continue;

        const rows: any[] = [];
        for (const item of items) {
          const amt = Number(item.actual_amount || 0);
          if (amt <= 0) continue;
          let pm: string | null = null;
          if (item.item_type === 'invoice1_espace_cash' || item.item_type === 'invoice1_versement_cash' || item.item_type === 'invoice2_cash' || item.item_type === 'debt_collections_cash') pm = 'cash';
          else if (item.item_type === 'invoice1_check' || item.item_type === 'debt_collections_check') pm = 'check';
          else if (item.item_type === 'invoice1_receipt' || item.item_type === 'debt_collections_receipt') pm = 'bank_receipt';
          else if (item.item_type === 'invoice1_transfer' || item.item_type === 'debt_collections_transfer') pm = 'bank_transfer';
          if (!pm) continue;
          rows.push({ manager_id: sess.manager_id, branch_id: sess.branch_id, session_id: sess.id, source_type: 'accounting_session', payment_method: pm, amount: amt, notes: item.item_type });
        }
        if (rows.length > 0) {
          await supabase.from('manager_treasury').insert(rows);
          totalInserted += rows.length;
        }
      }

      toast.success(`${t('treasury.sync_success')} (${unsynced.length} / ${totalInserted})`);
      queryClient.invalidateQueries({ queryKey: ['manager-treasury'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-summary'] });
    } catch (err: any) {
      toast.error(t('treasury.sync_error') + ': ' + (err.message || ''));
    } finally {
      setSyncing(false);
    }
  };

  const handleAddEntry = async () => {
    if (!addForm.amount || Number(addForm.amount) <= 0) {
      toast.error(t('treasury.enter_valid_amount'));
      return;
    }
    try {
      await addEntry.mutateAsync({
        payment_method: addForm.payment_method.startsWith('cash') ? 'cash' : addForm.payment_method,
        amount: Number(addForm.amount),
        customer_name: addForm.customer_name || undefined,
        invoice_number: addForm.invoice_number || undefined,
        invoice_date: addForm.invoice_date || undefined,
        check_number: addForm.check_number || undefined,
        check_bank: addForm.check_bank || undefined,
        check_date: addForm.check_date || undefined,
        receipt_number: addForm.receipt_number || undefined,
        transfer_reference: addForm.transfer_reference || undefined,
        notes: addForm.notes || undefined,
      });
      toast.success(t('treasury.added_success'));
      setAddOpen(false);
      setAddForm({ payment_method: 'cash_invoice1', amount: '', customer_name: '', invoice_number: '', invoice_date: '', check_number: '', check_bank: '', check_date: '', receipt_number: '', transfer_reference: '', notes: '' });
    } catch {
      toast.error(t('treasury.error'));
    }
  };

  const checksAmount = pickedChecks.reduce((s, i) => s + i.amount, 0);
  const pureCashInvoice1Amount = pickedCash.reduce((s, i) => s + i.amount, 0);
  const pickedCashStampAmount = pickedCash.reduce((s, i) => s + Number(i.stamp_amount || 0), 0);
  const pickedCashInvoice1WithStamp = pickedCash.reduce((s, i) => s + Number(i.total_with_stamp || i.amount || 0), 0);
  const receiptCashAmount = pickedReceiptCash.reduce((s, i) => s + i.amount, 0);
  const invoice1CashAmount = pureCashInvoice1Amount + receiptCashAmount;
  const invoice1CashAmountWithStamp = pickedCashInvoice1WithStamp + receiptCashAmount;
  const receiptsAmount = pickedReceipts.reduce((s, i) => s + i.amount, 0);
  const transfersAmount = pickedTransfers.reduce((s, i) => s + i.amount, 0);
  const deliveredCashAmount = Number(handoverForm.cash_delivered || 0);
  const availableInvoice2CashAmount = Math.max((summary?.cash_invoice2 || 0) - (summary?.cash_invoice2_handed || 0), 0);
  const invoice2CashAmount = Math.min(availableInvoice2CashAmount, Math.max(0, deliveredCashAmount - invoice1CashAmountWithStamp));
  const remainingCashInvoice1Count = remainingCounts?.cash_invoice1?.operations ?? (((summary?.cash_invoice1 || 0) + (summary?.cash_invoice1_stamp || 0) - (summary?.cash_invoice1_handed || 0)) > 1 ? (summary?.cash_invoice1_count || 0) : 0);
  const remainingCashInvoice2Count = remainingCounts?.cash_invoice2?.operations ?? (((summary?.cash_invoice2 || 0) - (summary?.cash_invoice2_handed || 0)) > 1 ? (summary?.cash_invoice2_count || 0) : 0);
  const remainingChecksCount = remainingCounts?.check?.operations ?? (((summary?.check || 0) - (summary?.check_handed || 0)) > 1 ? (summary?.checkCount || 0) : 0);
  const remainingReceiptCashCount = remainingCounts?.receipt_cash?.operations ?? (((summary?.receipt_cash || 0) - (summary?.receipt_cash_handed || 0)) > 1 ? (summary?.receiptCashCount || 0) : 0);
  const remainingReceiptDocCount = remainingCounts?.receipt?.operations ?? (((summary?.bank_receipt || 0) - (summary?.receipt_handed || 0)) > 1 ? (summary?.receiptCount || 0) : 0);
  const remainingTransferCount = remainingCounts?.transfer?.operations ?? (((summary?.bank_transfer || 0) - (summary?.transfer_handed || 0)) > 1 ? (summary?.transferCount || 0) : 0);
  const buildBadgeText = (bucket?: { clients: number; operations: number }) =>
    bucket ? `العمليات: ${bucket.operations} | العملاء: ${bucket.clients}` : undefined;
  const cashInvoice1Badge = buildBadgeText(remainingCounts?.cash_invoice1);
  const cashInvoice2Badge = buildBadgeText(remainingCounts?.cash_invoice2);
  const checksBadge = buildBadgeText(remainingCounts?.check);
  const receiptCashBadge = buildBadgeText(remainingCounts?.receipt_cash);
  const receiptDocBadge = buildBadgeText(remainingCounts?.receipt);
  const transferBadge = buildBadgeText(remainingCounts?.transfer);

  const handleHandover = async () => {
    const finalCash1 = invoice1CashAmountWithStamp;
    const finalCash2 = invoice2CashAmount;
    if (deliveredCashAmount < finalCash1) {
      toast.error('الكاش المسلم يجب أن يكون أكبر من أو يساوي كاش فاتورة 1');
      return;
    }
    const total = finalCash1 + finalCash2 + checksAmount + receiptsAmount + transfersAmount;
    if (total <= 0) {
      toast.error(t('treasury.enter_at_least_one'));
      return;
    }
    try {
      const { data: handover, error } = await supabase.from('manager_handovers').insert({
        manager_id: workerId!,
        branch_id: activeBranch?.id || null,
        payment_method: 'mixed',
        amount: total,
        cash_invoice1: finalCash1,
        cash_invoice2: finalCash2,
        checks_amount: checksAmount,
        check_count: pickedChecks.length,
        receipts_amount: receiptsAmount,
        receipt_count: pickedReceipts.length,
        transfers_amount: transfersAmount,
        transfer_count: pickedTransfers.length,
        notes: handoverForm.notes || null,
        delivery_method: handoverForm.delivery_method !== 'direct' ? 'intermediary' : 'direct',
        intermediary_name: handoverForm.delivery_method !== 'direct' ? handoverForm.intermediary_name || null : null,
        bank_transfer_reference: null,
        bank_account_id: null,
        receipt_image_url: null,
        received_by: null,
        receiver_name: handoverForm.received_by || null,
        unified_cash: false,
      } as any).select('id').single();

      if (error) throw error;

      const allItems = [
        ...pickedCash.map(i => ({ handover_id: handover.id, order_id: i.order_id, payment_method: 'cash', amount: i.amount, customer_name: i.customer_name })),
        ...pickedReceiptCash.map(i => ({ handover_id: handover.id, order_id: i.order_id, payment_method: 'receipt_cash', amount: i.amount, customer_name: i.customer_name })),
        ...pickedChecks.map(i => ({ handover_id: handover.id, order_id: i.order_id, payment_method: 'check', amount: i.amount, customer_name: i.customer_name })),
        ...pickedReceipts.map(i => ({ handover_id: handover.id, order_id: i.order_id, payment_method: 'receipt', amount: i.amount, customer_name: i.customer_name })),
        ...pickedTransfers.map(i => ({ handover_id: handover.id, order_id: i.order_id, payment_method: 'transfer', amount: i.amount, customer_name: i.customer_name })),
      ];
      if (allItems.length > 0) {
        await supabase.from('handover_items').insert(allItems);
      }

      toast.success(t('treasury.handover_success'));
      setHandoverOpen(false);
      setHandoverForm({ cash_invoice1: '', cash_invoice2: '', cash_delivered: '', notes: '', delivery_method: 'direct', intermediary_name: '', bank_transfer_reference: '', received_by: '', bank_account_id: '', receipt_image_url: '' });
      setPickedCash([]);
      setPickedReceiptCash([]);
      setPickedChecks([]);
      setPickedReceipts([]);
      setPickedTransfers([]);
      queryClient.invalidateQueries({ queryKey: ['manager-handovers'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-summary'] });
      queryClient.invalidateQueries({ queryKey: ['handover-picker'] });
    } catch (err: any) {
      toast.error(t('treasury.error') + ': ' + (err.message || ''));
    }
  };

  return (
    <div className="p-4 space-y-4 pb-24" dir={dir}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">{t('treasury.title')}</h1>
          <div className="flex items-center gap-2 rounded-full border border-border bg-muted/40 px-2.5 py-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">تفاصيل</span>
            <Switch checked={showCardDetails} onCheckedChange={setShowCardDetails} />
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {!isSettingsHidden && (
            <Button size="sm" variant="outline" className="h-9 shrink-0 gap-1.5 rounded-full px-3 text-[11px]" onClick={() => setSettingsOpen(true)}>
              <Settings className="w-4 h-4" />
              <span>إعدادات</span>
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-9 shrink-0 gap-1.5 rounded-full px-3 text-[11px]" onClick={syncOldSessions} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span>مزامنة</span>
          </Button>
          {!isInvoiceRequestHidden && (
            <Button size="sm" variant="default" className="h-9 shrink-0 gap-1.5 rounded-full px-3 text-[11px]" onClick={() => setInvoiceRequestOpen(true)} title="طلب فاتورة">
              <Receipt className="w-4 h-4" />
              <span>فاتورة</span>
            </Button>
          )}
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-9 shrink-0 gap-1.5 rounded-full px-3 text-[11px]"><FilePlus className="w-4 h-4" /><span>إضافة</span></Button>
            </DialogTrigger>
            <DialogContent dir={dir}>
              <DialogHeader><DialogTitle>{t('treasury.add_manual')}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <InvoiceOCRScanner
                  paymentMethod={addForm.payment_method.startsWith('cash') ? 'cash' : addForm.payment_method}
                  onDataExtracted={(data) => {
                    setAddForm(f => ({
                      ...f,
                      amount: data.amount || f.amount,
                      customer_name: data.customer_name || f.customer_name,
                      invoice_number: data.invoice_number || f.invoice_number,
                      invoice_date: data.invoice_date || f.invoice_date,
                      check_number: data.check_number || f.check_number,
                      check_bank: data.check_bank || f.check_bank,
                      check_date: data.check_date || f.check_date,
                      receipt_number: data.receipt_number || f.receipt_number,
                      transfer_reference: data.transfer_reference || f.transfer_reference,
                      notes: data.raw_text ? (f.notes ? f.notes + '\n---\n' + data.raw_text : data.raw_text) : f.notes,
                    }));
                  }}
                />
                <div>
                  <Label className="mb-2 block">{t('treasury.payment_method')}</Label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {Object.entries(paymentMethodLabels).map(([k, v]) => {
                      const Icon = v.icon;
                      return (
                        <Button
                          key={k}
                          type="button"
                          size="sm"
                          variant={addForm.payment_method === k ? 'default' : 'outline'}
                          className="gap-1 text-xs h-9"
                          onClick={() => setAddForm(f => ({ ...f, payment_method: k }))}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {v.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label>{t('treasury.customer_name')}</Label>
                  <Input placeholder={t('treasury.customer_name')} value={addForm.customer_name} onChange={e => setAddForm(f => ({ ...f, customer_name: e.target.value }))} />
                </div>
                <div>
                  <Label>{t('treasury.amount')}</Label>
                  <Input type="number" value={addForm.amount} onChange={e => setAddForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div>
                  <Label>{t('treasury.invoice_number')}</Label>
                  <Input placeholder={t('treasury.invoice_number')} value={addForm.invoice_number} onChange={e => setAddForm(f => ({ ...f, invoice_number: e.target.value }))} />
                </div>
                <div>
                  <Label>{t('treasury.invoice_date')}</Label>
                  <Input type="date" value={addForm.invoice_date} onChange={e => setAddForm(f => ({ ...f, invoice_date: e.target.value }))} />
                </div>
                {addForm.payment_method === 'check' && (
                  <>
                    <div><Label>{t('treasury.check_number')}</Label><Input value={addForm.check_number} onChange={e => setAddForm(f => ({ ...f, check_number: e.target.value }))} /></div>
                    <div><Label>{t('treasury.bank')}</Label><Input value={addForm.check_bank} onChange={e => setAddForm(f => ({ ...f, check_bank: e.target.value }))} /></div>
                    <div><Label>{t('treasury.check_date')}</Label><Input type="date" value={addForm.check_date} onChange={e => setAddForm(f => ({ ...f, check_date: e.target.value }))} /></div>
                  </>
                )}
                {addForm.payment_method === 'bank_receipt' && (
                  <div><Label>{t('treasury.receipt_number')}</Label><Input value={addForm.receipt_number} onChange={e => setAddForm(f => ({ ...f, receipt_number: e.target.value }))} /></div>
                )}
                {addForm.payment_method === 'bank_transfer' && (
                  <div><Label>{t('treasury.transfer_reference')}</Label><Input value={addForm.transfer_reference} onChange={e => setAddForm(f => ({ ...f, transfer_reference: e.target.value }))} /></div>
                )}
                <div><Label>{t('treasury.notes')}</Label><Textarea value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} /></div>
                <Button onClick={handleAddEntry} disabled={addEntry.isPending} className="w-full">{t('treasury.add')}</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button size="sm" variant="outline" className="h-9 shrink-0 gap-1.5 rounded-full px-3 text-[11px]" onClick={() => { setActiveTab('handovers'); setTimeout(() => document.getElementById('handovers-section')?.scrollIntoView({ behavior: 'smooth' }), 100); }}>
            <Table2 className="w-4 h-4" />
            <span>السجل</span>
          </Button>
          <Dialog open={handoverOpen} onOpenChange={setHandoverOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-9 shrink-0 gap-1.5 rounded-full px-3 text-[11px]"><Send className="w-4 h-4" /><span>تسليم</span></Button>
            </DialogTrigger>
            <DialogContent dir={dir} className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{t('treasury.handover_to_upper')}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-muted/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">💵 {t('treasury.cash')}</p>
                    <Badge variant="outline" className="text-[10px]">حساب تلقائي</Badge>
                  </div>
                  <div>
                    <Label className="text-xs">الكاش المسلم</Label>
                    <Input type="number" placeholder="0" value={handoverForm.cash_delivered} onChange={e => setHandoverForm(f => ({ ...f, cash_delivered: e.target.value }))} />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button type="button" size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => setHandoverForm(f => ({ ...f, cash_delivered: String(invoice1CashAmountWithStamp) }))}>
                        إدراج فاتورة 1
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => setHandoverForm(f => {
                        const current = Number(f.cash_delivered || 0);
                        const base = Math.max(current, invoice1CashAmountWithStamp);
                        return { ...f, cash_delivered: String(base + availableInvoice2CashAmount) };
                      })}>
                        إدراج فاتورة 2
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => setHandoverForm(f => ({ ...f, cash_delivered: String(invoice1CashAmountWithStamp + availableInvoice2CashAmount) }))}>
                        إدراج المجموع
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
	                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
	                      <p className="text-[11px] text-emerald-700">{t('treasury.cash_invoice1')} + Versement Cash</p>
	                      <p className="mt-1 text-lg font-bold text-emerald-600">{invoice1CashAmountWithStamp.toLocaleString()} {cur}</p>
	                      {pickedCashStampAmount > 0 && (
	                        <p className="mt-1 text-[11px] text-amber-700">الطابع ضمن Espèces: {pickedCashStampAmount.toLocaleString()} {cur}</p>
	                      )}
	                    </div>
	                    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
	                      <p className="text-[11px] text-sky-700">{t('treasury.cash_invoice2')}</p>
	                      <p className="mt-1 text-lg font-bold text-sky-600">{availableInvoice2CashAmount.toLocaleString()} {cur}</p>
	                      {invoice2CashAmount > 0 && (
	                        <p className="mt-1 text-[11px] text-sky-700">المرسل من فاتورة 2: {invoice2CashAmount.toLocaleString()} {cur}</p>
	                      )}
	                    </div>
                  </div>
                  {deliveredCashAmount > 0 && deliveredCashAmount < invoice1CashAmountWithStamp && (
                    <p className="text-xs font-medium text-destructive">الكاش المسلم أقل من كاش فاتورة 1 المحدد.</p>
                  )}
                </div>
                <PickerSection label="Espèces" items={pickedCash} onOpen={() => setPickerType('cash')} onRemove={(id) => setPickedCash(p => p.filter(i => i.order_id !== id))} currency={cur} />
                <div className="rounded-xl border border-blue-200/70 bg-blue-50/40 p-3">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-blue-900">المستندات</p>
                    <p className="text-[11px] text-blue-700">الشيكات والتحويلات والمستندات البنكية المسلّمة</p>
                  </div>
                  <PickerSection label={t('treasury.checks')} items={pickedChecks} onOpen={() => setPickerType('check')} onRemove={(id) => setPickedChecks(p => p.filter(i => i.order_id !== id))} currency={cur} />
                <div className="rounded-xl border border-purple-200/70 bg-purple-50/50 p-3">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-purple-900">Versement Doc</p>
                    <p className="text-[11px] text-purple-700">العمليات التي قدّم فيها العميل وصل Versement فعليًا</p>
                  </div>
                  <PickerSection label="Versement Doc" items={pickedReceipts} onOpen={() => setPickerType('receipt')} onRemove={(id) => setPickedReceipts(p => p.filter(i => i.order_id !== id))} currency={cur} />
                </div>
                  <PickerSection label={t('treasury.virement')} items={pickedTransfers} onOpen={() => setPickerType('transfer')} onRemove={(id) => setPickedTransfers(p => p.filter(i => i.order_id !== id))} currency={cur} />
                </div>
                
                <div className="rounded-xl border border-fuchsia-200/70 bg-fuchsia-50/50 p-3">
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-fuchsia-900">Versement Cash</p>
                    <p className="text-[11px] text-fuchsia-700">العمليات التي دفعها العميل نقدًا رغم أن طريقة الدفع Versement</p>
                  </div>
                  <PickerSection label="Versement Cash" items={pickedReceiptCash} onOpen={() => setPickerType('receipt_cash')} onRemove={(id) => setPickedReceiptCash(p => p.filter(i => i.order_id !== id))} currency={cur} />
                </div>
                {(() => {
                  const cashTotal = deliveredCashAmount;
                  const grandTotal = cashTotal + checksAmount + receiptsAmount + transfersAmount;
                  return grandTotal > 0 ? (
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{t('treasury.total_handover')}</span>
                      <span className="text-sm font-bold text-primary">
                        {grandTotal.toLocaleString()} {cur}
                      </span>
                    </div>
                  </div>
                  ) : null;
                })()}

                {/* Delivery Method Toggle */}
                <div className="flex items-center justify-between">
                  <Label className="text-sm">🚚 {t('treasury.delivery_method') || 'طريقة التسليم'}</Label>
                  <Switch checked={handoverForm.delivery_method !== 'direct'} onCheckedChange={(checked) => setHandoverForm(f => ({ ...f, delivery_method: checked ? 'intermediary' : 'direct', intermediary_name: '', received_by: '' }))} />
                </div>

                {handoverForm.delivery_method !== 'direct' && (
                  <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">{t('treasury.via_intermediary') || 'الوسيط'}</Label>
                        <Select value={handoverForm.intermediary_name} onValueChange={v => setHandoverForm(f => ({ ...f, intermediary_name: v }))}>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder={t('treasury.select_intermediary') || 'اختر الوسيط'} />
                          </SelectTrigger>
                          <SelectContent>
                            {(contacts || []).filter((c: any) => c.contact_type === 'intermediary').map((c: any) => (
                              <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">{t('treasury.receiver') || 'المستلم'}</Label>
                        <Select value={handoverForm.received_by} onValueChange={v => setHandoverForm(f => ({ ...f, received_by: v }))}>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder={t('treasury.select_receiver') || 'اختر المستلم'} />
                          </SelectTrigger>
                          <SelectContent>
                            {(contacts || []).filter((c: any) => c.contact_type === 'receiver').map((c: any) => (
                              <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {(handoverForm.intermediary_name || handoverForm.received_by) && (
                      <p className="text-xs text-muted-foreground text-center border-t pt-2 mt-1">
                        🏢 {t('treasury.branch_manager') || 'مدير الفرع'}
                        {handoverForm.intermediary_name && <> ← 🤝 <span className="font-medium">{handoverForm.intermediary_name}</span></>}
                        {handoverForm.received_by && <> ← 📥 <span className="font-medium">{handoverForm.received_by}</span></>}
                      </p>
                    )}
                  </div>
                )}

                <div><Label>{t('treasury.notes')}</Label><Textarea value={handoverForm.notes} onChange={e => setHandoverForm(f => ({ ...f, notes: e.target.value }))} /></div>
                <Button onClick={handleHandover} disabled={createHandover.isPending} className="w-full">{t('treasury.register_handover')}</Button>
              </div>
            </DialogContent>
          </Dialog>

          {pickerType && (
            <HandoverItemPickerDialog
              open={!!pickerType}
              onOpenChange={(open) => !open && setPickerType(null)}
              paymentMethod={pickerType}
              onConfirm={(items) => {
                if (pickerType === 'cash') setPickedCash(prev => [...prev, ...items]);
                else if (pickerType === 'receipt_cash') setPickedReceiptCash(prev => [...prev, ...items]);
                else if (pickerType === 'check') setPickedChecks(prev => [...prev, ...items]);
                else if (pickerType === 'receipt') setPickedReceipts(prev => [...prev, ...items]);
                else if (pickerType === 'transfer') setPickedTransfers(prev => [...prev, ...items]);
              }}
            />
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <TreasuryCard
          icon={<Banknote className="w-5 h-5 text-green-500" />}
          label={`${t('treasury.cash_invoice1')} (${remainingCashInvoice1Count})`}
          total={(summary?.cash_invoice1 || 0) + (summary?.cash_invoice1_stamp || 0)}
          handed={summary?.cash_invoice1_handed || 0}
          colorClass="green-500"
          borderClass="border-green-500/30 bg-green-500/5"
          onClick={() => setDetailsCategory('cash_invoice1')}
          currency={cur}
          showDetails={showCardDetails}
          badgeText={cashInvoice1Badge}
        />
        <TreasuryCard
          icon={<Banknote className="w-5 h-5 text-emerald-500" />}
          label={t('treasury.cash_invoice2')}
          total={summary?.cash_invoice2 || 0}
          handed={summary?.cash_invoice2_handed || 0}
          colorClass="emerald-500"
          borderClass="border-emerald-500/30 bg-emerald-500/5"
          onClick={() => setDetailsCategory('cash_invoice2')}
          currency={cur}
          showDetails={showCardDetails}
          badgeText={cashInvoice2Badge}
        />
        <TreasuryCard
          icon={<CreditCard className="w-5 h-5 text-blue-500" />}
          label={`${t('treasury.checks')} (${remainingChecksCount})`}
          total={summary?.check || 0}
          handed={summary?.check_handed || 0}
          colorClass="blue-500"
          borderClass="border-blue-500/30 bg-blue-500/5"
          onClick={() => setDetailsCategory('check')}
          currency={cur}
          showDetails={showCardDetails}
          badgeText={checksBadge}
        />
        <TreasuryCard
          icon={<Receipt className="w-5 h-5 text-purple-500" />}
          label={`Versement Cash (${remainingReceiptCashCount})`}
          total={summary?.receipt_cash || 0}
          handed={summary?.receipt_cash_handed || 0}
          colorClass="fuchsia-500"
          borderClass="border-fuchsia-500/30 bg-fuchsia-500/5"
          onClick={() => setDetailsCategory('bank_receipt_cash')}
          currency={cur}
          showDetails={showCardDetails}
          badgeText={receiptCashBadge}
        />
        <TreasuryCard
          icon={<Receipt className="w-5 h-5 text-purple-500" />}
          label={`Versement Doc (${remainingReceiptDocCount})`}
          total={summary?.bank_receipt || 0}
          handed={summary?.receipt_handed || 0}
          colorClass="purple-500"
          borderClass="border-purple-500/30 bg-purple-500/5"
          onClick={() => setDetailsCategory('bank_receipt')}
          currency={cur}
          showDetails={showCardDetails}
          badgeText={receiptDocBadge}
        />
        <TreasuryCard
          icon={<ArrowUpRight className="w-5 h-5 text-orange-500" />}
          label={`${t('treasury.virement')} (${remainingTransferCount})`}
          total={summary?.bank_transfer || 0}
          handed={summary?.transfer_handed || 0}
          colorClass="orange-500"
          borderClass="border-orange-500/30 bg-orange-500/5"
          onClick={() => setDetailsCategory('bank_transfer')}
          currency={cur}
          showDetails={showCardDetails}
          badgeText={transferBadge}
        />
        <Card className="border-amber-600/30 bg-amber-600/5 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStampOpen(true)}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground leading-tight">{t('treasury.stamp_total')}</p>
            <p className="text-sm font-bold text-amber-600 truncate">{(() => {
              const totalCash1 = summary?.cash_invoice1 || 0;
              const remainingCash1 = Math.max(totalCash1 - (summary?.cash_invoice1_handed || 0), 0);
              const totalStamp = summary?.cash_invoice1_stamp || 0;
              if (totalCash1 <= 0 || totalStamp <= 0 || (remainingCounts && remainingCounts.cash_invoice1 === 0)) return `0 ${cur}`;
              const remainingStamp = totalStamp * (remainingCash1 / totalCash1);
              return `${remainingStamp.toLocaleString()} ${cur}`;
            })()}</p>
          </CardContent>
        </Card>
      </div>

      {detailsCategory && (
        <PaymentMethodDetailsDialog
          open={!!detailsCategory}
          onOpenChange={(open) => !open && setDetailsCategory(null)}
          category={detailsCategory}
        />
      )}

      <StampDetailsDialog open={stampOpen} onOpenChange={setStampOpen} />
      <UncollectedDebtsDialog open={uncollectedDebtsOpen} onOpenChange={setUncollectedDebtsOpen} />

      {/* Sales & Debts Summary */}
      <Card className="border-muted">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs font-medium text-muted-foreground">{t('treasury.sales_debts_summary')}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">{t('treasury.sales_value')}</p>
              <MoneyValue value={summary?.totalSales || 0} currency={cur} className="text-sm font-bold text-green-600" />
            </div>
            <div className="rounded-lg bg-muted/50 p-2 text-center">
              <p className="text-[10px] text-muted-foreground">{t('treasury.received_treasury')}</p>
              <MoneyValue value={summary?.total || 0} currency={cur} className="text-sm font-bold" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-orange-500/5 border border-orange-500/20 p-2 text-center">
              <AlertCircle className="w-3 h-3 mx-auto mb-0.5 text-orange-500" />
              <p className="text-[10px] text-muted-foreground">{t('treasury.total_debts')}</p>
              <MoneyValue value={summary?.totalDebts || 0} currency={cur} className="text-xs font-bold text-orange-500" />
            </div>
            <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-2 text-center">
              <CheckCircle className="w-3 h-3 mx-auto mb-0.5 text-green-500" />
              <p className="text-[10px] text-muted-foreground">{t('treasury.collected_debts')}</p>
              <MoneyValue value={summary?.collectedDebts || 0} currency={cur} className="text-xs font-bold text-green-500" />
            </div>
            <button
              type="button"
              className="rounded-lg bg-destructive/5 border border-destructive/20 p-2 text-center transition-shadow hover:shadow-sm"
              onClick={() => setUncollectedDebtsOpen(true)}
            >
              <AlertCircle className="w-3 h-3 mx-auto mb-0.5 text-destructive" />
              <p className="text-[10px] text-muted-foreground">{t('treasury.uncollected_debts')}</p>
              <MoneyValue value={summary?.uncollectedDebts || 0} currency={cur} className="text-xs font-bold text-destructive" />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Total & Handed Over */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">{t('treasury.total')}</p>
            <MoneyValue value={summary?.total || 0} currency={cur} className="text-sm font-bold" />
          </CardContent>
        </Card>
        <Card className="border-destructive/30">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">{t('treasury.handed_over')}</p>
            <MoneyValue value={summary?.handedOver || 0} currency={cur} className="text-sm font-bold text-destructive" />
          </CardContent>
        </Card>
      </div>

      {/* Remaining Details */}
      {(() => {
        const cashAvailableBeforeHandover =
          (summary?.cash_invoice1 || 0) +
          (summary?.cash_invoice1_stamp || 0) +
          (summary?.receipt_cash || 0) +
          (summary?.cash_invoice2 || 0) +
          (summary?.debtCashCollected || 0) -
          (summary?.coinExchangeOut || 0);
        const nonCash = (summary?.check || 0) + (summary?.bank_receipt || 0) + (summary?.bank_transfer || 0);
        const nonCashHanded = (summary?.check_handed || 0) + (summary?.receipt_handed || 0) + (summary?.transfer_handed || 0);
        const cashHanded = (handovers || []).reduce((sum: number, handover: any) => (
          sum + Number(handover.cash_invoice1 || 0) + Number(handover.cash_invoice2 || 0)
        ), 0);
        const nonCashPending = nonCash - nonCashHanded;
        const physicalRemaining = cashAvailableBeforeHandover - cashHanded;
        const overallRemaining = physicalRemaining + nonCashPending;
        const paperMoney = physicalRemaining - (summary?.coins || 0) + (summary?.coinBillsReturned || 0);
        const hasCashDeficit = physicalRemaining < 0;
        return (
          <div className="space-y-3">
            <Card className="border-primary/30">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">{t('treasury.overall_remaining')}</p>
                <MoneyValue value={overallRemaining} currency={cur} className="text-base font-bold text-primary" />
              </CardContent>
            </Card>

            <Card className="border-green-500/20">
              <CardContent className="p-3 space-y-2">
                <div className="text-center">
                  <p className="text-[11px] font-medium text-muted-foreground">💵 {t('treasury.cash_remaining_after_handover')}</p>
                  <MoneyValue value={physicalRemaining} currency={cur} className={`text-sm font-bold ${hasCashDeficit ? 'text-destructive' : ''}`} />
                </div>
                {hasCashDeficit && (
                  <p className="text-[10px] text-center text-destructive">
                    يوجد عجز نقدي: تم تسليم كاش أكبر من الرصيد النقدي المتاح فعليًا.
                  </p>
                )}
                {(summary?.coins || 0) > 0 && (
                  <>
                    <p className="text-[10px] text-muted-foreground text-center">{t('treasury.cash_split')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-muted/50 p-2 text-center">
                        <Banknote className="w-3.5 h-3.5 mx-auto mb-0.5 text-muted-foreground" />
                        <p className="text-[10px] text-muted-foreground">{t('treasury.paper_money')}</p>
                        <MoneyValue value={paperMoney} currency={cur} className={`text-xs font-bold ${paperMoney < 0 ? 'text-destructive' : ''}`} />
                      </div>
                      <div className="rounded-lg bg-muted/50 p-2 text-center">
                        <Coins className="w-3.5 h-3.5 mx-auto mb-0.5 text-amber-500" />
                        <p className="text-[10px] text-muted-foreground">{t('treasury.coins_from_remaining')}</p>
                        <MoneyValue value={summary?.coins || 0} currency={cur} className="text-xs font-bold text-amber-500" />
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-blue-500/20">
              <CardContent className="p-3 text-center">
                <p className="text-[11px] font-medium text-muted-foreground">🏦 {t('treasury.non_physical_pending')}</p>
                <MoneyValue value={nonCashPending} currency={cur} className="text-sm font-bold" />
                <p className="text-[10px] text-muted-foreground mt-1">{t('treasury.non_cash_details')}</p>
                {nonCashHanded > 0 && <p className="text-[10px] text-green-500 mt-0.5">{t('treasury.handed')}: {nonCashHanded.toLocaleString()} {cur}</p>}
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Treasury Budget / Gap Analysis */}
      {(() => {
        const totalSales = summary?.totalSales || 0;
        const unpaidAmount = summary?.uncollectedDebts || 0;
        const debtCashCollected = summary?.debtCashCollected || 0;
        const totalInTreasury = summary?.total || 0;
        const handedOver = summary?.handedOver || 0;
        const totalExpenses = summary?.totalExpenses || 0;
        const workerHeldAmount = summary?.workerHeldAmount || 0;
        
        const coinExchangeOut = summary?.coinExchangeOut || 0;
        const expectedInTreasury = totalSales - unpaidAmount + debtCashCollected;
        const netInTreasury = totalInTreasury - handedOver - totalExpenses;
        const accountedFor = netInTreasury + handedOver + totalExpenses + workerHeldAmount + coinExchangeOut;
        const gap = expectedInTreasury - accountedFor;
        const hasGap = Math.abs(gap) > 1;
        
        return (
          <Card className={`border-2 ${hasGap ? 'border-orange-500/30 bg-orange-500/5' : 'border-green-500/20 bg-green-500/5'}`}>
            <CardContent className="p-3 space-y-3">
              <div className="flex items-center justify-center gap-2">
                {hasGap ? <AlertTriangle className="w-4 h-4 text-orange-500" /> : <CheckCircle className="w-4 h-4 text-green-500" />}
                <p className={`text-xs font-bold ${hasGap ? 'text-orange-600' : 'text-green-600'}`}>⚖️ {t('treasury.budget_title')}</p>
                <button onClick={() => setInfoOpen(true)} className="p-0.5 rounded-full hover:bg-muted">
                  <Info className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between rounded-lg bg-background p-2">
                  <span className="text-[10px] text-muted-foreground">{t('treasury.total_sales')}</span>
                  <MoneyValue value={totalSales} currency={cur} className="text-xs font-bold" />
                </div>
                <div className="flex items-center justify-between rounded-lg bg-background p-2">
                  <span className="text-[10px] text-muted-foreground">{t('treasury.unpaid')}</span>
                  <span dir="ltr" className="inline-block whitespace-nowrap text-xs font-bold text-orange-500">-{unpaidAmount.toLocaleString()} {cur}</span>
                </div>
                {debtCashCollected > 0 && (
                  <div className="flex items-center justify-between rounded-lg bg-background p-2">
                    <span className="text-[10px] text-muted-foreground">{t('treasury.debt_cash_collected')}</span>
                    <span dir="ltr" className="inline-block whitespace-nowrap text-xs font-bold text-green-500">+{debtCashCollected.toLocaleString()} {cur}</span>
                  </div>
                )}
                <div className="border-t pt-1.5">
                  <div className="flex items-center justify-between rounded-lg bg-primary/5 border border-primary/20 p-2">
                    <span className="text-[10px] font-medium">{t('treasury.expected_in_treasury')}</span>
                    <MoneyValue value={expectedInTreasury} currency={cur} className="text-xs font-bold text-primary" />
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground text-center pt-1">📤 {t('treasury.where_money_went')}</p>

                <div className="flex items-center justify-between rounded-lg bg-background p-2">
                  <span className="text-[10px] text-muted-foreground">{t('treasury.actual_after_handover')}</span>
                  <span className="text-xs font-bold">{netInTreasury.toLocaleString()} {cur}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-background p-2">
                  <span className="text-[10px] text-muted-foreground">{t('treasury.handed_to_upper')}</span>
                  <span className="text-xs font-bold">{handedOver.toLocaleString()} {cur}</span>
                </div>
                {totalExpenses > 0 && (
                  <div className="flex items-center justify-between rounded-lg bg-background p-2">
                    <span className="text-[10px] text-muted-foreground">{t('treasury.approved_expenses')}</span>
                    <span className="text-xs font-bold">{totalExpenses.toLocaleString()} {cur}</span>
                  </div>
                )}
                {workerHeldAmount > 0 && (
                  <div className="flex items-center justify-between rounded-lg bg-amber-500/5 border border-amber-500/20 p-2">
                    <span className="text-[10px] text-muted-foreground">👷 {t('treasury.worker_held')}</span>
                    <span className="text-xs font-bold text-amber-600">{workerHeldAmount.toLocaleString()} {cur}</span>
                  </div>
                )}
                {coinExchangeOut > 0 && (
                  <div className="flex items-center justify-between rounded-lg bg-amber-500/5 border border-amber-500/20 p-2">
                    <span className="text-[10px] text-muted-foreground">🪙 {t('coin_exchange.title') || 'تحويل عملات'}</span>
                    <span className="text-xs font-bold text-amber-600">{coinExchangeOut.toLocaleString()} {cur}</span>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-lg bg-muted/50 p-2">
                  <span className="text-[10px] font-medium">{t('treasury.total_accounted')}</span>
                  <span className="text-xs font-bold">{accountedFor.toLocaleString()} {cur}</span>
                </div>
              </div>

              <div className={`rounded-lg p-2.5 text-center ${hasGap ? (gap > 0 ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-green-500/10 border border-green-500/20') : 'bg-green-500/10 border border-green-500/20'}`}>
                {hasGap ? (
                  <>
                    <p className="text-[10px] text-muted-foreground mb-1">
                      {gap > 0 ? '⚠️ فرق محاسبي سالب' : '💰 فرق محاسبي موجب'}
                    </p>
                    <p className="hidden text-[10px] text-muted-foreground mb-1">
                      {gap > 0 ? `⚠️ ${t('treasury.deficit')}` : `💰 ${t('treasury.surplus')}`}
                    </p>
                    <p className={`text-sm font-bold ${gap > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                      {Math.abs(gap).toLocaleString()} {cur}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {gap > 0
                        ? 'المبلغ المتوقع في الخزينة أكبر من المبلغ الذي تم احتسابه كموجود أو مُسلَّم أو مصروف.'
                        : 'المبلغ المحتسب كموجود أو مُسلَّم أو مصروف أكبر من المبلغ المتوقع في الخزينة وفق المبيعات والديون.'}
                    </p>
                    <p className="hidden text-[10px] text-muted-foreground mt-1">
                      {gap > 0 ? t('treasury.deficit_msg') : t('treasury.surplus_msg')}
                    </p>
                  </>
                ) : (
                  <p className="text-xs font-medium text-green-600">✅ {t('treasury.balanced')}</p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Info Dialog */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent dir={dir} className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>📊 {t('treasury.info.title')}</DialogTitle></DialogHeader>
          <div className="space-y-4 text-sm leading-relaxed">
            <div className="p-3 rounded-lg bg-muted/50 space-y-2">
              <p className="font-bold text-sm">🔍 {t('treasury.info.principle')}</p>
              <p className="text-xs text-muted-foreground">{t('treasury.info.principle_desc')}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 space-y-2">
              <p className="font-bold text-sm">📋 {t('treasury.info.items_compared')}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 space-y-2">
              <p className="font-bold text-sm">⚠️ {t('treasury.info.excluded')}</p>
              <p className="text-xs text-muted-foreground">{t('treasury.info.excluded_desc')}</p>
            </div>
            <div className="p-3 rounded-lg bg-green-500/5 border border-green-500/20 space-y-1">
              <p className="font-bold text-sm text-green-600">✅ {t('treasury.info.when_balanced')}</p>
              <p className="text-xs text-muted-foreground">{t('treasury.info.when_balanced_desc')}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Accounting Discrepancies */}
      {discrepancies && discrepancies.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <p className="text-xs font-medium text-destructive">{t('treasury.discrepancies')} ({discrepancies.length})</p>
              <button onClick={() => setInfoOpen(true)} className="p-0.5 rounded-full hover:bg-muted">
                <Info className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">{t('treasury.discrepancy_desc')}</p>
            <div className="space-y-1.5">
              {discrepancies.map((d, i) => {
                const isSurplus = d.difference > 0;
                return (
                  <div key={i} className="rounded-lg bg-background p-2.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{getItemTypeLabel(d.item_type)}</span>
                      <Badge variant={isSurplus ? 'default' : 'destructive'} className="text-[10px]">
                        {isSurplus ? t('treasury.surplus_label') : t('treasury.deficit_label')} {Math.abs(d.difference).toLocaleString()} {cur}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>📊 {t('treasury.expected_system')}: {d.expected.toLocaleString()} {cur}</span>
                      <span>✅ {t('treasury.actual_recorded')}: {d.actual.toLocaleString()} {cur}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground/80">
                      {isSurplus 
                        ? `💡 ${t('treasury.surplus_detail')} (+${Math.abs(d.difference).toLocaleString()} ${cur})`
                        : `⚠️ ${t('treasury.deficit_detail')} (−${Math.abs(d.difference).toLocaleString()} ${cur})`
                      }
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {(!discrepancies || discrepancies.length === 0) && (
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <p className="text-xs font-medium text-green-600">{t('treasury.no_discrepancies')}</p>
              <button onClick={() => setInfoOpen(true)} className="p-0.5 rounded-full hover:bg-muted">
                <Info className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs: Entries & Handovers */}
      <Tabs value={activeTab} onValueChange={setActiveTab} dir={dir}>
        <TabsList className="w-full">
          <TabsTrigger value="entries" className="flex-1">{t('treasury.entries_tab')}</TabsTrigger>
          <TabsTrigger value="handovers" className="flex-1">{t('treasury.handovers_tab')}</TabsTrigger>
        </TabsList>

        <TabsContent value="entries" className="space-y-2 mt-2">
          {(!entries || entries.length === 0) ? (
            <p className="text-center text-muted-foreground py-8">{t('treasury.no_entries')}</p>
          ) : entries.map(entry => {
            const method = paymentMethodLabels[entry.payment_method];
            return (
              <Card key={entry.id}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      {method?.icon && <method.icon className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="font-medium">{Number(entry.amount).toLocaleString()} {cur}</p>
                      <p className="text-xs text-muted-foreground">
                        {method?.label || entry.payment_method}
                        {(entry as any).invoice_number && ` - ${t('treasury.invoice')} #${(entry as any).invoice_number}`}
                        {entry.check_number && ` - ${t('treasury.check')} #${entry.check_number}`}
                        {entry.receipt_number && ` - ${t('treasury.receipt')} #${entry.receipt_number}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-end">
                    <Badge variant={entry.source_type === 'accounting_session' ? 'default' : 'secondary'}>
                      {entry.source_type === 'accounting_session' ? t('treasury.accounting') : t('treasury.manual')}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(new Date(entry.created_at), 'dd/MM HH:mm', { locale: dateLocale })}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="handovers" id="handovers-section" className="space-y-2 mt-2">
          {(!handovers || handovers.length === 0) ? (
            <p className="text-center text-muted-foreground py-8">{t('treasury.no_handovers')}</p>
          ) : handovers.map(h => {
            return (
              <Card key={h.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Send className="w-4 h-4 text-destructive" />
                      <p className="font-bold">{Number(h.amount).toLocaleString()} {cur}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); setViewHandover(h.id); }}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); openEditHandover(h); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); setPrintHandover(h.id); }}>
                        <Printer className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={async (e) => {
                        e.stopPropagation();
                        setPrintHandover(h.id);
                        setTimeout(async () => {
                          if (printRef.current) {
                            try {
                              await generatePDF(printRef.current, `bordereau_${h.handover_date}.pdf`);
                              toast.success('تم حفظ الملف بنجاح');
                            } catch { toast.error('فشل في حفظ الملف'); }
                          }
                          setPrintHandover(null);
                        }, 500);
                      }}>
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={async (e) => {
                        e.stopPropagation();
                        setPrintHandover(h.id);
                        setTimeout(async () => {
                          if (printRef.current) {
                            try {
                              await generateImage(printRef.current, `bordereau_${h.handover_date}.png`);
                              toast.success('تم حفظ الصورة بنجاح');
                            } catch { toast.error('فشل في حفظ الصورة'); }
                          }
                          setPrintHandover(null);
                        }, 500);
                      }}>
                        <Image className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={(e) => { e.stopPropagation(); if (confirm(t('common.confirm_delete'))) deleteHandover(h.id); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(h.created_at), 'dd/MM/yyyy', { locale: dateLocale })}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    {Number(h.cash_invoice1 ?? 0) > 0 && <p>{t('treasury.cash_f1')}: {Number(h.cash_invoice1).toLocaleString()} {cur}</p>}
                    {Number(h.cash_invoice2 ?? 0) > 0 && <p>{t('treasury.cash_f2')}: {Number(h.cash_invoice2).toLocaleString()} {cur}</p>}
                    {Number(h.checks_amount ?? 0) > 0 && <p>{t('treasury.checks')}: {Number(h.checks_amount).toLocaleString()} {cur} ({h.check_count ?? 0})</p>}
                    {Number(h.receipts_amount ?? 0) > 0 && <p>{t('treasury.versement')}: {Number(h.receipts_amount).toLocaleString()} {cur} ({h.receipt_count ?? 0})</p>}
                    {Number(h.transfers_amount ?? 0) > 0 && <p>{t('treasury.virement')}: {Number(h.transfers_amount).toLocaleString()} {cur} ({(h as any).transfer_count ?? 0})</p>}
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[10px]">
                    {(h as any).delivery_method && (
                      <Badge variant="outline" className="text-[10px] h-5">
                        {(h as any).delivery_method === 'direct' ? '🏢 تسليم مباشر' : (h as any).delivery_method === 'bank_transfer' ? '🏦 تحويل بنكي' : '🤝 عبر وسيط'}
                      </Badge>
                    )}
                    {((h as any).receiver_name || (h as any).received_by) && <Badge variant="secondary" className="text-[10px] h-5">📥 {(h as any).receiver_name || (h as any).received_by}</Badge>}
                    {(h as any).intermediary_name && <Badge variant="secondary" className="text-[10px] h-5">🤝 {(h as any).intermediary_name}</Badge>}
                  </div>
                  {h.notes && <p className="text-xs text-muted-foreground">{h.notes}</p>}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      {/* Print Handover Dialog */}
      {printHandover && (() => {
        const h = handovers?.find(ho => ho.id === printHandover);
        if (!h) return null;
        return (
          <Dialog open={!!printHandover} onOpenChange={(open) => !open && setPrintHandover(null)}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="ltr">
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span>طباعة التسليم</span>
                  <Button size="sm" onClick={() => {
                    const printContent = printRef.current;
                    if (!printContent) return;
                    const w = window.open('', '_blank');
                    if (!w) return;
                    w.document.write(`<html><head><title>Bordereau</title><style>
                      @page { size: A4 portrait; margin: 15mm; }
                      body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; padding: 20px; direction: ltr; }
                      table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
                      th, td { border: 1px solid #000; padding: 4px 6px; text-align: left; }
                      th { background: #f0f0f0; }
                      .text-right { text-align: right; }
                      .text-center { text-align: center; }
                      .font-bold { font-weight: bold; }
                      .underline { text-decoration: underline; }
                      h1, h2, h3 { margin: 4px 0; }
                      .border-2 { border: 2px solid #000; padding: 12px; margin-bottom: 16px; }
                      .mb-4 { margin-bottom: 16px; }
                      .mt-6 { margin-top: 24px; }
                      .mt-10 { margin-top: 40px; }
                      .mb-1 { margin-bottom: 4px; }
                      .mb-2 { margin-bottom: 8px; }
                      .p-3 { padding: 12px; }
                      .text-sm { font-size: 12px; }
                      .text-base { font-size: 14px; }
                      .text-lg { font-size: 16px; }
                      .text-xs { font-size: 11px; }
                      @media print { body { margin: 0; padding: 15px; } }
                    </style></head><body>${printContent.innerHTML}</body></html>`);
                    w.document.close();
                    w.print();
                  }}>
                    <Printer className="w-4 h-4 mx-1" /> طباعة
                  </Button>
                  <Button size="sm" variant="outline" onClick={async () => {
                    if (!printRef.current) return;
                    try {
                      await generatePDF(printRef.current, `bordereau_${h.handover_date}.pdf`);
                      toast.success('تم حفظ الملف بنجاح');
                    } catch { toast.error('فشل في حفظ الملف'); }
                  }}>
                    <Download className="w-4 h-4 mx-1" /> PDF
                  </Button>
                  <Button size="sm" variant="outline" onClick={async () => {
                    if (!printRef.current) return;
                    try {
                      await generateImage(printRef.current, `bordereau_${h.handover_date}.png`);
                      toast.success('تم حفظ الصورة بنجاح');
                    } catch { toast.error('فشل في حفظ الصورة'); }
                  }}>
                    <Image className="w-4 h-4 mx-1" /> صورة
                  </Button>
                </DialogTitle>
              </DialogHeader>
              <div ref={printRef}>
                <HandoverPrintView
                  handoverId={h.id}
                  handoverDate={h.handover_date}
                  cashInvoice1={Number(h.cash_invoice1)}
                  cashInvoice2={Number(h.cash_invoice2)}
                  checksAmount={Number(h.checks_amount)}
                  receiptsAmount={Number(h.receipts_amount)}
                  transfersAmount={Number(h.transfers_amount)}
                  totalAmount={Number(h.amount)}
                  branchName={activeBranch?.name}
                  branchWilaya={activeBranch?.wilaya}
                  deliveryMethod={(h as any).delivery_method}
                  intermediaryName={(h as any).intermediary_name}
                  bankTransferReference={(h as any).bank_transfer_reference}
                  receivedBy={(h as any).receiver_name || (h as any).received_by}
                  unifiedCash={(h as any).unified_cash ?? true}
                />
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* View Handover Dialog */}
      {viewHandover && (() => {
        const h = handovers?.find(ho => ho.id === viewHandover);
        if (!h) return null;
        return (
          <Dialog open={!!viewHandover} onOpenChange={(open) => !open && setViewHandover(null)}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="ltr">
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between">
                  <span>{t('treasury.handover_details')}</span>
                  <Button size="sm" variant="outline" onClick={() => {
                    const printContent = viewRef.current;
                    if (!printContent) return;
                    const w = window.open('', '_blank');
                    if (!w) return;
                    w.document.write(`<html><head><style>body{font-family:sans-serif;direction:ltr;padding:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #000;padding:4px 8px;text-align:left}@media print{body{padding:0}}</style></head><body>${printContent.innerHTML}</body></html>`);
                    w.document.close();
                    w.print();
                  }}>
                    <Printer className="w-4 h-4 mx-1" /> طباعة
                  </Button>
                  <Button size="sm" variant="outline" onClick={async () => {
                    if (!viewRef.current) return;
                    try {
                      await generatePDF(viewRef.current, `bordereau_${h.handover_date}.pdf`);
                      toast.success('تم حفظ الملف بنجاح');
                    } catch { toast.error('فشل في حفظ الملف'); }
                  }}>
                    <Download className="w-4 h-4 mx-1" /> PDF
                  </Button>
                  <Button size="sm" variant="outline" onClick={async () => {
                    if (!viewRef.current) return;
                    try {
                      await generateImage(viewRef.current, `bordereau_${h.handover_date}.png`);
                      toast.success('تم حفظ الصورة بنجاح');
                    } catch { toast.error('فشل في حفظ الصورة'); }
                  }}>
                    <Image className="w-4 h-4 mx-1" /> صورة
                  </Button>
                </DialogTitle>
              </DialogHeader>
              <div ref={viewRef}>
                <HandoverPrintView
                  handoverId={h.id}
                  handoverDate={h.handover_date}
                  cashInvoice1={Number(h.cash_invoice1)}
                  cashInvoice2={Number(h.cash_invoice2)}
                  checksAmount={Number(h.checks_amount)}
                  receiptsAmount={Number(h.receipts_amount)}
                  transfersAmount={Number(h.transfers_amount)}
                  totalAmount={Number(h.amount)}
                  branchName={activeBranch?.name}
                  branchWilaya={activeBranch?.wilaya}
                  deliveryMethod={(h as any).delivery_method}
                  intermediaryName={(h as any).intermediary_name}
                  bankTransferReference={(h as any).bank_transfer_reference}
                  receivedBy={(h as any).receiver_name || (h as any).received_by}
                  unifiedCash={(h as any).unified_cash ?? true}
                />
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Edit Handover Dialog */}
      {editHandover && (() => {
        const h = handovers?.find(ho => ho.id === editHandover);
        if (!h) return null;
        const editChecksTotal = editItems.checks.reduce((s, i) => s + i.amount, 0);
        const editReceiptsTotal = editItems.receipts.reduce((s, i) => s + i.amount, 0);
        const editTransfersTotal = editItems.transfers.reduce((s, i) => s + i.amount, 0);
        const editGrandTotal = editCash1 + editCash2 + editChecksTotal + editReceiptsTotal + editTransfersTotal;
        return (
          <Dialog open={!!editHandover} onOpenChange={(open) => !open && setEditHandover(null)}>
            <DialogContent dir={dir} className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('treasury.edit_handover')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Cash section - editable */}
                <div className="p-3 rounded-lg bg-muted/50 space-y-3">
                  <p className="font-medium text-sm">💵 {t('treasury.cash')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">{t('treasury.cash_invoice1')}</Label><Input type="number" value={editCash1} onChange={e => setEditCash1(Number(e.target.value))} /></div>
                    <div><Label className="text-xs">{t('treasury.cash_invoice2')}</Label><Input type="number" value={editCash2} onChange={e => setEditCash2(Number(e.target.value))} /></div>
                  </div>
                </div>

                {/* Checks - read only */}
                {editItems.checks.length > 0 && (
                  <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                    <p className="font-medium text-sm">📝 {t('treasury.checks')} ({editItems.checks.length})</p>
                    {editItems.checks.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs bg-background rounded-md px-2 py-1.5 border">
                        <span className="truncate flex-1">{item.customer_name}</span>
                        <span className="font-bold whitespace-nowrap">{item.amount.toLocaleString()} {cur}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-xs pt-1 border-t">
                      <span className="text-muted-foreground">{t('common.total')}</span>
                      <span className="font-bold">{editChecksTotal.toLocaleString()} {cur}</span>
                    </div>
                  </div>
                )}

                {/* Receipts - read only */}
                {editItems.receipts.length > 0 && (
                  <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                    <p className="font-medium text-sm">🧾 {t('treasury.versement')} ({editItems.receipts.length})</p>
                    {editItems.receipts.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs bg-background rounded-md px-2 py-1.5 border">
                        <span className="truncate flex-1">{item.customer_name}</span>
                        <span className="font-bold whitespace-nowrap">{item.amount.toLocaleString()} {cur}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-xs pt-1 border-t">
                      <span className="text-muted-foreground">{t('common.total')}</span>
                      <span className="font-bold">{editReceiptsTotal.toLocaleString()} {cur}</span>
                    </div>
                  </div>
                )}

                {/* Transfers - read only */}
                {editItems.transfers.length > 0 && (
                  <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                    <p className="font-medium text-sm">🏦 {t('treasury.virement')} ({editItems.transfers.length})</p>
                    {editItems.transfers.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs bg-background rounded-md px-2 py-1.5 border">
                        <span className="truncate flex-1">{item.customer_name}</span>
                        <span className="font-bold whitespace-nowrap">{item.amount.toLocaleString()} {cur}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-xs pt-1 border-t">
                      <span className="text-muted-foreground">{t('common.total')}</span>
                      <span className="font-bold">{editTransfersTotal.toLocaleString()} {cur}</span>
                    </div>
                  </div>
                )}

                {/* Total */}
                {editGrandTotal > 0 && (
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{t('treasury.total_handover')}</span>
                      <span className="text-sm font-bold text-primary">{editGrandTotal.toLocaleString()} {cur}</span>
                    </div>
                  </div>
                )}

                {/* Delivery Method */}
                <div className="flex items-center justify-between">
                  <Label className="text-sm">🚚 {t('treasury.delivery_method') || 'طريقة التسليم'}</Label>
                  <Switch checked={editDeliveryMethod !== 'direct'} onCheckedChange={(checked) => { setEditDeliveryMethod(checked ? 'intermediary' : 'direct'); if (!checked) { setEditIntermediaryName(''); } }} />
                </div>
                {editDeliveryMethod !== 'direct' && (
                  <div className="p-3 rounded-lg bg-muted/50 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">{t('treasury.via_intermediary') || 'الوسيط'}</Label>
                        <Select value={editIntermediaryName} onValueChange={v => setEditIntermediaryName(v)}>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder={t('treasury.select_intermediary') || 'اختر الوسيط'} />
                          </SelectTrigger>
                          <SelectContent>
                            {(contacts || []).filter((c: any) => c.contact_type === 'intermediary').map((c: any) => (
                              <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">{t('treasury.receiver') || 'المستلم'}</Label>
                        <Select value={editReceivedBy} onValueChange={v => setEditReceivedBy(v)}>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder={t('treasury.select_receiver') || 'اختر المستلم'} />
                          </SelectTrigger>
                          <SelectContent>
                            {(contacts || []).filter((c: any) => c.contact_type === 'receiver').map((c: any) => (
                              <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {(editIntermediaryName || editReceivedBy) && (
                      <p className="text-xs text-muted-foreground text-center border-t pt-2 mt-1">
                        🏢 {t('treasury.branch_manager') || 'مدير الفرع'}
                        {editIntermediaryName && <> ← 🤝 <span className="font-medium">{editIntermediaryName}</span></>}
                        {editReceivedBy && <> ← 📥 <span className="font-medium">{editReceivedBy}</span></>}
                      </p>
                    )}
                  </div>
                )}

                <div><Label>{t('treasury.notes')}</Label><Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} /></div>
                <Button className="w-full" onClick={saveEditHandover} disabled={editSaving}>
                  {editSaving ? t('common.saving') : t('common.save')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
      <TreasurySettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <CoinExchangeDialog open={coinExchangeOpen} onOpenChange={setCoinExchangeOpen} />
      <InvoiceRequestDialog open={invoiceRequestOpen} onOpenChange={setInvoiceRequestOpen} />
    </div>
  );
};

// Helper component for picker sections in handover dialog
const PickerSection = ({ label, items, onOpen, onRemove, currency }: {
  label: string;
  items: PickedItem[];
  onOpen: () => void;
  onRemove: (orderId: string) => void;
  currency: string;
}) => {
  const { t } = useLanguage();
  const total = items.reduce((s, i) => s + i.amount, 0);
  return (
    <div className="p-3 rounded-lg bg-muted/50 space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm">{label}</p>
        <Button variant="outline" size="sm" className="text-xs h-7" onClick={(e) => { e.preventDefault(); onOpen(); }}>
          {t('treasury.select')}
        </Button>
      </div>
      {items.length > 0 ? (
        <div className="space-y-1">
          {items.map(item => (
            <div key={item.order_id} className="flex items-center justify-between text-xs bg-background rounded-md px-2 py-1.5 border">
              <span className="truncate flex-1">{item.customer_name}</span>
              <span className="font-bold mx-2 whitespace-nowrap">{item.amount.toLocaleString()} {currency}</span>
              <button onClick={(e) => { e.preventDefault(); onRemove(item.order_id); }} className="text-destructive hover:text-destructive/80 text-xs">✕</button>
            </div>
          ))}
          <div className="flex items-center justify-between text-xs pt-1 border-t">
            <span className="text-muted-foreground">{items.length} {t('treasury.items')}</span>
            <span className="font-bold">{total.toLocaleString()} {currency}</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-2">{t('treasury.no_items_selected')}</p>
      )}
    </div>
  );
};

export default ManagerTreasury;
