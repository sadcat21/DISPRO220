import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { 
  ShoppingCart, Loader2, Package, User, Calendar, Store,
  CheckCircle, Clock, Truck, XCircle, UserCheck, Phone, MapPin, ChevronDown, ChevronUp, Navigation, Search, Edit2,
  Receipt, Banknote, Route, Gift, Trash2, ListFilter, Map, AlertTriangle, FileCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { useAssignedOrders, useOrderItems, useUpdateOrderStatus, useCancelOrder } from '@/hooks/useOrders';
import { useLogActivity } from '@/hooks/useActivityLogs';
import { useLocationThreshold } from '@/hooks/useLocationSettings';
import { useHasPermission } from '@/hooks/usePermissions';
import { calculateDistance } from '@/utils/geoUtils';
import { useLanguage, Language } from '@/contexts/LanguageContext';
import { OrderStatus, OrderWithDetails } from '@/types/database';
import { format } from 'date-fns';
import { ar, fr, enUS } from 'date-fns/locale';
import LazyCustomerLocationView from '@/components/map/LazyCustomerLocationView';
import LazyNavigationMapView from '@/components/map/LazyNavigationMapView';
import OrderSearchDialog from '@/components/orders/OrderSearchDialog';
import ModifyOrderDialog from '@/components/orders/ModifyOrderDialog';
import DeliverySaleDialog from '@/components/orders/DeliverySaleDialog';
import CheckVerificationDialog from '@/components/orders/CheckVerificationDialog';
import { useLocationBroadcast } from '@/hooks/useWorkerLocation';
import { useIsElementHidden } from '@/hooks/useUIOverrides';
import { getLocalizedName } from '@/utils/sectorName';
import { supabase } from '@/integrations/supabase/client';

type TabStatus = 'all' | OrderStatus;
type DeliveryType = 'orders' | 'direct_sales';

const MyDeliveries: React.FC = () => {
  const { t, language, loadPrintSettingsFromDB } = useLanguage();
  
  const [activeTab, setActiveTab] = useState<TabStatus>('assigned');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('orders');
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [showDeliverySaleDialog, setShowDeliverySaleDialog] = useState(false);
  const [pendingDeliveryOrder, setPendingDeliveryOrder] = useState<OrderWithDetails | null>(null);
  const [modifyOrder, setModifyOrder] = useState<OrderWithDetails | null>(null);
  const [confirmCancelOrderId, setConfirmCancelOrderId] = useState<string | null>(null);
  const [checkVerifyOrder, setCheckVerifyOrder] = useState<OrderWithDetails | null>(null);
  const [navigationTarget, setNavigationTarget] = useState<{
    lat: number; lng: number; name: string; address?: string;
  } | null>(null);
  
  const { data: orders, isLoading, refetch: refetchOrders } = useAssignedOrders();
  const { data: selectedOrderItems } = useOrderItems(selectedOrderId);
  const updateStatus = useUpdateOrderStatus();
  const cancelOrder = useCancelOrder();
  const logActivity = useLogActivity();
  const { isTracking, startTracking } = useLocationBroadcast();
  const { data: locationThreshold } = useLocationThreshold();
  const canBypassLocation = useHasPermission('bypass_location_check');
  const [checkingLocation, setCheckingLocation] = useState(false);
  const [customerDebts, setCustomerDebts] = useState<Record<string, boolean>>({});

  // UI override checks
  const isSearchHidden = useIsElementHidden('button', 'deliveries_search');
  const isModifyHidden = useIsElementHidden('action', 'modify_delivery');
  const isCancelHidden = useIsElementHidden('action', 'cancel_delivery');

  // Fetch active debts for all visible customers
  useEffect(() => {
    if (!orders?.length) return;
    const customerIds = [...new Set(orders.map(o => o.customer_id).filter(Boolean))];
    if (customerIds.length === 0) return;
    supabase
      .from('customer_debts')
      .select('customer_id')
      .in('customer_id', customerIds)
      .eq('status', 'active')
      .then(({ data }) => {
        const map: Record<string, boolean> = {};
        data?.forEach(d => { map[d.customer_id] = true; });
        setCustomerDebts(map);
      });
  }, [orders]);

  // Auto-start location broadcasting when there are active orders
  useEffect(() => {
    const hasActiveOrders = orders?.some(o => o.status === 'in_progress' || o.status === 'assigned');
    if (hasActiveOrders && !isTracking) {
      startTracking();
    }
  }, [orders, isTracking, startTracking]);
  useEffect(() => {
    loadPrintSettingsFromDB(null);
  }, []);
  
  const getDateLocale = (lang: Language) => {
    switch (lang) {
      case 'fr': return fr;
      case 'en': return enUS;
      default: return ar;
    }
  };

  const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; icon: React.ElementType; tabColor: string }> = {
    pending: { label: t('orders.pending'), color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock, tabColor: 'text-yellow-600' },
    assigned: { label: t('orders.assigned'), color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: UserCheck, tabColor: 'text-blue-600' },
    in_progress: { label: t('orders.in_progress'), color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400', icon: Truck, tabColor: 'text-purple-600' },
    delivered: { label: t('orders.delivered'), color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle, tabColor: 'text-green-600' },
    cancelled: { label: t('orders.cancelled'), color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: XCircle, tabColor: 'text-red-600' },
  };

  const isDocumentOrder = (order: OrderWithDetails) => (
    order.status === 'delivered' && ['check', 'receipt', 'transfer'].includes(order.invoice_payment_method || '')
  );

  const isDocumentVerificationPending = (order: OrderWithDetails) => {
    if (!isDocumentOrder(order)) return false;
    const verification = (order as any).document_verification as any | null;
    return (order as any).document_status === 'pending' || verification?.skipped === true || !verification;
  };

  const handleDeliverClick = (order: OrderWithDetails) => {
    setPendingDeliveryOrder(order);
    setShowDeliverySaleDialog(true);
  };

  const checkLocationForOrder = async (order: OrderWithDetails): Promise<boolean> => {
    if (canBypassLocation) return true;
    const lat = order.customer?.latitude;
    const lng = order.customer?.longitude;
    if (!lat || !lng) return true;

    const threshold = locationThreshold ?? 100;
    setCheckingLocation(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) { reject(); return; }
        navigator.geolocation.getCurrentPosition(resolve, () => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 });
        }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 });
      });
      const distanceKm = calculateDistance(position.coords.latitude, position.coords.longitude, lat, lng);
      const distanceMeters = distanceKm * 1000;
      if (distanceMeters > threshold) {
        toast.error(`أنت بعيد عن موقع العميل (${Math.round(distanceMeters)} متر). يجب أن تكون على بُعد ${threshold} متر أو أقل.`);
        return false;
      }
      return true;
    } catch {
      toast.error('تعذر تحديد موقعك. يرجى تفعيل خدمة الموقع.');
      return false;
    } finally {
      setCheckingLocation(false);
    }
  };

  const handleCancelWithLocationCheck = async (order: OrderWithDetails) => {
    const allowed = await checkLocationForOrder(order);
    if (!allowed) return;
    setConfirmCancelOrderId(order.id);
  };

  const handleCancelOrder = async (orderId: string) => {
    try {
      await cancelOrder.mutateAsync(orderId);
      await logActivity.mutateAsync({
        actionType: 'status_change',
        entityType: 'order',
        entityId: orderId,
        details: { الحالة_الجديدة: t('orders.cancelled') },
      });
      toast.success(t('orders.cancel_success'));
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleUpdateStatus = async (orderId: string, status: OrderStatus) => {
    try {
      await updateStatus.mutateAsync({ orderId, status });
      
      await logActivity.mutateAsync({
        actionType: 'status_change',
        entityType: 'order',
        entityId: orderId,
        details: { الحالة_الجديدة: STATUS_CONFIG[status].label },
      });
      
      toast.success(t('orders.worker_assigned'));
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const selectedOrder = orders?.find(o => o.id === selectedOrderId);

  // Helper to check if an order is a direct sale
  const isDirectSale = (order: OrderWithDetails) => 
    order.notes?.includes('بيع مباشر') || false;

  // Filter by delivery type first
  const typeFilteredOrders = orders?.filter(o => 
    deliveryType === 'direct_sales' ? isDirectSale(o) : !isDirectSale(o)
  );

  // Count per status (based on type-filtered orders)
  const statusCounts: Record<string, number> = {
    all: typeFilteredOrders?.length || 0,
    assigned: typeFilteredOrders?.filter(o => o.status === 'assigned').length || 0,
    in_progress: typeFilteredOrders?.filter(o => o.status === 'in_progress').length || 0,
    delivered: typeFilteredOrders?.filter(o => o.status === 'delivered').length || 0,
    cancelled: typeFilteredOrders?.filter(o => o.status === 'cancelled').length || 0,
    pending: typeFilteredOrders?.filter(o => o.status === 'pending').length || 0,
  };

  // Type-level counts
  const orderTypeCount = orders?.filter(o => !isDirectSale(o)).length || 0;
  const directSaleCount = orders?.filter(o => isDirectSale(o)).length || 0;

  // Filtered orders
  const filteredOrders = activeTab === 'all' 
    ? typeFilteredOrders 
    : typeFilteredOrders?.filter(o => o.status === activeTab);

  // Tab definitions
  const tabs: { value: TabStatus; label: string; icon: React.ElementType; color: string }[] = [
    { value: 'all', label: t('deliveries.tab_all'), icon: ListFilter, color: 'text-foreground' },
    { value: 'assigned', label: t('orders.assigned'), icon: UserCheck, color: 'text-blue-600' },
    { value: 'in_progress', label: t('orders.in_progress'), icon: Truck, color: 'text-purple-600' },
    { value: 'delivered', label: t('orders.delivered'), icon: CheckCircle, color: 'text-green-600' },
    { value: 'cancelled', label: t('orders.cancelled'), icon: XCircle, color: 'text-red-600' },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const renderOrderCard = (order: OrderWithDetails) => {
    const StatusIcon = STATUS_CONFIG[order.status]?.icon || Clock;
    const isActive = order.status === 'assigned' || order.status === 'in_progress';
    
    return (
      <Card key={order.id} className={`overflow-hidden transition-all ${isActive ? 'border-primary/40 shadow-sm' : 'border-border/60'}`}>
        <CardContent className="p-0">
          {/* Status strip at top */}
          <div className={`h-1 w-full ${
            order.status === 'assigned' ? 'bg-blue-500' :
            order.status === 'in_progress' ? 'bg-purple-500' :
            order.status === 'delivered' ? 'bg-green-500' :
            order.status === 'cancelled' ? 'bg-red-500' : 'bg-yellow-500'
          }`} />
          
          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {/* Customer Info */}
                <div className="flex items-center gap-2 mb-0.5">
                  <Store className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="font-bold text-sm truncate">{order.customer?.store_name || order.customer?.name}</span>
                  {customerDebts[order.customer_id] && (
                    <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                  )}
                </div>
                {order.customer?.store_name && order.customer?.name && (
                  <p className="text-xs text-muted-foreground mr-6 mb-0.5">{order.customer.name}</p>
                )}
                {/* Sector & Zone */}
                {(order.customer as any)?.sector && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-6 mb-1">
                    <Map className="w-3 h-3 shrink-0" />
                    <span>{getLocalizedName((order.customer as any).sector, language)}</span>
                    {(order.customer as any)?.zone && (
                      <span className="text-muted-foreground/70">• {getLocalizedName((order.customer as any).zone, language)}</span>
                    )}
                  </div>
                )}
                
                {order.customer?.phone && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-0.5">
                    <Phone className="w-3 h-3 shrink-0" />
                    <a href={`tel:${order.customer.phone}`} className="text-primary">
                      {order.customer.phone}
                    </a>
                  </div>
                )}
                
                {order.customer?.address && (
                  <div className="flex items-start gap-2 text-xs text-muted-foreground mb-1.5">
                    <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                    <span className="line-clamp-1">{order.customer.address}{order.customer.wilaya ? ` - ${order.customer.wilaya}` : ''}</span>
                  </div>
                )}
                
                {/* Badges row */}
                <div className="flex flex-wrap items-center gap-1 mt-2">
                  <Badge className={`text-[10px] px-1.5 py-0.5 ${STATUS_CONFIG[order.status]?.color}`}>
                    <StatusIcon className="w-3 h-3 ml-0.5" />
                    {STATUS_CONFIG[order.status]?.label}
                  </Badge>
                  
                  {order.total_amount && Number(order.total_amount) > 0 && (
                    <Badge variant="outline" className="font-bold text-[10px] px-1.5 py-0.5 text-primary border-primary/30">
                      {Number(order.total_amount).toLocaleString()} دج
                    </Badge>
                  )}

                  {order.payment_type === 'with_invoice' ? (
                    <Badge variant="secondary" className="gap-0.5 text-[10px] px-1.5 py-0.5">
                      <Receipt className="w-3 h-3" />
                      {t('orders.with_invoice')}
                    </Badge>
                  ) : order.payment_type === 'without_invoice' ? (
                    <Badge variant="secondary" className="gap-0.5 text-[10px] px-1.5 py-0.5">
                      <Banknote className="w-3 h-3" />
                      {t('orders.without_invoice')}
                    </Badge>
                  ) : null}

                  {order.status === 'delivered' && order.invoice_payment_method && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                      {order.invoice_payment_method === 'check' ? t('accounting.method_check') :
                       order.invoice_payment_method === 'transfer' ? t('accounting.method_transfer') :
                       order.invoice_payment_method === 'receipt' ? t('accounting.method_receipt') :
                       order.invoice_payment_method === 'cash' ? t('accounting.method_cash') :
                       t('accounting.method_espace_cash')}
                    </Badge>
                  )}

                  {isDocumentVerificationPending(order) && (
                    <Badge className="text-[10px] px-1.5 py-0.5 bg-accent/10 text-accent border border-accent/30 gap-0.5">
                      <FileCheck className="w-3 h-3" />
                      تحقق معلق
                    </Badge>
                  )}

                  {order.customer?.default_price_subtype && order.payment_type === 'without_invoice' && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                      {order.customer.default_price_subtype === 'super_gros' ? t('products.price_super_gros') :
                       order.customer.default_price_subtype === 'retail' ? t('products.price_retail') :
                       t('products.price_gros')}
                    </Badge>
                  )}
                </div>
                
                {order.delivery_date && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(order.delivery_date), 'dd MMMM yyyy', { locale: getDateLocale(language) })}
                  </div>
                )}
                
                {order.notes && (
                  <p className="text-xs text-muted-foreground mt-1.5 bg-muted/50 p-1.5 rounded line-clamp-2">
                    {order.notes}
                  </p>
                )}
                
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  {t('orders.created_by')}: {order.created_by_worker?.full_name} • {format(new Date(order.created_at), 'dd/MM HH:mm')}
                </p>
              </div>
              
              {/* Action buttons */}
              <div className="flex flex-col gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setSelectedOrderId(order.id);
                    setShowDetailsDialog(true);
                  }}
                >
                  <Package className="w-4 h-4" />
                </Button>
                
                {order.status === 'assigned' && (
                  <>
                    {order.customer?.latitude && order.customer?.longitude && (
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 text-blue-600 border-blue-300 hover:bg-blue-50"
                        onClick={() => setNavigationTarget({
                          lat: order.customer!.latitude!,
                          lng: order.customer!.longitude!,
                          name: order.customer!.name,
                          address: order.customer?.address || undefined,
                        })}
                      >
                        <Route className="w-4 h-4" />
                      </Button>
                    )}
                    {!isModifyHidden && (
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setModifyOrder(order)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      className="h-8 w-8 bg-primary"
                      onClick={() => handleUpdateStatus(order.id, 'in_progress')}
                      disabled={updateStatus.isPending}
                    >
                      <Truck className="w-4 h-4" />
                    </Button>
                    {!isCancelHidden && (
                      <Button
                        size="icon"
                        variant="destructive"
                        className="h-8 w-8"
                        onClick={() => handleCancelOrder(order.id)}
                        disabled={cancelOrder.isPending}
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    )}
                  </>
                )}
                
                {order.status === 'in_progress' && (
                  <>
                    {order.customer?.latitude && order.customer?.longitude && (
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 text-blue-600 border-blue-300 hover:bg-blue-50"
                        onClick={() => setNavigationTarget({
                          lat: order.customer!.latitude!,
                          lng: order.customer!.longitude!,
                          name: order.customer!.name,
                          address: order.customer?.address || undefined,
                        })}
                      >
                        <Route className="w-4 h-4" />
                      </Button>
                    )}
                    {!isModifyHidden && (
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setModifyOrder(order)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      className="h-8 w-8 bg-green-600 hover:bg-green-700"
                      onClick={() => handleDeliverClick(order)}
                      disabled={updateStatus.isPending}
                    >
                      <CheckCircle className="w-4 h-4" />
                    </Button>
                    {!isCancelHidden && (
                      <Button
                        size="icon"
                        variant="destructive"
                        className="h-8 w-8"
                        onClick={() => handleCancelWithLocationCheck(order)}
                        disabled={cancelOrder.isPending || checkingLocation}
                      >
                        {checkingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                      </Button>
                    )}
                  </>
                )}

                {order.status === 'delivered' && (
                  <>
                    {isDocumentOrder(order) && (
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 border-accent/30 text-accent hover:bg-accent/10"
                        onClick={() => setCheckVerifyOrder(order)}
                      >
                        <FileCheck className="w-4 h-4" />
                      </Button>
                    )}
                    {!isModifyHidden && (
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setModifyOrder(order)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-4 space-y-3">
      {/* Order Search Dialog */}
      <OrderSearchDialog open={showSearchDialog} onOpenChange={setShowSearchDialog} />
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{t('deliveries.title')}</h2>
        {!isSearchHidden && (
          <Button variant="outline" size="sm" onClick={() => setShowSearchDialog(true)}>
            <Search className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Delivery Type Tabs (Orders vs Direct Sales) */}
      <Tabs value={deliveryType} onValueChange={(v) => { setDeliveryType(v as DeliveryType); setActiveTab('all'); }} dir="rtl">
        <TabsList className="w-full h-10 p-1 bg-muted/60">
          <TabsTrigger value="orders" className="flex-1 gap-1.5 data-[state=active]:shadow-sm">
            <Truck className="w-4 h-4" />
            <span className="text-xs font-bold">{t('deliveries.title')} ({orderTypeCount})</span>
          </TabsTrigger>
          <TabsTrigger value="direct_sales" className="flex-1 gap-1.5 data-[state=active]:shadow-sm">
            <ShoppingCart className="w-4 h-4" />
            <span className="text-xs font-bold">{t('stock.direct_sale')} ({directSaleCount})</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Status Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabStatus)} dir="rtl">
        <TabsList className="w-full h-auto p-1 bg-muted/60 flex-wrap">
          {tabs.map((tab) => {
            const count = statusCounts[tab.value] || 0;
            const TabIcon = tab.icon;
            return (
              <TabsTrigger 
                key={tab.value} 
                value={tab.value}
                className="flex-1 min-w-0 flex flex-col items-center gap-0.5 py-1.5 px-1 data-[state=active]:shadow-sm"
              >
                <TabIcon className={`w-4 h-4 ${tab.color}`} />
                <span className="text-xs font-bold">{count}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* Orders List */}
      <div className="space-y-2.5">
        {filteredOrders?.map(renderOrderCard)}

        {(!filteredOrders || filteredOrders.length === 0) && (
          <div className="text-center py-12 text-muted-foreground">
            <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{t('deliveries.no_deliveries')}</p>
          </div>
        )}
      </div>

      {/* Order Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-sm max-h-[90vh] flex flex-col p-0" dir="rtl">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle>{t('orders.details')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 p-6 pt-4">
            {/* Products first */}
            <div className="space-y-2">
              <p className="font-bold">{t('nav.products')}:</p>
              {selectedOrderItems?.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">
                      {item.product?.name}
                      {item.gift_quantity > 0 && (
                        <Badge variant="outline" className="ms-1 text-[10px] px-1 py-0 border-green-500 text-green-600">
                          <Gift className="w-3 h-3 ms-0.5" />
                          {item.gift_quantity} {t('offers.unit_box')} {t('common.free')}
                        </Badge>
                      )}
                    </span>
                    {(item.unit_price || 0) > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {Number(item.unit_price).toLocaleString()} دج × {item.quantity - (item.gift_quantity || 0)} = {Number(item.total_price || 0).toLocaleString()} دج
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary">{item.quantity} {t('common.box')}</Badge>
                </div>
              ))}
              {selectedOrder?.total_amount && Number(selectedOrder.total_amount) > 0 && (
                <>
                  <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg font-bold">
                    <span>{t('orders.grand_total')}</span>
                    <span className="text-primary">{Number(selectedOrder.total_amount).toLocaleString()} دج</span>
                  </div>
                  {Number(selectedOrder.prepaid_amount || 0) > 0 && (
                    <div className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-900/20 rounded-lg text-sm">
                      <span className="text-green-700 dark:text-green-400 font-medium">مبلغ مسبق مدفوع</span>
                      <span className="text-green-700 dark:text-green-400 font-bold">{Number(selectedOrder.prepaid_amount).toLocaleString()} دج</span>
                    </div>
                  )}
                </>
              )}
              {(!selectedOrderItems || selectedOrderItems.length === 0) && (
                <p className="text-center text-muted-foreground py-4">{t('orders.no_products')}</p>
              )}
            </div>

            {/* Customer details - compact */}
            {selectedOrder?.customer && (
              <div className="bg-muted/50 rounded-lg p-2.5 space-y-1">
                {/* Store name + sector */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Store className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="font-bold text-sm">{selectedOrder.customer.store_name || selectedOrder.customer.name}</span>
                  {customerDebts[selectedOrder.customer_id] && (
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                  )}
                  {(selectedOrder.customer as any)?.sector && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 gap-0.5">
                      <Map className="w-2.5 h-2.5" />
                      {getLocalizedName((selectedOrder.customer as any).sector, language)}
                      {(selectedOrder.customer as any)?.zone && ` • ${getLocalizedName((selectedOrder.customer as any).zone, language)}`}
                    </Badge>
                  )}
                </div>
                {/* Customer name + phone */}
                {selectedOrder.customer.store_name && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mr-5">
                    <User className="w-3 h-3 shrink-0" />
                    <span>{selectedOrder.customer.name}</span>
                    {selectedOrder.customer.phone && (
                      <a href={`tel:${selectedOrder.customer.phone}`} className="flex items-center gap-1 text-primary ms-auto">
                        <Phone className="w-3 h-3" />
                        {selectedOrder.customer.phone}
                      </a>
                    )}
                  </div>
                )}
                {!selectedOrder.customer.store_name && selectedOrder.customer.phone && (
                  <a href={`tel:${selectedOrder.customer.phone}`} className="flex items-center gap-1.5 text-xs text-primary mr-5">
                    <Phone className="w-3 h-3" />
                    {selectedOrder.customer.phone}
                  </a>
                )}
              </div>
            )}
            
            {/* Location map + address at the bottom */}
            {selectedOrder?.customer?.latitude && selectedOrder?.customer?.longitude && (
              <Collapsible onOpenChange={(open) => {
                if (open) {
                  setTimeout(() => {
                    document.getElementById('order-map-section')?.scrollIntoView({ behavior: 'smooth', block: 'end' });
                  }, 150);
                }
              }}>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-between border-primary/30 hover:bg-primary/5">
                    <span className="flex items-center gap-2">
                      <Navigation className="w-4 h-4 text-primary" />
                      <span>{t('customers.search_location')}</span>
                    </span>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-2" id="order-map-section">
                  {selectedOrder.customer.address && (
                    <p className="flex items-start gap-2 text-xs text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      {selectedOrder.customer.address}{selectedOrder.customer.wilaya ? ` - ${selectedOrder.customer.wilaya}` : ''}
                    </p>
                  )}
                  <LazyCustomerLocationView
                    latitude={selectedOrder.customer.latitude}
                    longitude={selectedOrder.customer.longitude}
                    customerName={selectedOrder.customer.name}
                    address={selectedOrder.customer.address || undefined}
                  />
                </CollapsibleContent>
              </Collapsible>
            )}

          </div>
          {selectedOrder && (selectedOrder.status === 'assigned' || selectedOrder.status === 'in_progress') && (
            <div className="border-t bg-card p-4 space-y-3 shrink-0">
              <p className="font-bold text-sm">{t('common.status')}:</p>
              <div className="flex gap-2">
                {(['assigned', 'in_progress', 'delivered'] as const).map((status) => (
                  <Button
                    key={status}
                    variant={selectedOrder.status === status ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1"
                    disabled={updateStatus.isPending || selectedOrder.status === status}
                    onClick={() => {
                      if (status === 'delivered') {
                        setSelectedOrderId(null);
                        handleDeliverClick(selectedOrder);
                      } else {
                        handleUpdateStatus(selectedOrder.id, status as OrderStatus);
                      }
                    }}
                  >
                    {t(`orders.${status}`)}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                {!isModifyHidden && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => { setSelectedOrderId(null); setModifyOrder(selectedOrder); }}
                  >
                    <Edit2 className="w-4 h-4 ms-1" />
                    {t('common.edit')}
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  onClick={() => { setSelectedOrderId(null); handleCancelWithLocationCheck(selectedOrder); }}
                  disabled={cancelOrder.isPending || checkingLocation}
                >
                  {checkingLocation ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4 ms-1" />}
                  {t('orders.cancel_order')}
                </Button>
              </div>
            </div>
          )}
          {selectedOrder && isDocumentOrder(selectedOrder) && (
            <div className="border-t bg-card p-4 shrink-0">
              <Button
                className="w-full gap-2 border-accent/30 text-accent hover:bg-accent/10"
                variant="outline"
                onClick={() => { setShowDetailsDialog(false); setCheckVerifyOrder(selectedOrder); }}
              >
                <FileCheck className="w-4 h-4" />
                {isDocumentVerificationPending(selectedOrder) ? 'إكمال التحقق' : 'تعديل التحقق'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {pendingDeliveryOrder && (
        <DeliverySaleDialog
          open={showDeliverySaleDialog}
          onOpenChange={(open) => {
            setShowDeliverySaleDialog(open);
            if (!open) setPendingDeliveryOrder(null);
          }}
          order={pendingDeliveryOrder}
        />
      )}
      
      {modifyOrder && (
        <ModifyOrderWithItems order={modifyOrder} onClose={() => setModifyOrder(null)} />
      )}
      
      {/* Check Verification Dialog for completing later */}
      {checkVerifyOrder && (
        <CheckVerificationDialog
          open={!!checkVerifyOrder}
          onOpenChange={(open) => { if (!open) setCheckVerifyOrder(null); }}
          orderTotal={Number(checkVerifyOrder.total_amount || 0)}
          customerName={checkVerifyOrder.customer?.name || ''}
          initialCheckReceived={(checkVerifyOrder as any).document_verification?.status !== 'not_received'}
          initialVerification={(checkVerifyOrder as any).document_verification || null}
          documentType={checkVerifyOrder.invoice_payment_method as 'check' | 'receipt' | 'transfer'}
          onConfirm={async (data) => {
            const docType = checkVerifyOrder.invoice_payment_method || 'check';
            const verification = data.checkReceived ? {
              type: docType,
              ...data.verification,
              skipped: data.skippedVerification,
              verified_at: new Date().toISOString(),
            } : { type: docType, status: 'not_received' };

            await supabase
              .from('orders')
              .update({
                document_status: data.checkReceived ? (data.skippedVerification ? 'pending' : 'received') : 'pending',
                document_verification: verification as any,
                check_due_date: data.verification?.due_date || null,
              })
              .eq('id', checkVerifyOrder.id);

            await refetchOrders();
            toast.success('تم تحديث التحقق من الشيك');
            setCheckVerifyOrder(null);
          }}
        />
      )}

      {navigationTarget && (
        <LazyNavigationMapView
          destinationLat={navigationTarget.lat}
          destinationLng={navigationTarget.lng}
          customerName={navigationTarget.name}
          address={navigationTarget.address}
          onClose={() => setNavigationTarget(null)}
        />
      )}
      
      <AlertDialog open={!!confirmCancelOrderId} onOpenChange={() => setConfirmCancelOrderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد إلغاء الطلبية</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من إلغاء هذه الطلبية؟ لا يمكن التراجع عن هذه العملية.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { if (confirmCancelOrderId) handleCancelOrder(confirmCancelOrderId); setConfirmCancelOrderId(null); }}>تأكيد الإلغاء</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// Wrapper to fetch order items for ModifyOrderDialog
const ModifyOrderWithItems: React.FC<{ order: OrderWithDetails; onClose: () => void }> = ({ order, onClose }) => {
  const { data: items } = useOrderItems(order.id);
  return (
    <ModifyOrderDialog
      open={true}
      onOpenChange={(open) => !open && onClose()}
      order={order}
      orderItems={items || []}
    />
  );
};

export default MyDeliveries;
