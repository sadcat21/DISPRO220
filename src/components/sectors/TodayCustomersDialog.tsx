import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MapPin, Truck, ShoppingCart, Landmark, User, Phone } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDueDebts } from '@/hooks/useDebtCollections';

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
  const effectiveWorkerId = targetWorkerId || authWorkerId;
  const todayName = JS_DAY_TO_NAME[new Date().getDay()] || '';
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

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
      let query = supabase.from('customers').select('id, name, phone, sector_id, store_name').not('sector_id', 'is', null);
      if (activeBranch) query = query.eq('branch_id', activeBranch.id);
      const { data } = await query;
      return data || [];
    },
    enabled: !!effectiveWorkerId && open,
  });

  // Orders assigned to this worker (pending delivery)
  const { data: assignedOrders = [] } = useQuery({
    queryKey: ['today-cust-assigned-orders', effectiveWorkerId],
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('customer_id, status')
        .eq('assigned_worker_id', effectiveWorkerId!)
        .in('status', ['pending', 'assigned', 'in_progress']);
      return data || [];
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
    assignedOrders.forEach(o => { if (o.customer_id) ids.add(o.customer_id); });
    deliveredOrders.forEach(o => { if (o.customer_id) ids.add(o.customer_id); });
    return ids;
  }, [assignedOrders, deliveredOrders]);

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

  const title = targetWorkerName
    ? `عملاء اليوم — ${targetWorkerName}`
    : `عملاء اليوم — ${DAY_NAMES[todayName] || todayName}`;

  return (
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

          <TabsContent value="delivery" className="m-0 flex-1 min-h-0">
            <ScrollArea className="h-full max-h-[60vh]">
              {deliveryCustomers.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">لا توجد توصيلات لليوم</div>
              ) : (
                <div className="divide-y">
                  {deliveryCustomers.map(c => (
                    <div key={c.id} className="flex items-center gap-2.5 p-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${deliveredSet.has(c.id) ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                        <User className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.store_name || c.name}</p>
                        {c.phone && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</p>}
                      </div>
                      {deliveredSet.has(c.id) && <Badge variant="outline" className="text-[10px] text-green-600 border-green-200">تم ✓</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="sales" className="m-0 flex-1 min-h-0">
            <ScrollArea className="h-full max-h-[60vh]">
              {salesCustomers.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">لا يوجد عملاء مبيعات لليوم</div>
              ) : (
                <div className="divide-y">
                  {salesCustomers.map(c => (
                    <div key={c.id} className="flex items-center gap-2.5 p-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.store_name || c.name}</p>
                        {c.phone && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="debts" className="m-0 flex-1 min-h-0">
            <ScrollArea className="h-full max-h-[60vh]">
              {debtCustomers.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">لا توجد ديون مستحقة لليوم</div>
              ) : (
                <div className="divide-y">
                  {debtCustomers.map(d => (
                    <div key={d.id} className="flex items-center gap-2.5 p-3">
                      <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                        <Landmark className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{(d.customer as any)?.store_name || (d.customer as any)?.name || '—'}</p>
                        <p className="text-[11px] text-destructive font-bold">{Number(d.remaining_amount).toLocaleString()} DA</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default TodayCustomersDialog;
