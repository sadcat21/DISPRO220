import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Loader2, Calculator, Receipt, Banknote, CreditCard, ArrowDownCircle, ArrowUpCircle, Wallet, TrendingDown, Coins, AlertTriangle, Package, ShoppingBag, RefreshCw, Gift, Tag, HandCoins, FileText, ClipboardList, Truck } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSessionCalculations, SessionCalculations } from '@/hooks/useSessionCalculations';
import { useCreateSession, useUpdateFullSession, AccountingSession, AccountingSessionItem } from '@/hooks/useAccountingSessions';
import { useCreateWorkerDebt } from '@/hooks/useWorkerDebts';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import ProductStockSummary from './ProductStockSummary';
import SalesDetailsSummary from './SalesDetailsSummary';
import PromoTrackingSummary from './PromoTrackingSummary';
import StockDiscrepancySection from './StockDiscrepancySection';
import DebtCollectionsSummary from './DebtCollectionsSummary';
import DocumentCollectionsSummary from './DocumentCollectionsSummary';
import ExceptionalActionsSummary from './ExceptionalActionsSummary';
import WorkerHandoverSummary from './WorkerHandoverSummary';
import { usePendingDiscrepancies } from '@/hooks/useStockDiscrepancies';
import TruckReviewSection from './TruckReviewSection';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';

interface CreateSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedWorkerId?: string;
  workerName?: string;
  editSession?: AccountingSession | null;
}

const fmt = (n: number) => n.toLocaleString();

const CreateSessionDialog: React.FC<CreateSessionDialogProps> = ({ open, onOpenChange, preselectedWorkerId, workerName, editSession }) => {
  const { t, dir } = useLanguage();
  const { activeBranch, workerId: currentWorkerId } = useAuth();
  const createSession = useCreateSession();
  const updateSession = useUpdateFullSession();
  const createWorkerDebt = useCreateWorkerDebt();
  const [registerDeficit, setRegisterDeficit] = useState(false);
  const [viewByProduct, setViewByProduct] = useState(false);
  const [registerDeficitTreasury, setRegisterDeficitTreasury] = useState(false);
  const [registerSurplus, setRegisterSurplus] = useState(false);
  const nowLocal = () => {
    const now = new Date();
    const algeriaOffset = 1 * 60;
    const localMs = now.getTime() + (algeriaOffset + now.getTimezoneOffset()) * 60000;
    const d = new Date(localMs);
    return format(d, "yyyy-MM-dd'T'HH:mm");
  };
  const todayStart = () => format(new Date(), "yyyy-MM-dd") + 'T00:00';
  const [periodStart, setPeriodStart] = useState(todayStart());
  const [periodEnd, setPeriodEnd] = useState(nowLocal());
  const [sessionNotes, setSessionNotes] = useState('');
  const [actualCash, setActualCash] = useState('');
  const [coinAmount, setCoinAmount] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);

  const isEditMode = !!editSession;
  const selectedWorkerId = editSession?.worker_id || preselectedWorkerId || '';

  useEffect(() => {
    if (open) {
      if (editSession) {
        const ps = editSession.period_start.includes('T') ? editSession.period_start.slice(0, 16) : editSession.period_start + 'T00:00';
        const pe = editSession.period_end.includes('T') ? editSession.period_end.slice(0, 16) : editSession.period_end + 'T23:59';
        setPeriodStart(ps);
        setPeriodEnd(pe);
        setSessionNotes(editSession.notes || '');
        const cashItem = editSession.items?.find(i => i.item_type === 'physical_cash');
        const coinItem = editSession.items?.find(i => i.item_type === 'coin_amount');
        setActualCash(cashItem ? String(Number(cashItem.actual_amount)) : '');
        setCoinAmount(coinItem ? String(Number(coinItem.actual_amount)) : '');
      } else {
        const fetchLastSession = async () => {
          if (!selectedWorkerId) return;
          const { data } = await supabase
            .from('accounting_sessions')
            .select('completed_at, period_end')
            .eq('worker_id', selectedWorkerId)
            .eq('status', 'completed')
            .order('completed_at', { ascending: false })
            .limit(1);
          
          if (data && data.length > 0) {
            const ca = data[0].completed_at ? new Date(data[0].completed_at) : null;
            const pe = data[0].period_end ? new Date(data[0].period_end) : null;
            let refDate: Date | null = null;
            if (ca && pe && !isNaN(ca.getTime()) && !isNaN(pe.getTime())) {
              refDate = ca.getTime() > pe.getTime() ? ca : pe;
            } else {
              refDate = (ca && !isNaN(ca.getTime())) ? ca : (pe && !isNaN(pe.getTime())) ? pe : null;
            }

            if (refDate) {
              const algeriaOffset = 1 * 60;
              const localMs = refDate.getTime() + (algeriaOffset + refDate.getTimezoneOffset()) * 60000;
              const localDate = new Date(localMs);
              setPeriodStart(format(localDate, "yyyy-MM-dd'T'HH:mm"));
            } else {
              setPeriodStart(todayStart());
            }
          } else {
            setPeriodStart(todayStart());
          }
        };
        fetchLastSession();
        setPeriodEnd(nowLocal());
        setSessionNotes('');
        setActualCash('');
        setCoinAmount('');
      }
      setRegisterDeficit(false);
      setRegisterDeficitTreasury(false);
      setRegisterSurplus(false);
      setIsSubmitting(false);
      setShowConfirmation(false);
      setReceivedDocs({});
    }
  }, [open, editSession, selectedWorkerId]);

  // Auto-update periodEnd removed - user controls manually via refresh button

  const calcParams = selectedWorkerId && periodStart && periodEnd
    ? { workerId: selectedWorkerId, branchId: activeBranch?.id, periodStart, periodEnd }
    : null;

  const { data: calc, isLoading: calcLoading } = useSessionCalculations(calcParams, { refetchInterval: autoRefresh ? 600000 : false });
  const { data: pendingDiscrepancies = [] } = usePendingDiscrepancies(selectedWorkerId || null);

  // Check for loading/unloading sessions after last review
  const { data: postReviewInfo } = useQuery({
    queryKey: ['post-review-sessions', selectedWorkerId],
    queryFn: async () => {
      const { data: lastReview } = await supabase
        .from('loading_sessions')
        .select('id, created_at')
        .eq('worker_id', selectedWorkerId!)
        .eq('status', 'review')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (!lastReview) return { count: 0 };
      const { count } = await supabase
        .from('loading_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('worker_id', selectedWorkerId!)
        .neq('status', 'review')
        .gt('created_at', lastReview.created_at);
      return { count: count || 0 };
    },
    enabled: !!selectedWorkerId,
  });

  useEffect(() => {
    if (calc && !isEditMode) {
      setActualCash(String(calc.physicalCash));
    }
  }, [calc, isEditMode]);

  const cashDifference = calc ? Number(actualCash || 0) - calc.physicalCash : 0;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [receivedDocs, setReceivedDocs] = useState<Record<string, boolean>>({});

  const handleShowConfirmation = () => {
    if (!selectedWorkerId || !calc) { toast.error('اختر العامل'); return; }
    setShowConfirmation(true);
  };

  const handleSubmit = async () => {
    if (!selectedWorkerId || !calc || isSubmitting) { toast.error('اختر العامل'); return; }

    setIsSubmitting(true);
    try {
      const items = [
        { item_type: 'total_sales', expected_amount: calc.totalSales, actual_amount: calc.totalSales },
        { item_type: 'total_paid', expected_amount: calc.totalPaid, actual_amount: calc.totalPaid },
        { item_type: 'new_debts', expected_amount: calc.newDebts, actual_amount: calc.newDebts },
        { item_type: 'invoice1_total', expected_amount: calc.invoice1.total, actual_amount: calc.invoice1.total },
        { item_type: 'invoice1_check', expected_amount: calc.invoice1.check, actual_amount: calc.invoice1.check },
        { item_type: 'invoice1_transfer', expected_amount: calc.invoice1.transfer, actual_amount: calc.invoice1.transfer },
        { item_type: 'invoice1_receipt', expected_amount: calc.invoice1.receipt, actual_amount: calc.invoice1.receipt },
        { item_type: 'invoice1_espace_cash', expected_amount: calc.invoice1.espaceCash, actual_amount: calc.invoice1.espaceCash },
        { item_type: 'invoice1_versement_cash', expected_amount: calc.invoice1.versementCash, actual_amount: calc.invoice1.versementCash },
        { item_type: 'invoice2_cash', expected_amount: calc.invoice2.cash, actual_amount: calc.invoice2.cash },
        { item_type: 'debt_collections_total', expected_amount: calc.debtCollections.total, actual_amount: calc.debtCollections.total },
        { item_type: 'debt_collections_cash', expected_amount: calc.debtCollections.cash, actual_amount: calc.debtCollections.cash },
        { item_type: 'debt_collections_check', expected_amount: calc.debtCollections.check, actual_amount: calc.debtCollections.check },
        { item_type: 'debt_collections_transfer', expected_amount: calc.debtCollections.transfer, actual_amount: calc.debtCollections.transfer },
        { item_type: 'debt_collections_receipt', expected_amount: calc.debtCollections.receipt, actual_amount: calc.debtCollections.receipt },
        { item_type: 'physical_cash', expected_amount: calc.physicalCash, actual_amount: Number(actualCash || 0) },
        { item_type: 'coin_amount', expected_amount: 0, actual_amount: Number(coinAmount || 0) },
        { item_type: 'expenses', expected_amount: calc.expenses, actual_amount: calc.expenses },
        { item_type: 'customer_surplus_cash', expected_amount: calc.customerSurplusCash, actual_amount: calc.customerSurplusCash },
      ];

      let sessionId: string | undefined;

      if (isEditMode && editSession) {
        await updateSession.mutateAsync({
          session_id: editSession.id,
          period_start: periodStart,
          period_end: periodEnd,
          notes: sessionNotes || undefined,
          items,
        });
        sessionId = editSession.id;
        toast.success(t('accounting.session_updated') || 'تم تحديث الجلسة بنجاح');
      } else {
        const result = await createSession.mutateAsync({
          worker_id: selectedWorkerId,
          period_start: periodStart,
          period_end: periodEnd,
          notes: sessionNotes || undefined,
          items,
        });
        sessionId = result?.id;
        toast.success(t('accounting.session_created'));
      }

      // Register deficit as worker debt AND in surplus/deficit treasury
      if (registerDeficit && cashDifference < 0) {
        try {
          await createWorkerDebt.mutateAsync({
            worker_id: selectedWorkerId,
            amount: Math.abs(cashDifference),
            debt_type: 'deficit',
            session_id: sessionId,
            description: `عجز جلسة محاسبة ${format(new Date(), 'dd/MM/yyyy')}`,
          });
          // Always also record in surplus/deficit treasury
          await supabase.from('manager_treasury').insert({
            manager_id: currentWorkerId!,
            branch_id: activeBranch?.id || null,
            session_id: sessionId || null,
            source_type: 'accounting_deficit',
            payment_method: 'cash',
            amount: Math.abs(cashDifference),
            notes: `عجز جلسة محاسبة - ${workerName || selectedWorkerId}`,
          });
          toast.success('تم تسجيل العجز كدين على العامل وفي خزينة الفائض والعجز');
        } catch { toast.error('خطأ في تسجيل العجز'); }
      }

      // Register deficit ONLY in surplus/deficit treasury (no worker debt)
      if (registerDeficitTreasury && cashDifference < 0) {
        try {
          await supabase.from('manager_treasury').insert({
            manager_id: currentWorkerId!,
            branch_id: activeBranch?.id || null,
            session_id: sessionId || null,
            source_type: 'accounting_deficit',
            payment_method: 'cash',
            amount: Math.abs(cashDifference),
            notes: `عجز جلسة محاسبة (خزينة فقط) - ${workerName || selectedWorkerId}`,
          });
          toast.success('تم تسجيل العجز في خزينة الفائض والعجز');
        } catch { toast.error('خطأ في تسجيل العجز في الخزينة'); }
      }

      // Register surplus in manager treasury
      if (registerSurplus && cashDifference > 0) {
        try {
          await supabase.from('manager_treasury').insert({
            manager_id: currentWorkerId!,
            branch_id: activeBranch?.id || null,
            session_id: sessionId || null,
            source_type: 'accounting_surplus',
            payment_method: 'cash',
            amount: cashDifference,
            notes: `فائض جلسة محاسبة - ${workerName || selectedWorkerId}`,
          });
          toast.success('تم تسجيل الفائض في الخزينة');
        } catch { toast.error('خطأ في تسجيل الفائض'); }
      }

      setShowConfirmation(false);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[92vw] sm:w-full sm:max-w-lg max-h-[90vh] p-0 gap-0 rounded-xl" dir={dir}>
        <DialogHeader className="px-3 py-3 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Calculator className="w-5 h-5 text-primary" />
              </div>
              <div className="flex flex-col">
                <span>{isEditMode ? (t('accounting.edit_session') || 'تعديل الجلسة') : t('accounting.new_session')}</span>
                {workerName && <span className="text-xs font-normal text-muted-foreground">{workerName}</span>}
              </div>
            </DialogTitle>
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] text-muted-foreground">حسب المنتج</Label>
              <Switch checked={viewByProduct} onCheckedChange={setViewByProduct} />
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-6rem)] [&_[data-radix-scroll-area-viewport]]:[scrollbar-gutter:stable] [&_[data-radix-scroll-area-viewport]]:px-3 [&_[data-radix-scroll-area-viewport]]:py-3 [&_[data-radix-scroll-area-scrollbar]]:w-2 [&_[data-radix-scroll-area-thumb]]:bg-muted-foreground/40">
          <div className="space-y-3">

            {/* ━━━ Step 1: Period ━━━ */}
            <StepSection step={1} title={t('accounting.period') || 'الفترة'} color="primary">
              <div className="flex items-center gap-1.5" dir="rtl">
                <Input 
                  type="datetime-local" 
                  value={periodStart} 
                  onChange={e => setPeriodStart(e.target.value)} 
                  className="text-[11px] h-8 rounded-lg border-muted flex-1 [direction:ltr]" 
                />
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-primary hover:text-primary/80" onClick={() => setPeriodEnd(nowLocal())}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
                <Input 
                  type="datetime-local" 
                  value={periodEnd} 
                  onChange={e => setPeriodEnd(e.target.value)} 
                  className="text-[11px] h-8 rounded-lg border-muted flex-1 [direction:ltr]" 
                />
              </div>
            </StepSection>

            {/* Warning: sessions after last review */}
            {(postReviewInfo?.count || 0) > 0 && (
              <Alert className="rounded-xl border-orange-300 bg-orange-50 dark:bg-orange-900/10">
                <Info className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-sm font-medium text-orange-800 dark:text-orange-400">
                  ⚠️ توجد {postReviewInfo!.count} جلسة شحن/تفريغ بعد آخر جلسة مراجعة — المحاسبة مبنية على آخر جلسة مراجعة فقط
                </AlertDescription>
              </Alert>
            )}

            {calcLoading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="mr-2 text-sm text-muted-foreground">{t('accounting.calculating')}</span>
              </div>
            )}

            {calc && (
              <>
                {/* ━━━ Step 2: Sales Overview ━━━ */}
                <StepSection step={2} title="ملخص المبيعات" color="primary">
                  <div className="bg-primary/5 rounded-xl p-3 mb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ArrowUpCircle className="w-5 h-5 text-primary" />
                        <span className="font-bold text-sm">{t('accounting.total_sales')}</span>
                      </div>
                      <span className="text-xl font-bold text-primary">{fmt(calc.totalSales)} DA</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-green-50 dark:bg-green-900/10 rounded-lg p-2.5 text-center">
                      <p className="text-[10px] text-muted-foreground">{t('accounting.total_paid')}</p>
                      <p className="font-bold text-lg text-green-600">{fmt(calc.totalPaid)} DA</p>
                    </div>
                    <div className="bg-destructive/5 rounded-lg p-2.5 text-center">
                      <p className="text-[10px] text-muted-foreground">{t('accounting.new_debts')}</p>
                      <p className="font-bold text-lg text-destructive">{fmt(calc.newDebts)} DA</p>
                    </div>
                  </div>
                </StepSection>

                {/* ━━━ Step 3: Payment Breakdown ━━━ */}
                <StepSection step={3} title="تفاصيل المدفوعات" color="blue">
                  {/* Invoice 1 */}
                  <div className="rounded-lg border p-3 space-y-1.5 mb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Receipt className="w-3.5 h-3.5 text-blue-600" />
                        <span className="font-bold text-xs">{t('accounting.invoice1')}</span>
                      </div>
                      <span className="font-bold text-xs text-blue-600">{fmt(calc.invoice1.total)} DA</span>
                    </div>
                    <div className="space-y-0.5">
                      <PaymentRow label={t('accounting.method_check')} value={calc.invoice1.check} />
                      <PaymentRow label={t('accounting.method_transfer')} value={calc.invoice1.transfer} />
                      <PaymentRow label={t('accounting.method_receipt')} value={calc.invoice1.receipt} />
                      <PaymentRow label={t('accounting.method_espace_cash')} value={calc.invoice1.espaceCash} highlight />
                      <PaymentRow label="Versement (cache)" value={calc.invoice1.versementCash} highlight />
                    </div>
                  </div>
                  {/* Invoice 2 */}
                  <div className="rounded-lg border p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="font-bold text-xs">{t('accounting.invoice2')}</span>
                      </div>
                      <span className="font-bold text-xs text-emerald-600">{fmt(calc.invoice2.total)} DA</span>
                    </div>
                    <PaymentRow label={t('accounting.method_direct_cash')} value={calc.invoice2.cash} highlight />
                  </div>
                </StepSection>

                {/* ━━━ Step 4: Debt Collections ━━━ */}
                <StepSection step={4} title={t('accounting.debt_collections')} color="orange" badge={`${fmt(calc.debtCollections.total)} DA`}>
                  <div className="space-y-0.5">
                    <PaymentRow label={t('accounting.method_cash')} value={calc.debtCollections.cash} highlight />
                    <PaymentRow label={t('accounting.method_check')} value={calc.debtCollections.check} />
                    <PaymentRow label={t('accounting.method_transfer')} value={calc.debtCollections.transfer} />
                    <PaymentRow label={t('accounting.method_receipt')} value={calc.debtCollections.receipt} />
                  </div>
                </StepSection>

                {/* ━━━ Step 5: Physical Cash (Key Input) ━━━ */}
                <StepSection step={5} title={t('accounting.physical_cash')} color="primary" important>
                  <div className="space-y-1 text-xs bg-muted/40 rounded-lg p-2.5">
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t('accounting.invoice2')} ({t('accounting.method_direct_cash')})</span>
                      <span>{fmt(calc.invoice2.cash)} DA</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t('accounting.invoice1')} ({t('accounting.method_espace_cash')})</span>
                      <span>{fmt(calc.invoice1.espaceCash)} DA</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Versement (cache)</span>
                      <span>{fmt(calc.invoice1.versementCash)} DA</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t('accounting.debt_collections')} ({t('accounting.method_cash')})</span>
                      <span>{fmt(calc.debtCollections.cash)} DA</span>
                    </div>
                    <div className="flex justify-between text-blue-600">
                      <span>فائض العملاء (كاش)</span>
                      <span>{calc.customerSurplusCash > 0 ? '+' : ''}{fmt(calc.customerSurplusCash)} DA</span>
                    </div>
                    <div className="flex justify-between text-destructive">
                      <span>{t('accounting.expenses')} ({t('accounting.method_cash')})</span>
                      <span>-{fmt(calc.cashExpenses)} DA</span>
                    </div>
                    <div className="border-t pt-1.5 flex justify-between font-bold text-sm">
                      <span>{t('accounting.expected')}</span>
                      <span className="text-primary">{fmt(calc.physicalCash)} DA</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 mt-3">
                    <Label className="text-xs font-semibold">{t('accounting.actual_cash_received')}</Label>
                    <Input type="number" value={actualCash} onChange={e => setActualCash(e.target.value)} className="h-11 text-lg font-bold text-center rounded-lg" placeholder="0" />
                  </div>

                  {actualCash !== '' && (
                    <div className={`rounded-xl p-3 text-center mt-2 ${cashDifference >= 0 ? 'bg-green-100 dark:bg-green-900/20' : 'bg-destructive/10'}`}>
                      <p className="text-xs text-muted-foreground mb-0.5">{t('accounting.difference')}</p>
                      <p className={`text-xl font-bold ${cashDifference >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                        {cashDifference >= 0 ? '+' : ''}{fmt(cashDifference)} DA
                      </p>
                    </div>
                  )}

                  {actualCash !== '' && cashDifference < 0 && (
                    <div className="space-y-2 mt-2">
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10">
                        <Checkbox id="register-deficit" checked={registerDeficit} onCheckedChange={(v) => { setRegisterDeficit(!!v); if (!!v) setRegisterDeficitTreasury(false); }} />
                        <label htmlFor="register-deficit" className="text-xs font-medium text-destructive cursor-pointer">
                          تسجيل العجز كدين على العامل + في خزينة الفائض والعجز ({fmt(Math.abs(cashDifference))} DA)
                        </label>
                      </div>
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-100 dark:bg-orange-900/20">
                        <Checkbox id="register-deficit-treasury" checked={registerDeficitTreasury} onCheckedChange={(v) => { setRegisterDeficitTreasury(!!v); if (!!v) setRegisterDeficit(false); }} />
                        <label htmlFor="register-deficit-treasury" className="text-xs font-medium text-orange-700 dark:text-orange-400 cursor-pointer">
                          تسجيل العجز فقط في خزينة الفائض والعجز ({fmt(Math.abs(cashDifference))} DA)
                        </label>
                      </div>
                    </div>
                  )}

                  {actualCash !== '' && cashDifference > 0 && (
                    <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-green-100 dark:bg-green-900/20">
                      <Checkbox id="register-surplus" checked={registerSurplus} onCheckedChange={(v) => setRegisterSurplus(!!v)} />
                      <label htmlFor="register-surplus" className="text-xs font-medium text-green-700 dark:text-green-400 cursor-pointer">
                        تسجيل الفائض في الخزينة ({fmt(cashDifference)} DA)
                      </label>
                    </div>
                  )}

                  {/* Coin amount */}
                  <div className="space-y-1.5 border-t pt-3 mt-3">
                    <div className="flex items-center gap-2">
                      <Coins className="w-4 h-4 text-muted-foreground" />
                      <Label className="text-xs font-semibold">{t('accounting.coin_amount')}</Label>
                    </div>
                    <Input type="number" value={coinAmount} onChange={e => setCoinAmount(e.target.value)} onFocus={e => e.target.select()} className="h-9 text-center rounded-lg" placeholder="0" />
                    {coinAmount && Number(coinAmount) > 0 && actualCash !== '' && (
                      <p className="text-xs text-muted-foreground text-center">
                        {t('accounting.coin_amount')}: {fmt(Number(coinAmount))} DA — {t('accounting.method_cash')}: {fmt(Number(actualCash || 0) - Number(coinAmount))} DA
                      </p>
                    )}
                  </div>
                </StepSection>

                {/* ━━━ Step 6: Expenses & Gifts ━━━ */}
                <StepSection step={6} title="المصاريف" color="muted">
                  <div className="rounded-lg border p-2.5 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <CreditCard className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">{t('accounting.expenses')}</span>
                    </div>
                    <p className="font-bold text-lg">{fmt(calc.expenses)} DA</p>
                  </div>
                </StepSection>

                {/* ━━━ Step 7: Grand Summary ━━━ */}
                <StepSection step={7} title={t('accounting.grand_summary')} color="primary" important>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <SummaryItem label={t('accounting.total_sales')} value={calc.totalSales} />
                    <SummaryItem label={t('accounting.total_paid')} value={calc.totalPaid} color="green" />
                    <SummaryItem label={t('accounting.new_debts')} value={calc.newDebts} color="red" />
                    <SummaryItem label={t('accounting.debt_collections')} value={calc.debtCollections.total} color="orange" />
                    <SummaryItem label={t('accounting.physical_cash')} value={calc.physicalCash} color="primary" />
                    <SummaryItem label={t('accounting.expenses')} value={calc.expenses} />
                    <SummaryItem label={t('accounting.coin_amount')} value={Number(coinAmount || 0)} />
                  </div>
                </StepSection>
              </>
            )}

            {/* ━━━ Step 8: Worker Handover ━━━ */}
            {selectedWorkerId && periodStart && periodEnd && calc && (
              <StepSection step={8} title="تسليم العامل" color="primary">
                <WorkerHandoverSummary
                  workerId={selectedWorkerId}
                  periodStart={periodStart}
                  periodEnd={periodEnd}
                  calc={calc}
                  coinAmount={Number(coinAmount || 0)}
                />
              </StepSection>
            )}

            {/* ━━━ Step 9: Stock & Sales Tracking ━━━ */}
            {selectedWorkerId && periodStart && periodEnd && (
              <>
                <StepSection step={9} title={t('accounting.truck_stock') || 'تتبع المنتجات'} color="primary" badge="A">
                  <ProductStockSummary workerId={selectedWorkerId} branchId={activeBranch?.id} periodStart={periodStart} periodEnd={periodEnd} viewByProduct={viewByProduct} promoTracking={viewByProduct ? calc?.promoTracking : undefined} />
                </StepSection>
                {!viewByProduct && (
                  <>
                    <StepSection step={9} title={t('accounting.sales_details')} color="primary" badge="B">
                      <SalesDetailsSummary workerId={selectedWorkerId} periodStart={periodStart} periodEnd={periodEnd} />
                    </StepSection>
                    {calc && calc.promoTracking.length > 0 && (
                      <StepSection step={9} title="تتبع العروض" color="purple" badge="C">
                        <PromoTrackingSummary items={calc.promoTracking} />
                      </StepSection>
                    )}
                  </>
                )}

                {/* ━━━ Step 10: Debt Collections Detail ━━━ */}
                <StepSection step={10} title="تفاصيل الديون المحصلة" color="orange">
                  <DebtCollectionsSummary workerId={selectedWorkerId} periodStart={periodStart} periodEnd={periodEnd} />
                </StepSection>

                {/* ━━━ Step 11: Document Collections ━━━ */}
                <StepSection step={11} title="المستندات المحصلة (شيكات / وصولات)" color="blue">
                  <DocumentCollectionsSummary workerId={selectedWorkerId} periodStart={periodStart} periodEnd={periodEnd} receivedDocs={receivedDocs} onReceivedDocsChange={setReceivedDocs} />
                </StepSection>

                {/* ━━━ Step 12: Exceptional Actions ━━━ */}
                <StepSection step={12} title="إجراءات استثنائية" color="amber">
                  <ExceptionalActionsSummary workerId={selectedWorkerId} periodStart={periodStart} periodEnd={periodEnd} />
                </StepSection>

                {/* ━━━ Step 13: Stock Discrepancies ━━━ */}
                {pendingDiscrepancies.length > 0 && (
                  <StepSection step={13} title="فوارق المخزون (فائض / عجز)" color="red">
                    <StockDiscrepancySection discrepancies={pendingDiscrepancies} />
                  </StepSection>
                )}
              </>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label className="font-semibold">{t('common.notes')}</Label>
              <Textarea value={sessionNotes} onChange={e => setSessionNotes(e.target.value)} rows={2} className="rounded-lg" />
            </div>

            {/* Submit */}
            <Button
              className="w-full rounded-xl h-11 text-base font-bold"
              onClick={handleShowConfirmation}
              disabled={isSubmitting || createSession.isPending || updateSession.isPending || !selectedWorkerId || !calc}
            >
              {isEditMode ? (t('accounting.update_session') || 'حفظ التعديلات') : t('accounting.save_session')}
            </Button>
          </div>
        </ScrollArea>
      </DialogContent>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmation} onOpenChange={setShowConfirmation}>
        <DialogContent className="max-w-lg max-h-[90vh] p-0 gap-0 overflow-hidden" dir={dir}>
          <DialogHeader className="p-4 pb-3 border-b bg-muted/30">
            <DialogTitle className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-primary" />
              </div>
              <div className="flex flex-col">
                <span>ملخص التسليم</span>
                {workerName && <span className="text-xs font-normal text-muted-foreground">{workerName}</span>}
              </div>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-12rem)] px-4 py-3 space-y-3">
            {calc && (
              <WorkerHandoverSummary
                workerId={selectedWorkerId}
                periodStart={periodStart}
                periodEnd={periodEnd}
                calc={calc}
                coinAmount={Number(coinAmount || 0)}
              />
            )}

            {/* Warning for unchecked document items */}
            {Object.entries(receivedDocs).some(([k, v]) => k.startsWith('doc_') && !v || k.startsWith('stamp_') && !v) && (
              <div className="mt-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">
                  بعض المستندات لم يتم تأكيد استلامها. ستُسجل في ذمة العامل كمستندات غير مسلمة.
                </p>
              </div>
            )}
          </ScrollArea>
          <div className="p-4 border-t flex gap-2">
            <Button
              variant="outline"
              className="flex-1 rounded-xl h-11"
              onClick={() => setShowConfirmation(false)}
            >
              العودة للمراجعة
            </Button>
            <Button
              className="flex-1 rounded-xl h-11 text-base font-bold"
              onClick={handleSubmit}
              disabled={isSubmitting || createSession.isPending || updateSession.isPending}
            >
              {(isSubmitting || createSession.isPending || updateSession.isPending) && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
              تأكيد الحفظ
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

// === Step Section Component ===
const stepColors: Record<string, string> = {
  primary: 'border-primary/30 text-primary bg-primary/10',
  blue: 'border-blue-300 dark:border-blue-800 text-blue-600 bg-blue-50 dark:bg-blue-900/20',
  orange: 'border-orange-300 dark:border-orange-800 text-orange-600 bg-orange-50 dark:bg-orange-900/20',
  amber: 'border-amber-300 dark:border-amber-800 text-amber-600 bg-amber-50 dark:bg-amber-900/20',
  red: 'border-destructive/30 text-destructive bg-destructive/5',
  muted: 'border-border text-muted-foreground bg-muted/30',
  green: 'border-green-300 dark:border-green-800 text-green-600 bg-green-50 dark:bg-green-900/20',
};

const StepSection: React.FC<{
  step: number;
  title: string;
  color?: string;
  badge?: string;
  important?: boolean;
  children: React.ReactNode;
}> = ({ step, title, color = 'primary', badge, important, children }) => {
  const colorClass = stepColors[color] || stepColors.primary;
  return (
    <div className={`rounded-xl border-2 p-3.5 space-y-2.5 ${important ? 'border-primary bg-primary/5' : 'border-border'}`}>
      <div className="flex items-center gap-2.5">
        <div className={`${badge ? 'w-auto px-1.5 min-w-[1.5rem]' : 'w-6'} h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${colorClass}`}>
          {badge ? `${step}-${badge}` : step}
        </div>
        <h3 className="font-bold text-sm flex-1">{title}</h3>
      </div>
      {children}
    </div>
  );
};

// === Helper Components ===

const SectionDivider: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center gap-2">
    <div className="h-px flex-1 bg-border" />
    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
    <div className="h-px flex-1 bg-border" />
  </div>
);

const SectionDividerWithIcon: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className="flex items-center gap-2.5 mb-3">
    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
      {icon}
    </div>
    <h3 className="font-bold text-sm">{label}</h3>
    <div className="h-px flex-1 bg-border" />
  </div>
);

const SectionCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  value: number;
  color?: string;
  highlight?: boolean;
  small?: boolean;
}> = ({ icon, title, value, color, highlight, small }) => (
  <div className={`border-2 rounded-xl p-3.5 ${highlight ? 'border-primary/30 bg-primary/5' : ''}`}>
    <div className="flex items-center gap-2">
      {icon}
      <span className={`font-semibold ${small ? 'text-xs' : 'text-sm'}`}>{title}</span>
    </div>
    <p className={`font-bold mt-1.5 ${small ? 'text-lg' : 'text-2xl'} ${
      color === 'green' ? 'text-green-600' : 
      color === 'red' ? 'text-destructive' : 
      color === 'orange' ? 'text-orange-600' : 
      color === 'purple' ? 'text-purple-600' :
      'text-primary'
    }`}>
      {fmt(value)} DA
    </p>
  </div>
);

const PaymentRow: React.FC<{ label: string; value: number; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div className={`flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg ${highlight ? 'bg-amber-50 dark:bg-amber-900/10 font-medium' : ''}`}>
    <span className="text-muted-foreground">{label}</span>
    <span className={`font-bold ${value > 0 ? '' : 'text-muted-foreground/50'}`}>
      {fmt(value)} DA
    </span>
  </div>
);

const SummaryItem: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color }) => (
  <div className="text-center p-2 bg-background rounded-lg">
    <p className="text-muted-foreground text-[10px]">{label}</p>
    <p className={`font-bold text-sm ${
      color === 'green' ? 'text-green-600' :
      color === 'red' ? 'text-destructive' :
      color === 'orange' ? 'text-orange-600' :
      color === 'primary' ? 'text-primary' :
      ''
    }`}>
      {fmt(value)}
    </p>
  </div>
);

export default CreateSessionDialog;
