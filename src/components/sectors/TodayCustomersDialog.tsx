import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { MapPin, Truck, ShoppingCart, Landmark, User, Phone, Eye, PackageX } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDueDebts } from '@/hooks/useDebtCollections';
import { useLocationCheck } from '@/hooks/useLocationCheck';
import { useTrackVisit } from '@/hooks/useVisitTracking';
import { OrderWithDetails, Customer } from '@/types/database';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import DeliverySaleDialog from '@/components/orders/DeliverySaleDialog';
import CreateOrderDialog from '@/components/orders/CreateOrderDialog';
import VisitNoPaymentDialog from '@/components/debts/VisitNoPaymentDialog';
import CollectDebtDialog from '@/components/debts/CollectDebtDialog';

const DAY_NAMES: Record<string, string> = {
  saturday: 'السبت', sunday: 'الأحد', monday: 'الإثنين',
  tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس',
};
const JS_DAY_TO_NAME: Record<number, string> = {
  6: 'saturday', 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday',
};

interface TodayCustomersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetWorkerId?: string;
  targetWorkerName?: string;
}

const TodayCustomersDialog: React.FC<TodayCustomersDialogProps> = ({
  open, onOpenChange, targetWorkerId, targetWorkerName,
}) => {
  const { workerId: authWorkerId, activeBranch } = useAuth();
  const navigate = useNavigate();
  const effectiveWorkerId = targetWorkerId || authWorkerId;
  const todayName = JS_DAY_TO_NAME[new Date().getDay()] || '';
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  // Sub-dialog states
  const [showDeliveryDialog, setShowDeliveryDialog] = useState(false);
  const [pendingDeliveryOrder, setPendingDeliveryOrder] = useState<OrderWithDetails | null>(null);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [selectedCustomerForOrder, setSelectedCustomerForOrder] = useState<string | null>(null);
  const [showVisitNoPayment, setShowVisitNoPayment] = useState(false);
  const [selectedDebt, setSelectedDebt] = useState<any>(null);
  const [showCollectDebt, setShowCollectDebt] = useState(false);

  const { trackVisit } = useTrackVisit();

  // Sectors assigned to this worker
  const { data: sectors = [] } = useQuery({
    queryKey: ['today-cust-sectors', effectiveWorkerId, activeBranch?.id],
    queryFn: async () => {
      let query = supabase.from('sectors').select('*');
      if (activeBranch) query = query.eq('branch_id', activeBranch.id);
      const { data } = await query;
      return data || [];
    },
    enabled: !!effectiveWorkerId && open,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['today-cust-customers', activeBranch?.id],
    queryFn: async () => {
      let query = supabase.from('customers').select('id, name, phone, sector_id, store_name, latitude, longitude').not('sector_id', 'is', null);
      if (activeBranch) query = query.eq('branch_id', activeBranch.id);
      const { data } = await query;
      return data || [];
    },
    enabled: !!effectiveWorkerId && open,
  });

  // Orders assigned to this worker (pending delivery) - fetch full details
  // Include orders matching today's delivery sectors OR with delivery scheduled for today
  const todayDateStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const { data: assignedOrders = [] } = useQuery({
    queryKey: ['today-cust-assigned-orders-full', effectiveWorkerId, todayDateStr],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('*, customer:customers(*), items:order_items(*, product:products(*))')
        .eq('assigned_worker_id', effectiveWorkerId!)
        .in('status', ['pending', 'assigned', 'in_progress']);
      return (data || []) as OrderWithDetails[];
    },
    enabled: !!effectiveWorkerId && open,
  });

  // Today's delivered orders
  const { data: deliveredOrders = [] } = useQuery({
    queryKey: ['today-cust-delivered', effectiveWorkerId, todayStart],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('customer_id')
        .eq('assigned_worker_id', effectiveWorkerId!)
        .eq('status', 'delivered')
        .gte('updated_at', todayStart);
      return data || [];
    },
    enabled: !!effectiveWorkerId && open,
  });

  // Due debts
  const { data: dueDebts = [] } = useDueDebts(undefined);

  // Filter sectors for this worker
  const workerSectors = useMemo(() => {
    if (targetWorkerId) {
      return sectors.filter(s => s.delivery_worker_id === targetWorkerId || s.sales_worker_id === targetWorkerId);
    }
    return sectors;
  }, [sectors, targetWorkerId]);

  const salesSectors = useMemo(() =>
    workerSectors.filter(s => s.visit_day_sales === todayName && (!targetWorkerId || s.sales_worker_id === targetWorkerId)),
    [workerSectors, todayName, targetWorkerId]
  );

  const deliverySectors = useMemo(() =>
    workerSectors.filter(s => s.visit_day_delivery === todayName && (!targetWorkerId || s.delivery_worker_id === targetWorkerId)),
    [workerSectors, todayName, targetWorkerId]
  );

  const salesCustomers = useMemo(() => {
    const sectorIds = new Set(salesSectors.map(s => s.id));
    return customers.filter(c => c.sector_id && sectorIds.has(c.sector_id));
  }, [customers, salesSectors]);

  const deliveryCustomerIds = useMemo(() => {
    const ids = new Set<string>();
    const deliverySectorIds = new Set(deliverySectors.map(s => s.id));
    
    assignedOrders.forEach(o => {
      if (!o.customer_id) return;
      const customer = customers.find(c => c.id === o.customer_id);
      // Include if: customer's sector matches today's delivery sector, OR order has delivery_date = today
      const matchesSector = customer?.sector_id && deliverySectorIds.has(customer.sector_id);
      const matchesDate = o.delivery_date && o.delivery_date.startsWith(todayDateStr);
      if (matchesSector || matchesDate) {
        ids.add(o.customer_id);
      }
    });
    deliveredOrders.forEach(o => { if (o.customer_id) ids.add(o.customer_id); });
    return ids;
  }, [assignedOrders, deliveredOrders, deliverySectors, customers, todayDateStr]);

  const deliveryCustomers = useMemo(() => {
    return customers.filter(c => deliveryCustomerIds.has(c.id));
  }, [customers, deliveryCustomerIds]);

  const deliveredSet = useMemo(() => new Set(deliveredOrders.map(o => o.customer_id).filter(Boolean)), [deliveredOrders]);

  const debtCustomers = useMemo(() => {
    if (targetWorkerId) {
      return dueDebts.filter(d => d.worker_id === targetWorkerId);
    }
    return dueDebts;
  }, [dueDebts, targetWorkerId]);

  // Handlers
  const handleDeliveryCustomerClick = (customerId: string) => {
    const order = assignedOrders.find(o => o.customer_id === customerId && ['pending', 'assigned', 'in_progress'].includes(o.status));
    if (order) {
      setPendingDeliveryOrder(order);
      setShowDeliveryDialog(true);
    } else {
      toast.info('لا توجد طلبية نشطة لهذا العميل');
    }
  };

  const handleSalesCustomerClick = (customerId: string) => {
    setSelectedCustomerForOrder(customerId);
    setShowCreateOrder(true);
  };

  const handleDebtClick = (debt: any) => {
    setSelectedDebt(debt);
    setShowCollectDebt(true);
  };

  const handleVisitNoPayment = (debt: any) => {
    setSelectedDebt(debt);
    setShowVisitNoPayment(true);
  };

  const title = targetWorkerName
    ? `عملاء اليوم — ${targetWorkerName}`
    : `عملاء اليوم — ${DAY_NAMES[todayName] || todayName}`;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-0 gap-0 max-h-[85vh] flex flex-col" dir="rtl">
          <DialogHeader className="p-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="truncate">{title}</span>
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="delivery" className="flex flex-col flex-1 min-h-0">
            <TabsList className="w-full rounded-none border-b shrink-0">
              <TabsTrigger value="delivery" className="flex-1 gap-1 text-xs">
                <Truck className="w-3.5 h-3.5" />
                توصيل
                {deliveryCustomers.length > 0 && <Badge variant="secondary" className="text-[10px] px-1">{deliveryCustomers.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="sales" className="flex-1 gap-1 text-xs">
                <ShoppingCart className="w-3.5 h-3.5" />
                طلبات
                {salesCustomers.length > 0 && <Badge variant="secondary" className="text-[10px] px-1">{salesCustomers.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="debts" className="flex-1 gap-1 text-xs">
                <Landmark className="w-3.5 h-3.5" />
                ديون
                {debtCustomers.length > 0 && <Badge variant="destructive" className="text-[10px] px-1">{debtCustomers.length}</Badge>}
              </TabsTrigger>
            </TabsList>

            {/* Delivery Tab */}
            <TabsContent value="delivery" className="m-0 flex-1 min-h-0">
              <ScrollArea className="h-full max-h-[60vh]">
                {deliveryCustomers.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">لا توجد توصيلات لليوم</div>
                ) : (
                  <div className="divide-y">
                    {deliveryCustomers.map(c => {
                      const isDelivered = deliveredSet.has(c.id);
                      const hasActiveOrder = assignedOrders.some(o => o.customer_id === c.id);
                      return (
                        <div
                          key={c.id}
                          className={`flex items-center gap-2.5 p-3 ${!isDelivered && hasActiveOrder ? 'cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors' : ''}`}
                          onClick={() => !isDelivered && hasActiveOrder && handleDeliveryCustomerClick(c.id)}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isDelivered ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                            <User className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{c.store_name || c.name}</p>
                            {c.phone && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</p>}
                          </div>
                          {isDelivered ? (
                            <Badge variant="outline" className="text-[10px] text-green-600 border-green-200">تم ✓</Badge>
                          ) : hasActiveOrder ? (
                            <Truck className="w-4 h-4 text-orange-500 shrink-0" />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Sales Tab */}
            <TabsContent value="sales" className="m-0 flex-1 min-h-0">
              <ScrollArea className="h-full max-h-[60vh]">
                {salesCustomers.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">لا يوجد عملاء مبيعات لليوم</div>
                ) : (
                  <div className="divide-y">
                    {salesCustomers.map(c => (
                      <div
                        key={c.id}
                        className="flex items-center gap-2.5 p-3 cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors"
                        onClick={() => handleSalesCustomerClick(c.id)}
                      >
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.store_name || c.name}</p>
                          {c.phone && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</p>}
                        </div>
                        <ShoppingCart className="w-4 h-4 text-blue-500 shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Debts Tab */}
            <TabsContent value="debts" className="m-0 flex-1 min-h-0">
              <ScrollArea className="h-full max-h-[60vh]">
                {debtCustomers.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">لا توجد ديون مستحقة لليوم</div>
                ) : (
                  <div className="divide-y">
                    {debtCustomers.map(d => {
                      const customer = d.customer as any;
                      return (
                        <div key={d.id} className="flex items-center gap-2.5 p-3">
                          <div
                            className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 cursor-pointer hover:bg-red-200 transition-colors"
                            onClick={() => handleDebtClick(d)}
                          >
                            <Landmark className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleDebtClick(d)}>
                            <p className="text-sm font-medium truncate">{customer?.store_name || customer?.name || '—'}</p>
                            <p className="text-[11px] text-destructive font-bold">{Number(d.remaining_amount).toLocaleString()} DA</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-orange-600"
                              title="زيارة بدون تحصيل"
                              onClick={(e) => { e.stopPropagation(); handleVisitNoPayment(d); }}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-green-600"
                              title="تحصيل"
                              onClick={(e) => { e.stopPropagation(); handleDebtClick(d); }}
                            >
                              <Landmark className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Sub-dialogs */}
      {pendingDeliveryOrder && (
        <DeliverySaleDialog
          open={showDeliveryDialog}
          onOpenChange={(open) => {
            setShowDeliveryDialog(open);
            if (!open) setPendingDeliveryOrder(null);
          }}
          order={pendingDeliveryOrder}
        />
      )}

      <CreateOrderDialog
        open={showCreateOrder}
        onOpenChange={setShowCreateOrder}
        initialCustomerId={selectedCustomerForOrder || undefined}
      />

      {selectedDebt && (
        <VisitNoPaymentDialog
          open={showVisitNoPayment}
          onOpenChange={(open) => {
            setShowVisitNoPayment(open);
            if (!open) setSelectedDebt(null);
          }}
          debtId={selectedDebt.id}
          customerName={(selectedDebt.customer as any)?.store_name || (selectedDebt.customer as any)?.name || ''}
          collectionType={selectedDebt.collection_type}
          collectionDays={selectedDebt.collection_days}
          customerLatitude={(selectedDebt.customer as any)?.latitude}
          customerLongitude={(selectedDebt.customer as any)?.longitude}
        />
      )}

      {selectedDebt && (
        <CollectDebtDialog
          open={showCollectDebt}
          onOpenChange={(open) => {
            setShowCollectDebt(open);
            if (!open) setSelectedDebt(null);
          }}
          debtId={selectedDebt.id}
          customerName={(selectedDebt.customer as any)?.store_name || (selectedDebt.customer as any)?.name || ''}
          totalDebtAmount={Number(selectedDebt.total_amount)}
          paidAmountBefore={Number(selectedDebt.paid_amount)}
          remainingAmount={Number(selectedDebt.remaining_amount)}
          customerId={selectedDebt.customer_id}
          defaultAmount={selectedDebt.collection_amount ? Number(selectedDebt.collection_amount) : undefined}
          collectionType={selectedDebt.collection_type}
          collectionDays={selectedDebt.collection_days}
        />
      )}
    </>
  );
};

export default TodayCustomersDialog;
