import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, Package, Truck, ShoppingBag, PackageX, CheckCircle, AlertTriangle, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import EmptyTruckDialog from './EmptyTruckDialog';

interface ProductStockSummaryProps {
  workerId: string;
  branchId?: string;
  periodStart: string;
  periodEnd: string;
}

interface SoldProductRow {
  product_name: string;
  quantity: number;
  unit_price: number;
  box_price: number;
  total_value: number;
  selling_unit: string;
}


interface WorkerStockRow {
  product_name: string;
  quantity: number;
  unit_price: number;
  total_value: number;
  selling_unit: string;
  raw_unit_price: number;
}

// Get raw unit price (the price per pricing unit before box conversion)
const getRawUnitPrice = (p: any): number => {
  return Number(p?.price_gros || p?.price_super_gros || p?.price_retail || p?.price_invoice || 0);
};

// Calculate the box price based on pricing unit
const calcBoxPrice = (p: any): number => {
  const rawPrice = getRawUnitPrice(p);
  if (!rawPrice) return 0;
  const pricingUnit = p?.pricing_unit || 'box';
  if (pricingUnit === 'kg') {
    const weightPerBox = Number(p?.weight_per_box || 0);
    return rawPrice * weightPerBox;
  }
  if (pricingUnit === 'unit') {
    const piecesPerBox = Number(p?.pieces_per_box || 1);
    return rawPrice * piecesPerBox;
  }
  return rawPrice;
};

const ProductStockSummary: React.FC<ProductStockSummaryProps> = ({
  workerId, branchId, periodStart, periodEnd,
}) => {
  const { t } = useLanguage();
  const [showEmptyTruck, setShowEmptyTruck] = useState(false);

  // Helper to convert period values to proper timestamptz
  const toTz = (v: string, isEnd: boolean) => {
    if (v.includes('+') || v.includes('Z')) return v;
    if (v.includes('T')) return v + ':00+01:00';
    return isEnd ? v + 'T23:59:59+01:00' : v + 'T00:00:00+01:00';
  };

  // Fetch sold products
  const { data: salesData, isLoading: soldLoading } = useQuery({
    queryKey: ['sold-products-summary', workerId, periodStart, periodEnd],
    queryFn: async () => {
      const periodStartTz = toTz(periodStart, false);
      const periodEndTz = toTz(periodEnd, true);

      const { data: orders } = await supabase
        .from('orders')
        .select('id, total_amount')
        .eq('assigned_worker_id', workerId)
        .eq('status', 'delivered')
        .gte('updated_at', periodStartTz)
        .lte('updated_at', periodEndTz);

      const ordersTotalSales = orders?.reduce((s, o) => s + Number(o.total_amount || 0), 0) || 0;
      const orderIds = orders?.map(o => o.id) || [];

      const { data: movements } = await supabase
        .from('stock_movements')
        .select('order_id, quantity, product:products(name, price_gros, price_super_gros, price_invoice, price_retail, pricing_unit, weight_per_box, pieces_per_box)')
        .eq('worker_id', workerId)
        .eq('movement_type', 'delivery')
        .gte('created_at', periodStartTz)
        .lte('created_at', periodEndTz);

      const productMap: Record<string, SoldProductRow> = {};
      const trackedOrderIds = new Set<string>();
      for (const item of (movements || [])) {
        const product = (item as any).product;
        const name = product?.name || '';
        const boxPrice = calcBoxPrice(product);
        const rawPrice = getRawUnitPrice(product);
        const pricingUnit = product?.pricing_unit || 'box';
        if ((item as any).order_id) trackedOrderIds.add((item as any).order_id);

        if (!productMap[name]) {
          productMap[name] = {
            product_name: name, quantity: 0, unit_price: rawPrice,
            box_price: boxPrice, total_value: 0, selling_unit: pricingUnit,
          };
        }
        productMap[name].quantity += Number(item.quantity || 0);
        productMap[name].total_value += Number(item.quantity || 0) * boxPrice;
      }

      const soldProducts = Object.values(productMap).filter(r => r.quantity > 0).sort((a, b) => b.total_value - a.total_value);
      const trackedTotal = soldProducts.reduce((s, r) => s + r.total_value, 0);
      const untrackedCount = orderIds.filter(id => !trackedOrderIds.has(id)).length;

      return { soldProducts, ordersTotalSales, trackedTotal, untrackedCount };
    },
    enabled: !!workerId && !!periodStart && !!periodEnd,
  });

  const soldProducts = salesData?.soldProducts || [];

  // Current worker stock (truck inventory)
  const { data: truckStock, isLoading: truckLoading } = useQuery({
    queryKey: ['worker-truck-stock', workerId],
    queryFn: async (): Promise<WorkerStockRow[]> => {
      const { data } = await supabase
        .from('worker_stock')
        .select('quantity, product:products(name, price_gros, price_super_gros, price_invoice, price_retail, pricing_unit, weight_per_box, pieces_per_box)')
        .eq('worker_id', workerId)
        .gt('quantity', 0);

      if (!data) return [];

      return data.map((item: any) => {
        const boxPrice = calcBoxPrice(item.product);
        const rawPrice = getRawUnitPrice(item.product);
        const pricingUnit = item.product?.pricing_unit || 'box';
        return {
          product_name: item.product?.name || '',
          quantity: item.quantity,
          unit_price: boxPrice,
          total_value: item.quantity * boxPrice,
          selling_unit: pricingUnit,
          raw_unit_price: rawPrice,
        };
      }).filter((r: WorkerStockRow) => r.quantity > 0);
    },
    enabled: !!workerId,
  });

  // Fetch loading/unloading data and session counts since last completed accounting session
  const { data: loadingData } = useQuery({
    queryKey: ['truck-loading-since-session', workerId, periodStart],
    queryFn: async () => {
      const periodStartTz = toTz(periodStart, false);

      // Fetch all loading sessions since period start
      const { data: sessions } = await supabase
        .from('loading_sessions')
        .select('id, status, created_at')
        .eq('worker_id', workerId)
        .gte('created_at', periodStartTz)
        .order('created_at', { ascending: false });

      const allSessions = sessions || [];
      const loadCount = allSessions.filter(s => s.status === 'completed' || s.status === 'open').length;
      const unloadCount = allSessions.filter(s => s.status === 'unloaded').length;
      const reviewCount = allSessions.filter(s => s.status === 'review').length;

      // Fetch all loading session items for these sessions
      const sessionIds = allSessions.map(s => s.id);
      if (sessionIds.length === 0) return { loadedMap: {} as Record<string, number>, loadCount: 0, unloadCount: 0, reviewCount: 0 };

      const { data: items } = await supabase
        .from('loading_session_items')
        .select('quantity, product:products(name), session_id')
        .in('session_id', sessionIds);

      // Aggregate loaded quantity per product (net: loading - unloading)
      const loadedMap: Record<string, number> = {};
      for (const item of (items || [])) {
        const name = (item as any).product?.name || '';
        if (!name) continue;
        if (!loadedMap[name]) loadedMap[name] = 0;
        loadedMap[name] += Number(item.quantity || 0);
      }

      return { loadedMap, loadCount, unloadCount, reviewCount };
    },
    enabled: !!workerId && !!periodStart,
  });

  // Fetch sales per product since last accounting session
  const { data: salesPerProduct } = useQuery({
    queryKey: ['sales-per-product-map', workerId, periodStart, periodEnd],
    queryFn: async () => {
      const periodStartTz = toTz(periodStart, false);
      const periodEndTz = toTz(periodEnd, true);

      const { data: movements } = await supabase
        .from('stock_movements')
        .select('quantity, product:products(name)')
        .eq('worker_id', workerId)
        .eq('movement_type', 'delivery')
        .gte('created_at', periodStartTz)
        .lte('created_at', periodEndTz);

      const salesMap: Record<string, number> = {};
      for (const item of (movements || [])) {
        const name = (item as any).product?.name || '';
        if (!name) continue;
        if (!salesMap[name]) salesMap[name] = 0;
        salesMap[name] += Number(item.quantity || 0);
      }
      return salesMap;
    },
    enabled: !!workerId && !!periodStart && !!periodEnd,
  });

  // Fetch latest review session data for this worker
  const { data: reviewData } = useQuery({
    queryKey: ['truck-review-for-stock', workerId],
    queryFn: async () => {
      const { data: sessions } = await supabase
        .from('loading_sessions')
        .select('id, status, created_at, notes, manager:workers!loading_sessions_manager_id_fkey(full_name)')
        .eq('worker_id', workerId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!sessions || sessions.length === 0 || sessions[0].status !== 'review') {
        return null;
      }

      const session = sessions[0] as any;
      const sessionId = session.id;
      const { data: items } = await supabase
        .from('loading_session_items')
        .select('product_id, previous_quantity, quantity, product:products(name)')
        .eq('session_id', sessionId);

      const reviewMap: Record<string, { systemQty: number; actualQty: number; diff: number }> = {};
      let deficitCount = 0;
      let surplusCount = 0;
      let matchCount = 0;
      for (const item of (items || [])) {
        const name = (item as any).product?.name || '';
        const systemQty = Number((item as any).previous_quantity || 0);
        const actualQty = Number((item as any).quantity || 0);
        const diff = actualQty - systemQty;
        reviewMap[name] = { systemQty, actualQty, diff };
        if (Math.abs(diff) < 0.001) matchCount++;
        else if (diff > 0) surplusCount++;
        else deficitCount++;
      }
      return {
        items: reviewMap,
        sessionInfo: {
          status: session.status,
          created_at: session.created_at,
          manager_name: session.manager?.full_name || 'مدير النظام',
          deficitCount,
          surplusCount,
          matchCount,
          notes: session.notes,
        },
      };
    },
    enabled: !!workerId,
  });

  const totalTruckValue = truckStock?.reduce((s, r) => s + r.total_value, 0) || 0;
  const totalTruckQty = truckStock?.reduce((s, r) => s + r.quantity, 0) || 0;
  const totalSoldValue = salesData?.ordersTotalSales || 0;
  const trackedSoldValue = salesData?.trackedTotal || 0;
  const totalSoldQty = soldProducts.reduce((s, r) => s + r.quantity, 0);
  const untrackedCount = salesData?.untrackedCount || 0;

  if (soldLoading && truckLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  // Collect all product names from truck stock, loading, and sales
  const allProductNames = new Set<string>();
  truckStock?.forEach(r => allProductNames.add(r.product_name));
  if (loadingData?.loadedMap) Object.keys(loadingData.loadedMap).forEach(n => allProductNames.add(n));
  if (salesPerProduct) Object.keys(salesPerProduct).forEach(n => allProductNames.add(n));
  if (reviewData?.items) Object.keys(reviewData.items).forEach(n => allProductNames.add(n));

  const productRows = Array.from(allProductNames).map(name => {
    const truckRow = truckStock?.find(r => r.product_name === name);
    const review = reviewData?.items?.[name];
    const loaded = loadingData?.loadedMap?.[name] || 0;
    const sold = salesPerProduct?.[name] || 0;
    const systemQty = review ? review.systemQty : (truckRow?.quantity || 0);
    const actualQty = review ? review.actualQty : null;
    const diff = review ? review.diff : null;
    const status = diff === null ? null : Math.abs(diff) < 0.001 ? 'match' : diff > 0 ? 'surplus' : 'deficit';
    return { name, loaded, sold, systemQty, actualQty, diff, status };
  }).filter(r => r.loaded > 0 || r.sold > 0 || r.systemQty > 0 || r.actualQty !== null);

  return (
    <div className="space-y-4">
      {/* Current Truck Stock with Review Data */}
      {productRows.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Truck className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">{t('accounting.truck_stock')}</span>
          </div>

          {/* Session Counts */}
          {loadingData && (
            <div className="flex items-center gap-2 flex-wrap text-xs bg-muted/30 border rounded-lg px-3 py-1.5" dir="rtl">
              <span className="whitespace-nowrap">شحن: <span className="font-bold text-green-600">{loadingData.loadCount}</span></span>
              <span className="text-muted-foreground/40">|</span>
              <span className="whitespace-nowrap">تفريغ: <span className="font-bold text-destructive">{loadingData.unloadCount}</span></span>
              <span className="text-muted-foreground/40">|</span>
              <span className="whitespace-nowrap">مراجعة: <span className="font-bold text-primary">{loadingData.reviewCount}</span></span>
            </div>
          )}

          {/* Review Session Info */}
          {reviewData?.sessionInfo && (
            <div className="flex items-center gap-2 flex-wrap text-xs bg-muted/50 border rounded-lg px-3 py-2" dir="rtl">
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-background/70 px-2 py-1">
                <span className="font-semibold">{new Date(reviewData.sessionInfo.created_at).toLocaleDateString('ar-DZ')}</span>
                <span className="text-muted-foreground">،</span>
                <span className="text-primary font-bold">{new Date(reviewData.sessionInfo.created_at).toLocaleTimeString('ar-DZ', { hour12: false, hour: '2-digit', minute: '2-digit' })}</span>
              </span>
              <span className="text-muted-foreground/40 whitespace-nowrap">|</span>
              <span className="whitespace-nowrap">المراجع: <span className="font-semibold">{reviewData.sessionInfo.manager_name}</span></span>
              <span className="text-muted-foreground/40 whitespace-nowrap">|</span>
              <span className="whitespace-nowrap font-semibold text-destructive">عجز ({reviewData.sessionInfo.deficitCount ?? 0})</span>
              <span className="whitespace-nowrap font-semibold text-orange-600">فائض ({reviewData.sessionInfo.surplusCount ?? 0})</span>
              <span className="whitespace-nowrap font-semibold text-green-600">متوافق ({reviewData.sessionInfo.matchCount ?? 0})</span>
            </div>
          )}

          <div className="grid grid-cols-6 gap-1 text-xs text-muted-foreground text-center font-medium border-b pb-1">
            <span className="text-start">{t('stock.product')}</span>
            <span>الشحن</span>
            <span>المبيعات</span>
            <span>كمية النظام</span>
            <span>الكمية الفعلية</span>
            <span>المراجعة</span>
          </div>

          {productRows.map((row) => (
            <div key={row.name} className="grid grid-cols-6 gap-1 text-xs text-center items-center py-1.5 border-b border-dashed last:border-0">
              <span className="text-start font-medium text-wrap">{row.name}</span>
              <span className="font-bold text-green-600">{row.loaded > 0 ? row.loaded : '-'}</span>
              <span className="font-bold text-blue-600">{row.sold > 0 ? row.sold : '-'}</span>
              <span className="font-bold">{row.systemQty}</span>
              <span className={`font-bold ${row.status === 'deficit' ? 'text-destructive' : row.status === 'surplus' ? 'text-orange-600' : ''}`}>
                {row.actualQty !== null ? row.actualQty : '-'}
              </span>
              <span>
                {row.status === 'match' && (
                  <Badge className="text-[10px] bg-primary/80 text-primary-foreground">
                    <CheckCircle className="w-2.5 h-2.5 ml-0.5" />
                    متوافق
                  </Badge>
                )}
                {row.status === 'deficit' && (
                  <Badge className="text-[10px] bg-destructive text-destructive-foreground" dir="rtl">
                    <AlertTriangle className="w-2.5 h-2.5 me-1" />
                    عجز ({Math.abs(row.diff!)})
                  </Badge>
                )}
                {row.status === 'surplus' && (
                  <Badge className="text-[10px] bg-orange-500 text-white" dir="rtl">
                    <TrendingUp className="w-2.5 h-2.5 me-1" />
                    فائض ({Math.abs(row.diff!)})
                  </Badge>
                )}
                {row.status === null && (
                  <span className="text-muted-foreground">-</span>
                )}
              </span>
            </div>
          ))}

          <div className="grid grid-cols-6 gap-1 text-xs text-center font-bold border-t-2 pt-1 bg-primary/5 rounded p-1.5">
            <span className="text-start">{t('common.total')}</span>
            <span className="text-green-600">{productRows.reduce((s, r) => s + r.loaded, 0) || '-'}</span>
            <span className="text-blue-600">{productRows.reduce((s, r) => s + r.sold, 0) || '-'}</span>
            <span>{totalTruckQty}</span>
            <span>-</span>
            <span>-</span>
          </div>

        </div>
      )}

      {(!productRows || productRows.length === 0) && !truckLoading && (
        <p className="text-center text-muted-foreground py-2 text-xs">
          {t('accounting.no_truck_stock')}
        </p>
      )}

      {/* Sales Tracking (only sold products) */}
      {soldProducts && soldProducts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingBag className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">{t('accounting.sales_tracking')}</span>
          </div>

          <div className="grid grid-cols-5 gap-1 text-xs text-muted-foreground text-center font-medium border-b pb-1">
            <span className="text-start">{t('stock.product')}</span>
            <span>{t('stock.quantity')}</span>
            <span>{t('accounting.unit_price')}</span>
            <span>{t('accounting.box_price')}</span>
            <span>{t('accounting.total_value')}</span>
          </div>

          {soldProducts.map((row) => (
            <div key={row.product_name} className="grid grid-cols-5 gap-1 text-xs text-center items-center py-1 border-b border-dashed last:border-0">
              <span className="text-start font-medium text-wrap">{row.product_name}</span>
              <span className="font-bold">{row.quantity}</span>
              <span className="text-muted-foreground">{row.unit_price.toLocaleString()}</span>
              <span>{row.box_price.toLocaleString()}</span>
              <span className="font-bold">{row.total_value.toLocaleString()}</span>
            </div>
          ))}

          <div className="grid grid-cols-5 gap-1 text-xs text-center font-bold border-t-2 pt-1 bg-primary/5 rounded p-1.5">
            <span className="text-start">{t('common.total')}</span>
            <span>{totalSoldQty}</span>
            <span>-</span>
            <span>-</span>
            <span className="text-primary">{trackedSoldValue.toLocaleString()} DA</span>
          </div>

          {untrackedCount > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-lg p-2 text-xs text-yellow-800 dark:text-yellow-400">
              ⚠️ {untrackedCount} {t('accounting.orders_count')} {t('accounting.untracked_orders')} ({(totalSoldValue - trackedSoldValue).toLocaleString()} DA)
            </div>
          )}
        </div>
      )}

      {(!soldProducts || soldProducts.length === 0) && !soldLoading && (
        <p className="text-center text-muted-foreground py-3 text-sm">
          {t('accounting.no_sales')}
        </p>
      )}

      <EmptyTruckDialog
        workerId={workerId}
        open={showEmptyTruck}
        onOpenChange={setShowEmptyTruck}
      />
    </div>
  );
};

export default ProductStockSummary;