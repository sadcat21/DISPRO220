import React, { useState, useMemo } from 'react';
import { FileCheck, Check, X, Clock, Eye, FileWarning } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  usePendingDocOrders, usePendingDocCollections, useApproveDocCollection,
  useCreateDocCollection,
  PendingDocOrder,
} from '@/hooks/useDocumentCollections';
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
import CheckVerificationDialog from '@/components/orders/CheckVerificationDialog';
import DocVisitNoCollectionDialog from './DocVisitNoCollectionDialog';
import { supabase } from '@/integrations/supabase/client';

const WORK_DAYS = [
  { num: 0, ar: 'سبت', jsDay: 6 },
  { num: 1, ar: 'أحد', jsDay: 0 },
  { num: 2, ar: 'إثن', jsDay: 1 },
  { num: 3, ar: 'ثلا', jsDay: 2 },
  { num: 4, ar: 'أرب', jsDay: 3 },
  { num: 5, ar: 'خمي', jsDay: 4 },
];

const getNextDateForJsDay = (jsDay: number): string => {
  const today = new Date();
  const todayDay = today.getDay();
  let diff = jsDay - todayDay;
  if (diff < 0) diff += 7;
  return addDays(today, diff).toISOString().split('T')[0];
};

const getDocLabel = (type: string) => {
  switch (type) {
    case 'check': return 'Chèque';
    case 'receipt': return 'Versement';
    case 'transfer': return 'Virement';
    default: return type;
  }
};

const getDocColor = (type: string) => {
  switch (type) {
    case 'check': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
    case 'receipt': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    case 'transfer': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
    default: return '';
  }
};

const DocumentCollectionsPopover: React.FC = () => {
  const { role, workerId } = useAuth();
  const createCollection = useCreateDocCollection();
  const [selectedDayNum, setSelectedDayNum] = useState<number | null>(null);

  const targetDate = useMemo(() => {
    if (selectedDayNum === -1) return '__all__';
    if (selectedDayNum === null) return undefined;
    const workDay = WORK_DAYS.find(d => d.num === selectedDayNum);
    if (!workDay) return undefined;
    return getNextDateForJsDay(workDay.jsDay);
  }, [selectedDayNum]);

  const { data: pendingOrders = [] } = usePendingDocOrders(targetDate);
  const { data: todayOrders = [] } = usePendingDocOrders(undefined);
  const { data: pendingCollections = [] } = usePendingDocCollections();
  const approveCollection = useApproveDocCollection();

  const [selectedOrder, setSelectedOrder] = useState<PendingDocOrder | null>(null);
  const [showCollect, setShowCollect] = useState(false);
  const [showVisit, setShowVisit] = useState(false);

  const isAdmin = role === 'admin' || role === 'branch_admin';
  const totalCount = todayOrders.length + (isAdmin ? pendingCollections.length : 0);

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
    ? 'جميع المستندات المعلقة'
    : targetDate
      ? format(new Date(targetDate + 'T00:00:00'), 'dd/MM/yyyy')
      : 'اليوم';

  if (totalCount === 0 && pendingOrders.length === 0) return null;

  return (
    <>
      <Popover onOpenChange={(open) => { if (open) setSelectedDayNum(null); }}>
        <PopoverTrigger asChild>
          <button
            className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
            title="تحصيل المستندات"
          >
            <FileWarning className="w-4 h-4 text-amber-500" />
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
                  مستندات معلقة
                  {pendingOrders.length > 0 && <Badge variant="destructive" className="text-[10px] px-1">{pendingOrders.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="pending" className="flex-1 gap-1">
                  في الانتظار
                  {pendingCollections.length > 0 && <Badge variant="secondary" className="text-[10px] px-1">{pendingCollections.length}</Badge>}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="due" className="m-0 flex-1">
                {dayButtons}
                <p className="text-[10px] text-muted-foreground text-center py-1">{selectedDateLabel}</p>
                <PendingDocList orders={pendingOrders} onSelect={setSelectedOrder} />
              </TabsContent>
              <TabsContent value="pending" className="m-0 flex-1">
                <PendingDocCollectionsList
                  collections={pendingCollections}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  isLoading={approveCollection.isPending}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <>
              <div className="p-3 border-b font-bold text-sm">مستندات معلقة للتحصيل</div>
              {dayButtons}
              <p className="text-[10px] text-muted-foreground text-center py-1">{selectedDateLabel}</p>
              <PendingDocList orders={pendingOrders} onSelect={setSelectedOrder} />
            </>
          )}
        </PopoverContent>
      </Popover>

      {/* Order Info Dialog */}
      {selectedOrder && (
        <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
          <DialogContent className="max-w-[95vw] sm:max-w-sm p-4 gap-3" dir="rtl">
            <DialogHeader className="pb-0">
              <DialogTitle className="text-base truncate">
                {selectedOrder.customer?.store_name || selectedOrder.customer?.name || '—'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="bg-muted/50 rounded-md p-2 text-center space-y-1">
                <p className="text-xs text-muted-foreground">نوع المستند</p>
                <Badge className={`text-sm ${getDocColor(selectedOrder.invoice_payment_method)}`}>
                  {getDocLabel(selectedOrder.invoice_payment_method)}
                </Badge>
                <p className="text-lg font-bold">{Number(selectedOrder.total_amount).toLocaleString()} DA</p>
                {selectedOrder.doc_due_date && (
                  <p className="text-xs text-muted-foreground">
                    موعد التحصيل: {format(new Date(selectedOrder.doc_due_date + 'T00:00:00'), 'dd/MM/yyyy')}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button size="sm" className="flex-1" onClick={() => setShowCollect(true)}>
                  <FileCheck className="w-4 h-4 ml-1" />
                  تم التحصيل
                </Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setShowVisit(true)}>
                  <Eye className="w-4 h-4 ml-1" />
                  زيارة بدون تحصيل
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {selectedOrder && (
        <CheckVerificationDialog
          open={showCollect}
          onOpenChange={(open) => { setShowCollect(open); if (!open) setSelectedOrder(null); }}
          orderTotal={Number(selectedOrder.total_amount)}
          customerName={selectedOrder.customer?.store_name || selectedOrder.customer?.name || '—'}
          documentType={selectedOrder.invoice_payment_method as 'check' | 'receipt' | 'transfer'}
          initialVerification={(selectedOrder as any).document_verification}
          onConfirm={async (data) => {
            if (!workerId) return;
            // Save verification data to the order
            await supabase
              .from('orders')
              .update({
                document_verification: data.verification,
                document_status: data.checkReceived ? 'received' : 'pending',
              })
              .eq('id', selectedOrder.id);
            // Create collection record
            await createCollection.mutateAsync({
              orderId: selectedOrder.id,
              workerId,
              action: 'collected',
              notes: `تم تحصيل ${getDocLabel(selectedOrder.invoice_payment_method)}`,
            });
            toast.success('تم تحصيل المستند والتحقق منه بنجاح');
            setShowCollect(false);
            setSelectedOrder(null);
          }}
        />
      )}

      {selectedOrder && (
        <DocVisitNoCollectionDialog
          open={showVisit}
          onOpenChange={(open) => { setShowVisit(open); if (!open) setSelectedOrder(null); }}
          orderId={selectedOrder.id}
          customerName={selectedOrder.customer?.name || '—'}
          documentType={selectedOrder.invoice_payment_method}
          customerLatitude={selectedOrder.customer?.latitude}
          customerLongitude={selectedOrder.customer?.longitude}
        />
      )}
    </>
  );
};

const PendingDocList: React.FC<{ orders: PendingDocOrder[]; onSelect: (o: PendingDocOrder) => void }> = ({ orders, onSelect }) => {
  if (orders.length === 0) {
    return <div className="p-6 text-center text-sm text-muted-foreground">لا توجد مستندات معلقة</div>;
  }

  return (
    <ScrollArea className="max-h-[50vh]">
      <div className="divide-y">
        {orders.map(order => (
          <button
            key={order.id}
            className="w-full p-3 text-right hover:bg-muted/50 transition-colors"
            onClick={() => onSelect(order)}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm">{order.customer?.store_name || order.customer?.name || '—'}</span>
              <Badge className={`text-[10px] ${getDocColor(order.invoice_payment_method)}`}>
                {getDocLabel(order.invoice_payment_method)}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span className="font-bold">{Number(order.total_amount).toLocaleString()} DA</span>
              {order.doc_due_date && (
                <>
                  <Clock className="w-3 h-3" />
                  <span>{format(new Date(order.doc_due_date + 'T00:00:00'), 'dd/MM/yyyy')}</span>
                </>
              )}
              {order.customer?.phone && <span>• {order.customer.phone}</span>}
            </div>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
};

const PendingDocCollectionsList: React.FC<{
  collections: any[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  isLoading: boolean;
}> = ({ collections, onApprove, onReject, isLoading }) => {
  if (collections.length === 0) {
    return <div className="p-6 text-center text-sm text-muted-foreground">لا توجد طلبات في الانتظار</div>;
  }

  const actionLabels: Record<string, string> = {
    no_collection: 'زيارة بدون تحصيل',
    collected: 'تم التحصيل',
  };

  return (
    <ScrollArea className="max-h-[50vh]">
      <div className="divide-y">
        {collections.map(c => (
          <div key={c.id} className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm">{c.order?.customer?.store_name || c.order?.customer?.name || '—'}</span>
              <Badge variant="outline" className="text-xs">{actionLabels[c.action] || c.action}</Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              بواسطة: {c.worker?.full_name || '—'}
            </div>
            {c.next_due_date && (
              <p className="text-xs text-muted-foreground">الموعد القادم: {format(new Date(c.next_due_date + 'T00:00:00'), 'dd/MM/yyyy')}</p>
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

export default DocumentCollectionsPopover;
