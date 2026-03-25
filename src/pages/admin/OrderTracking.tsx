import React, { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useAllOrderEvents } from '@/hooks/useOrderEvents';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Search, Filter, ArrowRightLeft, UserCheck, CreditCard, Package, Printer, Plus, DollarSign, Clock, Users } from 'lucide-react';
import { Loader2 } from 'lucide-react';

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

  // Fetch workers list for filter
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

  const filteredEvents = useMemo(() => {
    if (!events) return [];
    if (!searchQuery) return events;
    const q = searchQuery.toLowerCase();
    return events.filter((e: any) => {
      const customerName = e.order?.customer?.name?.toLowerCase() || '';
      const orderId = e.order_id?.toLowerCase() || '';
      const performerName = e.performer?.full_name?.toLowerCase() || '';
      return customerName.includes(q) || orderId.includes(q) || performerName.includes(q);
    });
  }, [events, searchQuery]);

  // Summary stats
  const stats = useMemo(() => {
    if (!events) return { total: 0, statusChanges: 0, modifications: 0, newOrders: 0 };
    return {
      total: events.length,
      statusChanges: events.filter((e: any) => e.event_type === 'status_change').length,
      modifications: events.filter((e: any) => ['item_modified', 'amount_changed', 'price_changed', 'payment_updated'].includes(e.event_type)).length,
      newOrders: events.filter((e: any) => e.event_type === 'created').length,
    };
  }, [events]);

  const getEventConfig = (type: string) => EVENT_TYPE_CONFIG[type] || { label: type, icon: Clock, color: 'bg-muted text-muted-foreground' };

  const formatValue = (eventType: string, value: string | null) => {
    if (!value) return '-';
    if (eventType === 'status_change') return STATUS_LABELS[value] || value;
    if (eventType === 'amount_changed') return `${Number(value).toLocaleString()} د.ج`;
    return value;
  };

  return (
    <div className="space-y-4 pb-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <h1 className="text-xl font-bold">لوحة تتبع الطلبات</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="p-3">
          <div className="text-2xl font-bold text-primary">{stats.total}</div>
          <div className="text-xs text-muted-foreground">إجمالي الأحداث</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-green-600">{stats.newOrders}</div>
          <div className="text-xs text-muted-foreground">طلبات جديدة</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-blue-600">{stats.statusChanges}</div>
          <div className="text-xs text-muted-foreground">تغييرات الحالة</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-orange-600">{stats.modifications}</div>
          <div className="text-xs text-muted-foreground">تعديلات</div>
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
              <Input
                placeholder="بحث بالعميل أو رقم الطلبية..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8 text-sm pr-8"
              />
            </div>
            <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
              <SelectTrigger className="w-32 h-8 text-sm">
                <Filter className="h-3 w-3 ml-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأحداث</SelectItem>
                <SelectItem value="created">إنشاء</SelectItem>
                <SelectItem value="status_change">تغيير حالة</SelectItem>
                <SelectItem value="worker_changed">تغيير عامل</SelectItem>
                <SelectItem value="payment_updated">تحديث دفع</SelectItem>
                <SelectItem value="amount_changed">تغيير مبلغ</SelectItem>
                <SelectItem value="item_modified">تعديل منتجات</SelectItem>
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

      {/* Events List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filteredEvents.length === 0 ? (
        <Card className="p-6 text-center text-muted-foreground">
          لا توجد أحداث في الفترة المحددة
        </Card>
      ) : (
        <ScrollArea className="h-[calc(100vh-420px)]">
          <div className="space-y-2">
            {filteredEvents.map((event: any) => {
              const config = getEventConfig(event.event_type);
              const Icon = config.icon;
              return (
                <Card key={event.id} className="overflow-hidden">
                  <div className="p-3">
                    <div className="flex items-start gap-2">
                      <div className={`p-1.5 rounded-lg border ${config.color} shrink-0 mt-0.5`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className={`text-[10px] ${config.color} border`}>
                            {config.label}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {format(new Date(event.created_at), 'HH:mm', { locale: ar })}
                          </span>
                        </div>

                        {/* Customer & Order Info */}
                        <div className="mt-1 text-xs">
                          {event.order?.customer?.name && (
                            <span className="font-medium">{event.order.customer.name}</span>
                          )}
                          <span className="text-muted-foreground mr-1">
                            #{event.order_id?.slice(0, 6)}
                          </span>
                        </div>

                        {/* Event Details */}
                        {event.event_type === 'status_change' && (
                          <div className="mt-1 flex items-center gap-1 text-xs">
                            <Badge variant="outline" className="text-[10px] bg-muted">
                              {formatValue('status_change', event.old_value)}
                            </Badge>
                            <span>←</span>
                            <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary">
                              {formatValue('status_change', event.new_value)}
                            </Badge>
                          </div>
                        )}

                        {event.event_type === 'amount_changed' && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatValue('amount_changed', event.old_value)} → {formatValue('amount_changed', event.new_value)}
                          </div>
                        )}

                        {event.event_type === 'created' && event.details?.total_amount && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            المبلغ: {Number(event.details.total_amount).toLocaleString()} د.ج
                          </div>
                        )}

                        {/* Performer */}
                        {event.performer?.full_name && (
                          <div className="mt-1 text-[10px] text-muted-foreground">
                            بواسطة: {event.performer.full_name}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default OrderTracking;
