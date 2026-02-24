import React, { useState, useMemo } from 'react';
import { Landmark, Check, X, Clock, Banknote, Eye } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useDueDebts, usePendingCollections, useApproveCollection, DueDebt } from '@/hooks/useDebtCollections';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format, addDays } from 'date-fns';
import { toast } from 'sonner';
import CollectDebtDialog from './CollectDebtDialog';
import VisitNoPaymentDialog from './VisitNoPaymentDialog';

// Algerian work week: 0=Saturday, 1=Sunday, 2=Monday, 3=Tuesday, 4=Wednesday, 5=Thursday
const WORK_DAYS = [
  { num: 0, ar: 'سبت', jsDay: 6 },
  { num: 1, ar: 'أحد', jsDay: 0 },
  { num: 2, ar: 'إثن', jsDay: 1 },
  { num: 3, ar: 'ثلا', jsDay: 2 },
  { num: 4, ar: 'أرب', jsDay: 3 },
  { num: 5, ar: 'خمي', jsDay: 4 },
];

/** Get the next occurrence of a given JS day (0=Sun..6=Sat), including today */
const getNextDateForJsDay = (jsDay: number): string => {
  const today = new Date();
  const todayDay = today.getDay();
  let diff = jsDay - todayDay;
  if (diff < 0) diff += 7;
  const target = addDays(today, diff);
  return target.toISOString().split('T')[0];
};

const DebtCollectionsPopover: React.FC = () => {
  const { t } = useLanguage();
  const { role } = useAuth();
  // -1 = all, null = today (default), 0-5 = specific work day
  const [selectedDayNum, setSelectedDayNum] = useState<number | null>(null);

  // Calculate target date based on selected day
  const targetDate = useMemo(() => {
    if (selectedDayNum === -1) return '__all__';
    if (selectedDayNum === null) return undefined;
    const workDay = WORK_DAYS.find(d => d.num === selectedDayNum);
    if (!workDay) return undefined;
    return getNextDateForJsDay(workDay.jsDay);
  }, [selectedDayNum]);

  const { data: dueDebts = [] } = useDueDebts(targetDate);
  const { data: todayDebts = [] } = useDueDebts(undefined); // Always today — for badge count
  const { data: pendingCollections = [] } = usePendingCollections();
  const approveCollection = useApproveCollection();

  const [selectedDebt, setSelectedDebt] = useState<DueDebt | null>(null);
  const [showCollect, setShowCollect] = useState(false);
  const [showVisit, setShowVisit] = useState(false);

  const isAdmin = role === 'admin' || role === 'branch_admin';
  // Badge always shows TODAY's count, not the selected day
  const totalCount = todayDebts.length + (isAdmin ? pendingCollections.length : 0);

  const todayJsDay = new Date().getDay();

  const handleApprove = async (collectionId: string) => {
    try {
      await approveCollection.mutateAsync({ collectionId, approved: true });
      toast.success('تمت الموافقة');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleReject = async (collectionId: string) => {
    try {
      await approveCollection.mutateAsync({ collectionId, approved: false, rejectionReason: 'مرفوض' });
      toast.success('تم الرفض');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const dayButtons = (
    <div className="flex gap-1 p-2 border-b overflow-x-auto">
      {/* "All" button */}
      <button
        onClick={() => setSelectedDayNum(-1)}
        className={`flex flex-col items-center min-w-[40px] px-1.5 py-1 rounded-lg text-xs font-bold transition-colors ${
          selectedDayNum === -1
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted/60 hover:bg-muted text-foreground'
        }`}
      >
        <span className="text-[10px] leading-tight">الكل</span>
        <span className="text-sm leading-tight">∞</span>
      </button>
      {WORK_DAYS.map(day => {
        const isToday = day.jsDay === todayJsDay;
        const isSelected = selectedDayNum === day.num || (selectedDayNum === null && isToday);
        return (
          <button
            key={day.num}
            onClick={() => setSelectedDayNum(day.num === selectedDayNum ? null : day.num)}
            className={`flex flex-col items-center min-w-[40px] px-1.5 py-1 rounded-lg text-xs font-bold transition-colors ${
              isSelected
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/60 hover:bg-muted text-foreground'
            }`}
          >
            <span className="text-[10px] leading-tight">{day.ar}</span>
            <span className="text-sm leading-tight">{day.num}</span>
          </button>
        );
      })}
    </div>
  );

  const selectedDateLabel = targetDate === '__all__'
    ? 'جميع الديون المستحقة'
    : targetDate
      ? format(new Date(targetDate + 'T00:00:00'), 'dd/MM/yyyy')
      : 'اليوم والمتأخرة';

  const remaining = selectedDebt ? Number(selectedDebt.remaining_amount) : 0;

  return (
    <>
      <Popover onOpenChange={(open) => { if (open) setSelectedDayNum(null); }}>
        <PopoverTrigger asChild>
          <button
            className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 transition-colors"
            title="استحقاق الديون"
          >
            <Landmark className="w-4 h-4 text-orange-500" />
            {totalCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {totalCount}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0 max-h-[70vh] flex flex-col">
          {isAdmin ? (
            <Tabs defaultValue="due" className="flex flex-col h-full">
              <TabsList className="w-full rounded-none border-b">
                <TabsTrigger value="due" className="flex-1 gap-1">
                  ديون مستحقة
                  {dueDebts.length > 0 && <Badge variant="destructive" className="text-[10px] px-1">{dueDebts.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="pending" className="flex-1 gap-1">
                  في الانتظار
                  {pendingCollections.length > 0 && <Badge variant="secondary" className="text-[10px] px-1">{pendingCollections.length}</Badge>}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="due" className="m-0 flex-1">
                {dayButtons}
                <p className="text-[10px] text-muted-foreground text-center py-1">{selectedDateLabel}</p>
                <DueDebtsList debts={dueDebts} onSelect={setSelectedDebt} />
              </TabsContent>
              <TabsContent value="pending" className="m-0 flex-1">
                <PendingCollectionsList
                  collections={pendingCollections}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  isLoading={approveCollection.isPending}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <>
              <div className="p-3 border-b font-bold text-sm">ديون مستحقة</div>
              {dayButtons}
              <p className="text-[10px] text-muted-foreground text-center py-1">{selectedDateLabel}</p>
              <DueDebtsList debts={dueDebts} onSelect={setSelectedDebt} />
            </>
          )}
        </PopoverContent>
      </Popover>

      {/* Debt Info Dialog — same pattern as debt management */}
      {selectedDebt && (
        <Dialog open={!!selectedDebt} onOpenChange={(open) => !open && setSelectedDebt(null)}>
          <DialogContent className="max-w-[95vw] sm:max-w-sm p-4 gap-3" dir="rtl">
            <DialogHeader className="pb-0">
              <DialogTitle className="text-base truncate">
                {selectedDebt.customer?.name || '—'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              {/* Debt summary */}
              <div className="bg-muted/50 rounded-md p-2 text-center space-y-1">
                <p className="text-xs text-muted-foreground">المبلغ المتبقي</p>
                <p className="text-xl font-bold text-destructive">{remaining.toLocaleString()} DA</p>
                <p className="text-xs text-muted-foreground">
                  تاريخ الاستحقاق: {selectedDebt.due_date ? format(new Date(selectedDebt.due_date + 'T00:00:00'), 'dd/MM/yyyy') : '—'}
                </p>
              </div>

              {/* Action buttons — same as debt management */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => setShowCollect(true)}
                >
                  <Banknote className="w-4 h-4 ml-1" />
                  تحصيل
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowVisit(true)}
                >
                  <Eye className="w-4 h-4 ml-1" />
                  زيارة بدون دفع
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Collect dialog — same as debt management */}
      {selectedDebt && (
        <CollectDebtDialog
          open={showCollect}
          onOpenChange={(open) => {
            setShowCollect(open);
            if (!open) setSelectedDebt(null);
          }}
          debtId={selectedDebt.id}
          totalDebtAmount={Number(selectedDebt.total_amount)}
          paidAmountBefore={Number(selectedDebt.paid_amount)}
          remainingAmount={remaining}
          customerName={selectedDebt.customer?.name || '—'}
          customerId={selectedDebt.customer_id}
          defaultAmount={selectedDebt.collection_amount || undefined}
          collectionType={selectedDebt.collection_type}
          collectionDays={selectedDebt.collection_days}
        />
      )}

      {/* Visit dialog — same as debt management */}
      {selectedDebt && (
        <VisitNoPaymentDialog
          open={showVisit}
          onOpenChange={(open) => {
            setShowVisit(open);
            if (!open) setSelectedDebt(null);
          }}
          debtId={selectedDebt.id}
          customerName={selectedDebt.customer?.name || '—'}
          collectionType={selectedDebt.collection_type}
          collectionDays={selectedDebt.collection_days}
          customerLatitude={selectedDebt.customer?.latitude}
          customerLongitude={selectedDebt.customer?.longitude}
        />
      )}
    </>
  );
};

const DueDebtsList: React.FC<{ debts: DueDebt[]; onSelect: (d: DueDebt) => void }> = ({ debts, onSelect }) => {
  if (debts.length === 0) {
    return <div className="p-6 text-center text-sm text-muted-foreground">لا توجد ديون مستحقة</div>;
  }

  return (
    <ScrollArea className="max-h-[50vh]">
      <div className="divide-y">
        {debts.map(debt => (
          <button
            key={debt.id}
            className="w-full p-3 text-right hover:bg-muted/50 transition-colors"
            onClick={() => onSelect(debt)}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm">{debt.customer?.name || '—'}</span>
              <span className="text-destructive font-bold">{Number(debt.remaining_amount).toLocaleString()} DA</span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>{debt.due_date ? format(new Date(debt.due_date + 'T00:00:00'), 'dd/MM/yyyy') : '—'}</span>
              {debt.customer?.phone && <span>• {debt.customer.phone}</span>}
            </div>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
};

const PendingCollectionsList: React.FC<{
  collections: any[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  isLoading: boolean;
}> = ({ collections, onApprove, onReject, isLoading }) => {
  if (collections.length === 0) {
    return <div className="p-6 text-center text-sm text-muted-foreground">لا توجد تحصيلات في الانتظار</div>;
  }

  const actionLabels: Record<string, string> = {
    no_payment: 'بدون دفع',
    partial_payment: 'دفع جزئي',
    full_payment: 'دفع كامل',
  };

  return (
    <ScrollArea className="max-h-[50vh]">
      <div className="divide-y">
        {collections.map(c => (
          <div key={c.id} className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm">{c.debt?.customer?.name || '—'}</span>
              <Badge variant="outline" className="text-xs">{actionLabels[c.action] || c.action}</Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              بواسطة: {c.worker?.full_name || '—'}
              {c.amount_collected > 0 && <span className="text-primary font-bold mr-2"> • {Number(c.amount_collected).toLocaleString()} DA</span>}
            </div>
            {c.next_due_date && (
              <p className="text-xs text-muted-foreground">الاستحقاق التالي: {format(new Date(c.next_due_date + 'T00:00:00'), 'dd/MM/yyyy')}</p>
            )}
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 gap-1" onClick={() => onApprove(c.id)} disabled={isLoading}>
                <Check className="w-3 h-3" /> موافقة
              </Button>
              <Button size="sm" variant="destructive" className="flex-1 gap-1" onClick={() => onReject(c.id)} disabled={isLoading}>
                <X className="w-3 h-3" /> رفض
              </Button>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};

export default DebtCollectionsPopover;
