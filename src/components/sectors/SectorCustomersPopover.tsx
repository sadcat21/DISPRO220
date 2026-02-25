import React, { useMemo, useState } from 'react';
import { MapPin, User, Truck, ShoppingCart, MapPinOff, Navigation, Loader2, Eye, EyeOff, CheckCircle, PackageX, PackageCheck, Landmark, Banknote, Clock, Check, X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useNavigate } from 'react-router-dom';
import { useTrackVisit } from '@/hooks/useVisitTracking';
import { toast } from 'sonner';
import { useLocationThreshold } from '@/hooks/useLocationSettings';
import { useHasPermission } from '@/hooks/usePermissions';
import { calculateDistance } from '@/utils/geoUtils';
import { useDueDebts, usePendingCollections, useApproveCollection, DueDebt } from '@/hooks/useDebtCollections';
import CollectDebtDialog from '@/components/debts/CollectDebtDialog';
import VisitNoPaymentDialog from '@/components/debts/VisitNoPaymentDialog';
import { format } from 'date-fns';

const DAY_NAMES: Record<string, string> = {
  saturday: 'السبت',
  sunday: 'الأحد',
  monday: 'الإثنين',
  tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء',
  thursday: 'الخميس',
};

const JS_DAY_TO_NAME: Record<number, string> = {
  6: 'saturday',
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
};

const SectorCustomersPopover: React.FC = () => {
  const { t } = useLanguage();
  const { workerId, activeBranch, role } = useAuth();
  const navigate = useNavigate();
  const { trackVisit } = useTrackVisit();
  const { data: locationThreshold } = useLocationThreshold();
  const canBypassLocation = useHasPermission('bypass_location_check');
  const todayName = JS_DAY_TO_NAME[new Date().getDay()] || '';
  const [isOpen, setIsOpen] = useState(false);
  const [checkingLocationFor, setCheckingLocationFor] = useState<string | null>(null);

  // Debt-related state
  const isAdmin = role === 'admin' || role === 'branch_admin';
  const { data: dueDebts = [] } = useDueDebts(undefined);
  const { data: allDebts = [] } = useDueDebts('__all__');
  const { data: pendingCollections = [] } = usePendingCollections();
  const approveCollection = useApproveCollection();
  const [selectedDebt, setSelectedDebt] = useState<DueDebt | null>(null);
  const [showCollect, setShowCollect] = useState(false);
  const [showVisit, setShowVisit] = useState(false);

  const { data: sectors = [] } = useQuery({
    queryKey: ['sectors-with-customers', workerId, activeBranch?.id],
    queryFn: async () => {
      let query = supabase.from('sectors').select('*');
      if (activeBranch) query = query.eq('branch_id', activeBranch.id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!workerId,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['sector-customers', activeBranch?.id],
    queryFn: async () => {
      let query = supabase.from('customers').select('id, name, phone, wilaya, sector_id, store_name, latitude, longitude').not('sector_id', 'is', null);
      if (activeBranch) query = query.eq('branch_id', activeBranch.id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!workerId,
  });

  // Fetch today's visits for this worker
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const { data: todayVisits = [] } = useQuery({
    queryKey: ['today-visits', workerId, todayStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visit_tracking')
        .select('customer_id, operation_type')
        .eq('worker_id', workerId!)
        .gte('created_at', todayStart);
      if (error) throw error;
      return data || [];
    },
    enabled: !!workerId && isOpen,
    refetchInterval: 10000,
  });

  // isAdmin already declared above

  // Fetch today's orders by this worker (for sales categorization)
  const { data: todayOrders = [] } = useQuery({
    queryKey: ['today-orders-customers', workerId, todayStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('customer_id')
        .eq('created_by', workerId!)
        .gte('created_at', todayStart)
        .not('status', 'eq', 'cancelled');
      if (error) throw error;
      return data || [];
    },
    enabled: !!workerId && isOpen,
    refetchInterval: 10000,
  });

  // Fetch today's delivered orders (for delivery categorization)
  const { data: todayDeliveredOrders = [] } = useQuery({
    queryKey: ['today-delivered-orders', workerId, todayStart, isAdmin],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select('customer_id, status, assigned_worker_id')
        .gte('updated_at', todayStart)
        .eq('status', 'delivered');
      if (!isAdmin) {
        query = query.eq('assigned_worker_id', workerId!);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!workerId && isOpen,
    refetchInterval: 10000,
  });

  // Fetch orders assigned to this worker that are not yet delivered/cancelled (for delivery tab filtering)
  const { data: assignedOrderCustomerIds = [] } = useQuery({
    queryKey: ['assigned-order-customers', workerId, isAdmin, activeBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select('customer_id')
        .in('status', ['pending', 'assigned', 'in_progress']);
      if (!isAdmin) {
        query = query.eq('assigned_worker_id', workerId!);
      } else if (activeBranch) {
        query = query.eq('branch_id', activeBranch.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!workerId && isOpen,
    refetchInterval: 10000,
  });

  const mySectors = useMemo(() => {
    if (isAdmin) return sectors;
    return sectors.filter(s => 
      s.delivery_worker_id === workerId || s.sales_worker_id === workerId
    );
  }, [sectors, workerId, isAdmin]);

  const todayDeliverySectors = useMemo(() => {
    if (isAdmin) return mySectors.filter(s => s.visit_day_delivery === todayName);
    return mySectors.filter(s => s.visit_day_delivery === todayName && s.delivery_worker_id === workerId);
  }, [mySectors, todayName, workerId, isAdmin]);

  const todaySalesSectors = useMemo(() => {
    if (isAdmin) return mySectors.filter(s => s.visit_day_sales === todayName);
    return mySectors.filter(s => s.visit_day_sales === todayName && s.sales_worker_id === workerId);
  }, [mySectors, todayName, workerId, isAdmin]);

  // Delivery tab: only show customers who have assigned orders OR were delivered today
  const deliveryCustomerIdsWithOrders = useMemo(() => {
    const ids = new Set<string>();
    assignedOrderCustomerIds.forEach(o => { if (o.customer_id) ids.add(o.customer_id); });
    todayDeliveredOrders.forEach(o => { if (o.customer_id) ids.add(o.customer_id); });
    return ids;
  }, [assignedOrderCustomerIds, todayDeliveredOrders]);

  const deliveryCustomers = useMemo(() => {
    return customers.filter(c => deliveryCustomerIdsWithOrders.has(c.id));
  }, [customers, deliveryCustomerIdsWithOrders]);

  const salesCustomers = useMemo(() => {
    const sectorIds = new Set(todaySalesSectors.map(s => s.id));
    return customers.filter(c => c.sector_id && sectorIds.has(c.sector_id));
  }, [customers, todaySalesSectors]);

  // Categorize sales customers into sub-tabs
  const visitedCustomerIds = useMemo(() => {
    return new Set(todayVisits.filter(v => v.operation_type === 'visit').map(v => v.customer_id).filter(Boolean));
  }, [todayVisits]);

  const orderedCustomerIds = useMemo(() => {
    return new Set(todayOrders.map(o => o.customer_id).filter(Boolean));
  }, [todayOrders]);

  const salesNotVisited = useMemo(() => {
    return salesCustomers.filter(c => !visitedCustomerIds.has(c.id) && !orderedCustomerIds.has(c.id));
  }, [salesCustomers, visitedCustomerIds, orderedCustomerIds]);

  const salesVisitedNoOrder = useMemo(() => {
    return salesCustomers.filter(c => visitedCustomerIds.has(c.id) && !orderedCustomerIds.has(c.id));
  }, [salesCustomers, visitedCustomerIds, orderedCustomerIds]);

  const salesWithOrders = useMemo(() => {
    return salesCustomers.filter(c => orderedCustomerIds.has(c.id));
  }, [salesCustomers, orderedCustomerIds]);

  // Categorize delivery customers into sub-tabs
  const deliveredCustomerIds = useMemo(() => {
    return new Set(todayDeliveredOrders.map(o => o.customer_id).filter(Boolean));
  }, [todayDeliveredOrders]);

  const deliveryVisitedCustomerIds = useMemo(() => {
    return new Set(todayVisits.filter(v => v.operation_type === 'delivery_visit').map(v => v.customer_id).filter(Boolean));
  }, [todayVisits]);

  const deliveryNotDone = useMemo(() => {
    return deliveryCustomers.filter(c => !deliveredCustomerIds.has(c.id) && !deliveryVisitedCustomerIds.has(c.id));
  }, [deliveryCustomers, deliveredCustomerIds, deliveryVisitedCustomerIds]);

  const deliveryNotReceived = useMemo(() => {
    return deliveryCustomers.filter(c => deliveryVisitedCustomerIds.has(c.id) && !deliveredCustomerIds.has(c.id));
  }, [deliveryCustomers, deliveryVisitedCustomerIds, deliveredCustomerIds]);

  const deliveryReceived = useMemo(() => {
    return deliveryCustomers.filter(c => deliveredCustomerIds.has(c.id));
  }, [deliveryCustomers, deliveredCustomerIds]);

  // Debt categorization: today's collection customers that have been collected vs not
  const todayStart2 = useMemo(() => new Date().toISOString().split('T')[0], []);
  
  const { data: todayCollections = [] } = useQuery({
    queryKey: ['today-debt-collections', workerId, todayStart2],
    queryFn: async () => {
      let query = supabase
        .from('debt_collections')
        .select('debt_id, action, amount_collected, status')
        .eq('collection_date', todayStart2);
      if (!isAdmin) {
        query = query.eq('worker_id', workerId!);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!workerId && isOpen,
    refetchInterval: 10000,
  });

  const collectedDebtIds = useMemo(() => {
    return new Set(todayCollections.filter(c => c.action !== 'no_payment').map(c => c.debt_id));
  }, [todayCollections]);

  const noPaymentDebtIds = useMemo(() => {
    return new Set(todayCollections.filter(c => c.action === 'no_payment').map(c => c.debt_id));
  }, [todayCollections]);

  const debtsToCollectToday = useMemo(() => {
    return dueDebts.filter(d => !collectedDebtIds.has(d.id) && !noPaymentDebtIds.has(d.id));
  }, [dueDebts, collectedDebtIds, noPaymentDebtIds]);

  const debtsCollectedToday = useMemo(() => {
    return dueDebts.filter(d => collectedDebtIds.has(d.id));
  }, [dueDebts, collectedDebtIds]);

  const debtsNoPaymentToday = useMemo(() => {
    return dueDebts.filter(d => noPaymentDebtIds.has(d.id));
  }, [dueDebts, noPaymentDebtIds]);

  const totalCount = deliveryCustomers.length + salesCustomers.length;
  const debtBadgeCount = dueDebts.length;

  if (mySectors.length === 0 && dueDebts.length === 0 && allDebts.length === 0) return null;

  const handleApproveCollection = async (collectionId: string) => {
    try {
      await approveCollection.mutateAsync({ collectionId, approved: true });
      toast.success('تمت الموافقة');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleRejectCollection = async (collectionId: string) => {
    try {
      await approveCollection.mutateAsync({ collectionId, approved: false, rejectionReason: 'مرفوض' });
      toast.success('تم الرفض');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleCustomerClick = (customer: any, tab: 'delivery' | 'sales') => {
    setIsOpen(false);
    if (tab === 'sales') {
      navigate('/orders', { state: { customerId: customer.id } });
    } else {
      navigate('/my-deliveries', { state: { customerId: customer.id, action: 'delivery' } });
    }
  };

  const handleDeliveryVisitWithoutDelivery = async (customer: any) => {
    const allowed = await checkLocationBeforeAction(customer);
    if (!allowed) return;
    try {
      await trackVisit({
        customerId: customer.id,
        operationType: 'delivery_visit',
        notes: `زيارة توصيل بدون تسليم - ${customer.store_name || customer.name}`,
      });
      toast.success(`تم تسجيل زيارة بدون تسليم لـ ${customer.store_name || customer.name}`);
    } catch {
      toast.error('فشل في تسجيل الزيارة');
    }
  };

  const checkLocationBeforeAction = async (customer: any): Promise<boolean> => {
    if (canBypassLocation) return true;
    if (!customer.latitude || !customer.longitude) return true;

    const threshold = locationThreshold ?? 100;
    setCheckingLocationFor(customer.id);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) { reject(); return; }
        navigator.geolocation.getCurrentPosition(resolve, () => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 });
        }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 });
      });
      const distanceKm = calculateDistance(position.coords.latitude, position.coords.longitude, customer.latitude, customer.longitude);
      const distanceMeters = distanceKm * 1000;
      if (distanceMeters > threshold) {
        const formattedDistance = distanceMeters >= 1000 
          ? `${(distanceMeters / 1000).toFixed(1)} كم` 
          : `${Math.round(distanceMeters)} متر`;
        toast.error(`📍 أنت بعيد عن العميل بمسافة ${formattedDistance}`, {
          description: `يجب أن تكون على بُعد ${threshold} متر أو أقل من موقع العميل`,
        });
        return false;
      }
      return true;
    } catch {
      toast.error('تعذر تحديد موقعك. يرجى تفعيل خدمة الموقع.');
      return false;
    } finally {
      setCheckingLocationFor(null);
    }
  };

  const handleVisitWithoutOrder = async (customer: any) => {
    const allowed = await checkLocationBeforeAction(customer);
    if (!allowed) return;
    try {
      await trackVisit({
        customerId: customer.id,
        operationType: 'visit',
        notes: `زيارة بدون طلبية - ${customer.name}`,
      });
      toast.success(`تم تسجيل زيارة ${customer.name} بنجاح`);
    } catch {
      toast.error('فشل في تسجيل الزيارة');
    }
  };

  return (
    <>
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 transition-colors"
          title="عملاء اليوم"
        >
          <MapPin className="w-4 h-4 text-blue-500" />
          {(totalCount + debtBadgeCount) > 0 && (
            <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {totalCount + debtBadgeCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0 max-h-[75vh] flex flex-col">
        <div className="p-3 border-b font-bold text-sm flex items-center gap-2">
          <MapPin className="w-4 h-4 text-blue-500" />
          عملاء اليوم — {DAY_NAMES[todayName] || todayName}
        </div>

        <Tabs defaultValue="sales" className="flex flex-col flex-1 min-h-0">
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
              {debtBadgeCount > 0 && <Badge variant="destructive" className="text-[10px] px-1">{debtBadgeCount}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="delivery" className="m-0 flex-1 min-h-0">
            <Tabs defaultValue="not-delivered" className="flex flex-col h-full min-h-0">
              <TabsList className="w-full rounded-none border-b shrink-0 h-auto p-0.5 gap-0.5">
                <TabsTrigger value="not-delivered" className="flex-1 gap-1 text-[10px] px-1.5 py-1.5 data-[state=active]:bg-orange-100 data-[state=active]:text-orange-700">
                  <Truck className="w-3 h-3" />
                  بدون توصيل
                  {deliveryNotDone.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-orange-500">{deliveryNotDone.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="not-received" className="flex-1 gap-1 text-[10px] px-1.5 py-1.5 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-700">
                  <PackageX className="w-3 h-3" />
                  لم يتم الاستلام
                  {deliveryNotReceived.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-amber-500">{deliveryNotReceived.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="received" className="flex-1 gap-1 text-[10px] px-1.5 py-1.5 data-[state=active]:bg-green-100 data-[state=active]:text-green-700">
                  <PackageCheck className="w-3 h-3" />
                  تم الاستلام
                  {deliveryReceived.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-green-500">{deliveryReceived.length}</Badge>}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="not-delivered" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '45vh' }}>
                <CustomerList
                  customers={deliveryNotDone}
                  emptyMessage="تم توصيل جميع العملاء ✓"
                  onCustomerClick={(c) => handleCustomerClick(c, 'delivery')}
                  onVisitWithoutOrder={handleDeliveryVisitWithoutDelivery}
                  showVisitButton={true}
                  visitButtonLabel="بدون تسليم"
                  checkingLocationFor={checkingLocationFor}
                />
              </TabsContent>
              <TabsContent value="not-received" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '45vh' }}>
                <CustomerList
                  customers={deliveryNotReceived}
                  emptyMessage="لا توجد زيارات بدون تسليم"
                  onCustomerClick={(c) => handleCustomerClick(c, 'delivery')}
                  onVisitWithoutOrder={handleDeliveryVisitWithoutDelivery}
                  showVisitButton={false}
                  checkingLocationFor={checkingLocationFor}
                />
              </TabsContent>
              <TabsContent value="received" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '45vh' }}>
                <CustomerList
                  customers={deliveryReceived}
                  emptyMessage="لا توجد توصيلات بعد"
                  onCustomerClick={(c) => handleCustomerClick(c, 'delivery')}
                  onVisitWithoutOrder={handleDeliveryVisitWithoutDelivery}
                  showVisitButton={false}
                  checkingLocationFor={checkingLocationFor}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="sales" className="m-0 flex-1 min-h-0">
            <Tabs defaultValue="not-visited" className="flex flex-col h-full min-h-0">
              <TabsList className="w-full rounded-none border-b shrink-0 h-auto p-0.5 gap-0.5">
                <TabsTrigger value="not-visited" className="flex-1 gap-1 text-[10px] px-1.5 py-1.5 data-[state=active]:bg-orange-100 data-[state=active]:text-orange-700">
                  <EyeOff className="w-3 h-3" />
                  بدون زيارة
                  {salesNotVisited.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-orange-500">{salesNotVisited.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="visited-no-order" className="flex-1 gap-1 text-[10px] px-1.5 py-1.5 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-700">
                  <Eye className="w-3 h-3" />
                  بدون طلبية
                  {salesVisitedNoOrder.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-amber-500">{salesVisitedNoOrder.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="with-orders" className="flex-1 gap-1 text-[10px] px-1.5 py-1.5 data-[state=active]:bg-green-100 data-[state=active]:text-green-700">
                  <CheckCircle className="w-3 h-3" />
                  بطلبيات
                  {salesWithOrders.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-green-500">{salesWithOrders.length}</Badge>}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="not-visited" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '45vh' }}>
                  <CustomerList
                    customers={salesNotVisited}
                    emptyMessage="تمت زيارة جميع العملاء ✓"
                    onCustomerClick={(c) => handleCustomerClick(c, 'sales')}
                    onVisitWithoutOrder={handleVisitWithoutOrder}
                    showVisitButton={true}
                    checkingLocationFor={checkingLocationFor}
                  />
              </TabsContent>
              <TabsContent value="visited-no-order" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '45vh' }}>
                  <CustomerList
                    customers={salesVisitedNoOrder}
                    emptyMessage="لا توجد زيارات بدون طلبيات"
                    onCustomerClick={(c) => handleCustomerClick(c, 'sales')}
                    onVisitWithoutOrder={handleVisitWithoutOrder}
                    showVisitButton={false}
                    checkingLocationFor={checkingLocationFor}
                  />
              </TabsContent>
              <TabsContent value="with-orders" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '45vh' }}>
                  <CustomerList
                    customers={salesWithOrders}
                    emptyMessage="لا توجد طلبيات بعد"
                    onCustomerClick={(c) => handleCustomerClick(c, 'sales')}
                    onVisitWithoutOrder={handleVisitWithoutOrder}
                    showVisitButton={false}
                    checkingLocationFor={checkingLocationFor}
                  />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* Debts Tab */}
          <TabsContent value="debts" className="m-0 flex-1 min-h-0">
            <Tabs defaultValue="today-collection" className="flex flex-col h-full min-h-0">
              <TabsList className="w-full rounded-none border-b shrink-0 h-auto p-0.5 gap-0.5">
                <TabsTrigger value="today-collection" className="flex-1 gap-1 text-[10px] px-1 py-1.5 data-[state=active]:bg-orange-100 data-[state=active]:text-orange-700">
                  <Clock className="w-3 h-3" />
                  تحصيل اليوم
                  {debtsToCollectToday.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-orange-500">{debtsToCollectToday.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="collected" className="flex-1 gap-1 text-[10px] px-1 py-1.5 data-[state=active]:bg-green-100 data-[state=active]:text-green-700">
                  <Check className="w-3 h-3" />
                  تم التحصيل
                  {debtsCollectedToday.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-green-500">{debtsCollectedToday.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="no-payment" className="flex-1 gap-1 text-[10px] px-1 py-1.5 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-700">
                  <X className="w-3 h-3" />
                  بدون تحصيل
                  {debtsNoPaymentToday.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-amber-500">{debtsNoPaymentToday.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="all-debts" className="flex-1 gap-1 text-[10px] px-1 py-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                  <Landmark className="w-3 h-3" />
                  الكل
                  {allDebts.length > 0 && <Badge variant="secondary" className="text-[9px] px-1 h-4">{allDebts.length}</Badge>}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="today-collection" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '45vh' }}>
                <DebtList debts={debtsToCollectToday} onSelect={setSelectedDebt} emptyMessage="لا توجد ديون مستحقة اليوم ✓" />
              </TabsContent>
              <TabsContent value="collected" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '45vh' }}>
                <DebtList debts={debtsCollectedToday} onSelect={setSelectedDebt} emptyMessage="لا توجد تحصيلات بعد" />
              </TabsContent>
              <TabsContent value="no-payment" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '45vh' }}>
                <DebtList debts={debtsNoPaymentToday} onSelect={setSelectedDebt} emptyMessage="لا توجد زيارات بدون دفع" />
              </TabsContent>
              <TabsContent value="all-debts" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '45vh' }}>
                <DebtList debts={allDebts} onSelect={setSelectedDebt} emptyMessage="لا توجد ديون مستحقة" />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>

    {/* Debt Info Dialog */}
    {selectedDebt && (
      <Dialog open={!!selectedDebt} onOpenChange={(open) => !open && setSelectedDebt(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm p-4 gap-3" dir="rtl">
          <DialogHeader className="pb-0">
            <DialogTitle className="text-base truncate">
              {selectedDebt.customer?.store_name || selectedDebt.customer?.name || '—'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-muted/50 rounded-md p-2 text-center space-y-1">
              <p className="text-xs text-muted-foreground">المبلغ المتبقي</p>
              <p className="text-xl font-bold text-destructive">{Number(selectedDebt.remaining_amount).toLocaleString()} DA</p>
              <p className="text-xs text-muted-foreground">
                تاريخ الاستحقاق: {selectedDebt.due_date ? format(new Date(selectedDebt.due_date + 'T00:00:00'), 'dd/MM/yyyy') : '—'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={() => { setShowCollect(true); setIsOpen(false); }}>
                <Banknote className="w-4 h-4 ml-1" />
                تحصيل
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => { setShowVisit(true); setIsOpen(false); }}>
                <Eye className="w-4 h-4 ml-1" />
                زيارة بدون دفع
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )}

    {selectedDebt && (
      <CollectDebtDialog
        open={showCollect}
        onOpenChange={(open) => { setShowCollect(open); if (!open) setSelectedDebt(null); }}
        debtId={selectedDebt.id}
        totalDebtAmount={Number(selectedDebt.total_amount)}
        paidAmountBefore={Number(selectedDebt.paid_amount)}
        remainingAmount={Number(selectedDebt.remaining_amount)}
        customerName={selectedDebt.customer?.name || '—'}
        customerId={selectedDebt.customer_id}
        defaultAmount={selectedDebt.collection_amount || undefined}
        collectionType={selectedDebt.collection_type}
        collectionDays={selectedDebt.collection_days}
      />
    )}

    {selectedDebt && (
      <VisitNoPaymentDialog
        open={showVisit}
        onOpenChange={(open) => { setShowVisit(open); if (!open) setSelectedDebt(null); }}
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

const CustomerList: React.FC<{
  customers: any[];
  emptyMessage: string;
  onCustomerClick: (c: any) => void;
  onVisitWithoutOrder: (c: any) => void;
  showVisitButton: boolean;
  visitButtonLabel?: string;
  checkingLocationFor: string | null;
}> = ({ customers, emptyMessage, onCustomerClick, onVisitWithoutOrder, showVisitButton, visitButtonLabel, checkingLocationFor }) => {
  if (customers.length === 0) {
    return <div className="p-6 text-center text-sm text-muted-foreground">{emptyMessage}</div>;
  }

  return (
    <div className="divide-y">
      {customers.map(c => (
        <div key={c.id} className="p-3 hover:bg-muted/50 transition-colors">
          <button
            className="w-full flex items-center gap-2 text-start"
            onClick={() => onCustomerClick(c)}
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm truncate">{c.store_name || c.name}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {c.store_name && <span>{c.name}</span>}
                {c.phone && <span>• {c.phone}</span>}
                {c.wilaya && <span>• {c.wilaya}</span>}
              </div>
            </div>
          </button>
          <div className="flex items-center gap-1 mt-1.5 justify-end">
            {c.latitude && c.longitude && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-1.5 gap-0.5"
                onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}`, '_blank')}
              >
                <Navigation className="w-3 h-3" />
                الموقع
              </Button>
            )}
            {showVisitButton && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-1.5 gap-0.5 text-orange-600"
                onClick={() => onVisitWithoutOrder(c)}
                disabled={checkingLocationFor === c.id}
              >
                {checkingLocationFor === c.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <MapPinOff className="w-3 h-3" />
                )}
                {visitButtonLabel || 'زيارة بدون طلبية'}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};


const DebtList: React.FC<{ debts: DueDebt[]; onSelect: (d: DueDebt) => void; emptyMessage: string }> = ({ debts, onSelect, emptyMessage }) => {
  if (debts.length === 0) {
    return <div className="p-6 text-center text-sm text-muted-foreground">{emptyMessage}</div>;
  }

  return (
    <div className="divide-y">
      {debts.map(debt => (
        <button
          key={debt.id}
          className="w-full p-3 text-right hover:bg-muted/50 transition-colors"
          onClick={() => onSelect(debt)}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm">{debt.customer?.store_name || debt.customer?.name || '—'}</span>
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
  );
};

export default SectorCustomersPopover;
