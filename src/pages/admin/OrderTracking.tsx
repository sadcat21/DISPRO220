import React, { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAllOrderEvents } from '@/hooks/useOrderEvents';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Search, Filter, ArrowRightLeft, UserCheck, CreditCard, Package, Printer, Plus, DollarSign, Clock, Users, ChevronLeft, Truck, ShoppingCart, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

const EVENT_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  created: { label: 'إنشاء طلبية', icon: Plus, color: 'bg-green-100 text-green-700 border-green-200' },
  status_change: { label: 'تغيير الحالة', icon: ArrowRightLeft, color: 'bg-blue-100 text-blue-700 border-blue-200' },
  worker_changed: { label: 'تغيير العامل', icon: UserCheck, color: 'bg-purple-100 text-purple-700 border-purple-200' },
  payment_updated: { label: 'تحديث الدفع', icon: CreditCard, color: 'bg-amber-100 text-amber-700 border-amber-200' },
  item_modified: { label: 'تعديل المنتجات', icon: Package, color: 'bg-orange-100 text-orange-700 border-orange-200' },
  amount_changed: { label: 'تغيير المبلغ', icon: DollarSign, color: 'bg-rose-100 text-rose-700 border-rose-200' },
  printed: { label: 'طباعة', icon: Printer, color: 'bg-gray-100 text-gray-700 border-gray-200' },
  price_changed: { label: 'تغيير السعر', icon: DollarSign, color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'قيد الانتظار',
  assigned: 'معيّنة',
  in_transit: 'قيد التوصيل',
  delivered: 'تم التسليم',
  cancelled: 'ملغاة',
  postponed: 'مؤجلة',
  confirmed: 'مؤكدة',
  completed: 'مكتملة',
};

const STATUS_STEPS = ['pending', 'assigned', 'in_transit', 'delivered'];

const STATUS_STEP_CONFIG: Record<string, { label: string; icon: React.ElementType; activeColor: string }> = {
  pending: { label: 'إنشاء', icon: ShoppingCart, activeColor: 'bg-blue-500' },
  assigned: { label: 'تعيين', icon: UserCheck, activeColor: 'bg-purple-500' },
  in_transit: { label: 'شحن', icon: Truck, activeColor: 'bg-amber-500' },
  delivered: { label: 'تسليم', icon: CheckCircle2, activeColor: 'bg-green-500' },
};

interface GroupedOrder {
  orderId: string;
  customerName: string;
  currentStatus: string;
  totalAmount: number | null;
  events: any[];
  latestEvent: string;
}

const OrderTimeline: React.FC<{ events: any[] }> = ({ events }) => {
  return (
    <div className="relative pr-4">
      {/* Vertical line */}
      <div className="absolute right-[7px] top-2 bottom-2 w-0.5 bg-border" />
      
      {events.map((event: any, idx: number) => {
        const config = EVENT_TYPE_CONFIG[event.event_type] || { label: event.event_type, icon: Clock, color: 'bg-muted text-muted-foreground' };
        const Icon = config.icon;
        const isLast = idx === events.length - 1;
        
        return (
          <div key={event.id} className="relative flex items-start gap-3 pb-4">
            {/* Dot on timeline */}
            <div className={`relative z-10 w-3.5 h-3.5 rounded-full border-2 shrink-0 mt-1 ${
              isLast ? 'bg-primary border-primary' : 'bg-background border-muted-foreground/40'
            }`} />
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon className={`h-3 w-3 ${config.color.split(' ')[1]}`} />
                  <span className="text-xs font-medium">{config.label}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {format(new Date(event.created_at), 'MM/dd HH:mm')}
                </span>
              </div>
              
              {/* Status change details */}
              {event.event_type === 'status_change' && (
                <div className="mt-0.5 flex items-center gap-1 text-[11px]">
                  <span className="text-muted-foreground">{STATUS_LABELS[event.old_value] || event.old_value}</span>
                  <span>←</span>
                  <span className="font-medium text-primary">{STATUS_LABELS[event.new_value] || event.new_value}</span>
                </div>
              )}
              
              {event.event_type === 'amount_changed' && (
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {Number(event.old_value).toLocaleString()} → {Number(event.new_value).toLocaleString()} د.ج
                </div>
              )}

              {event.event_type === 'created' && event.details?.total_amount && (
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  المبلغ: {Number(event.details.total_amount).toLocaleString()} د.ج
                </div>
              )}
              
              {event.performer?.full_name && (
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  بواسطة: {event.performer.full_name}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const StatusProgressBar: React.FC<{ currentStatus: string }> = ({ currentStatus }) => {
  const isCancelled = currentStatus === 'cancelled';
  const currentIdx = STATUS_STEPS.indexOf(currentStatus);
  const activeIdx = currentIdx >= 0 ? currentIdx : (isCancelled ? -1 : 0);

  return (
    <div className="flex items-center justify-between gap-1 my-2">
      {STATUS_STEPS.map((step, idx) => {
        const config = STATUS_STEP_CONFIG[step];
        const Icon = config.icon;
        const isActive = idx <= activeIdx && !isCancelled;
        const isCurrent = step === currentStatus;

        return (
          <React.Fragment key={step}>
            <div className="flex flex-col items-center gap-0.5 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                isActive ? config.activeColor + ' text-white' : 'bg-muted text-muted-foreground'
              } ${isCurrent ? 'ring-2 ring-offset-1 ring-primary' : ''}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <span className={`text-[9px] ${isActive ? 'font-medium' : 'text-muted-foreground'}`}>
                {config.label}
              </span>
            </div>
            {idx < STATUS_STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 -mt-4 ${idx < activeIdx && !isCancelled ? 'bg-primary' : 'bg-muted'}`} />
            )}
          </React.Fragment>
        );
      })}
      {isCancelled && (
        <div className="flex flex-col items-center gap-0.5 flex-1">
          <div className="w-7 h-7 rounded-full flex items-center justify-center bg-destructive text-white ring-2 ring-offset-1 ring-destructive">
            <XCircle className="h-3.5 w-3.5" />
          </div>
          <span className="text-[9px] font-medium text-destructive">ملغاة</span>
        </div>
      )}
    </div>
  );
};

const OrderTracking: React.FC = () => {
  const { language } = useLanguage();
  const isRTL = language === 'ar';
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return format(d, 'yyyy-MM-dd');
  });
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [eventTypeFilter, setEventTypeFilter] = useState('all');
  const [workerFilter, setWorkerFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<GroupedOrder | null>(null);

  const { data: workers } = useQuery({
    queryKey: ['workers-list-for-tracking'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('id, full_name, role')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data;
    },
  });

  const { data: events, isLoading } = useAllOrderEvents({
    dateFrom,
    dateTo,
    eventType: eventTypeFilter,
    workerId: workerFilter,
  });

  // Group events by order
  const groupedOrders = useMemo<GroupedOrder[]>(() => {
    if (!events) return [];
    const map = new Map<string, GroupedOrder>();
    
    for (const e of events as any[]) {
      if (!map.has(e.order_id)) {
        map.set(e.order_id, {
          orderId: e.order_id,
          customerName: e.order?.customer?.name || 'غير معروف',
          currentStatus: e.order?.status || 'pending',
          totalAmount: e.order?.total_amount,
          events: [],
          latestEvent: e.created_at,
        });
      }
      map.get(e.order_id)!.events.push(e);
    }

    // Sort events within each order by time ascending
    for (const group of map.values()) {
      group.events.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }

    return Array.from(map.values()).sort((a, b) => 
      new Date(b.latestEvent).getTime() - new Date(a.latestEvent).getTime()
    );
  }, [events]);

  const filteredOrders = useMemo(() => {
    if (!searchQuery) return groupedOrders;
    const q = searchQuery.toLowerCase();
    return groupedOrders.filter(o => 
      o.customerName.toLowerCase().includes(q) || o.orderId.toLowerCase().includes(q)
    );
  }, [groupedOrders, searchQuery]);

  const stats = useMemo(() => {
    if (!events) return { total: 0, statusChanges: 0, modifications: 0, newOrders: 0 };
    return {
      total: (events as any[]).length,
      statusChanges: (events as any[]).filter(e => e.event_type === 'status_change').length,
      modifications: (events as any[]).filter(e => ['item_modified', 'amount_changed', 'price_changed', 'payment_updated'].includes(e.event_type)).length,
      newOrders: (events as any[]).filter(e => e.event_type === 'created').length,
    };
  }, [events]);

  return (
    <div className="space-y-4 pb-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <h1 className="text-xl font-bold">لوحة تتبع الطلبات</h1>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="p-2 text-center">
          <div className="text-lg font-bold text-primary">{stats.total}</div>
          <div className="text-[9px] text-muted-foreground">الأحداث</div>
        </Card>
        <Card className="p-2 text-center">
          <div className="text-lg font-bold text-green-600">{stats.newOrders}</div>
          <div className="text-[9px] text-muted-foreground">جديدة</div>
        </Card>
        <Card className="p-2 text-center">
          <div className="text-lg font-bold text-blue-600">{stats.statusChanges}</div>
          <div className="text-[9px] text-muted-foreground">حالات</div>
        </Card>
        <Card className="p-2 text-center">
          <div className="text-lg font-bold text-orange-600">{stats.modifications}</div>
          <div className="text-[9px] text-muted-foreground">تعديلات</div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">من</label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">إلى</label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute right-2 top-2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="بحث..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="h-8 text-sm pr-8" />
            </div>
            <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
              <SelectTrigger className="w-28 h-8 text-sm">
                <Filter className="h-3 w-3 ml-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="created">إنشاء</SelectItem>
                <SelectItem value="status_change">حالة</SelectItem>
                <SelectItem value="worker_changed">عامل</SelectItem>
                <SelectItem value="payment_updated">دفع</SelectItem>
                <SelectItem value="amount_changed">مبلغ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Select value={workerFilter} onValueChange={setWorkerFilter}>
            <SelectTrigger className="h-8 text-sm">
              <Users className="h-3 w-3 ml-1" />
              <SelectValue placeholder="كل العمال" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل العمال</SelectItem>
              {workers?.map(w => (
                <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Orders List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">
          لا توجد طلبات في الفترة المحددة
        </Card>
      ) : (
        <ScrollArea className="h-[calc(100vh-480px)]">
          <div className="space-y-2">
            {filteredOrders.map(order => (
              <Card
                key={order.orderId}
                className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedOrder(order)}
              >
                <div className="p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{order.customerName}</span>
                      <span className="text-[10px] text-muted-foreground">#{order.orderId.slice(0, 6)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className={`text-[10px] ${
                        order.currentStatus === 'delivered' ? 'bg-green-100 text-green-700' :
                        order.currentStatus === 'cancelled' ? 'bg-red-100 text-red-700' :
                        order.currentStatus === 'assigned' ? 'bg-purple-100 text-purple-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {STATUS_LABELS[order.currentStatus] || order.currentStatus}
                      </Badge>
                      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  
                  {/* Mini progress bar */}
                  <StatusProgressBar currentStatus={order.currentStatus} />
                  
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{order.events.length} حدث</span>
                    {order.totalAmount && <span>{Number(order.totalAmount).toLocaleString()} د.ج</span>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Timeline Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-right">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">#{selectedOrder?.orderId.slice(0, 8)}</span>
                <span>{selectedOrder?.customerName}</span>
              </div>
            </DialogTitle>
          </DialogHeader>
          
          {selectedOrder && (
            <div className="flex-1 overflow-auto">
              {/* Status Progress */}
              <StatusProgressBar currentStatus={selectedOrder.currentStatus} />
              
              {selectedOrder.totalAmount && (
                <div className="text-center text-sm font-medium mb-3">
                  المبلغ: {Number(selectedOrder.totalAmount).toLocaleString()} د.ج
                </div>
              )}
              
              {/* Full Timeline */}
              <div className="border-t pt-3">
                <h3 className="text-xs font-medium text-muted-foreground mb-3">سجل الأحداث</h3>
                <OrderTimeline events={selectedOrder.events} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrderTracking;
