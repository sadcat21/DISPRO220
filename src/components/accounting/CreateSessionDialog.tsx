import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Loader2, Calculator, Receipt, Banknote, CreditCard, ArrowDownCircle, ArrowUpCircle, Wallet, TrendingDown, Coins, AlertTriangle, Package, ShoppingBag, RefreshCw, Gift, Tag } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSessionCalculations, SessionCalculations } from '@/hooks/useSessionCalculations';
import { useCreateSession, useUpdateFullSession, AccountingSession, AccountingSessionItem } from '@/hooks/useAccountingSessions';
import { useCreateWorkerDebt } from '@/hooks/useWorkerDebts';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import ProductStockSummary from './ProductStockSummary';
import SalesDetailsSummary from './SalesDetailsSummary';
import PromoTrackingSummary from './PromoTrackingSummary';

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
  const { activeBranch } = useAuth();
  const createSession = useCreateSession();
  const updateSession = useUpdateFullSession();
  const createWorkerDebt = useCreateWorkerDebt();
  const [deficitRegistered, setDeficitRegistered] = useState(false);
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
      setDeficitRegistered(false);
      setIsSubmitting(false);
    }
  }, [open, editSession, selectedWorkerId]);

  // Auto-update periodEnd to current time every 30 seconds (only in create mode)
  useEffect(() => {
    if (!open || isEditMode) return;
    const interval = setInterval(() => {
      setPeriodEnd(nowLocal());
    }, 30000);
    return () => clearInterval(interval);
  }, [open, isEditMode]);

  const calcParams = selectedWorkerId && periodStart && periodEnd
    ? { workerId: selectedWorkerId, branchId: activeBranch?.id, periodStart, periodEnd }
    : null;

  const { data: calc, isLoading: calcLoading } = useSessionCalculations(calcParams, { refetchInterval: autoRefresh ? 600000 : false });

  useEffect(() => {
    if (calc && !isEditMode) {
      setActualCash(String(calc.physicalCash));
    }
  }, [calc, isEditMode]);

  const cashDifference = calc ? Number(actualCash || 0) - calc.physicalCash : 0;

  const [isSubmitting, setIsSubmitting] = useState(false);

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
        { item_type: 'invoice2_cash', expected_amount: calc.invoice2.cash, actual_amount: calc.invoice2.cash },
        { item_type: 'debt_collections_total', expected_amount: calc.debtCollections.total, actual_amount: calc.debtCollections.total },
        { item_type: 'debt_collections_cash', expected_amount: calc.debtCollections.cash, actual_amount: calc.debtCollections.cash },
        { item_type: 'debt_collections_check', expected_amount: calc.debtCollections.check, actual_amount: calc.debtCollections.check },
        { item_type: 'debt_collections_transfer', expected_amount: calc.debtCollections.transfer, actual_amount: calc.debtCollections.transfer },
        { item_type: 'debt_collections_receipt', expected_amount: calc.debtCollections.receipt, actual_amount: calc.debtCollections.receipt },
        { item_type: 'physical_cash', expected_amount: calc.physicalCash, actual_amount: Number(actualCash || 0) },
        { item_type: 'coin_amount', expected_amount: 0, actual_amount: Number(coinAmount || 0) },
        { item_type: 'expenses', expected_amount: calc.expenses, actual_amount: calc.expenses },
      ];

      if (isEditMode && editSession) {
        await updateSession.mutateAsync({
          session_id: editSession.id,
          period_start: periodStart,
          period_end: periodEnd,
          notes: sessionNotes || undefined,
          items,
        });
        toast.success(t('accounting.session_updated') || 'تم تحديث الجلسة بنجاح');
      } else {
        await createSession.mutateAsync({
          worker_id: selectedWorkerId,
          period_start: periodStart,
          period_end: periodEnd,
          notes: sessionNotes || undefined,
          items,
        });
        toast.success(t('accounting.session_created'));
      }
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0 gap-0 overflow-hidden" dir={dir}>
        <DialogHeader className="p-4 pb-3 border-b bg-muted/30">
          <DialogTitle className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Calculator className="w-5 h-5 text-primary" />
            </div>
            <div className="flex flex-col">
              <span>{isEditMode ? (t('accounting.edit_session') || 'تعديل الجلسة') : t('accounting.new_session')}</span>
              {workerName && <span className="text-xs font-normal text-muted-foreground">{workerName}</span>}
            </div>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-6rem)] px-4 py-3">
          <div className="space-y-4">
            {/* Period */}
            <div className="space-y-2">
              <SectionDivider label={t('accounting.period') || 'الفترة'} />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">{t('accounting.period_start')}</Label>
                  <Input type="datetime-local" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="text-xs rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">{t('accounting.period_end')}</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[10px] text-primary hover:text-primary/80 gap-1"
                      onClick={() => setPeriodEnd(nowLocal())}
                    >
                      <RefreshCw className="w-3 h-3" />
                      {t('common.refresh') || 'تحديث'}
                    </Button>
                  </div>
                  <Input type="datetime-local" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="text-xs rounded-lg" />
                </div>
              </div>
              <div className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
                <Label className="text-xs font-medium text-muted-foreground">تحديث تلقائي للبيانات</Label>
                <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
              </div>
            </div>

            {calcLoading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="mr-2 text-sm text-muted-foreground">{t('accounting.calculating')}</span>
              </div>
            )}

            {calc && (
              <div className="space-y-4">
                {/* === Section 1: Total Sales === */}
                <SectionCard
                  icon={<ArrowUpCircle className="w-4 h-4 text-primary" />}
                  title={t('accounting.total_sales')}
                  value={calc.totalSales}
                  highlight
                />

                {/* === Section 2: Paid vs Debts === */}
                <div className="grid grid-cols-2 gap-2.5">
                  <SectionCard
                    icon={<Banknote className="w-3.5 h-3.5 text-green-600" />}
                    title={t('accounting.total_paid')}
                    value={calc.totalPaid}
                    color="green"
                    small
                  />
                  <SectionCard
                    icon={<TrendingDown className="w-3.5 h-3.5 text-destructive" />}
                    title={t('accounting.new_debts')}
                    value={calc.newDebts}
                    color="red"
                    small
                  />
                </div>

                {/* === Section 3: Invoice 1 === */}
                <div className="border-2 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <Receipt className="w-4 h-4 text-blue-600" />
                    </div>
                    <span className="font-bold text-sm">{t('accounting.invoice1')}</span>
                    <span className="ms-auto font-bold text-sm text-blue-600">{fmt(calc.invoice1.total)} DA</span>
                  </div>
                  <div className="space-y-0.5">
                    <PaymentRow label={t('accounting.method_check')} value={calc.invoice1.check} />
                    <PaymentRow label={t('accounting.method_transfer')} value={calc.invoice1.transfer} />
                    <PaymentRow label={t('accounting.method_receipt')} value={calc.invoice1.receipt} />
                    <PaymentRow label={t('accounting.method_espace_cash')} value={calc.invoice1.espaceCash} highlight />
                  </div>
                </div>

                {/* === Section 4: Invoice 2 === */}
                <div className="border-2 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <Banknote className="w-4 h-4 text-emerald-600" />
                    </div>
                    <span className="font-bold text-sm">{t('accounting.invoice2')}</span>
                    <span className="ms-auto font-bold text-sm text-emerald-600">{fmt(calc.invoice2.total)} DA</span>
                  </div>
                  <PaymentRow label={t('accounting.method_direct_cash')} value={calc.invoice2.cash} highlight />
                </div>

                {/* === Section 5: Debt Collections === */}
                <div className="border-2 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                      <ArrowDownCircle className="w-4 h-4 text-orange-600" />
                    </div>
                    <span className="font-bold text-sm">{t('accounting.debt_collections')}</span>
                    <span className="ms-auto font-bold text-sm text-orange-600">{fmt(calc.debtCollections.total)} DA</span>
                  </div>
                  <div className="space-y-0.5">
                    <PaymentRow label={t('accounting.method_cash')} value={calc.debtCollections.cash} highlight />
                    <PaymentRow label={t('accounting.method_check')} value={calc.debtCollections.check} />
                    <PaymentRow label={t('accounting.method_transfer')} value={calc.debtCollections.transfer} />
                    <PaymentRow label={t('accounting.method_receipt')} value={calc.debtCollections.receipt} />
                  </div>
                </div>

                {/* === Section 6: Physical Cash === */}
                <div className="border-2 border-primary rounded-xl p-3.5 space-y-3 bg-primary/5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                      <Wallet className="w-5 h-5 text-primary" />
                    </div>
                    <span className="font-bold text-sm">{t('accounting.physical_cash')}</span>
                  </div>

                  <div className="space-y-1 text-xs bg-background/60 rounded-lg p-2.5">
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t('accounting.invoice2')} ({t('accounting.method_direct_cash')})</span>
                      <span>{fmt(calc.invoice2.cash)} DA</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t('accounting.invoice1')} ({t('accounting.method_espace_cash')})</span>
                      <span>{fmt(calc.invoice1.espaceCash)} DA</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t('accounting.debt_collections')} ({t('accounting.method_cash')})</span>
                      <span>{fmt(calc.debtCollections.cash)} DA</span>
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

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">{t('accounting.actual_cash_received')}</Label>
                    <Input
                      type="number"
                      value={actualCash}
                      onChange={e => setActualCash(e.target.value)}
                      className="h-11 text-lg font-bold text-center rounded-lg"
                      placeholder="0"
                    />
                  </div>

                  {actualCash !== '' && (
                    <div className={`rounded-xl p-3 text-center ${cashDifference >= 0 ? 'bg-green-100 dark:bg-green-900/20' : 'bg-destructive/10'}`}>
                      <p className="text-xs text-muted-foreground mb-0.5">{t('accounting.difference')}</p>
                      <p className={`text-xl font-bold ${cashDifference >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                        {cashDifference >= 0 ? '+' : ''}{fmt(cashDifference)} DA
                      </p>
                    </div>
                  )}

                  {actualCash !== '' && cashDifference < 0 && !deficitRegistered && (
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="w-full text-xs rounded-lg"
                      onClick={async () => {
                        try {
                          await createWorkerDebt.mutateAsync({
                            worker_id: selectedWorkerId,
                            amount: Math.abs(cashDifference),
                            debt_type: 'deficit',
                            session_id: undefined,
                            description: `عجز جلسة محاسبة ${format(new Date(), 'dd/MM/yyyy')}`,
                          });
                          setDeficitRegistered(true);
                          toast.success('تم تسجيل العجز كدين على العامل');
                        } catch {
                          toast.error('خطأ في تسجيل العجز');
                        }
                      }}
                      disabled={createWorkerDebt.isPending}
                    >
                      {createWorkerDebt.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin ml-1" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 ml-1" />
                      )}
                      تسجيل العجز كدين على العامل ({fmt(Math.abs(cashDifference))} DA)
                    </Button>
                  )}
                  {deficitRegistered && (
                    <p className="text-xs text-center text-green-600 font-medium">✓ تم تسجيل العجز كدين على العامل</p>
                  )}

                  {/* Coin amount */}
                  <div className="space-y-1.5 border-t pt-3">
                    <div className="flex items-center gap-2">
                      <Coins className="w-4 h-4 text-muted-foreground" />
                      <Label className="text-xs font-semibold">{t('accounting.coin_amount')}</Label>
                    </div>
                    <Input
                      type="number"
                      value={coinAmount}
                      onChange={e => setCoinAmount(e.target.value)}
                      onFocus={e => e.target.select()}
                      className="h-9 text-center rounded-lg"
                      placeholder="0"
                    />
                    {coinAmount && Number(coinAmount) > 0 && actualCash !== '' && (
                      <p className="text-xs text-muted-foreground text-center">
                        {t('accounting.coin_amount')}: {fmt(Number(coinAmount))} DA — {t('accounting.method_cash')}: {fmt(Number(actualCash || 0) - Number(coinAmount))} DA
                      </p>
                    )}
                  </div>
                </div>

                {/* === Section 7: Gift Offer Value === */}
                <SectionCard
                  icon={<Gift className="w-4 h-4 text-purple-600" />}
                  title="القيمة المالية لهدايا العروض"
                  value={calc.giftOfferValue}
                  color="purple"
                  small
                />

                {/* === Section 8: Expenses === */}
                <SectionCard
                  icon={<CreditCard className="w-4 h-4 text-muted-foreground" />}
                  title={t('accounting.expenses')}
                  value={calc.expenses}
                  small
                />

                {/* === Grand Summary === */}
                <div className="border-2 rounded-xl p-3.5 space-y-2.5 bg-muted/30">
                  <p className="font-bold text-sm text-center">{t('accounting.grand_summary')}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <SummaryItem label={t('accounting.total_sales')} value={calc.totalSales} />
                    <SummaryItem label={t('accounting.total_paid')} value={calc.totalPaid} color="green" />
                    <SummaryItem label={t('accounting.new_debts')} value={calc.newDebts} color="red" />
                    <SummaryItem label={t('accounting.debt_collections')} value={calc.debtCollections.total} color="orange" />
                    <SummaryItem label={t('accounting.physical_cash')} value={calc.physicalCash} color="primary" />
                    <SummaryItem label={t('accounting.expenses')} value={calc.expenses} />
                    <SummaryItem label={t('accounting.coin_amount')} value={Number(coinAmount || 0)} />
                  </div>
                </div>
              </div>
            )}

            {/* Product & Sales Tracking */}
            {selectedWorkerId && periodStart && periodEnd && (
              <>
                <div className="border-2 rounded-xl p-3.5">
                  <SectionDividerWithIcon
                    icon={<Package className="w-4 h-4 text-primary" />}
                    label={t('accounting.truck_stock') || 'تتبع المنتجات'}
                  />
                  <ProductStockSummary
                    workerId={selectedWorkerId}
                    branchId={activeBranch?.id}
                    periodStart={periodStart}
                    periodEnd={periodEnd}
                  />
                </div>
                <div className="border-2 rounded-xl p-3.5">
                  <SectionDividerWithIcon
                    icon={<ShoppingBag className="w-4 h-4 text-primary" />}
                    label={t('accounting.sales_details')}
                  />
                  <SalesDetailsSummary
                    workerId={selectedWorkerId}
                    periodStart={periodStart}
                    periodEnd={periodEnd}
                  />
                </div>
                {/* Promo Tracking */}
                {calc && calc.promoTracking.length > 0 && (
                  <div className="border-2 rounded-xl p-3.5">
                    <SectionDividerWithIcon
                      icon={<Tag className="w-4 h-4 text-purple-600" />}
                      label="تتبع العروض"
                    />
                    <PromoTrackingSummary
                      items={calc.promoTracking}
                      totalGiftValue={calc.giftOfferValue}
                    />
                  </div>
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
              onClick={handleSubmit}
              disabled={isSubmitting || createSession.isPending || updateSession.isPending || !selectedWorkerId || !calc}
            >
              {(isSubmitting || createSession.isPending || updateSession.isPending) && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
              {isEditMode ? (t('accounting.update_session') || 'حفظ التعديلات') : t('accounting.save_session')}
            </Button>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
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
