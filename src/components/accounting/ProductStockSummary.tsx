import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, Package, Truck, ShoppingBag, PackageX } from 'lucide-react';
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

  // Fetch sold products from stock_movements (delivery type) AND orders for totals
  const { data: salesData, isLoading: soldLoading } = useQuery({
    queryKey: ['sold-products-summary', workerId, periodStart, periodEnd],
    queryFn: async () => {
      const periodStartTz = toTz(periodStart, false);
      const periodEndTz = toTz(periodEnd, true);

      // Get delivered orders total
      const { data: orders } = await supabase
        .from('orders')
        .select('id, total_amount')
        .eq('assigned_worker_id', workerId)
        .eq('status', 'delivered')
        .gte('updated_at', periodStartTz)
        .lte('updated_at', periodEndTz);

      const ordersTotalSales = orders?.reduce((s, o) => s + Number(o.total_amount || 0), 0) || 0;
      const orderIds = orders?.map(o => o.id) || [];

      // Get delivery movements for this worker in period
      const { data: movements } = await supabase
        .from('stock_movements')
        .select('order_id, quantity, product:products(name, price_gros, price_super_gros, price_invoice, price_retail, pricing_unit, weight_per_box, pieces_per_box)')
        .eq('worker_id', workerId)
        .eq('movement_type', 'delivery')
        .gte('created_at', periodStartTz)
        .lte('created_at', periodEndTz);

      // Aggregate by product
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
            product_name: name,
            quantity: 0,
            unit_price: rawPrice,
            box_price: boxPrice,
            total_value: 0,
            selling_unit: pricingUnit,
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

  return (
    <div className="space-y-4">
      {/* Current Truck Stock */}
      {truckStock && truckStock.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Truck className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">{t('accounting.truck_stock')}</span>
          </div>

          <div className="grid grid-cols-5 gap-1 text-xs text-muted-foreground text-center font-medium border-b pb-1">
            <span className="text-start">{t('stock.product')}</span>
            <span>{t('stock.quantity')}</span>
            <span>{t('accounting.unit_price')}</span>
            <span>{t('accounting.box_price')}</span>
            <span>{t('accounting.total_value')}</span>
          </div>

          {truckStock.map((row) => (
            <div key={row.product_name} className="grid grid-cols-5 gap-1 text-xs text-center items-center py-1 border-b border-dashed last:border-0">
              <span className="text-start font-medium text-wrap">{row.product_name}</span>
              <span className="font-bold">{row.quantity}</span>
              <span className="text-muted-foreground">{row.raw_unit_price.toLocaleString()}</span>
              <span>{row.unit_price.toLocaleString()}</span>
              <span className="font-bold">{row.total_value.toLocaleString()}</span>
            </div>
          ))}

          <div className="grid grid-cols-5 gap-1 text-xs text-center font-bold border-t-2 pt-1 bg-primary/5 rounded p-1.5">
            <span className="text-start">{t('common.total')}</span>
            <span>{totalTruckQty}</span>
            <span>-</span>
            <span>-</span>
            <span className="text-primary">{totalTruckValue.toLocaleString()} DA</span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEmptyTruck(true)}
            className="w-full mt-2 text-destructive border-destructive/30 hover:bg-destructive/5"
          >
            <PackageX className="w-4 h-4 ml-2" />
            {t('stock.empty_truck')}
          </Button>
        </div>
      )}

      {truckStock && truckStock.length === 0 && (
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