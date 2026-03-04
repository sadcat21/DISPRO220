import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, Package, Truck, ShoppingBag, PackageX, CheckCircle, AlertTriangle, TrendingUp, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import EmptyTruckDialog from './EmptyTruckDialog';

interface ProductStockSummaryProps {
  workerId: string;
  branchId?: string;
  periodStart: string;
  periodEnd: string;
}

interface SoldProductPricingRow {
  subtype: string;
  quantity: number;
  unit_price: number;
  total_value: number;
  pricing_unit: string | null;
  weight_per_box: number | null;
  pieces_per_box: number | null;
}

interface SoldProductRow {
  product_name: string;
  quantity: number;
  total_value: number;
  pricing_rows: SoldProductPricingRow[];
}


interface WorkerStockRow {
  product_name: string;
  quantity: number;
  unit_price: number;
  total_value: number;
  selling_unit: string;
  raw_unit_price: number;
}

// Format quantity: max 2 decimal places, trim trailing zeros
const fmtQty = (v: number): string => {
  const rounded = Math.round(v * 100) / 100;
  if (rounded === Math.floor(rounded)) return rounded.toString();
  return rounded.toFixed(2).replace(/0+$/, '');
};

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

  // Fetch sold products with real pricing snapshot from order_items
  const { data: salesData, isLoading: soldLoading } = useQuery({
    queryKey: ['sold-products-summary', workerId, periodStart, periodEnd],
    queryFn: async () => {
      const periodStartTz = toTz(periodStart, false);
      const periodEndTz = toTz(periodEnd, true);

      const { data: stockMovements } = await supabase
        .from('stock_movements')
        .select('order_id')
        .eq('worker_id', workerId)
        .eq('movement_type', 'delivery')
        .eq('status', 'approved')
        .gte('created_at', periodStartTz)
        .lte('created_at', periodEndTz);

      const orderIds = Array.from(new Set((stockMovements || []).map((m: any) => m.order_id).filter(Boolean)));

      if (orderIds.length === 0) {
        return { soldProducts: [] as SoldProductRow[], ordersTotalSales: 0, trackedTotal: 0, untrackedCount: 0 };
      }

      const { data: orders } = await supabase
        .from('orders')
        .select('id, total_amount, payment_type, customer:customers(default_price_subtype)')
        .in('id', orderIds)
        .eq('assigned_worker_id', workerId)
        .eq('status', 'delivered');

      const ordersTotalSales = orders?.reduce((s, o) => s + Number(o.total_amount || 0), 0) || 0;
      const orderPaymentTypeMap = new Map((orders || []).map(o => [o.id, o.payment_type || '']));
      const orderCustomerSubtypeMap = new Map((orders || []).map(o => [o.id, (o as any).customer?.default_price_subtype || 'gros']));

      const { data: orderItems } = await supabase
        .from('order_items')
        .select('order_id, quantity, gift_quantity, unit_price, total_price, price_subtype, payment_type, pricing_unit, weight_per_box, pieces_per_box, product:products(name)')
        .in('order_id', orderIds);

      const productMap: Record<string, SoldProductRow> = {};
      const trackedOrderIds = new Set<string>();

      for (const item of (orderItems || [])) {
        const orderId = (item as any).order_id as string | undefined;
        if (!orderId) continue;

        const productName = (item as any).product?.name || '';
        if (!productName) continue;

        trackedOrderIds.add(orderId);

        const rawQty = Number(item.quantity || 0);
        const giftQty = Number(item.gift_quantity || 0);
        const unitPrice = Number(item.unit_price || 0);
        const totalPrice = Number(item.total_price || 0);

        const paidQtyByDiff = rawQty - giftQty;
        const paidQtyByAmount = unitPrice > 0 ? totalPrice / unitPrice : 0;
        const paidQty = Number(Math.max(0, paidQtyByDiff > 0 ? paidQtyByDiff : paidQtyByAmount).toFixed(3));
        if (paidQty <= 0) continue;

        const orderPaymentType = orderPaymentTypeMap.get(orderId) || '';
        const itemPaymentType = (item as any).payment_type || orderPaymentType;
        const rawSubtype = item.price_subtype || orderCustomerSubtypeMap.get(orderId) || 'gros';
        const isInvoice = itemPaymentType === 'with_invoice';
        const subtype = isInvoice ? 'invoice' : rawSubtype;
        const itemPricingUnit = (item as any).pricing_unit || 'box';
        const itemWeightPerBox = Number((item as any).weight_per_box || 0);
        const itemPiecesPerBox = Number((item as any).pieces_per_box || 0);
        const lineTotal = totalPrice > 0 ? totalPrice : paidQty * unitPrice;

        if (!productMap[productName]) {
          productMap[productName] = {
            product_name: productName,
            quantity: 0,
            total_value: 0,
            pricing_rows: [],
          };
        }

        productMap[productName].quantity += paidQty;
        productMap[productName].total_value += lineTotal;

        const pricingRow = productMap[productName].pricing_rows.find(
          (r) =>
            r.subtype === subtype &&
            Math.abs(r.unit_price - unitPrice) < 0.01 &&
            (r.pricing_unit || 'box') === itemPricingUnit &&
            Math.abs(Number(r.weight_per_box || 0) - itemWeightPerBox) < 0.001 &&
            Number(r.pieces_per_box || 0) === itemPiecesPerBox,
        );

        if (pricingRow) {
          pricingRow.quantity += paidQty;
          pricingRow.total_value += lineTotal;
        } else {
          productMap[productName].pricing_rows.push({
            subtype,
            quantity: paidQty,
            unit_price: unitPrice,
            total_value: lineTotal,
            pricing_unit: itemPricingUnit,
            weight_per_box: itemWeightPerBox > 0 ? itemWeightPerBox : null,
            pieces_per_box: itemPiecesPerBox > 0 ? itemPiecesPerBox : null,
          });
        }
      }

      const soldProducts = Object.values(productMap)
        .filter((r) => r.quantity > 0)
        .sort((a, b) => b.total_value - a.total_value);

      const trackedTotal = soldProducts.reduce((s, r) => s + r.total_value, 0);
      const untrackedCount = orderIds.filter((id) => !trackedOrderIds.has(id)).length;

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

      // Fetch all loading sessions since period start (include unloading_details for unloaded sessions)
      const { data: sessions } = await supabase
        .from('loading_sessions')
        .select('id, status, created_at, unloading_details')
        .eq('worker_id', workerId)
        .gte('created_at', periodStartTz)
        .order('created_at', { ascending: false });

      const allSessions = (sessions || []) as any[];
      const loadCount = allSessions.filter(s => s.status === 'completed' || s.status === 'open').length;
      const unloadCount = allSessions.filter(s => s.status === 'unloaded').length;
      const reviewCount = allSessions.filter(s => s.status === 'review').length;

      const loadSessionIds = allSessions.filter(s => s.status === 'completed' || s.status === 'open').map(s => s.id);
      const unloadSessionIds = allSessions.filter(s => s.status === 'unloaded').map(s => s.id);
      const allSessionIds = allSessions.map(s => s.id);
      if (allSessionIds.length === 0) return { loadedMap: {} as Record<string, number>, unloadedMap: {} as Record<string, number>, loadCount: 0, unloadCount: 0, reviewCount: 0 };

      const { data: items } = await supabase
        .from('loading_session_items')
        .select('quantity, product:products(name), session_id')
        .in('session_id', allSessionIds);

      const loadedMap: Record<string, number> = {};
      const unloadedMap: Record<string, number> = {};
      const loadSet = new Set(loadSessionIds);
      const unloadSet = new Set(unloadSessionIds);
      
      // Track which unload sessions have items in loading_session_items
      const unloadSessionsWithItems = new Set<string>();
      
      for (const item of (items || [])) {
        const name = (item as any).product?.name || '';
        if (!name) continue;
        const qty = Number(item.quantity || 0);
        if (loadSet.has((item as any).session_id)) {
          loadedMap[name] = (loadedMap[name] || 0) + qty;
        } else if (unloadSet.has((item as any).session_id)) {
          unloadedMap[name] = (unloadedMap[name] || 0) + qty;
          unloadSessionsWithItems.add((item as any).session_id);
        }
      }

      // For unloaded sessions without loading_session_items, use unloading_details JSONB
      for (const session of allSessions) {
        if (session.status === 'unloaded' && !unloadSessionsWithItems.has(session.id) && session.unloading_details) {
          const details = Array.isArray(session.unloading_details) ? session.unloading_details : [];
          for (const detail of details) {
            const name = detail.product_name || '';
            if (!name) continue;
            const qty = Number(detail.return_qty || detail.actual_qty || 0) + Number(detail.surplus_qty || 0);
            if (qty > 0) {
              unloadedMap[name] = (unloadedMap[name] || 0) + qty;
            }
          }
        }
      }

      return { loadedMap, unloadedMap, loadCount, unloadCount, reviewCount };
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

  const subtypeLabels: Record<string, string> = {
    retail: 'تجزئة',
    gros: 'جملة',
    super_gros: 'سوبر جملة',
    invoice: 'فاتورة 1',
  };

  const getUnitSalePrice = (row: SoldProductPricingRow): number | null => {
    if (row.pricing_unit === 'kg' && row.weight_per_box && row.weight_per_box > 0) {
      return row.unit_price / row.weight_per_box;
    }
    if (row.pricing_unit === 'unit' && row.pieces_per_box && row.pieces_per_box > 0) {
      return row.unit_price / row.pieces_per_box;
    }
    return null;
  };

  const getUnitSaleLabel = (row: SoldProductPricingRow): string => {
    if (row.pricing_unit === 'kg') return 'دج/كغ';
    if (row.pricing_unit === 'unit') return 'دج/قطعة';
    return '-';
  };

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
  if (loadingData?.unloadedMap) Object.keys(loadingData.unloadedMap).forEach(n => allProductNames.add(n));
  if (salesPerProduct) Object.keys(salesPerProduct).forEach(n => allProductNames.add(n));
  if (reviewData?.items) Object.keys(reviewData.items).forEach(n => allProductNames.add(n));

  const productRows = Array.from(allProductNames).map(name => {
    const truckRow = truckStock?.find(r => r.product_name === name);
    const review = reviewData?.items?.[name];
    const loaded = loadingData?.loadedMap?.[name] || 0;
    const unloaded = loadingData?.unloadedMap?.[name] || 0;
    const sold = salesPerProduct?.[name] || 0;
    const systemQty = review ? review.systemQty : (truckRow?.quantity || 0);
    const actualQty = review ? review.actualQty : null;
    const diff = review ? review.diff : null;
    const status = diff === null ? null : Math.abs(diff) < 0.001 ? 'match' : diff > 0 ? 'surplus' : 'deficit';
    return { name, loaded, unloaded, sold, systemQty, actualQty, diff, status };
  }).filter(r => r.loaded > 0 || r.unloaded > 0 || r.sold > 0 || r.systemQty > 0 || r.actualQty !== null);

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

          <div className="grid grid-cols-7 gap-1 text-xs text-muted-foreground text-center font-medium border-b pb-1">
            <span className="text-start">{t('stock.product')}</span>
            <span>الشحن</span>
            <span>التفريغ</span>
            <span>المبيعات</span>
            <span>كمية النظام</span>
            <span>الكمية الفعلية</span>
            <span>المراجعة</span>
          </div>

          {productRows.map((row) => (
            <div key={row.name} className="grid grid-cols-7 gap-1 text-xs text-center items-center py-1.5 border-b border-dashed last:border-0">
              <span className="text-start font-medium text-wrap">{row.name}</span>
              <span className="font-bold text-green-600">{row.loaded > 0 ? fmtQty(row.loaded) : '-'}</span>
              <span className="font-bold text-destructive">{row.unloaded > 0 ? fmtQty(row.unloaded) : '-'}</span>
              <span className="font-bold text-blue-600">{row.sold > 0 ? fmtQty(row.sold) : '-'}</span>
              <span className="font-bold">{fmtQty(row.systemQty)}</span>
              <span className={`font-bold ${row.status === 'deficit' ? 'text-destructive' : row.status === 'surplus' ? 'text-orange-600' : ''}`}>
                {row.actualQty !== null ? fmtQty(row.actualQty) : '-'}
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
                    عجز ({fmtQty(Math.abs(row.diff!))})
                  </Badge>
                )}
                {row.status === 'surplus' && (
                  <Badge className="text-[10px] bg-orange-500 text-white" dir="rtl">
                    <TrendingUp className="w-2.5 h-2.5 me-1" />
                    فائض ({fmtQty(Math.abs(row.diff!))})
                  </Badge>
                )}
                {row.status === null && (
                  <span className="text-muted-foreground">-</span>
                )}
              </span>
            </div>
          ))}

          <div className="grid grid-cols-7 gap-1 text-xs text-center font-bold border-t-2 pt-1 bg-primary/5 rounded p-1.5">
            <span className="text-start">{t('common.total')}</span>
            <span className="text-green-600">{productRows.reduce((s, r) => s + r.loaded, 0) ? fmtQty(productRows.reduce((s, r) => s + r.loaded, 0)) : '-'}</span>
            <span className="text-destructive">{productRows.reduce((s, r) => s + r.unloaded, 0) ? fmtQty(productRows.reduce((s, r) => s + r.unloaded, 0)) : '-'}</span>
            <span className="text-blue-600">{productRows.reduce((s, r) => s + r.sold, 0) ? fmtQty(productRows.reduce((s, r) => s + r.sold, 0)) : '-'}</span>
            <span>{fmtQty(totalTruckQty)}</span>
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

      {/* Sales Tracking (with pricing breakdown per product) */}
      {soldProducts && soldProducts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingBag className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">{t('accounting.sales_tracking')}</span>
          </div>

          {soldProducts.map((row) => (
            <Collapsible key={row.product_name} defaultOpen>
              <div className="border rounded-lg overflow-hidden">
                <CollapsibleTrigger className="w-full flex items-center justify-between p-2 text-start hover:bg-muted/30 transition-colors">
                  <span className="font-medium text-sm text-wrap">{row.product_name}</span>
                  <span className="flex items-center gap-1.5 shrink-0 ms-2">
                    <span className="text-xs text-muted-foreground">{fmtQty(row.quantity)} صندوق</span>
                    <span className="text-xs font-bold">{row.total_value.toLocaleString()} DA</span>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </span>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="border-t p-1.5 space-y-1">
                    <div className="grid grid-cols-5 gap-1 text-[10px] text-muted-foreground text-center font-medium border-b pb-1">
                      <span className="text-start">التسعير</span>
                      <span>{t('stock.quantity')}</span>
                      <span>سعر الصندوق</span>
                      <span>سعر الوحدة</span>
                      <span>{t('accounting.total_value')}</span>
                    </div>

                    {row.pricing_rows
                      .sort((a, b) => b.quantity - a.quantity)
                      .map((pricingRow, idx) => {
                        const unitSalePrice = getUnitSalePrice(pricingRow);
                        const unitSaleLabel = getUnitSaleLabel(pricingRow);

                        return (
                          <div key={`${row.product_name}-${idx}`} className="grid grid-cols-5 gap-1 text-xs text-center items-center py-1 border-b border-dashed last:border-0">
                            <span className="text-start">
                              <Badge variant="secondary" className="text-[10px] px-1.5">
                                {subtypeLabels[pricingRow.subtype] || pricingRow.subtype}
                              </Badge>
                            </span>
                            <span className="font-bold">{fmtQty(pricingRow.quantity)}</span>
                            <span className="text-muted-foreground">{pricingRow.unit_price.toLocaleString()}</span>
                            <span className="text-muted-foreground">
                              {unitSalePrice !== null
                                ? `${unitSalePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unitSaleLabel}`
                                : '-'}
                            </span>
                            <span className="font-semibold">{pricingRow.total_value.toLocaleString()}</span>
                          </div>
                        );
                      })}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}

          <div className="grid grid-cols-2 gap-2 text-xs text-center font-bold border-t-2 pt-1 bg-primary/5 rounded p-1.5">
            <span className="text-start">{t('common.total')}: {fmtQty(totalSoldQty)} صندوق</span>
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