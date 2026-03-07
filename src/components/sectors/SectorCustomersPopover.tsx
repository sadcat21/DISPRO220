import React, { useMemo, useState } from 'react';
import { MapPin, User, Truck, ShoppingCart, MapPinOff, Navigation, Loader2, Eye, EyeOff, CheckCircle, PackageX, PackageCheck, Landmark, Banknote, Clock, Check, X, DoorClosed, UserX, ShoppingBag, Printer, XCircle, Phone, Search } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
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
import DeliverySaleDialog from '@/components/orders/DeliverySaleDialog';
import DirectSaleDialog from '@/components/warehouse/DirectSaleDialog';
import ReceiptDialog from '@/components/printing/ReceiptDialog';
import { ReceiptItem } from '@/types/receipt';
import { format } from 'date-fns';
import { OrderWithDetails } from '@/types/database';

const DAY_NAMES: Record<string, string> = {
  saturday: 'السبت', sunday: 'الأحد', monday: 'الإثنين',
  tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس',
};

const JS_DAY_TO_NAME: Record<number, string> = {
  6: 'saturday', 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday',
};

const SectorCustomersPopover: React.FC = () => {
  const { t } = useLanguage();
  const { workerId, activeBranch, role, user } = useAuth();
  const navigate = useNavigate();
  const { trackVisit } = useTrackVisit();
  const { data: locationThreshold } = useLocationThreshold();
  const canBypassLocation = useHasPermission('bypass_location_check');
  const todayName = JS_DAY_TO_NAME[new Date().getDay()] || '';
  const [isOpen, setIsOpen] = useState(false);
  const [checkingLocationFor, setCheckingLocationFor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const isAdmin = role === 'admin' || role === 'branch_admin';

  // Admin worker picker
  const [selectedAdminWorkerId, setSelectedAdminWorkerId] = useState<string | null>(null);
  const { data: workersList = [] } = useQuery({
    queryKey: ['popover-workers-list', activeBranch?.id],
    queryFn: async () => {
      let query = supabase.from('workers').select('id, full_name, username').eq('is_active', true);
      if (activeBranch && role === 'branch_admin') query = query.eq('branch_id', activeBranch.id);
      const { data } = await query.order('full_name');
      return data || [];
    },
    enabled: isAdmin && isOpen,
  });

  const effectiveWorkerId = isAdmin && selectedAdminWorkerId ? selectedAdminWorkerId : workerId;
  const hasSpecificWorker = !!selectedAdminWorkerId;

  const { data: dueDebts = [] } = useDueDebts(undefined);
  const { data: allDebts = [] } = useDueDebts('__all__');
  const { data: pendingCollections = [] } = usePendingCollections();
  const approveCollection = useApproveCollection();
  const [selectedDebt, setSelectedDebt] = useState<DueDebt | null>(null);
  const [showCollect, setShowCollect] = useState(false);
  const [showVisit, setShowVisit] = useState(false);
  const [deliveryOrder, setDeliveryOrder] = useState<OrderWithDetails | null>(null);
  const [showDeliverySale, setShowDeliverySale] = useState(false);
  const [loadingDeliveryFor, setLoadingDeliveryFor] = useState<string | null>(null);
  const [orderDetailsDialog, setOrderDetailsDialog] = useState<any>(null);
  const [showDirectSale, setShowDirectSale] = useState(false);
  const [directSaleCustomerId, setDirectSaleCustomerId] = useState<string | null>(null);
  const [printReceiptData, setPrintReceiptData] = useState<any>(null);
  const [showPrintReceipt, setShowPrintReceipt] = useState(false);

  const { data: sectors = [] } = useQuery({
    queryKey: ['sectors-with-customers', effectiveWorkerId, activeBranch?.id],
    queryFn: async () => {
      let query = supabase.from('sectors').select('*');
      if (activeBranch) query = query.eq('branch_id', activeBranch.id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveWorkerId,
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

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const { data: todayVisits = [] } = useQuery({
    queryKey: ['today-visits-pop', effectiveWorkerId, todayStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visit_tracking')
        .select('customer_id, operation_type')
        .eq('worker_id', effectiveWorkerId!)
        .gte('created_at', todayStart);
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveWorkerId && isOpen,
    refetchInterval: 10000,
  });

  const { data: todayOrders = [] } = useQuery({
    queryKey: ['today-orders-customers-pop', effectiveWorkerId, todayStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('customer_id')
        .eq('created_by', effectiveWorkerId!)
        .gte('created_at', todayStart)
        .not('status', 'eq', 'cancelled');
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveWorkerId && isOpen,
    refetchInterval: 10000,
  });

  const { data: todayDeliveredOrders = [] } = useQuery({
    queryKey: ['today-delivered-orders-pop', effectiveWorkerId, todayStart, hasSpecificWorker],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select('customer_id, status, assigned_worker_id')
        .gte('updated_at', todayStart)
        .eq('status', 'delivered');
      if (hasSpecificWorker) {
        query = query.eq('assigned_worker_id', effectiveWorkerId!);
      } else if (!isAdmin) {
        query = query.eq('assigned_worker_id', effectiveWorkerId!);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveWorkerId && isOpen,
    refetchInterval: 10000,
  });

  const { data: assignedOrderCustomerIds = [] } = useQuery({
    queryKey: ['assigned-order-customers-pop', effectiveWorkerId, hasSpecificWorker, activeBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select('customer_id')
        .in('status', ['pending', 'assigned', 'in_progress']);
      if (hasSpecificWorker) {
        query = query.eq('assigned_worker_id', effectiveWorkerId!);
      } else if (!isAdmin) {
        query = query.eq('assigned_worker_id', effectiveWorkerId!);
      } else if (activeBranch) {
        query = query.eq('branch_id', activeBranch.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveWorkerId && isOpen,
    refetchInterval: 10000,
  });

  const todayStart2 = useMemo(() => new Date().toISOString().split('T')[0], []);

  const { data: todayCollections = [] } = useQuery({
    queryKey: ['today-debt-collections-pop', effectiveWorkerId, todayStart2, hasSpecificWorker],
    queryFn: async () => {
      let query = supabase
        .from('debt_collections')
        .select('debt_id, action, amount_collected, status')
        .eq('collection_date', todayStart2);
      if (hasSpecificWorker) {
        query = query.eq('worker_id', effectiveWorkerId!);
      } else if (!isAdmin) {
        query = query.eq('worker_id', effectiveWorkerId!);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!effectiveWorkerId && isOpen,
    refetchInterval: 10000,
  });

  const sevenDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const { data: recentNegativeVisits = [] } = useQuery({
    queryKey: ['recent-negative-visits-popover', effectiveWorkerId, sevenDaysAgo],
    queryFn: async () => {
      const { data } = await supabase
        .from('visit_tracking')
        .select('customer_id, notes, created_at')
        .gte('created_at', sevenDaysAgo)
        .or('notes.ilike.%مغلق%,notes.ilike.%غير متاح%,notes.ilike.%بدون طلبية%');
      return data || [];
    },
    enabled: !!effectiveWorkerId && isOpen,
  });

  // Worker stock for direct sale
  const { data: workerStock = [] } = useQuery({
    queryKey: ['my-worker-stock-popover', effectiveWorkerId],
    queryFn: async () => {
      const { data } = await supabase
        .from('worker_stock')
        .select('id, product_id, quantity, product:products(*)')
        .eq('worker_id', effectiveWorkerId!)
        .gt('quantity', 0);
      return data || [];
    },
    enabled: !!effectiveWorkerId && isOpen,
  });

  // Today's direct sales
  const { data: todayDirectSales = [] } = useQuery({
    queryKey: ['today-direct-sales-popover', effectiveWorkerId, todayStart, hasSpecificWorker],
    queryFn: async () => {
      let query = supabase
        .from('receipts')
        .select('customer_id, items, total_amount, customer_name, created_at')
        .eq('receipt_type', 'direct_sale')
        .gte('created_at', todayStart);
      if (hasSpecificWorker) {
        query = query.eq('worker_id', effectiveWorkerId!);
      } else if (!isAdmin) {
        query = query.eq('worker_id', effectiveWorkerId!);
      }
      const { data } = await query;
      return data || [];
    },
    enabled: !!effectiveWorkerId && isOpen,
    refetchInterval: 10000,
  });

  // Today's direct sale visits (بدون بيع)
  const { data: todayDirectSaleVisits = [] } = useQuery({
    queryKey: ['today-direct-sale-visits-popover', effectiveWorkerId, todayStart],
    queryFn: async () => {
      const { data } = await supabase
        .from('visit_tracking')
        .select('customer_id, notes')
        .eq('worker_id', effectiveWorkerId!)
        .gte('created_at', todayStart)
        .or('notes.ilike.%بدون بيع%,notes.ilike.%مغلق (بيع مباشر)%,notes.ilike.%غير متاح (بيع مباشر)%');
      return data || [];
    },
    enabled: !!effectiveWorkerId && isOpen,
    refetchInterval: 10000,
  });

  // Computed
  const mySectors = useMemo(() => {
    if (hasSpecificWorker) return sectors.filter(s => s.delivery_worker_id === effectiveWorkerId || s.sales_worker_id === effectiveWorkerId);
    if (isAdmin) return sectors;
    return sectors.filter(s => s.delivery_worker_id === effectiveWorkerId || s.sales_worker_id === effectiveWorkerId);
  }, [sectors, effectiveWorkerId, isAdmin, hasSpecificWorker]);

  const todayDeliverySectors = useMemo(() => {
    if (isAdmin && !hasSpecificWorker) return mySectors.filter(s => s.visit_day_delivery === todayName);
    return mySectors.filter(s => s.visit_day_delivery === todayName && s.delivery_worker_id === effectiveWorkerId);
  }, [mySectors, todayName, effectiveWorkerId, isAdmin, hasSpecificWorker]);

  const todaySalesSectors = useMemo(() => {
    if (isAdmin && !hasSpecificWorker) return mySectors.filter(s => s.visit_day_sales === todayName);
    return mySectors.filter(s => s.visit_day_sales === todayName && s.sales_worker_id === effectiveWorkerId);
  }, [mySectors, todayName, effectiveWorkerId, isAdmin, hasSpecificWorker]);

  const deliveryCustomerIdsWithOrders = useMemo(() => {
    const ids = new Set<string>();
    assignedOrderCustomerIds.forEach(o => { if (o.customer_id) ids.add(o.customer_id); });
    todayDeliveredOrders.forEach(o => { if (o.customer_id) ids.add(o.customer_id); });
    return ids;
  }, [assignedOrderCustomerIds, todayDeliveredOrders]);

  const deliveryCustomers = useMemo(() => customers.filter(c => deliveryCustomerIdsWithOrders.has(c.id)), [customers, deliveryCustomerIdsWithOrders]);
  const salesCustomers = useMemo(() => {
    const sectorIds = new Set(todaySalesSectors.map(s => s.id));
    return customers.filter(c => c.sector_id && sectorIds.has(c.sector_id));
  }, [customers, todaySalesSectors]);

  const visitedCustomerIds = useMemo(() => new Set(todayVisits.filter(v => v.operation_type === 'visit').map(v => v.customer_id).filter(Boolean)), [todayVisits]);
  const orderedCustomerIds = useMemo(() => new Set(todayOrders.map(o => o.customer_id).filter(Boolean)), [todayOrders]);
  const salesNotVisited = useMemo(() => salesCustomers.filter(c => !visitedCustomerIds.has(c.id) && !orderedCustomerIds.has(c.id)), [salesCustomers, visitedCustomerIds, orderedCustomerIds]);
  const salesVisitedNoOrder = useMemo(() => salesCustomers.filter(c => visitedCustomerIds.has(c.id) && !orderedCustomerIds.has(c.id)), [salesCustomers, visitedCustomerIds, orderedCustomerIds]);
  const salesWithOrders = useMemo(() => salesCustomers.filter(c => orderedCustomerIds.has(c.id)), [salesCustomers, orderedCustomerIds]);

  const deliveredCustomerIds = useMemo(() => new Set(todayDeliveredOrders.map(o => o.customer_id).filter(Boolean)), [todayDeliveredOrders]);
  const deliveryVisitedCustomerIds = useMemo(() => new Set(todayVisits.filter(v => v.operation_type === 'delivery_visit').map(v => v.customer_id).filter(Boolean)), [todayVisits]);
  const deliveryNotDone = useMemo(() => deliveryCustomers.filter(c => !deliveredCustomerIds.has(c.id) && !deliveryVisitedCustomerIds.has(c.id)), [deliveryCustomers, deliveredCustomerIds, deliveryVisitedCustomerIds]);
  const deliveryNotReceived = useMemo(() => deliveryCustomers.filter(c => deliveryVisitedCustomerIds.has(c.id) && !deliveredCustomerIds.has(c.id)), [deliveryCustomers, deliveryVisitedCustomerIds, deliveredCustomerIds]);
  const deliveryReceived = useMemo(() => deliveryCustomers.filter(c => deliveredCustomerIds.has(c.id)), [deliveryCustomers, deliveredCustomerIds]);

  const collectedDebtIds = useMemo(() => new Set(todayCollections.filter(c => c.action !== 'no_payment').map(c => c.debt_id)), [todayCollections]);
  const noPaymentDebtIds = useMemo(() => new Set(todayCollections.filter(c => c.action === 'no_payment').map(c => c.debt_id)), [todayCollections]);
  const filteredDueDebts = useMemo(() => {
    if (hasSpecificWorker) return dueDebts.filter(d => d.worker_id === effectiveWorkerId);
    return dueDebts;
  }, [dueDebts, effectiveWorkerId, hasSpecificWorker]);
  const debtsToCollectToday = useMemo(() => filteredDueDebts.filter(d => !collectedDebtIds.has(d.id) && !noPaymentDebtIds.has(d.id)), [filteredDueDebts, collectedDebtIds, noPaymentDebtIds]);
  const debtsCollectedToday = useMemo(() => filteredDueDebts.filter(d => collectedDebtIds.has(d.id)), [filteredDueDebts, collectedDebtIds]);
  const debtsNoPaymentToday = useMemo(() => filteredDueDebts.filter(d => noPaymentDebtIds.has(d.id)), [filteredDueDebts, noPaymentDebtIds]);

  // Direct sale
  const directSaleCustomers = useMemo(() => {
    const deliverySectorIds = new Set(todayDeliverySectors.map(s => s.id));
    const customersInDeliverySectors = customers.filter(c => c.sector_id && deliverySectorIds.has(c.sector_id));
    const negativeCustomerIds = new Set(recentNegativeVisits.map(v => v.customer_id).filter(Boolean));
    return customersInDeliverySectors.filter(c => negativeCustomerIds.has(c.id) && !deliveredCustomerIds.has(c.id));
  }, [todayDeliverySectors, customers, recentNegativeVisits, deliveredCustomerIds]);

  const directSoldCustomerIds = useMemo(() => new Set(todayDirectSales.map(s => s.customer_id).filter(Boolean)), [todayDirectSales]);
  const directNoSaleCustomerIds = useMemo(() => new Set(todayDirectSaleVisits.map(v => v.customer_id).filter(Boolean)), [todayDirectSaleVisits]);
  const directSalePending = useMemo(() => directSaleCustomers.filter(c => !directSoldCustomerIds.has(c.id) && !directNoSaleCustomerIds.has(c.id)), [directSaleCustomers, directSoldCustomerIds, directNoSaleCustomerIds]);
  const directSaleSold = useMemo(() => directSaleCustomers.filter(c => directSoldCustomerIds.has(c.id)), [directSaleCustomers, directSoldCustomerIds]);
  const directSaleNoSale = useMemo(() => directSaleCustomers.filter(c => directNoSaleCustomerIds.has(c.id) && !directSoldCustomerIds.has(c.id)), [directSaleCustomers, directNoSaleCustomerIds, directSoldCustomerIds]);

  const totalCount = deliveryCustomers.length + salesCustomers.length;
  const debtBadgeCount = filteredDueDebts.length;

  if (mySectors.length === 0 && dueDebts.length === 0 && allDebts.length === 0) return null;

  const handleApproveCollection = async (collectionId: string) => {
    try {
      await approveCollection.mutateAsync({ collectionId, approved: true });
      toast.success('تمت الموافقة');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleRejectCollection = async (collectionId: string) => {
    try {
      await approveCollection.mutateAsync({ collectionId, approved: false, rejectionReason: 'مرفوض' });
      toast.success('تم الرفض');
    } catch (e: any) { toast.error(e.message); }
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
        const formattedDistance = distanceMeters >= 1000 ? `${(distanceMeters / 1000).toFixed(1)} كم` : `${Math.round(distanceMeters)} متر`;
        toast.error(`📍 أنت بعيد عن العميل بمسافة ${formattedDistance}`, { description: `يجب أن تكون على بُعد ${threshold} متر أو أقل` });
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

  const handleCustomerClick = async (customer: any, tab: 'delivery' | 'sales') => {
    if (tab === 'sales') {
      setIsOpen(false);
      navigate('/orders', { state: { customerId: customer.id } });
    } else {
      setLoadingDeliveryFor(customer.id);
      try {
        let query = supabase
          .from('orders')
          .select('*, customer:customers(*, sector:sectors(id, name, name_fr), zone:sector_zones(id, name, name_fr)), created_by_worker:workers!orders_created_by_fkey(id, full_name, username)')
          .eq('customer_id', customer.id)
          .in('status', ['pending', 'assigned', 'in_progress'])
          .order('created_at', { ascending: false })
          .limit(1);
        if (!isAdmin) query = query.eq('assigned_worker_id', workerId!);
        const { data, error } = await query;
        if (error) throw error;
        if (data && data.length > 0) {
          setDeliveryOrder(data[0] as OrderWithDetails);
          setIsOpen(false);
          setShowDeliverySale(true);
        } else {
          toast.error('لا توجد طلبية معينة لهذا العميل');
        }
      } catch {
        toast.error('خطأ في جلب بيانات الطلبية');
      } finally {
        setLoadingDeliveryFor(null);
      }
    }
  };

  const handleShowDeliveredOrderDetails = async (customer: any) => {
    try {
      const { data } = await supabase
        .from('orders')
        .select('*, customer:customers(*), items:order_items(*, product:products(*))')
        .eq('customer_id', customer.id)
        .eq('status', 'delivered')
        .gte('updated_at', todayStart)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        const hydratedItems = await hydrateOrderItems(data[0]);
        setOrderDetailsDialog({ ...data[0], items: hydratedItems });
      } else {
        toast.error('لم يتم العثور على تفاصيل الطلبية');
      }
    } catch {
      toast.error('خطأ في جلب التفاصيل');
    }
  };

  const handleShowOrderDetails = async (customer: any) => {
    try {
      const { data } = await supabase
        .from('orders')
        .select('*, customer:customers(*), items:order_items(*, product:products(*))')
        .eq('customer_id', customer.id)
        .eq('created_by', workerId!)
        .gte('created_at', todayStart)
        .not('status', 'eq', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        const hydratedItems = await hydrateOrderItems(data[0]);
        setOrderDetailsDialog({ ...data[0], items: hydratedItems, _isOrderRequest: true });
      } else {
        toast.error('لم يتم العثور على تفاصيل الطلبية');
      }
    } catch {
      toast.error('خطأ في جلب التفاصيل');
    }
  };

  const handleShowDirectSaleDetails = (customer: any) => {
    const sale = todayDirectSales.find(s => s.customer_id === customer.id);
    if (sale) {
      setOrderDetailsDialog({ ...sale, _isDirectSale: true, customer });
    }
  };

  const hydrateOrderItems = async (order: any) => {
    const currentItems = Array.isArray(order?.items) ? order.items : [];
    if (currentItems.length > 0) return currentItems;

    if (order?.id) {
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('*, product:products(*)')
        .eq('order_id', order.id);
      if (orderItems && orderItems.length > 0) return orderItems;

      const { data: receipt } = await supabase
        .from('receipts')
        .select('items')
        .eq('order_id', order.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (Array.isArray((receipt as any)?.items) && (receipt as any).items.length > 0) {
        return (receipt as any).items;
      }
    }

    return [];
  };

  const buildReceiptDataFromOrder = (order: any, isDirectSale: boolean) => {
    const customer = order.customer;
    const items = order.items || [];
    const totalAmount = Number(order.total_amount || 0);
    const isOrderRequest = !isDirectSale && !!order._isOrderRequest;
    const paidAmount = Number(order.paid_amount ?? order.paidAmount ?? (isOrderRequest ? 0 : totalAmount));
    const remainingAmount = Number(order.remaining_amount ?? order.remainingAmount ?? (isOrderRequest ? totalAmount : 0));

    return {
      receiptType: (isDirectSale ? 'direct_sale' : 'delivery') as any,
      orderId: order.id || null,
      customerId: customer?.id || '',
      customerName: customer?.store_name || customer?.name || order.customer_name || '—',
      customerPhone: customer?.phone || null,
      workerId: user?.id || '',
      workerName: user?.full_name || '',
      workerPhone: null,
      branchId: user?.branch_id || null,
      items: items.map((item: any) => ({
        productId: isDirectSale ? (item.product_id || '') : (item.product_id || item.product?.id || ''),
        productName: isDirectSale ? (item.productName || '—') : (item.product?.name || '—'),
        quantity: item.quantity || 0,
        unitPrice: isDirectSale ? (item.unitPrice || 0) : (item.unit_price || 0),
        totalPrice: isDirectSale ? (item.totalPrice || 0) : (item.total_price || 0),
        giftQuantity: isDirectSale ? (item.giftQuantity || 0) : (item.gift_quantity || 0),
        giftPieces: isDirectSale ? (item.giftPieces || 0) : (item.gift_pieces || 0),
        piecesPerBox: isDirectSale ? (item.piecesPerBox || 0) : (item.pieces_per_box || item.product?.pieces_per_box || 0),
        pricingUnit: isDirectSale ? (item.pricingUnit || undefined) : (item.pricing_unit || item.product?.pricing_unit || undefined),
        weightPerBox: isDirectSale ? (item.weightPerBox || null) : (item.weight_per_box || item.product?.weight_per_box || null),
      })),
      totalAmount,
      paidAmount,
      remainingAmount,
      paymentMethod: order.payment_type || order.paymentMethod || 'cash',
      notes: order.notes || null,
      receiptTitleOverride: !isDirectSale && order._isOrderRequest ? 'BON DE COMMANDE' : undefined,
    };
  };

  const handlePrintDeliveredOrder = async (customer: any) => {
    try {
      const { data } = await supabase
        .from('orders')
        .select('*, customer:customers(*), items:order_items(*, product:products(*))')
        .eq('customer_id', customer.id)
        .eq('status', 'delivered')
        .gte('updated_at', todayStart)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        const hydratedItems = await hydrateOrderItems(data[0]);
        setPrintReceiptData(buildReceiptDataFromOrder({ ...data[0], items: hydratedItems }, false));
        setShowPrintReceipt(true);
      } else {
        toast.error('لم يتم العثور على الطلبية');
      }
    } catch { toast.error('خطأ في جلب البيانات'); }
  };

  const handlePrintDirectSale = (customer: any) => {
    const sale = todayDirectSales.find(s => s.customer_id === customer.id);
    if (sale) {
      setPrintReceiptData(buildReceiptDataFromOrder({ ...sale, _isDirectSale: true, customer }, true));
      setShowPrintReceipt(true);
    }
  };

  const handleDeliveryVisitWithoutDelivery = async (customer: any) => {
    const allowed = await checkLocationBeforeAction(customer);
    if (!allowed) return;
    try {
      await trackVisit({ customerId: customer.id, operationType: 'delivery_visit', notes: `زيارة توصيل بدون تسليم - ${customer.store_name || customer.name}` });
      toast.success(`تم تسجيل زيارة بدون تسليم لـ ${customer.store_name || customer.name}`);
    } catch { toast.error('فشل في تسجيل الزيارة'); }
  };

  const handleVisitWithoutOrder = async (customer: any) => {
    const allowed = await checkLocationBeforeAction(customer);
    if (!allowed) return;
    try {
      await trackVisit({ customerId: customer.id, operationType: 'visit', notes: `زيارة بدون طلبية - ${customer.name}` });
      toast.success(`تم تسجيل زيارة ${customer.name} بنجاح`);
    } catch { toast.error('فشل في تسجيل الزيارة'); }
  };

  const handleCustomerClosed = async (customer: any) => {
    const allowed = await checkLocationBeforeAction(customer);
    if (!allowed) return;
    try {
      await trackVisit({ customerId: customer.id, operationType: 'visit', notes: `مغلق - ${customer.store_name || customer.name}` });
      toast.success(`تم تسجيل "${customer.store_name || customer.name}" كمغلق`);
    } catch { toast.error('فشل في تسجيل الحالة'); }
  };

  const handleCustomerUnavailable = async (customer: any) => {
    const allowed = await checkLocationBeforeAction(customer);
    if (!allowed) return;
    try {
      await trackVisit({ customerId: customer.id, operationType: 'visit', notes: `غير متاح - ${customer.store_name || customer.name}` });
      toast.success(`تم تسجيل "${customer.store_name || customer.name}" كغير متاح`);
    } catch { toast.error('فشل في تسجيل الحالة'); }
  };

  const handleDirectSaleClosed = async (customer: any) => {
    const allowed = await checkLocationBeforeAction(customer);
    if (!allowed) return;
    try {
      await trackVisit({ customerId: customer.id, operationType: 'visit', notes: `مغلق (بيع مباشر) - ${customer.store_name || customer.name}` });
      toast.success(`تم تسجيل "${customer.store_name || customer.name}" كمغلق`);
    } catch { toast.error('فشل في تسجيل الحالة'); }
  };

  const handleDirectSaleUnavailable = async (customer: any) => {
    const allowed = await checkLocationBeforeAction(customer);
    if (!allowed) return;
    try {
      await trackVisit({ customerId: customer.id, operationType: 'visit', notes: `غير متاح (بيع مباشر) - ${customer.store_name || customer.name}` });
      toast.success(`تم تسجيل "${customer.store_name || customer.name}" كغير متاح`);
    } catch { toast.error('فشل في تسجيل الحالة'); }
  };

  const handleDirectSaleNoSale = async (customer: any) => {
    const allowed = await checkLocationBeforeAction(customer);
    if (!allowed) return;
    try {
      await trackVisit({ customerId: customer.id, operationType: 'visit', notes: `بدون بيع - ${customer.store_name || customer.name}` });
      toast.success(`تم تسجيل "${customer.store_name || customer.name}" بدون بيع`);
    } catch { toast.error('فشل في تسجيل الحالة'); }
  };

  const handleDirectSaleClick = (customer: any) => {
    setDirectSaleCustomerId(customer.id);
    setIsOpen(false);
    setShowDirectSale(true);
  };

  const handleDebtCustomerClosed = async (debt: DueDebt) => {
    const customer = debt.customer as any;
    const customerObj = { id: debt.customer_id, latitude: customer?.latitude, longitude: customer?.longitude, store_name: customer?.store_name, name: customer?.name };
    const allowed = await checkLocationBeforeAction(customerObj);
    if (!allowed) return;
    try {
      await trackVisit({ customerId: debt.customer_id, operationType: 'visit', notes: `مغلق (تحصيل دين) - ${customer?.store_name || customer?.name}` });
      toast.success(`تم تسجيل "${customer?.store_name || customer?.name}" كمغلق`);
    } catch { toast.error('فشل في تسجيل الحالة'); }
  };

  const handleDebtCustomerUnavailable = async (debt: DueDebt) => {
    const customer = debt.customer as any;
    const customerObj = { id: debt.customer_id, latitude: customer?.latitude, longitude: customer?.longitude, store_name: customer?.store_name, name: customer?.name };
    const allowed = await checkLocationBeforeAction(customerObj);
    if (!allowed) return;
    try {
      await trackVisit({ customerId: debt.customer_id, operationType: 'visit', notes: `غير متاح (تحصيل دين) - ${customer?.store_name || customer?.name}` });
      toast.success(`تم تسجيل "${customer?.store_name || customer?.name}" كغير متاح`);
    } catch { toast.error('فشل في تسجيل الحالة'); }
  };

  return (
    <>
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 transition-colors" title="عملاء اليوم">
          <MapPin className="w-4 h-4 text-blue-500" />
          {(totalCount + debtBadgeCount) > 0 && (
            <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {totalCount + debtBadgeCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0 max-h-[80vh] flex flex-col" dir="rtl">
        <div className="p-3 border-b font-bold text-sm flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          عملاء اليوم — {selectedAdminWorkerId ? workersList.find(w => w.id === selectedAdminWorkerId)?.full_name || '' : DAY_NAMES[todayName] || todayName}
        </div>

        {/* Admin worker picker strip */}
        {isAdmin && workersList.length > 0 && (
          <div className="border-b px-2 py-1.5 shrink-0">
            <ScrollArea className="w-full" dir="rtl">
              <div className="flex gap-1.5 pb-1">
                {workersList.map(w => {
                  const isSelected = w.id === selectedAdminWorkerId;
                  return (
                    <button
                      key={w.id}
                      onClick={() => setSelectedAdminWorkerId(isSelected ? null : w.id)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-medium whitespace-nowrap transition-colors shrink-0
                        ${isSelected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border hover:bg-accent text-foreground'}
                      `}
                    >
                      <User className="w-3 h-3" />
                      {w.full_name}
                    </button>
                  );
                })}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        )}

        {/* Search bar */}
        <div className="px-2 pt-1.5 pb-1 shrink-0">
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم أو الهاتف..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 text-xs pr-7"
              dir="rtl"
            />
          </div>
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
            <TabsTrigger value="direct-sale" className="flex-1 gap-1 text-xs">
              <ShoppingBag className="w-3.5 h-3.5" />
              بيع مباشر
              {directSaleCustomers.length > 0 && <Badge className="text-[10px] px-1 bg-emerald-500">{directSaleCustomers.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="debts" className="flex-1 gap-1 text-xs">
              <Landmark className="w-3.5 h-3.5" />
              ديون
              {debtBadgeCount > 0 && <Badge variant="destructive" className="text-[10px] px-1">{debtBadgeCount}</Badge>}
            </TabsTrigger>
          </TabsList>

          {/* Delivery Tab */}
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
                  بدون تسليم
                  {deliveryNotReceived.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-amber-500">{deliveryNotReceived.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="received" className="flex-1 gap-1 text-[10px] px-1.5 py-1.5 data-[state=active]:bg-green-100 data-[state=active]:text-green-700">
                  <PackageCheck className="w-3 h-3" />
                  تم الاستلام
                  {deliveryReceived.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-green-500">{deliveryReceived.length}</Badge>}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="not-delivered" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '45vh' }}>
                <CustomerList customers={deliveryNotDone} emptyMessage="تم توصيل جميع العملاء ✓" onCustomerClick={(c) => handleCustomerClick(c, 'delivery')} onVisitWithoutOrder={handleDeliveryVisitWithoutDelivery} onClosed={handleCustomerClosed} onUnavailable={handleCustomerUnavailable} showVisitButton visitButtonLabel="بدون تسليم" showActionButtons checkingLocationFor={checkingLocationFor} loadingFor={loadingDeliveryFor} searchQuery={searchQuery} />
              </TabsContent>
              <TabsContent value="not-received" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '45vh' }}>
                <CustomerList customers={deliveryNotReceived} emptyMessage="لا توجد زيارات بدون تسليم" onCustomerClick={(c) => handleCustomerClick(c, 'delivery')} showActionButtons onClosed={handleCustomerClosed} onUnavailable={handleCustomerUnavailable} checkingLocationFor={checkingLocationFor} loadingFor={loadingDeliveryFor} searchQuery={searchQuery} />
              </TabsContent>
              <TabsContent value="received" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '45vh' }}>
                <CustomerList customers={deliveryReceived} emptyMessage="لا توجد توصيلات بعد" onCustomerClick={handleShowDeliveredOrderDetails} showPrintButton onPrint={handlePrintDeliveredOrder} checkingLocationFor={checkingLocationFor} loadingFor={loadingDeliveryFor} searchQuery={searchQuery} />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* Sales Tab */}
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
                  تم الطلب
                  {salesWithOrders.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-green-500">{salesWithOrders.length}</Badge>}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="not-visited" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '45vh' }}>
                <CustomerList customers={salesNotVisited} emptyMessage="تمت زيارة جميع العملاء ✓" onCustomerClick={(c) => handleCustomerClick(c, 'sales')} onVisitWithoutOrder={handleVisitWithoutOrder} onClosed={handleCustomerClosed} onUnavailable={handleCustomerUnavailable} showVisitButton showActionButtons checkingLocationFor={checkingLocationFor} searchQuery={searchQuery} />
              </TabsContent>
              <TabsContent value="visited-no-order" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '45vh' }}>
                <CustomerList customers={salesVisitedNoOrder} emptyMessage="لا توجد زيارات بدون طلبيات" onCustomerClick={(c) => handleCustomerClick(c, 'sales')} showActionButtons onClosed={handleCustomerClosed} onUnavailable={handleCustomerUnavailable} checkingLocationFor={checkingLocationFor} searchQuery={searchQuery} />
              </TabsContent>
              <TabsContent value="with-orders" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '45vh' }}>
                <CustomerList customers={salesWithOrders} emptyMessage="لا توجد طلبيات بعد" onCustomerClick={handleShowOrderDetails} checkingLocationFor={checkingLocationFor} searchQuery={searchQuery} />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* Direct Sale Tab */}
          <TabsContent value="direct-sale" className="m-0 flex-1 min-h-0">
            <Tabs defaultValue="pending" className="flex flex-col h-full min-h-0">
              <TabsList className="w-full rounded-none border-b shrink-0 h-auto p-0.5 gap-0.5">
                <TabsTrigger value="pending" className="flex-1 gap-1 text-[10px] px-1.5 py-1.5 data-[state=active]:bg-orange-100 data-[state=active]:text-orange-700">
                  <ShoppingBag className="w-3 h-3" />
                  العملاء
                  {directSalePending.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-orange-500">{directSalePending.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="sold" className="flex-1 gap-1 text-[10px] px-1.5 py-1.5 data-[state=active]:bg-green-100 data-[state=active]:text-green-700">
                  <CheckCircle className="w-3 h-3" />
                  تم البيع
                  {directSaleSold.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-green-500">{directSaleSold.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="no-sale" className="flex-1 gap-1 text-[10px] px-1.5 py-1.5 data-[state=active]:bg-amber-100 data-[state=active]:text-amber-700">
                  <XCircle className="w-3 h-3" />
                  بدون بيع
                  {directSaleNoSale.length > 0 && <Badge className="text-[9px] px-1 h-4 bg-amber-500">{directSaleNoSale.length}</Badge>}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '45vh' }}>
                <CustomerList customers={directSalePending} emptyMessage="لا توجد محلات متاحة للبيع المباشر" onCustomerClick={handleDirectSaleClick} onClosed={handleDirectSaleClosed} onUnavailable={handleDirectSaleUnavailable} onNoSale={handleDirectSaleNoSale} showActionButtons showNoSaleButton checkingLocationFor={checkingLocationFor} searchQuery={searchQuery} />
              </TabsContent>
              <TabsContent value="sold" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '45vh' }}>
                <CustomerList customers={directSaleSold} emptyMessage="لا توجد مبيعات بعد" onCustomerClick={handleShowDirectSaleDetails} showPrintButton onPrint={handlePrintDirectSale} checkingLocationFor={checkingLocationFor} searchQuery={searchQuery} />
              </TabsContent>
              <TabsContent value="no-sale" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '45vh' }}>
                <CustomerList customers={directSaleNoSale} emptyMessage="لا توجد زيارات بدون بيع" onCustomerClick={handleDirectSaleClick} checkingLocationFor={checkingLocationFor} searchQuery={searchQuery} />
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
                <DebtList debts={debtsToCollectToday} onSelect={setSelectedDebt} onClosed={handleDebtCustomerClosed} onUnavailable={handleDebtCustomerUnavailable} emptyMessage="لا توجد ديون مستحقة اليوم ✓" searchQuery={searchQuery} />
              </TabsContent>
              <TabsContent value="collected" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '45vh' }}>
                <DebtList debts={debtsCollectedToday} onSelect={setSelectedDebt} onClosed={handleDebtCustomerClosed} onUnavailable={handleDebtCustomerUnavailable} emptyMessage="لا توجد تحصيلات بعد" searchQuery={searchQuery} />
              </TabsContent>
              <TabsContent value="no-payment" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '45vh' }}>
                <DebtList debts={debtsNoPaymentToday} onSelect={setSelectedDebt} onClosed={handleDebtCustomerClosed} onUnavailable={handleDebtCustomerUnavailable} emptyMessage="لا توجد زيارات بدون دفع" searchQuery={searchQuery} />
              </TabsContent>
              <TabsContent value="all-debts" className="m-0 flex-1 min-h-0" style={{ overflow: 'auto', maxHeight: '45vh' }}>
                <DebtList debts={allDebts} onSelect={setSelectedDebt} onClosed={handleDebtCustomerClosed} onUnavailable={handleDebtCustomerUnavailable} emptyMessage="لا توجد ديون مستحقة" searchQuery={searchQuery} />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>

    {/* Order Details Dialog */}
    {orderDetailsDialog && (
      <OrderDetailsPopoverDialog order={orderDetailsDialog} onClose={() => setOrderDetailsDialog(null)} />
    )}

    {/* Debt Info Dialog */}
    {selectedDebt && !showCollect && !showVisit && (
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
        customerPhone={selectedDebt.customer?.phone || null}
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

    {deliveryOrder && (
      <DeliverySaleDialog
        open={showDeliverySale}
        onOpenChange={(open) => { setShowDeliverySale(open); if (!open) setDeliveryOrder(null); }}
        order={deliveryOrder}
      />
    )}

    <DirectSaleDialog
      open={showDirectSale}
      onOpenChange={(o) => { setShowDirectSale(o); if (!o) setDirectSaleCustomerId(null); }}
      stockItems={workerStock}
      initialCustomerId={directSaleCustomerId || undefined}
    />

    {/* Print Receipt Dialog */}
    {printReceiptData && (
      <ReceiptDialog
        open={showPrintReceipt}
        onOpenChange={(o) => { setShowPrintReceipt(o); if (!o) setPrintReceiptData(null); }}
        receiptData={printReceiptData}
      />
    )}
    </>
  );
};

// Order Details Dialog for popover context
const OrderDetailsPopoverDialog: React.FC<{ order: any; onClose: () => void }> = ({ order, onClose }) => {
  const { user } = useAuth();
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const isDirectSale = order._isDirectSale;
  const items = order.items || [];
  const customer = order.customer;
  const totalAmount = Number(order.total_amount || 0);
  const isOrderRequest = !isDirectSale && !!order._isOrderRequest;
  const paidAmount = Number(order.paid_amount ?? order.paidAmount ?? (isOrderRequest ? 0 : totalAmount));
  const remainingAmount = Number(order.remaining_amount ?? order.remainingAmount ?? (isOrderRequest ? totalAmount : 0));

  const handlePrint = () => {
    setShowReceiptDialog(true);
  };

  const receiptData = {
    receiptType: (isDirectSale ? 'direct_sale' : 'delivery') as any,
    orderId: order.id || null,
    customerId: customer?.id || '',
    customerName: customer?.store_name || customer?.name || order.customer_name || '—',
    customerPhone: customer?.phone || null,
    workerId: user?.id || '',
    workerName: user?.full_name || '',
    workerPhone: null,
    branchId: user?.branch_id || null,
    items: items.map((item: any) => ({
      productId: isDirectSale ? (item.product_id || '') : (item.product_id || item.product?.id || ''),
      productName: isDirectSale ? (item.productName || '—') : (item.product?.name || '—'),
      quantity: item.quantity || 0,
      unitPrice: isDirectSale ? (item.unitPrice || 0) : (item.unit_price || 0),
      totalPrice: isDirectSale ? (item.totalPrice || 0) : (item.total_price || 0),
      giftQuantity: isDirectSale ? (item.giftQuantity || 0) : (item.gift_quantity || 0),
    })),
    totalAmount,
    paidAmount,
    remainingAmount,
    paymentMethod: order.payment_type || order.paymentMethod || 'cash',
    notes: order.notes || null,
    receiptTitleOverride: !isDirectSale && order._isOrderRequest ? 'BON DE COMMANDE' : undefined,
  };

  return (
    <>
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-sm p-4 gap-3 max-h-[80vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-base">
            {isDirectSale ? '🛒 تفاصيل البيع المباشر' : '📦 تفاصيل الطلبية'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              <span className="font-bold text-sm">{customer?.store_name || customer?.name || order.customer_name || '—'}</span>
            </div>
            {customer?.phone && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Phone className="w-3 h-3" />
                <span>{customer.phone}</span>
              </div>
            )}
            {order.created_at && (
              <p className="text-xs text-muted-foreground">
                التاريخ: {format(new Date(order.created_at), 'dd/MM/yyyy HH:mm')}
              </p>
            )}
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/30 px-3 py-2 text-xs font-bold border-b">المنتجات</div>
            <div className="divide-y">
              {items.map((item: any, idx: number) => {
                const productName = isDirectSale ? (item.productName || '—') : (item.product?.name || '—');
                const quantity = item.quantity;
                const unitPrice = isDirectSale ? item.unitPrice : item.unit_price;
                const itemTotal = isDirectSale ? item.totalPrice : item.total_price;
                const giftQty = isDirectSale ? (item.giftQuantity || 0) : (item.gift_quantity || 0);

                return (
                  <div key={idx} className="px-3 py-2 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{productName}</span>
                      <span className="font-bold text-sm">{Number(itemTotal || 0).toLocaleString()} DA</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>الكمية: {quantity}</span>
                      <span>السعر: {Number(unitPrice || 0).toLocaleString()} DA</span>
                      {giftQty > 0 && <span className="text-emerald-600">🎁 هدية: {giftQty}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-primary/5 rounded-lg p-3 flex items-center justify-between">
            <span className="font-bold">المجموع</span>
            <span className="font-bold text-lg text-primary">{Number(totalAmount || 0).toLocaleString()} DA</span>
          </div>

          {!isDirectSale && order.notes && (
            <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
              ملاحظات: {order.notes}
            </div>
          )}

          {/* Print Button */}
          <Button className="w-full gap-2" variant="outline" onClick={handlePrint}>
            <Printer className="w-4 h-4" />
            طباعة الوصل
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <ReceiptDialog
      open={showReceiptDialog}
      onOpenChange={setShowReceiptDialog}
      receiptData={receiptData}
    />
    </>
  );
};

const CustomerList: React.FC<{
  customers: any[];
  emptyMessage: string;
  onCustomerClick: (c: any) => void;
  onVisitWithoutOrder?: (c: any) => void;
  onClosed?: (c: any) => void;
  onUnavailable?: (c: any) => void;
  onNoSale?: (c: any) => void;
  onPrint?: (c: any) => void;
  showVisitButton?: boolean;
  visitButtonLabel?: string;
  showActionButtons?: boolean;
  showPrintButton?: boolean;
  showNoSaleButton?: boolean;
  checkingLocationFor: string | null;
  loadingFor?: string | null;
  searchQuery?: string;
}> = ({ customers, emptyMessage, onCustomerClick, onVisitWithoutOrder, onClosed, onUnavailable, onNoSale, onPrint, showVisitButton, visitButtonLabel, showActionButtons, showPrintButton, showNoSaleButton, checkingLocationFor, loadingFor, searchQuery }) => {
  const filtered = useMemo(() => {
    if (!searchQuery?.trim()) return customers;
    const q = searchQuery.trim().toLowerCase();
    return customers.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.store_name || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q)
    );
  }, [customers, searchQuery]);

  if (filtered.length === 0) {
    return <div className="p-6 text-center text-sm text-muted-foreground">{searchQuery?.trim() ? 'لا توجد نتائج' : emptyMessage}</div>;
  }

  return (
    <div className="divide-y">
      {filtered.map(c => (
        <div key={c.id} className="p-3 hover:bg-muted/50 transition-colors">
          <button className="w-full flex items-center gap-2 text-start" onClick={() => onCustomerClick(c)} disabled={loadingFor === c.id}>
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              {loadingFor === c.id ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <User className="w-4 h-4 text-primary" />}
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
          <div className="flex items-center gap-1 mt-1.5 justify-end flex-wrap">
            {c.latitude && c.longitude && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 gap-0.5" onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}`, '_blank')}>
                <Navigation className="w-3 h-3" />
                الموقع
              </Button>
            )}
            {showPrintButton && onPrint && (
              <Button variant="ghost" size="icon" className="h-6 w-6 text-primary" onClick={(e) => { e.stopPropagation(); onPrint(c); }}>
                <Printer className="w-3.5 h-3.5" />
              </Button>
            )}
            {showVisitButton && onVisitWithoutOrder && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 gap-0.5 text-orange-600" onClick={() => onVisitWithoutOrder(c)} disabled={checkingLocationFor === c.id}>
                {checkingLocationFor === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPinOff className="w-3 h-3" />}
                {visitButtonLabel || 'زيارة بدون طلبية'}
              </Button>
            )}
            {showNoSaleButton && onNoSale && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 gap-0.5 text-amber-600" onClick={() => onNoSale(c)} disabled={checkingLocationFor === c.id}>
                {checkingLocationFor === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                بدون بيع
              </Button>
            )}
            {showActionButtons && onClosed && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 gap-0.5 text-destructive" onClick={() => onClosed(c)} disabled={checkingLocationFor === c.id}>
                <DoorClosed className="w-3 h-3" />
                مغلق
              </Button>
            )}
            {showActionButtons && onUnavailable && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 gap-0.5 text-muted-foreground" onClick={() => onUnavailable(c)} disabled={checkingLocationFor === c.id}>
                <UserX className="w-3 h-3" />
                غير متاح
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const DebtList: React.FC<{ debts: DueDebt[]; onSelect: (d: DueDebt) => void; onClosed: (d: DueDebt) => void; onUnavailable: (d: DueDebt) => void; emptyMessage: string; searchQuery?: string }> = ({ debts, onSelect, onClosed, onUnavailable, emptyMessage, searchQuery }) => {
  const filtered = useMemo(() => {
    if (!searchQuery?.trim()) return debts;
    const q = searchQuery.trim().toLowerCase();
    return debts.filter(d => {
      const cust = d.customer as any;
      return (cust?.name || '').toLowerCase().includes(q) ||
        (cust?.store_name || '').toLowerCase().includes(q) ||
        (cust?.phone || '').includes(q);
    });
  }, [debts, searchQuery]);

  if (filtered.length === 0) {
    return <div className="p-6 text-center text-sm text-muted-foreground">{searchQuery?.trim() ? 'لا توجد نتائج' : emptyMessage}</div>;
  }

  return (
    <div className="divide-y">
      {filtered.map(debt => (
        <div key={debt.id} className="p-3 hover:bg-muted/50 transition-colors">
          <button className="w-full text-right" onClick={() => onSelect(debt)}>
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
          <div className="flex items-center gap-1 mt-1.5 justify-end flex-wrap">
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 gap-0.5 text-red-600" onClick={(e) => { e.stopPropagation(); onClosed(debt); }}>
              <DoorClosed className="w-3 h-3" />
              مغلق
            </Button>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 gap-0.5 text-gray-600" onClick={(e) => { e.stopPropagation(); onUnavailable(debt); }}>
              <UserX className="w-3 h-3" />
              غير متاح
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SectorCustomersPopover;
