import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { fetchSessionCalculations, SessionCalculations } from '@/hooks/useSessionCalculations';
import { Banknote, Calendar, ClipboardList, Gift, HandCoins, Package, ShoppingBag, TrendingDown, Wallet } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branchId?: string | null;
  workers?: WorkerInfo[];
}

interface ContentProps {
  branchId?: string | null;
  workers?: WorkerInfo[];
}

interface WorkerInfo {
  id: string;
  full_name: string;
  username: string;
}

interface CustomerBreakdown {
  customerId: string;
  customerName: string;
  storeName: string | null;
  phone: string | null;
  deliveryTime: string | null;
  quantity: number;
  giftQuantity: number;
  totalAmount: number;
}

interface ProductAgg {
  productId: string;
  name: string;
  quantity: number;
  giftQuantity: number;
  totalAmount: number;
  piecesPerBox: number | null;
  imageUrl: string | null;
  warehouseQuantity?: number;
  workerStockQuantity?: number;
  workerStockByWorker?: Record<string, number>;
  customers: CustomerBreakdown[];
}

interface WorkerSummary {
  worker: WorkerInfo;
  lastAccounting: string | null;
  periodStart: string;
  periodEnd: string;
  orderCount: number;
  items: ProductAgg[];
  firstOrderTime: string | null;
  lastOrderTime: string | null;
  calc: SessionCalculations;
  managerReceivedAmount: number;
}

interface AggregateSummary {
  workerLabel: string;
  orderCount: number;
  items: ProductAgg[];
  firstOrderTime: string | null;
  lastOrderTime: string | null;
  calc: SessionCalculations;
  managerReceivedAmount: number;
}

interface SummaryFinance {
  nonCashCollected: number;
  workerHeldAmount: number;
}

const WORK_DAYS = [
  { key: 'saturday', label: 'السبت', jsDay: 6 },
  { key: 'sunday', label: 'الأحد', jsDay: 0 },
  { key: 'monday', label: 'الاثنين', jsDay: 1 },
  { key: 'tuesday', label: 'الثلاثاء', jsDay: 2 },
  { key: 'wednesday', label: 'الأربعاء', jsDay: 3 },
  { key: 'thursday', label: 'الخميس', jsDay: 4 },
] as const;

const calcOrderTotal = (order: any, items: any[]) => {
  const storedTotal = Number(order?.total_amount || 0);
  if (storedTotal > 0) return storedTotal;
  return items.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
};

const getOrderPaidAmount = (order: any, totalAmount: number) => {
  const paymentStatus = String(order?.payment_status || 'pending').toLowerCase();
  if (paymentStatus === 'debt') return 0;
  if (paymentStatus === 'partial') return Number(order?.partial_amount || 0);
  return totalAmount;
};

const buildCalcFromOrders = (orders: any[], items: any[]): SessionCalculations => {
  const calc = emptyCalc();
  const itemsByOrder = new Map<string, any[]>();

  for (const item of items) {
    const current = itemsByOrder.get(item.order_id) || [];
    current.push(item);
    itemsByOrder.set(item.order_id, current);
  }

  for (const order of orders) {
    const orderItems = itemsByOrder.get(order.id) || [];
    const totalAmount = calcOrderTotal(order, orderItems);
    calc.totalSales += totalAmount;

    const paidAmount = getOrderPaidAmount(order, totalAmount);
    const paymentStatus = String(order.payment_status || 'pending').toLowerCase();

    const debtAmount = Math.max(0, totalAmount - paidAmount);
    calc.totalPaid += paidAmount;
    calc.newDebts += debtAmount;

    if (paidAmount > 0) {
      const paymentType = order.payment_type || 'without_invoice';
      const invoiceMethod = String(order.invoice_payment_method || '').toLowerCase();
      const docVerification = order.document_verification && typeof order.document_verification === 'object'
        ? order.document_verification
        : null;
      const paidByCash = docVerification?.paid_by_cash === true;

      if (paymentType === 'with_invoice') {
        calc.invoice1.total += paidAmount;
        if (paymentStatus === 'check' || invoiceMethod === 'check') calc.invoice1.check += paidAmount;
        else if ((invoiceMethod === 'receipt' || invoiceMethod === 'transfer') && paidByCash) calc.invoice1.versementCash += paidAmount;
        else if (invoiceMethod === 'transfer' || invoiceMethod === 'virement') calc.invoice1.transfer += paidAmount;
        else if (invoiceMethod === 'receipt' || invoiceMethod === 'versement') calc.invoice1.receipt += paidAmount;
        else calc.invoice1.espaceCash += paidAmount;
      } else {
        calc.invoice2.total += paidAmount;
        calc.invoice2.cash += paidAmount;
      }
    }

    for (const item of orderItems) {
      const giftQty = Number(item.gift_quantity || 0);
      const qty = Number(item.quantity || 0);
      const totalPrice = Number(item.total_price || 0);
      if (giftQty <= 0 || qty <= 0) continue;
      const estimatedUnit = totalPrice > 0 ? totalPrice / qty : Number(item.unit_price || 0);
      calc.giftOfferValue += giftQty * estimatedUnit;
    }
  }

  calc.physicalCash = calc.invoice2.cash + calc.invoice1.espaceCash + calc.invoice1.versementCash;
  return calc;
};

const emptyCalc = (): SessionCalculations => ({
  totalSales: 0,
  totalPaid: 0,
  newDebts: 0,
  invoice1: { total: 0, check: 0, transfer: 0, receipt: 0, espaceCash: 0, versementCash: 0 },
  invoice2: { total: 0, cash: 0 },
  debtCollections: { total: 0, cash: 0, check: 0, transfer: 0, receipt: 0 },
  physicalCash: 0,
  expenses: 0,
  cashExpenses: 0,
  salesDebtCollectionsCash: 0,
  salesDebtCollectionsNonCash: 0,
  giftOfferValue: 0,
  promoTracking: [],
  customerSurplusCash: 0,
});

const fmtMoney = (value: number) => `${value.toLocaleString('ar-DZ')} د.ج`;

const formatGiftDisplay = (giftPieces: number, piecesPerBox: number) => {
  if (giftPieces <= 0) return '0.00';
  if (piecesPerBox <= 1) return `0.${giftPieces.toString().padStart(2, '0')}`;
  const boxes = Math.floor(giftPieces / piecesPerBox);
  const remainingPieces = giftPieces % piecesPerBox;
  return `${boxes}.${remainingPieces.toString().padStart(2, '0')}`;
};

const SETTLEMENT_ITEM_TYPES = new Set([
  'physical_cash',
  'invoice1_check',
  'invoice1_transfer',
  'invoice1_receipt',
  'debt_collections_check',
  'debt_collections_transfer',
  'debt_collections_receipt',
]);

const mergeCalcs = (calcs: SessionCalculations[]): SessionCalculations => {
  const merged = emptyCalc();

  for (const calc of calcs) {
    merged.totalSales += calc.totalSales;
    merged.totalPaid += calc.totalPaid;
    merged.newDebts += calc.newDebts;
    merged.invoice1.total += calc.invoice1.total;
    merged.invoice1.check += calc.invoice1.check;
    merged.invoice1.transfer += calc.invoice1.transfer;
    merged.invoice1.receipt += calc.invoice1.receipt;
    merged.invoice1.espaceCash += calc.invoice1.espaceCash;
    merged.invoice1.versementCash += calc.invoice1.versementCash;
    merged.invoice2.total += calc.invoice2.total;
    merged.invoice2.cash += calc.invoice2.cash;
    merged.debtCollections.total += calc.debtCollections.total;
    merged.debtCollections.cash += calc.debtCollections.cash;
    merged.debtCollections.check += calc.debtCollections.check;
    merged.debtCollections.transfer += calc.debtCollections.transfer;
    merged.debtCollections.receipt += calc.debtCollections.receipt;
    merged.physicalCash += calc.physicalCash;
    merged.expenses += calc.expenses;
    merged.cashExpenses += calc.cashExpenses;
    merged.salesDebtCollectionsCash += calc.salesDebtCollectionsCash;
    merged.salesDebtCollectionsNonCash += calc.salesDebtCollectionsNonCash;
    merged.giftOfferValue += calc.giftOfferValue;
    merged.customerSurplusCash += calc.customerSurplusCash;
    merged.promoTracking.push(...calc.promoTracking);
  }

  return merged;
};

const mergeProducts = (summaries: WorkerSummary[]): ProductAgg[] => {
  const map = new Map<string, ProductAgg>();

  for (const summary of summaries) {
    for (const item of summary.items) {
      if (!map.has(item.productId)) {
        map.set(item.productId, {
          productId: item.productId,
          name: item.name,
          quantity: 0,
          giftQuantity: 0,
          totalAmount: 0,
          piecesPerBox: item.piecesPerBox,
          imageUrl: item.imageUrl,
          customers: [],
          workerStockByWorker: { ...(item.workerStockByWorker || {}) },
        });
      }

      const current = map.get(item.productId)!;
      current.quantity += item.quantity;
      current.giftQuantity += item.giftQuantity;
      current.totalAmount += item.totalAmount;
      current.warehouseQuantity = item.warehouseQuantity ?? current.warehouseQuantity ?? 0;
      current.workerStockQuantity = item.workerStockQuantity ?? current.workerStockQuantity ?? 0;
      current.workerStockByWorker = {
        ...(current.workerStockByWorker || {}),
        ...(item.workerStockByWorker || {}),
      };

      for (const customer of item.customers) {
        const existing = current.customers.find((c) => c.customerId === customer.customerId);
        if (existing) {
          existing.quantity += customer.quantity;
          existing.giftQuantity += customer.giftQuantity;
          existing.totalAmount += customer.totalAmount;
          existing.deliveryTime = existing.deliveryTime || customer.deliveryTime;
        } else {
          current.customers.push({ ...customer });
        }
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
};

const getSummaryFinance = (calc: SessionCalculations): SummaryFinance => {
  const nonCashCollected =
    calc.invoice1.check +
    calc.invoice1.transfer +
    calc.invoice1.receipt +
    calc.debtCollections.check +
    calc.debtCollections.transfer +
    calc.debtCollections.receipt;

  return {
    nonCashCollected,
    workerHeldAmount: calc.physicalCash + nonCashCollected,
  };
};

const fetchWorkerSalesSummary = async (
  workerId: string,
  periodStart?: string | null,
  periodEnd?: string | null,
  lastAccounting?: string | null,
  branchId?: string | null,
) => {
  const baseQuery = () =>
    supabase
      .from('orders')
      .select('id, status, payment_type, created_at, updated_at, customer_id')
      .in('status', ['delivered', 'completed', 'confirmed'])
      .or(`assigned_worker_id.eq.${workerId},created_by.eq.${workerId}`);

  let orders: any[] = [];

  if (periodStart && periodEnd) {
    const [{ data: createdOrders, error: createdError }, { data: updatedOrders, error: updatedError }] = await Promise.all([
      baseQuery().gte('created_at', periodStart).lte('created_at', periodEnd),
      baseQuery().gte('updated_at', periodStart).lte('updated_at', periodEnd),
    ]);

    if (createdError) throw createdError;
    if (updatedError) throw updatedError;

    const ordersMap = new Map<string, any>();
    for (const order of createdOrders || []) ordersMap.set(order.id, order);
    for (const order of updatedOrders || []) ordersMap.set(order.id, order);
    orders = Array.from(ordersMap.values());
  } else {
    let query = baseQuery();
    if (lastAccounting) {
      query = query.gte('updated_at', lastAccounting);
    }
    const { data: fallbackOrders, error } = await query;
    if (error) throw error;
    orders = fallbackOrders || [];
  }

  if (orders.length === 0) {
    return { items: [] as ProductAgg[], orderCount: 0, firstOrderTime: null, lastOrderTime: null };
  }

      const orderIds = orders.map((o) => o.id);
  const orderCustomerMap = new Map(orders.map((o) => [o.id, o.customer_id]));
  const orderTimeMap = new Map(orders.map((o) => [o.id, o.updated_at]));

  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('order_id, product_id, quantity, gift_quantity, unit_price, total_price, product:products(name, pieces_per_box, image_url)')
    .in('order_id', orderIds);

  if (itemsError) throw itemsError;

  const productIds = [...new Set((items || []).map((item) => item.product_id).filter(Boolean))];
  const [warehouseStockResult, workerStockResult] = await Promise.all([
    productIds.length > 0
      ? (() => {
          let query = supabase
            .from('warehouse_stock')
            .select('product_id, quantity');
          if (branchId) query = query.eq('branch_id', branchId);
          return query.in('product_id', productIds);
        })()
      : Promise.resolve({ data: [], error: null } as any),
    productIds.length > 0
      ? (() => {
          let query = supabase
            .from('worker_stock')
            .select('product_id, quantity, worker_id');
          if (branchId) query = query.eq('branch_id', branchId);
          return query.in('product_id', productIds);
        })()
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (warehouseStockResult.error) throw warehouseStockResult.error;
  if (workerStockResult.error) throw workerStockResult.error;

  const warehouseQtyMap = new Map<string, number>();
  for (const row of warehouseStockResult.data || []) {
    warehouseQtyMap.set(row.product_id, (warehouseQtyMap.get(row.product_id) || 0) + Number(row.quantity || 0));
  }

  const workerStockQtyMap = new Map<string, number>();
  const workerStockByWorkerMap = new Map<string, Record<string, number>>();
  for (const row of workerStockResult.data || []) {
    workerStockQtyMap.set(row.product_id, (workerStockQtyMap.get(row.product_id) || 0) + Number(row.quantity || 0));
    const current = workerStockByWorkerMap.get(row.product_id) || {};
    current[row.worker_id] = (current[row.worker_id] || 0) + Number(row.quantity || 0);
    workerStockByWorkerMap.set(row.product_id, current);
  }

  const customerIds = [...new Set(orders.map((o) => o.customer_id).filter(Boolean))];
  const { data: customers } = customerIds.length > 0
    ? await supabase.from('customers').select('id, name, store_name, phone').in('id', customerIds)
    : { data: [] };

  const customerNameMap = new Map((customers || []).map((c) => [c.id, c.name]));
  const customerStoreMap = new Map((customers || []).map((c) => [c.id, c.store_name || null]));
  const customerPhoneMap = new Map((customers || []).map((c) => [c.id, c.phone || null]));

  const agg: Record<string, ProductAgg> = {};

  for (const item of items || []) {
    const customerId = orderCustomerMap.get(item.order_id) || 'unknown';
    const product = (item as any).product;
    if (!agg[item.product_id]) {
      agg[item.product_id] = {
        productId: item.product_id,
        name: product?.name || 'منتج غير معروف',
        quantity: 0,
        giftQuantity: 0,
        totalAmount: 0,
        piecesPerBox: product?.pieces_per_box || null,
        imageUrl: product?.image_url || null,
        warehouseQuantity: warehouseQtyMap.get(item.product_id) || 0,
        workerStockQuantity: workerStockQtyMap.get(item.product_id) || 0,
        workerStockByWorker: workerStockByWorkerMap.get(item.product_id) || {},
        customers: [],
      };
    }

    agg[item.product_id].quantity += Number(item.quantity || 0);
    agg[item.product_id].giftQuantity += Number(item.gift_quantity || 0);
    agg[item.product_id].totalAmount += Number(item.total_price || 0);

    const existing = agg[item.product_id].customers.find((c) => c.customerId === customerId);
    if (existing) {
      existing.quantity += Number(item.quantity || 0);
      existing.giftQuantity += Number(item.gift_quantity || 0);
      existing.totalAmount += Number(item.total_price || 0);
    } else {
      agg[item.product_id].customers.push({
        customerId,
        customerName: customerNameMap.get(customerId) || 'عميل غير معروف',
        storeName: customerStoreMap.get(customerId) || null,
        phone: customerPhoneMap.get(customerId) || null,
        deliveryTime: orderTimeMap.get(item.order_id) || null,
        quantity: Number(item.quantity || 0),
        giftQuantity: Number(item.gift_quantity || 0),
        totalAmount: Number(item.total_price || 0),
      });
    }
  }

  const createdTimes = orders.map((o) => new Date(o.created_at).getTime());
  const updatedTimes = orders.map((o) => new Date(o.updated_at).getTime());
  const calc = buildCalcFromOrders(orders, items || []);

  return {
    items: Object.values(agg).sort((a, b) => b.totalAmount - a.totalAmount),
    orderCount: orders.length,
    firstOrderTime: createdTimes.length ? new Date(Math.min(...createdTimes)).toISOString() : null,
    lastOrderTime: updatedTimes.length ? new Date(Math.max(...updatedTimes)).toISOString() : null,
    calc,
  };
};

const buildAggregateSummary = (workerSummaries: WorkerSummary[], selectedWorkerId: string): AggregateSummary => {
  if (selectedWorkerId !== 'all') {
    const workerSummary = workerSummaries.find((item) => item.worker.id === selectedWorkerId);
    if (workerSummary) {
      return {
        workerLabel: workerSummary.worker.full_name || workerSummary.worker.username,
        orderCount: workerSummary.orderCount,
        items: workerSummary.items,
        firstOrderTime: workerSummary.firstOrderTime,
        lastOrderTime: workerSummary.lastOrderTime,
        calc: workerSummary.calc,
      };
    }
  }

  const firstTimes = workerSummaries.map((w) => w.firstOrderTime).filter(Boolean).map((v) => new Date(v!).getTime());
  const lastTimes = workerSummaries.map((w) => w.lastOrderTime).filter(Boolean).map((v) => new Date(v!).getTime());

  return {
    workerLabel: 'الكل',
    orderCount: workerSummaries.reduce((sum, item) => sum + item.orderCount, 0),
    items: mergeProducts(workerSummaries),
    firstOrderTime: firstTimes.length ? new Date(Math.min(...firstTimes)).toISOString() : null,
    lastOrderTime: lastTimes.length ? new Date(Math.max(...lastTimes)).toISOString() : null,
    calc: mergeCalcs(workerSummaries.map((item) => item.calc)),
  };
};

const getWorkerButtonClass = (isActive: boolean) =>
  isActive
    ? 'h-10 shrink-0 rounded-full border border-red-500 bg-red-500 px-4 text-sm font-semibold text-white shadow-sm hover:bg-red-600'
    : 'h-10 shrink-0 rounded-full border border-slate-200 bg-white px-4 text-sm text-slate-600 hover:border-red-200 hover:bg-red-50';

const getDayButtonClass = (isSelected: boolean, isToday: boolean) => {
  if (isSelected) {
    return 'h-9 shrink-0 rounded-full border border-red-500 bg-red-500 px-3 text-xs font-semibold text-white shadow-sm';
  }
  if (isToday) {
    return 'h-9 shrink-0 rounded-full border-2 border-red-400 bg-red-50 px-3 text-xs font-semibold text-red-600';
  }
  return 'h-9 shrink-0 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:border-red-200 hover:bg-red-50';
};

const StatCard: React.FC<{ label: string; value: string; icon: React.ReactNode; tone?: string }> = ({ label, value, icon, tone = '' }) => (
  <div className="group relative overflow-hidden rounded-[22px] border border-slate-200 bg-white p-3 sm:rounded-[26px] sm:p-4 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.35)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_35px_-20px_rgba(15,23,42,0.4)]">
    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100" />
    <div className="mb-3 flex items-center gap-2.5 sm:mb-5 sm:gap-3">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-100 sm:h-12 sm:w-12 sm:rounded-2xl ${tone}`}>
        {icon}
      </div>
      <span className="text-xs font-semibold leading-5 text-slate-500 sm:text-sm sm:leading-6">{label}</span>
    </div>
    <div className="text-right text-2xl font-black tracking-tight text-slate-700 sm:text-[2rem]">
      {value}
    </div>
  </div>
);

const BreakdownRow: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 text-sm last:border-b-0">
    <span className="text-slate-600">{label}</span>
    <span className="shrink-0 font-semibold text-slate-700">{fmtMoney(value)}</span>
  </div>
);

export const ManagerSalesSummaryContent: React.FC<ContentProps> = ({ branchId, workers = [] }) => {
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('all');
  const today = new Date();
  const todayDateString = today.toISOString().slice(0, 10);
  const [periodFrom, setPeriodFrom] = useState<string>(todayDateString);
  const [periodTo, setPeriodTo] = useState<string>(todayDateString);
  const [timeFilterOpen, setTimeFilterOpen] = useState(false);
  const [workerFilterOpen, setWorkerFilterOpen] = useState(false);
  const workerButtons = workers;
  const selectedSingleDay = periodFrom && periodFrom === periodTo ? periodFrom : null;

  const normalizePeriodRange = (from: string, to: string) => {
    let start = from ? new Date(`${from}T00:00:00`) : null;
    let end = to ? new Date(`${to}T23:59:59`) : null;

    if (!start && !end) return null;
    if (!start) start = new Date('1970-01-01T00:00:00Z');
    if (!end) end = new Date();

    if (start > end) {
      const tmp = start;
      start = end;
      end = tmp;
    }

    return { start, end };
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['manager-sales-summary-dialog', branchId, workers.map((worker) => worker.id).join(','), periodFrom, periodTo],
    enabled: true,
    queryFn: async () => {
      let availableWorkers = workers;

      if (availableWorkers.length === 0) {
        let workersQuery = supabase
          .from('workers')
          .select('id, full_name, username')
          .eq('is_active', true)
          .order('full_name');

        if (branchId) workersQuery = workersQuery.eq('branch_id', branchId);

        const { data: fetchedWorkers, error: workersError } = await workersQuery;
        if (workersError) throw workersError;
        availableWorkers = (fetchedWorkers || []) as WorkerInfo[];
      }

      const settled = await Promise.allSettled(
        availableWorkers.map(async (worker) => {
          const { data: accounting } = await supabase
            .from('accounting_sessions')
            .select('completed_at')
            .eq('worker_id', worker.id)
            .eq('status', 'completed')
            .order('completed_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const lastAccounting = accounting?.completed_at || null;
          const normalized = normalizePeriodRange(periodFrom, periodTo);
          const periodStart = normalized
            ? normalized.start.toISOString()
            : (lastAccounting || '1970-01-01T00:00:00Z');
          const periodEnd = normalized
            ? normalized.end.toISOString()
            : new Date().toISOString();
          const salesSummary = await fetchWorkerSalesSummary(
            worker.id,
            normalized ? periodStart : null,
            normalized ? periodEnd : null,
            lastAccounting,
            branchId || null,
          );

          const salesCalc = salesSummary.calc || emptyCalc();
          let calc = salesCalc;
          try {
            const fetchedCalc = await fetchSessionCalculations({
              workerId: worker.id,
              branchId: branchId || undefined,
              periodStart,
              periodEnd,
            });
            calc = {
              ...fetchedCalc,
              totalSales: salesCalc.totalSales,
              totalPaid: salesCalc.totalPaid,
              newDebts: salesCalc.newDebts,
              invoice1: salesCalc.invoice1,
              invoice2: salesCalc.invoice2,
              physicalCash:
                salesCalc.invoice2.cash +
                salesCalc.invoice1.espaceCash +
                salesCalc.invoice1.versementCash +
                fetchedCalc.debtCollections.cash -
                fetchedCalc.cashExpenses +
                fetchedCalc.customerSurplusCash,
              giftOfferValue: salesCalc.giftOfferValue > 0 ? salesCalc.giftOfferValue : fetchedCalc.giftOfferValue,
            };
          } catch (error) {
            console.error('Manager sales calculations failed for worker:', worker.id, error);
          }

          return {
            worker: worker as WorkerInfo,
            lastAccounting,
            periodStart,
            periodEnd,
            orderCount: salesSummary.orderCount,
            items: salesSummary.items,
            firstOrderTime: salesSummary.firstOrderTime,
            lastOrderTime: salesSummary.lastOrderTime,
            calc,
          } satisfies WorkerSummary;
        }),
      );

      return settled
        .filter((result): result is PromiseFulfilledResult<WorkerSummary> => result.status === 'fulfilled')
        .map((result) => result.value);
    },
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    setSelectedWorkerId('all');
  }, [branchId, workers]);

  const aggregate = useMemo(() => buildAggregateSummary(data || [], selectedWorkerId), [data, selectedWorkerId]);
  const totalQuantity = useMemo(() => aggregate.items.reduce((sum, item) => sum + item.quantity, 0), [aggregate.items]);
  const finance = useMemo(() => getSummaryFinance(aggregate.calc), [aggregate.calc]);
  const giftsDisplay = useMemo(() => {
    const totalGiftPieces = aggregate.calc.promoTracking.reduce((sum, item) => sum + Number(item.giftQuantity || 0), 0);
    const piecesByBox = new Map<number, number>();
    for (const item of aggregate.calc.promoTracking) {
      const ppb = Math.max(1, Number(item.piecesPerBox || 1));
      piecesByBox.set(ppb, (piecesByBox.get(ppb) || 0) + Number(item.giftQuantity || 0));
    }
    const dominantPiecesPerBox =
      piecesByBox.size > 0
        ? Array.from(piecesByBox.entries()).sort((a, b) => b[1] - a[1])[0][0]
        : 1;
    return {
      totalGiftPieces,
      text: formatGiftDisplay(totalGiftPieces, dominantPiecesPerBox),
    };
  }, [aggregate.calc.promoTracking]);

  const resetFilters = () => {
    setPeriodFrom(todayDateString);
    setPeriodTo(todayDateString);
    setSelectedWorkerId('all');
    void refetch();
  };

  const handleDaySelect = (jsDay: number) => {
    const date = new Date();
    while (date.getDay() !== jsDay) {
      date.setDate(date.getDate() - 1);
    }
    const selectedDate = date.toISOString().slice(0, 10);
    setPeriodFrom(selectedDate);
    setPeriodTo(selectedDate);
  };

  const selectedWorkerLabel = selectedWorkerId === 'all'
    ? 'كل العمال'
    : (workerButtons.find((worker) => worker.id === selectedWorkerId)?.full_name || 'عامل محدد');
  const timingSummary = periodFrom && periodTo
    ? (periodFrom === periodTo ? periodFrom : `${periodFrom} - ${periodTo}`)
    : todayDateString;

  return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden" dir="rtl">
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setTimeFilterOpen(true)}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-right shadow-sm transition-colors hover:border-red-200 hover:bg-red-50/40"
            >
              <div className="text-[11px] font-semibold text-slate-500">فلتر التوقيت</div>
              <div className="mt-1 truncate text-xs font-bold text-slate-800">{timingSummary}</div>
            </button>
            <button
              type="button"
              onClick={() => setWorkerFilterOpen(true)}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-right shadow-sm transition-colors hover:border-red-200 hover:bg-red-50/40"
            >
              <div className="text-[11px] font-semibold text-slate-500">فلتر العمال</div>
              <div className="mt-1 truncate text-xs font-bold text-slate-800">{selectedWorkerLabel}</div>
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <Button size="sm" className="h-8 rounded-full bg-red-500 px-4 text-xs hover:bg-red-600 sm:h-9 sm:px-5 sm:text-sm" onClick={() => void refetch()}>
              تحديث
            </Button>
            <Button size="sm" variant="outline" className="h-8 rounded-full px-4 text-xs sm:h-9 sm:px-5 sm:text-sm" onClick={resetFilters}>
              إعادة تعيين
            </Button>
          </div>
        </div>

        <Dialog open={timeFilterOpen} onOpenChange={setTimeFilterOpen}>
          <DialogContent className="max-w-md rounded-[28px] p-0" dir="rtl">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="text-sm font-bold text-slate-900">فلتر التوقيت</div>
              <div className="text-xs text-slate-500">حدد يومًا سريعًا أو اختر فترة يدوية</div>
            </div>
            <div className="space-y-3 px-4 py-4">
              <div className="grid grid-cols-1 gap-2">
                <label htmlFor="periodFrom" className="text-xs text-slate-600">من</label>
                <input
                  id="periodFrom"
                  type="date"
                  className="h-10 rounded-full border border-slate-300 bg-white px-4 text-sm shadow-sm outline-none focus:border-slate-900"
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                />
                <label htmlFor="periodTo" className="text-xs text-slate-600">إلى</label>
                <input
                  id="periodTo"
                  type="date"
                  className="h-10 rounded-full border border-slate-300 bg-white px-4 text-sm shadow-sm outline-none focus:border-slate-900"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                />
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {WORK_DAYS.map((day) => {
                  const date = new Date();
                  while (date.getDay() !== day.jsDay) {
                    date.setDate(date.getDate() - 1);
                  }
                  const dayDateString = date.toISOString().slice(0, 10);
                  const isSelected = selectedSingleDay === dayDateString;
                  const isToday = today.getDay() === day.jsDay;

                  return (
                    <button
                      key={day.key}
                      type="button"
                      className={getDayButtonClass(isSelected, isToday)}
                      onClick={() => handleDaySelect(day.jsDay)}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-2">
                <Button variant="outline" className="rounded-full" onClick={resetFilters}>إعادة تعيين</Button>
                <Button className="rounded-full bg-red-500 hover:bg-red-600" onClick={() => setTimeFilterOpen(false)}>تم</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={workerFilterOpen} onOpenChange={setWorkerFilterOpen}>
          <DialogContent className="max-w-md rounded-[28px] p-0" dir="rtl">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="text-sm font-bold text-slate-900">فلتر العمال</div>
              <div className="text-xs text-slate-500">اختر كل العمال أو عاملًا محددًا</div>
            </div>
            <div className="space-y-3 px-4 py-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={selectedWorkerId === 'all' ? 'default' : 'outline'}
                  className={getWorkerButtonClass(selectedWorkerId === 'all')}
                  onClick={() => setSelectedWorkerId('all')}
                >
                  الكل
                </Button>
                {workerButtons.map((worker) => (
                  <Button
                    key={worker.id}
                    type="button"
                    size="sm"
                    variant={selectedWorkerId === worker.id ? 'default' : 'outline'}
                    className={getWorkerButtonClass(selectedWorkerId === worker.id)}
                    onClick={() => setSelectedWorkerId(worker.id)}
                  >
                    {worker.full_name || worker.username}
                  </Button>
                ))}
              </div>

              <div className="flex justify-end">
                <Button className="rounded-full bg-red-500 hover:bg-red-600" onClick={() => setWorkerFilterOpen(false)}>تم</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {isLoading ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-red-500" />
          </div>
        ) : !data?.length ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-4 text-slate-500 sm:min-h-[320px]">
            <ClipboardList className="h-10 w-10 opacity-40" />
            <p className="text-center">
              {workerButtons.length > 0 ? 'لا توجد مبيعات في هذه الفترة للعمال المحددين' : 'لا يوجد عمال متاحون لهذا الفرع حاليًا'}
            </p>
          </div>
        ) : (
          <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
            <div className="px-3 pt-2 sm:px-4">
              <TabsList className="grid h-11 grid-cols-2 rounded-2xl bg-slate-100 p-1">
                <TabsTrigger value="overview" className="rounded-2xl text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  الملخص
                </TabsTrigger>
                <TabsTrigger value="products" className="rounded-2xl text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  المنتجات
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="mt-0 min-h-0 flex-1">
              <ScrollArea className="h-full">
                <div className="space-y-3 px-3 py-3 sm:px-4 sm:py-4">
                  <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
                    <StatCard label="إجمالي المبيعات" value={fmtMoney(aggregate.calc.totalSales)} icon={<ShoppingBag className="h-4 w-4" />} tone="text-emerald-600" />
                    <StatCard label="المبلغ المقبوض" value={fmtMoney(aggregate.calc.totalPaid)} icon={<Banknote className="h-4 w-4" />} tone="text-blue-600" />
                    <StatCard label="ديون جديدة" value={fmtMoney(aggregate.calc.newDebts)} icon={<TrendingDown className="h-4 w-4" />} tone="text-red-600" />
                    <StatCard label="ديون محصلة" value={fmtMoney(aggregate.calc.debtCollections.total)} icon={<HandCoins className="h-4 w-4" />} tone="text-orange-600" />
                    <StatCard label="النقد الفعلي" value={fmtMoney(aggregate.calc.physicalCash)} icon={<Banknote className="h-4 w-4" />} tone="text-green-700" />
                    <StatCard label="في ذمة العمال" value={fmtMoney(finance.workerHeldAmount)} icon={<Wallet className="h-4 w-4" />} tone="text-sky-700" />
                    <StatCard label="المصاريف" value={fmtMoney(aggregate.calc.expenses)} icon={<Wallet className="h-4 w-4" />} tone="text-amber-700" />
                    <StatCard label="العروض (صندوق.قطعة)" value={giftsDisplay.text} icon={<Gift className="h-4 w-4" />} tone="text-fuchsia-600" />
                    <StatCard label="الطلبيات / الكميات" value={`${aggregate.orderCount} / ${totalQuantity}`} icon={<Package className="h-4 w-4" />} tone="text-violet-600" />
                  </div>

                  <Tabs defaultValue="snapshot" className="space-y-3">
                    <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto rounded-none bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      <TabsTrigger value="snapshot" className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-3 text-xs sm:px-4 sm:text-sm data-[state=active]:border-slate-900 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
                        نظرة عامة
                      </TabsTrigger>
                      <TabsTrigger value="payments" className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-3 text-xs sm:px-4 sm:text-sm data-[state=active]:border-slate-900 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
                        طرق الدفع
                      </TabsTrigger>
                      <TabsTrigger value="collections" className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-3 text-xs sm:px-4 sm:text-sm data-[state=active]:border-slate-900 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
                        التحصيلات
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="snapshot" className="mt-0 rounded-[22px] border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                      <BreakdownRow label="إجمالي النقد (مبيعات + تحصيلات)" value={aggregate.calc.totalPaid + aggregate.calc.debtCollections.total} />
                      <BreakdownRow label="إجمالي غير نقدي" value={finance.nonCashCollected} />
                      <BreakdownRow label="في ذمة العمال ولم يسلَّم للمدير" value={finance.workerHeldAmount} />
                      <BreakdownRow label="المصاريف النقدية" value={aggregate.calc.cashExpenses} />
                      <BreakdownRow label="فائض العملاء" value={aggregate.calc.customerSurplusCash} />
                    </TabsContent>

                    <TabsContent value="payments" className="mt-0 rounded-[22px] border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                      <BreakdownRow label="فواتير 1 - إجمالي" value={aggregate.calc.invoice1.total} />
                      <BreakdownRow label="فواتير 1 - شيك" value={aggregate.calc.invoice1.check} />
                      <BreakdownRow label="فواتير 1 - تحويل" value={aggregate.calc.invoice1.transfer} />
                      <BreakdownRow label="فواتير 1 - وصل" value={aggregate.calc.invoice1.receipt} />
                      <BreakdownRow label="فواتير 1 - كاش" value={aggregate.calc.invoice1.espaceCash + aggregate.calc.invoice1.versementCash} />
                      <BreakdownRow label="فواتير 2 - كاش" value={aggregate.calc.invoice2.cash} />
                    </TabsContent>

                    <TabsContent value="collections" className="mt-0 rounded-[22px] border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                      <BreakdownRow label="تحصيلات الديون - إجمالي" value={aggregate.calc.debtCollections.total} />
                      <BreakdownRow label="تحصيلات الديون - كاش" value={aggregate.calc.debtCollections.cash} />
                      <BreakdownRow label="تحصيلات الديون - شيك" value={aggregate.calc.debtCollections.check} />
                      <BreakdownRow label="تحصيلات الديون - تحويل" value={aggregate.calc.debtCollections.transfer} />
                      <BreakdownRow label="تحصيلات الديون - وصل" value={aggregate.calc.debtCollections.receipt} />
                      <BreakdownRow label="فائض العملاء" value={aggregate.calc.customerSurplusCash} />
                    </TabsContent>
                  </Tabs>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="products" className="mt-0 min-h-0 flex-1">
              <ScrollArea className="h-full">
                <div className="grid grid-cols-2 gap-2.5 px-3 py-3 sm:gap-3 sm:px-4 sm:py-4 md:grid-cols-3">
                  {aggregate.items.map((item) => {
                    const displayedWorkerStock = selectedWorkerId !== 'all'
                      ? (item.workerStockByWorker?.[selectedWorkerId] || 0)
                      : (item.workerStockQuantity || 0);

                    return (
                    <div key={item.productId} dir="rtl" className="flex flex-col overflow-hidden rounded-2xl border-2 border-slate-200 bg-white shadow-lg transition-all hover:border-primary/40">
                      <div className="border-b border-slate-200 bg-slate-50 px-2.5 py-2 text-center">
                        <span className="block truncate text-xs font-bold text-slate-800 sm:text-sm">
                          {item.name}
                        </span>
                      </div>
                      <div className="aspect-square w-full overflow-hidden bg-slate-100">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Package className="h-12 w-12 text-slate-300" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 bg-white px-2.5 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-1 items-center justify-center gap-1 rounded-md bg-primary/10 py-1.5 text-xs font-bold text-primary sm:text-sm">
                            <Package className="h-3.5 w-3.5" />
                            {item.quantity}
                          </div>
                          {item.giftQuantity > 0 && (
                            <div className="rounded-md bg-secondary px-2 py-1.5 text-[10px] font-semibold text-secondary-foreground sm:text-xs">
                              🎁 {item.giftQuantity}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-center rounded-md bg-slate-100 py-1.5 text-[10px] font-semibold text-slate-600 sm:text-xs">
                          {fmtMoney(item.totalAmount)}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-right">
                          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-2">
                            <div className="text-[10px] font-medium text-emerald-700">المخزون</div>
                            <div className="mt-1 text-sm font-bold text-emerald-900">
                              {(item.warehouseQuantity || 0).toLocaleString('ar-DZ')}
                            </div>
                          </div>
                          <div className="rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-2">
                            <div className="text-[10px] font-medium text-blue-700">رصيد العمال</div>
                            <div className="mt-1 text-sm font-bold text-blue-900">
                              {displayedWorkerStock.toLocaleString('ar-DZ')}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )})}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </div>
  );
};

const ManagerSalesSummaryDialog: React.FC<Props> = ({ open, onOpenChange, branchId, workers = [] }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="h-[min(94dvh,860px)] w-[calc(100vw-0.35rem)] max-w-4xl overflow-hidden gap-0 p-0 sm:h-[min(92dvh,860px)] sm:w-[calc(100vw-0.5rem)]">
      <ManagerSalesSummaryContent branchId={branchId} workers={workers} />
    </DialogContent>
  </Dialog>
);

export default ManagerSalesSummaryDialog;
