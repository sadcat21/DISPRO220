import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { fetchSessionCalculations, SessionCalculations } from '@/hooks/useSessionCalculations';
import { Banknote, Calendar, ClipboardList, Gift, HandCoins, Package, ShoppingBag, TrendingDown, Wallet } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
}

interface AggregateSummary {
  workerLabel: string;
  orderCount: number;
  items: ProductAgg[];
  firstOrderTime: string | null;
  lastOrderTime: string | null;
  calc: SessionCalculations;
}

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
        });
      }

      const current = map.get(item.productId)!;
      current.quantity += item.quantity;
      current.giftQuantity += item.giftQuantity;
      current.totalAmount += item.totalAmount;

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

const fetchWorkerSalesSummary = async (
  workerId: string,
  periodStart?: string | null,
  periodEnd?: string | null,
  lastAccounting?: string | null,
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
    .select('order_id, product_id, quantity, gift_quantity, total_price, product:products(name, pieces_per_box, image_url)')
    .in('order_id', orderIds);

  if (itemsError) throw itemsError;

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

  return {
    items: Object.values(agg).sort((a, b) => b.totalAmount - a.totalAmount),
    orderCount: orders.length,
    firstOrderTime: createdTimes.length ? new Date(Math.min(...createdTimes)).toISOString() : null,
    lastOrderTime: updatedTimes.length ? new Date(Math.max(...updatedTimes)).toISOString() : null,
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

const StatCard: React.FC<{ label: string; value: string; icon: React.ReactNode; tone?: string }> = ({ label, value, icon, tone = '' }) => (
  <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
    <div className="mb-4 flex items-center gap-3 text-slate-500">
      <div className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-50 ${tone}`}>{icon}</div>
      <span className="text-sm font-medium text-slate-500">{label}</span>
    </div>
    <div className="text-2xl font-bold text-slate-700">{value}</div>
  </div>
);

const BreakdownRow: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="flex items-center justify-between border-b border-slate-100 py-3 text-sm last:border-b-0">
    <span className="text-slate-600">{label}</span>
    <span className="font-semibold text-slate-700">{fmtMoney(value)}</span>
  </div>
);

const ManagerSalesSummaryDialog: React.FC<Props> = ({ open, onOpenChange, branchId, workers = [] }) => {
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('all');
  const [periodFrom, setPeriodFrom] = useState<string>('');
  const [periodTo, setPeriodTo] = useState<string>('');
  const workerButtons = workers;

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
    enabled: open,
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
          );

          let calc = emptyCalc();
          try {
            calc = await fetchSessionCalculations({
              workerId: worker.id,
              branchId: branchId || undefined,
              periodStart,
              periodEnd,
            });
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
    refetchInterval: open ? 15000 : false,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!open) return;
    setSelectedWorkerId('all');
  }, [open]);

  const aggregate = useMemo(() => buildAggregateSummary(data || [], selectedWorkerId), [data, selectedWorkerId]);
  const totalQuantity = useMemo(() => aggregate.items.reduce((sum, item) => sum + item.quantity, 0), [aggregate.items]);

  const resetFilters = () => {
    setPeriodFrom('');
    setPeriodTo('');
    setSelectedWorkerId('all');
    void refetch();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(92dvh,860px)] w-[calc(100vw-0.5rem)] max-w-4xl overflow-hidden gap-0 p-0" dir="rtl">
        <div className="border-b border-red-200 bg-gradient-to-r from-rose-500 to-red-500 px-5 py-5 text-white">
          <DialogHeader className="space-y-2 text-right">
            <DialogTitle className="flex items-center justify-end gap-2 text-2xl font-bold">
              <ShoppingBag className="h-5 w-5 shrink-0" />
              تجميع مبيعات العمال
            </DialogTitle>
            <p className="text-sm text-white/90">مراجعة المبيعات والديون والتحصيلات لكل العمال</p>
          </DialogHeader>
        </div>

        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
            <label htmlFor="periodFrom" className="text-sm text-slate-600">من</label>
            <input
              id="periodFrom"
              type="date"
              className="h-10 rounded-full border border-slate-300 bg-white px-4 text-sm shadow-sm outline-none focus:border-slate-900"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
            />
            <label htmlFor="periodTo" className="text-sm text-slate-600">إلى</label>
            <input
              id="periodTo"
              type="date"
              className="h-10 rounded-full border border-slate-300 bg-white px-4 text-sm shadow-sm outline-none focus:border-slate-900"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
            />
            <Button size="sm" className="h-10 rounded-full bg-red-500 px-5 hover:bg-red-600" onClick={() => void refetch()}>
              تحديث
            </Button>
            <Button size="sm" variant="outline" className="h-10 rounded-full px-5" onClick={resetFilters}>
              إعادة تعيين
            </Button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
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
        </div>

        {isLoading ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-red-500" />
          </div>
        ) : !data?.length ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-slate-500">
            <ClipboardList className="h-10 w-10 opacity-40" />
            <p className="text-center">
              {workerButtons.length > 0 ? 'لا توجد مبيعات في هذه الفترة للعمال المحددين' : 'لا يوجد عمال متاحون لهذا الفرع حاليًا'}
            </p>
          </div>
        ) : (
          <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
            <div className="px-4 pt-3">
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
                <div className="space-y-4 px-4 py-4">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <StatCard label="إجمالي المبيعات" value={fmtMoney(aggregate.calc.totalSales)} icon={<ShoppingBag className="h-4 w-4" />} tone="text-emerald-600" />
                    <StatCard label="المبلغ المقبوض" value={fmtMoney(aggregate.calc.totalPaid)} icon={<Banknote className="h-4 w-4" />} tone="text-blue-600" />
                    <StatCard label="ديون جديدة" value={fmtMoney(aggregate.calc.newDebts)} icon={<TrendingDown className="h-4 w-4" />} tone="text-red-600" />
                    <StatCard label="ديون محصلة" value={fmtMoney(aggregate.calc.debtCollections.total)} icon={<HandCoins className="h-4 w-4" />} tone="text-orange-600" />
                    <StatCard label="النقد الفعلي" value={fmtMoney(aggregate.calc.physicalCash)} icon={<Banknote className="h-4 w-4" />} tone="text-green-700" />
                    <StatCard label="المصاريف" value={fmtMoney(aggregate.calc.expenses)} icon={<Wallet className="h-4 w-4" />} tone="text-amber-700" />
                    <StatCard label="قيمة العروض" value={fmtMoney(aggregate.calc.giftOfferValue)} icon={<Gift className="h-4 w-4" />} tone="text-fuchsia-600" />
                    <StatCard label="الطلبيات / الكميات" value={`${aggregate.orderCount} / ${totalQuantity}`} icon={<Package className="h-4 w-4" />} tone="text-violet-600" />
                  </div>

                  <Tabs defaultValue="snapshot" className="space-y-3">
                    <TabsList className="h-auto justify-start gap-2 rounded-none bg-transparent p-0">
                      <TabsTrigger value="snapshot" className="rounded-full border border-slate-200 bg-slate-100 px-4 text-sm data-[state=active]:border-slate-900 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
                        نظرة عامة
                      </TabsTrigger>
                      <TabsTrigger value="payments" className="rounded-full border border-slate-200 bg-slate-100 px-4 text-sm data-[state=active]:border-slate-900 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
                        طرق الدفع
                      </TabsTrigger>
                      <TabsTrigger value="collections" className="rounded-full border border-slate-200 bg-slate-100 px-4 text-sm data-[state=active]:border-slate-900 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
                        التحصيلات
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="snapshot" className="mt-0 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
                      <BreakdownRow label="إجمالي النقد (مبيعات + تحصيلات)" value={aggregate.calc.totalPaid + aggregate.calc.debtCollections.total} />
                      <BreakdownRow label="إجمالي غير نقدي" value={aggregate.calc.invoice1.check + aggregate.calc.invoice1.transfer + aggregate.calc.invoice1.receipt + aggregate.calc.debtCollections.check + aggregate.calc.debtCollections.transfer + aggregate.calc.debtCollections.receipt} />
                      <BreakdownRow label="المصاريف النقدية" value={aggregate.calc.cashExpenses} />
                      <BreakdownRow label="فائض العملاء" value={aggregate.calc.customerSurplusCash} />
                    </TabsContent>

                    <TabsContent value="payments" className="mt-0 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
                      <BreakdownRow label="فواتير 1 - إجمالي" value={aggregate.calc.invoice1.total} />
                      <BreakdownRow label="فواتير 1 - شيك" value={aggregate.calc.invoice1.check} />
                      <BreakdownRow label="فواتير 1 - تحويل" value={aggregate.calc.invoice1.transfer} />
                      <BreakdownRow label="فواتير 1 - وصل" value={aggregate.calc.invoice1.receipt} />
                      <BreakdownRow label="فواتير 1 - كاش" value={aggregate.calc.invoice1.espaceCash + aggregate.calc.invoice1.versementCash} />
                      <BreakdownRow label="فواتير 2 - كاش" value={aggregate.calc.invoice2.cash} />
                    </TabsContent>

                    <TabsContent value="collections" className="mt-0 rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
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
                <div className="grid grid-cols-2 gap-3 px-3 py-4 sm:px-4 md:grid-cols-3">
                  {aggregate.items.map((item) => (
                    <div key={item.productId} className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
                      <div className="aspect-square bg-slate-100">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Package className="h-10 w-10 text-slate-300" />
                          </div>
                        )}
                      </div>
                      <div className="space-y-3 p-3">
                        <div className="text-right text-sm font-bold text-slate-800">{item.name}</div>
                        <div className="flex justify-center">
                          <Badge className="border-0 bg-red-50 px-3 py-1 text-red-500 shadow-none">
                            {item.quantity}
                          </Badge>
                        </div>
                        <div className="text-center text-sm font-bold text-slate-700">{fmtMoney(item.totalAmount)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ManagerSalesSummaryDialog;
