import React, { useState } from 'react';
import { AlertTriangle, Package, User, ChevronLeft, Truck, PackageX, PackageCheck, Warehouse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStockAlerts, StockAlert } from '@/hooks/useStockAlerts';
import { useShortageTracking, useMarkProductUnavailable, ShortageWithDetails } from '@/hooks/useShortageTracking';
import { useWarehouseGap } from '@/hooks/useWarehouseGap';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import QuickLoadDialog from './QuickLoadDialog';
import ShortageDetailsDialog from './ShortageDetailsDialog';
import WarehouseGapDetailsDialog from './WarehouseGapDetailsDialog';
import { WarehouseGapItem } from '@/hooks/useWarehouseGap';
import { isAdminRole } from '@/lib/utils';

const StockAlertsNotification: React.FC = () => {
  const { t, dir } = useLanguage();
  const { role } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('shipping');
  const { data: alerts = [], isLoading } = useStockAlerts();
  const { data: shortageData } = useShortageTracking();
  const { data: warehouseGaps = [] } = useWarehouseGap();
  const markUnavailable = useMarkProductUnavailable();

  const [quickLoad, setQuickLoad] = useState<{
    workerId: string;
    workerName: string;
    items: { product_id: string; product_name: string; deficit: number }[];
  } | null>(null);

  const [shortageDetails, setShortageDetails] = useState<{
    productName: string;
    records: ShortageWithDetails[];
  } | null>(null);

  const [warehouseGapDetails, setWarehouseGapDetails] = useState<WarehouseGapItem | null>(null);

  const [markingProduct, setMarkingProduct] = useState<string | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  const isAdmin = isAdminRole(role);
  if (!isAdmin) return null;

  // Filter out dismissed alerts then group by worker
  const filteredAlerts = alerts.filter(a => !dismissedAlerts.has(a.product_id));
  const alertsByWorker = filteredAlerts.reduce((acc, alert) => {
    if (!acc[alert.worker_id]) {
      acc[alert.worker_id] = { worker_name: alert.worker_name, items: [] };
    }
    acc[alert.worker_id].items.push(alert);
    return acc;
  }, {} as Record<string, { worker_name: string; items: StockAlert[] }>);

  const workerCount = Object.keys(alertsByWorker).length;

  // Available products from shortage tracking
  const availableProducts = shortageData?.available || [];
  const availableByProduct = availableProducts.reduce((acc, r) => {
    const pid = r.product_id;
    if (!acc[pid]) acc[pid] = { productName: r.product?.name || '', records: [] };
    acc[pid].records.push(r);
    return acc;
  }, {} as Record<string, { productName: string; records: ShortageWithDetails[] }>);
  const availableCount = Object.keys(availableByProduct).length;

  const shippingBadge = filteredAlerts.length + availableCount;
  const warehouseBadge = warehouseGaps.length;
  const totalBadge = shippingBadge + warehouseBadge;

  const handleWorkerClick = (workerId: string, workerName: string, items: StockAlert[]) => {
    setIsOpen(false);
    setQuickLoad({
      workerId,
      workerName,
      items: items.map(i => ({
        product_id: i.product_id,
        product_name: i.product_name,
        deficit: i.deficit,
      })),
    });
  };

  const handleMarkUnavailable = async (productId: string, productName: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setMarkingProduct(productId);

    try {
      const { data: orders } = await supabase
        .from('orders')
        .select('id, customer_id, assigned_worker_id, created_by, status, order_items!inner(product_id, quantity)')
        .in('status', ['pending', 'assigned', 'in_progress']);

      const validOrders = (orders || []).filter((o: any) =>
        (o.order_items || []).some((oi: any) => oi.product_id === productId)
      );

      if (validOrders.length === 0) {
        toast.info(t('stock.shortage_no_orders'));
        return;
      }

      const mappedOrders = validOrders.map((o: any) => {
        const item = (o.order_items || []).find((oi: any) => oi.product_id === productId);
        return {
          orderId: o.id,
          customerId: o.customer_id,
          workerId: o.assigned_worker_id || o.created_by,
          quantity: item?.quantity || 0,
        };
      });

      await markUnavailable.mutateAsync({ productId, orders: mappedOrders });
      // Dismiss this alert from shipping tab
      setDismissedAlerts(prev => new Set(prev).add(productId));
      toast.success(
        `${t('stock.shortage_marked')} ${productName} ${t('stock.shortage_as_unavailable')} (${mappedOrders.length} ${t('stock.shortage_orders')})`
      );
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setMarkingProduct(null);
    }
  };

  const handleAvailableClick = (productId: string) => {
    const group = availableByProduct[productId];
    if (!group) return;
    setIsOpen(false);
    setShortageDetails({
      productName: group.productName,
      records: group.records,
    });
  };

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative w-8 h-8 bg-destructive/10 hover:bg-destructive/20">
            <AlertTriangle className={`w-4 h-4 ${totalBadge > 0 ? 'text-destructive' : 'text-destructive/60'}`} />
            {totalBadge > 0 && (
              <Badge
                className="absolute -top-1 -end-1 h-5 min-w-5 flex items-center justify-center p-0 text-xs bg-destructive text-destructive-foreground border-0"
              >
                {totalBadge}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[calc(100vw-16px)] max-w-[420px] p-0" align="end" dir={dir} sideOffset={8}>
          {/* Header */}
          <div className="p-3 border-b bg-destructive text-destructive-foreground rounded-t-lg">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-semibold">{t('stock.alerts_title')}</span>
              <Badge variant="secondary" className="ms-auto bg-white/20 text-white border-0">
                {totalBadge}
              </Badge>
            </div>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full rounded-none border-b h-10 bg-muted/30 p-0">
              <TabsTrigger value="shipping" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none gap-1.5 text-xs h-full">
                <Truck className="w-3.5 h-3.5" />
                {t('stock.tab_shipping_gap')}
                {shippingBadge > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 h-4 min-w-4">
                    {shippingBadge}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="warehouse" className="flex-1 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none gap-1.5 text-xs h-full">
                <Warehouse className="w-3.5 h-3.5" />
                {t('stock.tab_warehouse_gap')}
                {warehouseBadge > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 h-4 min-w-4">
                    {warehouseBadge}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Shipping Gap Tab */}
            <TabsContent value="shipping" className="m-0">
              <ScrollArea className="max-h-80">
                {/* Available Products Section */}
                {availableCount > 0 && (
                  <div className="border-b">
                    <div className="px-3 py-2 bg-green-50 dark:bg-green-900/10 flex items-center gap-2">
                      <PackageCheck className="w-4 h-4 text-green-600" />
                      <span className="text-xs font-bold text-green-700 dark:text-green-400">
                        {t('stock.shortage_available_title')}
                      </span>
                    </div>
                    <div className="divide-y">
                      {Object.entries(availableByProduct).map(([productId, { productName, records }]) => (
                        <div
                          key={productId}
                          className="p-3 cursor-pointer hover:bg-green-50/50 dark:hover:bg-green-900/5 transition-colors"
                          onClick={() => handleAvailableClick(productId)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Package className="w-4 h-4 text-green-600" />
                              <span className="font-semibold text-sm">{productName}</span>
                            </div>
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs">
                              {records.length} {t('stock.shortage_customers')}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t('stock.shortage_total_needed')}:{' '}
                            <strong>{records.reduce((s, r) => s + r.quantity_needed, 0)}</strong> {t('stock.boxes')}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Worker Deficit Section */}
                {isLoading ? (
                  <div className="p-4 text-center text-muted-foreground">
                    {t('common.loading')}
                  </div>
                ) : filteredAlerts.length === 0 && availableCount === 0 ? (
                  <div className="p-6 text-center">
                    <Truck className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
                    <p className="text-sm font-medium text-muted-foreground">{t('stock.no_alerts')}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('stock.all_balanced')}</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {Object.entries(alertsByWorker).map(([workerId, { worker_name, items }]) => (
                      <div
                        key={workerId}
                        className="p-3 space-y-2 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => handleWorkerClick(workerId, worker_name, items)}
                      >
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-primary" />
                          <span className="font-semibold text-sm">{worker_name}</span>
                          <Badge variant="destructive" className="ms-auto text-xs">
                            {items.length} {t('stock.deficit_items')}
                          </Badge>
                          <Truck className="w-4 h-4 text-primary opacity-60" />
                        </div>
                        <div className="space-y-1">
                          {items.map((alert) => (
                            <div
                              key={`${alert.worker_id}-${alert.product_id}`}
                              className="text-xs bg-destructive/5 rounded-md p-2 space-y-1.5"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium flex-1">{alert.product_name}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground">
                                    {t('stock.in_truck')}: <strong>{alert.current_stock}</strong>
                                  </span>
                                  <ChevronLeft className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">
                                    {t('stock.needed')}: <strong className="text-destructive">{alert.required_quantity}</strong>
                                  </span>
                                  <Badge variant="destructive" className="text-xs px-1.5">
                                    -{alert.deficit}
                                  </Badge>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full h-7 text-xs font-semibold text-orange-700 bg-orange-50 border-orange-300 hover:bg-orange-100 hover:text-orange-800 dark:text-orange-400 dark:bg-orange-900/20 dark:border-orange-700 dark:hover:bg-orange-900/40 gap-1"
                                onClick={(e) => handleMarkUnavailable(alert.product_id, alert.product_name, e)}
                                disabled={markingProduct === alert.product_id}
                              >
                                <PackageX className="w-3.5 h-3.5" />
                                {t('stock.product_unavailable_short')}
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Warehouse Gap Tab */}
            <TabsContent value="warehouse" className="m-0">
              <ScrollArea className="max-h-80">
                {warehouseGaps.length === 0 ? (
                  <div className="p-6 text-center">
                    <Warehouse className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
                    <p className="text-sm font-medium text-muted-foreground">{t('stock.warehouse_gap_empty')}</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {warehouseGaps.map((gap) => (
                      <div
                        key={gap.product_id}
                        className="p-3 space-y-2 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => {
                          setIsOpen(false);
                          setWarehouseGapDetails(gap);
                        }}
                      >
                        {/* Product header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Package className="w-4 h-4 text-destructive" />
                            <span className="font-semibold text-sm">{gap.product_name}</span>
                          </div>
                          <Badge variant="destructive" className="text-xs">
                            -{gap.deficit}
                          </Badge>
                        </div>

                        {/* Stats row */}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/50 rounded-md px-2 py-1.5">
                          <span>
                            {t('stock.warehouse_gap_needed')}: <strong className="text-foreground">{gap.total_needed}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            {t('stock.warehouse_gap_available')}: <strong className="text-foreground">{gap.warehouse_stock}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            {gap.order_count} {t('stock.warehouse_gap_orders')}
                          </span>
                          <span>•</span>
                          <span>
                            {gap.customer_count} {t('stock.warehouse_gap_customers')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>

      {quickLoad && (
        <QuickLoadDialog
          open={!!quickLoad}
          onOpenChange={(open) => { if (!open) setQuickLoad(null); }}
          workerId={quickLoad.workerId}
          workerName={quickLoad.workerName}
          deficitItems={quickLoad.items}
        />
      )}

      {shortageDetails && (
        <ShortageDetailsDialog
          open={!!shortageDetails}
          onOpenChange={(open) => { if (!open) setShortageDetails(null); }}
          productName={shortageDetails.productName}
          records={shortageDetails.records}
        />
      )}

      <WarehouseGapDetailsDialog
        open={!!warehouseGapDetails}
        onOpenChange={(open) => { if (!open) setWarehouseGapDetails(null); }}
        gap={warehouseGapDetails}
        onMarkUnavailable={(pid, pname) => handleMarkUnavailable(pid, pname)}
        isMarking={!!markingProduct}
      />
    </>
  );
};

export default StockAlertsNotification;
