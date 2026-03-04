import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Calendar, User, Receipt, Banknote, ArrowDownCircle, ArrowUpCircle, Wallet, CreditCard, TrendingDown, Coins, AlertTriangle, Pencil, Package, ShoppingBag, Calculator, Gift, Tag, HandCoins, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSessionItems, AccountingSession, AccountingSessionItem } from '@/hooks/useAccountingSessions';
import { useCreateWorkerDebt } from '@/hooks/useWorkerDebts';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import ProductStockSummary from './ProductStockSummary';
import SalesDetailsSummary from './SalesDetailsSummary';
import PromoTrackingSummary from './PromoTrackingSummary';
import CreateSessionDialog from './CreateSessionDialog';
import DebtCollectionsSummary from './DebtCollectionsSummary';
import { useSessionCalculations } from '@/hooks/useSessionCalculations';

interface SessionDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: AccountingSession;
}

const fmt = (n: number) => n.toLocaleString();

const getItemValue = (items: AccountingSessionItem[], type: string): { expected: number; actual: number } => {
  const item = items.find(i => i.item_type === type);
  return { expected: Number(item?.expected_amount || 0), actual: Number(item?.actual_amount || 0) };
};

const CollapsibleSection: React.FC<{ icon: React.ReactNode; title: string; summary?: string; children: React.ReactNode; className?: string }> = ({ icon, title, summary, children, className = '' }) => (
  <Collapsible>
    <div className={`border-2 rounded-xl overflow-hidden ${className}`}>
      <CollapsibleTrigger className="w-full flex items-center gap-2.5 p-3.5 hover:bg-muted/30 transition-colors">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <h3 className="font-bold text-sm flex-1 text-start">{title}</h3>
        {summary && <span className="text-xs text-muted-foreground shrink-0">{summary}</span>}
        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 transition-transform [[data-state=open]>&]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3.5 pb-3.5">
          {children}
        </div>
      </CollapsibleContent>
    </div>
  </Collapsible>
);

const SessionDetailsDialog: React.FC<SessionDetailsDialogProps> = ({ open, onOpenChange, session }) => {
  const { t, dir } = useLanguage();
  const { data: items, isLoading } = useSessionItems(session.id);
  const createWorkerDebt = useCreateWorkerDebt();
  const [deficitAdded, setDeficitAdded] = useState(false);
  const [surplusAdded, setSurplusAdded] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  
  // Fetch live calculations for promo tracking
  const { data: liveCalc } = useSessionCalculations({
    workerId: session.worker_id,
    branchId: session.branch_id || undefined,
    periodStart: session.period_start,
    periodEnd: session.period_end,
  });

  const handleAddDeficit = async (amount: number) => {
    try {
      await createWorkerDebt.mutateAsync({
        worker_id: session.worker_id,
        amount: Math.abs(amount),
        debt_type: 'deficit',
        session_id: session.id,
        description: `عجز جلسة محاسبة ${format(new Date(session.session_date), 'dd/MM/yyyy')}`,
      });
      setDeficitAdded(true);
      toast.success('تم إضافة العجز كدين على العامل');
    } catch {
      toast.error('خطأ في إضافة العجز');
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'open': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'disputed': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default: return '';
    }
  };

  const isNewFormat = items?.some(i => i.item_type === 'invoice1_total' || i.item_type === 'physical_cash');

  const renderNewFormat = () => {
    if (!items) return null;

    const totalSales = getItemValue(items, 'total_sales');
    const totalPaid = getItemValue(items, 'total_paid');
    const newDebts = getItemValue(items, 'new_debts');
    const inv1Total = getItemValue(items, 'invoice1_total');
    const inv1Check = getItemValue(items, 'invoice1_check');
    const inv1Transfer = getItemValue(items, 'invoice1_transfer');
    const inv1Receipt = getItemValue(items, 'invoice1_receipt');
    const inv1EspaceCash = getItemValue(items, 'invoice1_espace_cash');
    const inv1VersementCash = getItemValue(items, 'invoice1_versement_cash');
    const inv2Cash = getItemValue(items, 'invoice2_cash');
    const dcTotal = getItemValue(items, 'debt_collections_total');
    const dcCash = getItemValue(items, 'debt_collections_cash');
    const dcCheck = getItemValue(items, 'debt_collections_check');
    const dcTransfer = getItemValue(items, 'debt_collections_transfer');
    const dcReceipt = getItemValue(items, 'debt_collections_receipt');
    const physicalCash = getItemValue(items, 'physical_cash');
    const coinAmountItem = getItemValue(items, 'coin_amount');
    const expenses = getItemValue(items, 'expenses');

    const cashDiff = physicalCash.actual - physicalCash.expected;

    return (
      <div className="space-y-4">
        {/* Total Sales */}
        <ValueCard icon={<ArrowUpCircle className="w-4 h-4 text-primary" />} title={t('accounting.total_sales')} value={totalSales.expected} highlight />

        {/* Paid vs Debts */}
        <div className="grid grid-cols-2 gap-2.5">
          <ValueCard icon={<Banknote className="w-3.5 h-3.5 text-green-600" />} title={t('accounting.total_paid')} value={totalPaid.expected} color="green" small />
          <ValueCard icon={<TrendingDown className="w-3.5 h-3.5 text-destructive" />} title={t('accounting.new_debts')} value={newDebts.expected} color="red" small />
        </div>

        {/* Invoice 1 */}
        <div className="border-2 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Receipt className="w-4 h-4 text-blue-600" />
            </div>
            <span className="font-bold text-sm">{t('accounting.invoice1')}</span>
            <span className="ms-auto font-bold text-sm text-blue-600">{fmt(inv1Total.expected)} DA</span>
          </div>
          <div className="space-y-0.5">
            <DetailRow label={t('accounting.method_check')} value={inv1Check.expected} />
            <DetailRow label={t('accounting.method_transfer')} value={inv1Transfer.expected} />
            <DetailRow label={t('accounting.method_receipt')} value={inv1Receipt.expected} />
            <DetailRow label={t('accounting.method_espace_cash')} value={inv1EspaceCash.expected} highlight />
            <DetailRow label="Versement (cache)" value={inv1VersementCash.expected} highlight />
          </div>
        </div>

        {/* Invoice 2 */}
        <div className="border-2 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Banknote className="w-4 h-4 text-emerald-600" />
            </div>
            <span className="font-bold text-sm">{t('accounting.invoice2')}</span>
            <span className="ms-auto font-bold text-sm text-emerald-600">{fmt(inv2Cash.expected)} DA</span>
          </div>
          <DetailRow label={t('accounting.method_direct_cash')} value={inv2Cash.expected} highlight />
        </div>

        {/* Debt Collections */}
        <div className="border-2 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <ArrowDownCircle className="w-4 h-4 text-orange-600" />
            </div>
            <span className="font-bold text-sm">{t('accounting.debt_collections')}</span>
            <span className="ms-auto font-bold text-sm text-orange-600">{fmt(dcTotal.expected)} DA</span>
          </div>
          <div className="space-y-0.5">
            <DetailRow label={t('accounting.method_cash')} value={dcCash.expected} highlight />
            <DetailRow label={t('accounting.method_check')} value={dcCheck.expected} />
            <DetailRow label={t('accounting.method_transfer')} value={dcTransfer.expected} />
            <DetailRow label={t('accounting.method_receipt')} value={dcReceipt.expected} />
          </div>
        </div>

        {/* Physical Cash */}
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
              <span>{fmt(inv2Cash.expected)} DA</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>{t('accounting.invoice1')} ({t('accounting.method_espace_cash')})</span>
              <span>{fmt(inv1EspaceCash.expected)} DA</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Versement (cache)</span>
              <span>{fmt(inv1VersementCash.expected)} DA</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>{t('accounting.debt_collections')} ({t('accounting.method_cash')})</span>
              <span>{fmt(dcCash.expected)} DA</span>
            </div>
            {(() => {
              const customerSurplusItem = items?.find(i => i.item_type === 'customer_surplus_cash');
              const csVal = customerSurplusItem ? Number(customerSurplusItem.expected_amount || 0) : 0;
              return (
                <div className="flex justify-between text-blue-600">
                  <span>فائض العملاء (كاش)</span>
                  <span>{csVal > 0 ? '+' : ''}{fmt(csVal)} DA</span>
                </div>
              );
            })()}
            {expenses.expected > 0 && (
              <div className="flex justify-between text-destructive">
                <span>{t('accounting.expenses')} ({t('accounting.method_cash')})</span>
                <span>-{fmt(expenses.expected)} DA</span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2.5 text-center text-xs border-t pt-3">
            <div className="bg-background/60 rounded-lg p-2">
              <p className="text-[10px] text-muted-foreground mb-0.5">{t('accounting.expected')}</p>
              <p className="font-bold text-sm">{fmt(physicalCash.expected)}</p>
            </div>
            <div className="bg-background/60 rounded-lg p-2">
              <p className="text-[10px] text-muted-foreground mb-0.5">{t('accounting.actual')}</p>
              <p className="font-bold text-sm">{fmt(physicalCash.actual)}</p>
            </div>
            <div className={`rounded-lg p-2 ${cashDiff >= 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-destructive/10'}`}>
              <p className="text-[10px] text-muted-foreground mb-0.5">{t('accounting.difference')}</p>
              <p className={`font-bold text-sm ${cashDiff >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                {cashDiff >= 0 ? '+' : ''}{fmt(cashDiff)}
              </p>
            </div>
          </div>
          {/* Deficit Button */}
          {cashDiff < 0 && !deficitAdded && (
            <Button
              size="sm"
              variant="destructive"
              className="w-full mt-2 text-xs rounded-lg"
              onClick={() => handleAddDeficit(cashDiff)}
              disabled={createWorkerDebt.isPending}
            >
              {createWorkerDebt.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin ml-1" />
              ) : (
                <AlertTriangle className="w-3 h-3 ml-1" />
              )}
              تسجيل العجز كدين على العامل ({fmt(Math.abs(cashDiff))} DA)
            </Button>
          )}
           {deficitAdded && (
             <p className="text-xs text-center text-green-600 mt-2 font-medium">✓ تم تسجيل العجز كدين على العامل</p>
           )}
           {/* Surplus Button - records in treasury */}
           {cashDiff > 0 && !surplusAdded && (
             <Button
               size="sm"
               className="w-full mt-2 text-xs rounded-lg bg-green-600 hover:bg-green-700 text-white"
               onClick={async () => {
                 try {
                   await supabase.from('manager_treasury').insert({
                     manager_id: session.manager_id,
                     branch_id: session.branch_id || null,
                     session_id: session.id,
                     source_type: 'accounting_surplus',
                     payment_method: 'cash',
                     amount: cashDiff,
                     notes: `فائض جلسة محاسبة - ${session.worker?.full_name || session.worker_id}`,
                   });
                   setSurplusAdded(true);
                   toast.success('تم تسجيل الفائض في الخزينة');
                 } catch {
                   toast.error('خطأ في تسجيل الفائض');
                 }
               }}
             >
               <ArrowUpCircle className="w-3 h-3 ml-1" />
               تسجيل الفائض في الخزينة ({fmt(cashDiff)} DA)
             </Button>
           )}
           {surplusAdded && (
             <p className="text-xs text-center text-green-600 mt-2 font-medium">✓ تم تسجيل الفائض في الخزينة</p>
           )}
         </div>

         {/* Coin Amount */}
        <div className="border-2 rounded-xl p-3.5 flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
            <Coins className="w-4 h-4 text-muted-foreground" />
          </div>
          <span className="text-sm font-semibold">{t('accounting.coin_amount')}</span>
          <span className="ms-auto font-bold text-sm">{fmt(coinAmountItem.actual)} DA</span>
        </div>

        {/* Gift Offer Value */}
        {liveCalc && liveCalc.giftOfferValue > 0 && (
          <div className="border-2 border-purple-200 dark:border-purple-800 rounded-xl p-3.5 flex items-center gap-3 bg-purple-50/50 dark:bg-purple-950/20">
            <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Gift className="w-4 h-4 text-purple-600" />
            </div>
            <span className="text-sm font-semibold">القيمة المالية للهدايا</span>
            <span className="ms-auto font-bold text-sm text-purple-600">{fmt(liveCalc.giftOfferValue)} DA</span>
          </div>
        )}

        {/* Expenses */}
        <ValueCard icon={<CreditCard className="w-4 h-4 text-muted-foreground" />} title={t('accounting.expenses')} value={expenses.expected} small />
      </div>
    );
  };

  const renderOldFormat = () => {
    if (!items) return null;

    const labelMap: Record<string, string> = {
      sales: t('accounting.total_sales'),
      cash: t('accounting.cash_received'),
      debts: t('accounting.new_debts'),
      debt_collections: t('accounting.debt_collections'),
      expenses: t('accounting.expenses'),
    };
    const totalDiff = items.reduce((sum, i) => sum + Number(i.difference), 0);

    return (
      <div className="space-y-2.5">
        {items.map(item => {
          const diff = Number(item.difference);
          return (
            <div key={item.id} className="border-2 rounded-xl p-3.5">
              <p className="font-semibold text-sm mb-2.5">{labelMap[item.item_type] || item.item_type}</p>
              <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-[10px] text-muted-foreground mb-0.5">{t('accounting.expected')}</p>
                  <p className="font-bold">{Number(item.expected_amount).toLocaleString()}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-[10px] text-muted-foreground mb-0.5">{t('accounting.actual')}</p>
                  <p className="font-bold">{Number(item.actual_amount).toLocaleString()}</p>
                </div>
                <div className={`rounded-lg p-2 ${diff >= 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-destructive/10'}`}>
                  <p className="text-[10px] text-muted-foreground mb-0.5">{t('accounting.difference')}</p>
                  <p className={`font-bold ${diff >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                    {diff >= 0 ? '+' : ''}{diff.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        <div className={`border-2 rounded-xl p-3.5 text-center ${totalDiff >= 0 ? 'border-green-300 bg-green-50 dark:bg-green-900/10' : 'border-destructive/30 bg-destructive/5'}`}>
          <p className="text-sm text-muted-foreground">{t('accounting.total_difference')}</p>
          <p className={`text-2xl font-bold ${totalDiff >= 0 ? 'text-green-600' : 'text-destructive'}`}>
            {totalDiff >= 0 ? '+' : ''}{totalDiff.toLocaleString()} DA
          </p>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] p-0 gap-0 overflow-hidden" dir={dir}>
        <DialogHeader className="p-4 pb-3 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Calculator className="w-4 h-4 text-primary" />
              </div>
              {t('accounting.session_details')}
            </DialogTitle>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 rounded-lg"
              onClick={() => setShowEdit(true)}
            >
              <Pencil className="w-3.5 h-3.5" />
              {t('common.edit') || 'تعديل'}
            </Button>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-6rem)] px-4 py-3">
          <div className="space-y-4">
            {/* Session Info */}
            <div className="bg-muted/40 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <Badge className={`${statusColor(session.status)} text-[11px] px-2.5 py-0.5 rounded-full`}>{t(`accounting.status_${session.status}`)}</Badge>
                <span className="text-xs text-muted-foreground flex items-center gap-1.5 bg-background/60 rounded-full px-2.5 py-1">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(session.session_date), 'dd/MM/yyyy')}
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="font-semibold">{session.worker?.full_name}</span>
              </div>
              <p className="text-xs text-muted-foreground bg-background/60 rounded-lg px-2.5 py-1.5">
                {t('accounting.period')}: {session.period_start} → {session.period_end}
              </p>
              {session.notes && (
                <p className="text-sm bg-background rounded-lg p-2.5 border">{session.notes}</p>
              )}
            </div>

            {/* Financial Items */}
            {isLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : items && items.length > 0 ? (
              isNewFormat ? renderNewFormat() : renderOldFormat()
            ) : (
              <p className="text-center text-muted-foreground py-6">لا توجد بنود</p>
            )}

            {/* Sales Details Section */}
            <CollapsibleSection
              icon={<ShoppingBag className="w-4 h-4 text-primary" />}
              title="مبيعات العملاء"
            >
              <SalesDetailsSummary
                workerId={session.worker_id}
                periodStart={session.period_start}
                periodEnd={session.period_end}
              />
            </CollapsibleSection>

            {/* Product Stock Section */}
            <CollapsibleSection
              icon={<Package className="w-4 h-4 text-primary" />}
              title={t('accounting.truck_stock') || 'تتبع المنتجات'}
            >
              <ProductStockSummary
                workerId={session.worker_id}
                branchId={session.branch_id || undefined}
                periodStart={session.period_start}
                periodEnd={session.period_end}
              />
            </CollapsibleSection>

            {/* Debt Collections Detail Section */}
            <CollapsibleSection
              icon={<HandCoins className="w-4 h-4 text-orange-600" />}
              title="تفاصيل الديون المحصلة"
            >
              <DebtCollectionsSummary
                workerId={session.worker_id}
                periodStart={session.period_start}
                periodEnd={session.period_end}
              />
            </CollapsibleSection>

            {/* Promo Tracking Section */}
            {liveCalc && liveCalc.promoTracking.length > 0 && (
              <CollapsibleSection
                icon={<Tag className="w-4 h-4 text-purple-600" />}
                title="تتبع العروض"
                summary={`${fmt(liveCalc.giftOfferValue)} DA`}
              >
                <PromoTrackingSummary
                  items={liveCalc.promoTracking}
                  totalGiftValue={liveCalc.giftOfferValue}
                  workerName={session.worker?.full_name}
                />
              </CollapsibleSection>
            )}
          </div>
        </ScrollArea>
      </DialogContent>

      <CreateSessionDialog
        open={showEdit}
        onOpenChange={(open) => {
          setShowEdit(open);
          if (!open) onOpenChange(false);
        }}
        preselectedWorkerId={session.worker_id}
        editSession={session}
      />
    </Dialog>
  );
};

// === Helper Components ===


const ValueCard: React.FC<{
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
      'text-primary'
    }`}>
      {fmt(value)} DA
    </p>
  </div>
);

const DetailRow: React.FC<{ label: string; value: number; highlight?: boolean }> = ({ label, value, highlight }) => (
  <div className={`flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg ${highlight ? 'bg-amber-50 dark:bg-amber-900/10 font-medium' : ''}`}>
    <span className="text-muted-foreground">{label}</span>
    <span className={`font-bold ${value > 0 ? '' : 'text-muted-foreground/50'}`}>
      {fmt(value)} DA
    </span>
  </div>
);

export default SessionDetailsDialog;
