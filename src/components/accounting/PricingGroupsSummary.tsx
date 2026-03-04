import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, Package, AlertTriangle } from 'lucide-react';
import { inferPricingSubtype, PricingSubtype } from '@/utils/pricingSubtype';

interface PricingGroupsSummaryProps {
  workerId: string;
  periodStart: string;
  periodEnd: string;
  /** If provided, skip fetching and use this data directly */
  preloadedData?: PricingGroupData[];
}

export interface PricingGroupData {
  subtype: string;
  label: string;
  abbr: string;
  colorClass: string;
  totalQuantity: number;
  totalValue: number;
  products: PricingGroupProduct[];
}

export interface PricingGroupProduct {
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  isCustomPrice: boolean;
  catalogPrice: number | null;
}

const SUBTYPE_META: Record<string, { label: string; abbr: string; colorClass: string; order: number }> = {
  invoice: { label: 'فاتورة 1', abbr: 'F1', colorClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', order: 0 },
  super_gros: { label: 'سوبر جملة', abbr: 'SG', colorClass: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', order: 1 },
  gros: { label: 'جملة', abbr: 'G', colorClass: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', order: 2 },
  retail: { label: 'تجزئة', abbr: 'D', colorClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', order: 3 },
  custom: { label: 'أسعار مخصصة', abbr: '⚡', colorClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', order: 4 },
};

const fmt = (n: number) => n.toLocaleString();
const fmtQty = (v: number): string => {
  const rounded = Math.round(v * 100) / 100;
  if (rounded === Math.floor(rounded)) return rounded.toString();
  return rounded.toFixed(2).replace(/0+$/, '');
};

const toNumber = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const getBoxMultiplier = (pricingUnit?: string | null, weightPerBox?: number | null, piecesPerBox?: number | null): number => {
  if (pricingUnit === 'kg') return Math.max(1, toNumber(weightPerBox));
  if (pricingUnit === 'unit') return Math.max(1, toNumber(piecesPerBox));
  return 1;
};

export function buildPricingGroups(items: any[], orders: any[]): PricingGroupData[] {
  const orderPaymentTypeMap = new Map(orders.map((o: any) => [o.id, o.payment_type || '']));
  const orderCustomerSubtypeMap = new Map(orders.map((o: any) => [o.id, (o as any).customer?.default_price_subtype || 'gros']));

  // Group by subtype, detect custom prices
  const groups: Record<string, PricingGroupProduct[]> = {};
  const customProducts: PricingGroupProduct[] = [];

  for (const item of items) {
    const prod = (item as any).product;
    const productName = prod?.name || 'منتج غير معروف';
    const rawQty = Number(item.quantity || 0);
    const giftQty = Number(item.gift_quantity || 0);
    const unitPrice = Number(item.unit_price || 0);
    const totalPrice = Number(item.total_price || 0);
    const paidQty = Math.max(0, rawQty - giftQty);
    if (paidQty <= 0) continue;

    const orderPaymentType = orderPaymentTypeMap.get(item.order_id) || '';
    const itemPaymentType = (item as any).payment_type || orderPaymentType;
    const itemPricingUnit = (item as any).pricing_unit || 'box';
    const itemWeightPerBox = Number((item as any).weight_per_box || 0);
    const itemPiecesPerBox = Number((item as any).pieces_per_box || 0);

    const subtype = inferPricingSubtype({
      itemPaymentType,
      unitPrice,
      explicitSubtype: (item as any).price_subtype || null,
      fallbackSubtype: orderCustomerSubtypeMap.get(item.order_id) || 'gros',
      product: prod || null,
      pricingUnit: itemPricingUnit,
      weightPerBox: itemWeightPerBox > 0 ? itemWeightPerBox : null,
      piecesPerBox: itemPiecesPerBox > 0 ? itemPiecesPerBox : null,
    });

    // Detect custom price (doesn't match any catalog price)
    const multiplier = getBoxMultiplier(
      itemPricingUnit || prod?.pricing_unit,
      itemWeightPerBox || prod?.weight_per_box,
      itemPiecesPerBox || prod?.pieces_per_box
    );

    const catalogPrices = [
      toNumber(prod?.price_retail) * multiplier,
      toNumber(prod?.price_gros) * multiplier,
      toNumber(prod?.price_super_gros) * multiplier,
      toNumber(prod?.price_invoice) * multiplier,
    ].filter(p => p > 0);

    const isCustomPrice = catalogPrices.length > 0 && !catalogPrices.some(cp => Math.abs(cp - unitPrice) < 1);
    
    // Get expected catalog price for this subtype
    let catalogPrice: number | null = null;
    if (subtype === 'retail') catalogPrice = toNumber(prod?.price_retail) * multiplier || null;
    else if (subtype === 'gros') catalogPrice = toNumber(prod?.price_gros) * multiplier || null;
    else if (subtype === 'super_gros') catalogPrice = toNumber(prod?.price_super_gros) * multiplier || null;
    else if (subtype === 'invoice') catalogPrice = toNumber(prod?.price_invoice) * multiplier || null;

    const lineTotal = totalPrice > 0 ? totalPrice : paidQty * unitPrice;

    const entry: PricingGroupProduct = {
      productName,
      quantity: paidQty,
      unitPrice,
      total: lineTotal,
      isCustomPrice,
      catalogPrice,
    };

    // Add to subtype group
    if (!groups[subtype]) groups[subtype] = [];
    
    // Merge with existing product in same group with same price
    const existing = groups[subtype].find(e => e.productName === productName && Math.abs(e.unitPrice - unitPrice) < 0.01);
    if (existing) {
      existing.quantity += paidQty;
      existing.total += lineTotal;
    } else {
      groups[subtype].push({ ...entry });
    }

    // Also add to custom if applicable
    if (isCustomPrice) {
      const existingCustom = customProducts.find(e => e.productName === productName && Math.abs(e.unitPrice - unitPrice) < 0.01);
      if (existingCustom) {
        existingCustom.quantity += paidQty;
        existingCustom.total += lineTotal;
      } else {
        customProducts.push({ ...entry });
      }
    }
  }

  const result: PricingGroupData[] = [];

  for (const [subtype, products] of Object.entries(groups)) {
    const meta = SUBTYPE_META[subtype] || SUBTYPE_META.gros;
    result.push({
      subtype,
      label: meta.label,
      abbr: meta.abbr,
      colorClass: meta.colorClass,
      totalQuantity: products.reduce((s, p) => s + p.quantity, 0),
      totalValue: products.reduce((s, p) => s + p.total, 0),
      products: products.sort((a, b) => b.total - a.total),
    });
  }

  // Add custom prices group if any
  if (customProducts.length > 0) {
    const meta = SUBTYPE_META.custom;
    result.push({
      subtype: 'custom',
      label: meta.label,
      abbr: meta.abbr,
      colorClass: meta.colorClass,
      totalQuantity: customProducts.reduce((s, p) => s + p.quantity, 0),
      totalValue: customProducts.reduce((s, p) => s + p.total, 0),
      products: customProducts.sort((a, b) => b.total - a.total),
    });
  }

  // Sort by order
  result.sort((a, b) => (SUBTYPE_META[a.subtype]?.order ?? 99) - (SUBTYPE_META[b.subtype]?.order ?? 99));

  return result;
}

const PricingGroupCard: React.FC<{ group: PricingGroupData }> = ({ group }) => {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="border rounded-xl overflow-hidden">
        <CollapsibleTrigger className="w-full flex items-center gap-2 p-3 hover:bg-muted/30 transition-colors">
          <Badge className={`${group.colorClass} text-xs font-bold px-2 py-0.5 shrink-0`}>
            {group.abbr}
          </Badge>
          <span className="font-semibold text-sm flex-1 text-start">{group.label}</span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">{fmtQty(group.totalQuantity)} صندوق</span>
            <span className="text-xs font-bold">{fmt(Math.round(group.totalValue))} DA</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t px-2 py-1.5 space-y-0.5">
            {/* Header */}
            <div className="grid grid-cols-4 gap-1 text-[10px] text-muted-foreground font-medium pb-1 border-b px-1">
              <span>المنتج</span>
              <span className="text-center">الكمية</span>
              <span className="text-center">السعر</span>
              <span className="text-center">المجموع</span>
            </div>
            {group.products.map((product, idx) => (
              <div key={idx} className="grid grid-cols-4 gap-1 text-xs items-center py-1.5 px-1 border-b border-dashed last:border-0">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="truncate">{product.productName}</span>
                  {product.isCustomPrice && group.subtype !== 'custom' && (
                    <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                  )}
                </div>
                <span className="text-center font-bold">{fmtQty(product.quantity)}</span>
                <div className="text-center">
                  <span className="text-muted-foreground">{fmt(product.unitPrice)}</span>
                  {product.isCustomPrice && product.catalogPrice && (
                    <span className="block text-[9px] text-amber-600 line-through">{fmt(product.catalogPrice)}</span>
                  )}
                </div>
                <span className="text-center font-semibold">{fmt(Math.round(product.total))}</span>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

const PricingGroupsSummary: React.FC<PricingGroupsSummaryProps> = ({
  workerId, periodStart, periodEnd, preloadedData,
}) => {
  const { data: fetchedData, isLoading } = useQuery({
    queryKey: ['pricing-groups', workerId, periodStart, periodEnd],
    queryFn: async () => {
      const toTz = (v: string, isEnd: boolean) => {
        if (v.includes('+') || v.includes('Z')) return v;
        if (v.includes('T')) return v + ':00+01:00';
        return isEnd ? v + 'T23:59:59+01:00' : v + 'T00:00:00+01:00';
      };
      const startTz = toTz(periodStart, false);
      const endTz = toTz(periodEnd, true);

      // Fetch delivered orders via stock_movements
      const { data: movements } = await supabase
        .from('stock_movements')
        .select('order_id')
        .eq('worker_id', workerId)
        .eq('movement_type', 'delivery')
        .eq('status', 'approved')
        .gte('created_at', startTz)
        .lte('created_at', endTz);

      const orderIds = [...new Set((movements || []).map(m => m.order_id).filter(Boolean))];
      if (!orderIds.length) return [];

      const { data: orders } = await supabase
        .from('orders')
        .select('id, payment_type, customer:customers(default_price_subtype)')
        .in('id', orderIds)
        .eq('assigned_worker_id', workerId)
        .eq('status', 'delivered');

      const { data: items } = await supabase
        .from('order_items')
        .select('order_id, product_id, quantity, gift_quantity, unit_price, total_price, price_subtype, payment_type, pricing_unit, weight_per_box, pieces_per_box, product:products(name, price_retail, price_gros, price_super_gros, price_invoice, pricing_unit, weight_per_box, pieces_per_box)')
        .in('order_id', orderIds);

      return buildPricingGroups(items || [], orders || []);
    },
    enabled: !preloadedData && !!workerId,
  });

  const groups = preloadedData || fetchedData;

  if (isLoading && !preloadedData) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!groups || groups.length === 0) {
    return <p className="text-center text-muted-foreground py-6 text-sm">لا توجد بيانات</p>;
  }

  const grandTotal = groups.filter(g => g.subtype !== 'custom').reduce((s, g) => s + g.totalValue, 0);
  const customGroup = groups.find(g => g.subtype === 'custom');

  return (
    <div className="space-y-2">
      {/* Summary badges */}
      <div className="flex flex-wrap gap-1.5 pb-1">
        {groups.filter(g => g.subtype !== 'custom').map(g => (
          <Badge key={g.subtype} className={`${g.colorClass} text-[10px] font-bold`}>
            {g.abbr}: {fmtQty(g.totalQuantity)} ({fmt(Math.round(g.totalValue))} DA)
          </Badge>
        ))}
      </div>

      {/* Group cards */}
      {groups.map(g => (
        <PricingGroupCard key={g.subtype} group={g} />
      ))}

      {/* Grand total */}
      <div className="flex items-center justify-between text-xs font-bold border-t-2 pt-2 px-1">
        <span>الإجمالي</span>
        <span className="text-primary">{fmt(Math.round(grandTotal))} DA</span>
      </div>

      {customGroup && (
        <div className="flex items-center gap-1.5 text-[10px] text-amber-600 px-1">
          <AlertTriangle className="w-3 h-3" />
          <span>{customGroup.products.length} منتج بسعر مخصص مختلف عن الكتالوج</span>
        </div>
      )}
    </div>
  );
};

export default PricingGroupsSummary;
