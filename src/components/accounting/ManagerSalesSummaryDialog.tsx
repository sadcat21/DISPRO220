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

const DAY_OPTIONS = [
  { key: 'saturday', label: 'Ø§Ù„Ø³Ø¨Øª', jsDay: 6 },
  { key: 'sunday', label: 'Ø§Ù„Ø£Ø­Ø¯', jsDay: 0 },
  { key: 'monday', label: 'Ø§Ù„Ø§Ø«Ù†ÙŠÙ†', jsDay: 1 },
  { key: 'tuesday', label: 'Ø§Ù„Ø«Ù„Ø§Ø«Ø§Ø¡', jsDay: 2 },
  { key: 'wednesday', label: 'Ø§Ù„Ø£Ø±Ø¨Ø¹Ø§Ø¡', jsDay: 3 },
  { key: 'thursday', label: 'Ø§Ù„Ø®Ù…ÙŠØ³', jsDay: 4 },
] as const;

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

const fmtMoney = (value: number) => `${value.toLocaleString('ar-DZ')} Ø¯.Ø¬`;

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
        const existing = current.customers.find(c => c.customerId === customer.customerId);
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

const toDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getSelectedDayRange = (targetJsDay: number) => {
  const date = new Date();
  while (date.getDay() !== targetJsDay) {
    date.setDate(date.getDate() - 1);
  }

  const dateString = toDateString(date);
  return {
    start: `${dateString}T00:00:00+01:00`,
    end: `${dateString}T23:59:59+01:00`,
    label: dateString,
  };
};
const fetchWorkerSalesSummary = async (workerId: string, periodStart: string, periodEnd: string) => {
  let ordersQuery = supabase
    .from('orders')
    .select('id, status, payment_type, created_at, updated_at, customer_id')
    .in('status', ['delivered', 'completed', 'confirmed'])
    .or(`assigned_worker_id.eq.${workerId},created_by.eq.${workerId}`);

  // Use updated_at for date-range filtering so we include orders that were
  // completed/updated within the period, matching the worker sales summary behavior.
  ordersQuery = ordersQuery.gte('updated_at', periodStart).lte('updated_at', periodEnd);

  const { data: orders, error } = await ordersQuery;
  if (error) throw error;
  if (!orders || orders.length === 0) {
    return { items: [] as ProductAgg[], orderCount: 0, firstOrderTime: null, lastOrderTime: null };
  }

  const orderIds = orders.map(o => o.id);
  const orderCustomerMap = new Map(orders.map(o => [o.id, o.customer_id]));
  const orderTimeMap = new Map(orders.map(o => [o.id, o.updated_at]));

  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('order_id, product_id, quantity, gift_quantity, total_price, product:products(name, pieces_per_box, image_url)')
    .in('order_id', orderIds);

  if (itemsError) throw itemsError;

  const customerIds = [...new Set(orders.map(o => o.customer_id).filter(Boolean))];
  const { data: customers } = customerIds.length > 0
    ? await supabase.from('customers').select('id, name, store_name, phone').in('id', customerIds)
    : { data: [] };

  const customerNameMap = new Map((customers || []).map(c => [c.id, c.name]));
  const customerStoreMap = new Map((customers || []).map(c => [c.id, c.store_name || null]));
  const customerPhoneMap = new Map((customers || []).map(c => [c.id, c.phone || null]));

  const agg: Record<string, ProductAgg> = {};

  for (const item of items || []) {
    const customerId = orderCustomerMap.get(item.order_id) || 'unknown';
    const product = (item as any).product;
    if (!agg[item.product_id]) {
      agg[item.product_id] = {
        productId: item.product_id,
        name: product?.name || 'Ù…Ù†ØªØ¬ ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ',
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

    const existing = agg[item.product_id].customers.find(c => c.customerId === customerId);
    if (existing) {
      existing.quantity += Number(item.quantity || 0);
      existing.giftQuantity += Number(item.gift_quantity || 0);
      existing.totalAmount += Number(item.total_price || 0);
    } else {
      agg[item.product_id].customers.push({
        customerId,
        customerName: customerNameMap.get(customerId) || 'Ø¹Ù…ÙŠÙ„ ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ',
        storeName: customerStoreMap.get(customerId) || null,
        phone: customerPhoneMap.get(customerId) || null,
        deliveryTime: orderTimeMap.get(item.order_id) || null,
        quantity: Number(item.quantity || 0),
        giftQuantity: Number(item.gift_quantity || 0),
        totalAmount: Number(item.total_price || 0),
      });
    }
  }

  const createdTimes = orders.map(o => new Date(o.created_at).getTime());
  const updatedTimes = orders.map(o => new Date(o.updated_at).getTime());

  return {
    items: Object.values(agg).sort((a, b) => b.totalAmount - a.totalAmount),
    orderCount: orders.length,
    firstOrderTime: createdTimes.length ? new Date(Math.min(...createdTimes)).toISOString() : null,
    lastOrderTime: updatedTimes.length ? new Date(Math.max(...updatedTimes)).toISOString() : null,
  };
};

const buildAggregateSummary = (workerSummaries: WorkerSummary[], selectedWorkerId: string): AggregateSummary => {
  if (selectedWorkerId !== 'all') {
    const workerSummary = workerSummaries.find(item => item.worker.id === selectedWorkerId);
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

  const firstTimes = workerSummaries.map(w => w.firstOrderTime).filter(Boolean).map(v => new Date(v!).getTime());
  const lastTimes = workerSummaries.map(w => w.lastOrderTime).filter(Boolean).map(v => new Date(v!).getTime());

  return {
    workerLabel: 'ÙƒÙ„ Ø§Ù„Ø¹Ù…Ø§Ù„',
    orderCount: workerSummaries.reduce((sum, item) => sum + item.orderCount, 0),
    items: mergeProducts(workerSummaries),
    firstOrderTime: firstTimes.length ? new Date(Math.min(...firstTimes)).toISOString() : null,
    lastOrderTime: lastTimes.length ? new Date(Math.max(...lastTimes)).toISOString() : null,
    calc: mergeCalcs(workerSummaries.map(item => item.calc)),
  };
};

const StatCard: React.FC<{ label: string; value: string; icon: React.ReactNode; tone?: string }> = ({ label, value, icon, tone = '' }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
    <div className="mb-2 flex items-center gap-2 text-slate-500">
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 ${tone}`}>{icon}</div>
      <span className="text-xs font-medium">{label}</span>
    </div>
    <div className="text-base font-bold text-slate-800">{value}</div>
  </div>
);

const BreakdownRow: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
    <span className="text-slate-600">{label}</span>
    <span className="font-semibold text-slate-800">{fmtMoney(value)}</span>
  </div>
);

const ManagerSalesSummaryDialog: React.FC<Props> = ({ open, onOpenChange, branchId, workers = [] }) => {
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('all');
  const initialDay = DAY_OPTIONS.find(option => option.jsDay === new Date().getDay())?.key || 'thursday';
  const [selectedDayKey, setSelectedDayKey] = useState<string>(initialDay);
  const workerButtons = workers;
  const selectedDay = DAY_OPTIONS.find(option => option.key === selectedDayKey) || DAY_OPTIONS[DAY_OPTIONS.length - 1];
  const selectedRange = useMemo(() => getSelectedDayRange(selectedDay.jsDay), [selectedDay.jsDay]);

  const { data, isLoading } = useQuery({
    queryKey: ['manager-sales-summary-dialog', branchId, workers.map(worker => worker.id).join(','), selectedDayKey],
    enabled: open,
    queryFn: async () => {
      let availableWorkers = workers;

      if (availableWorkers.length === 0) {
        let workerRolesQuery = supabase
          .from('worker_roles')
          .select('worker_id, custom_roles!inner(code)')
          .eq('custom_roles.code', 'delivery_rep');

        if (branchId) {
          workerRolesQuery = workerRolesQuery.eq('branch_id', branchId);
        }

        const { data: workerRoles, error } = await workerRolesQuery;
        if (error) throw error;
        if (!workerRoles || workerRoles.length === 0) return [];

        const workerIds = [...new Set(workerRoles.map(item => item.worker_id))];
        const { data: fetchedWorkers, error: workersError } = await supabase
          .from('workers')
          .select('id, full_name, username')
          .in('id', workerIds)
          .eq('is_active', true)
          .order('full_name');

        if (workersError) throw workersError;
        availableWorkers = (fetchedWorkers || []) as WorkerInfo[];
      }

      const settled = await Promise.allSettled(availableWorkers.map(async (worker) => {
        const periodStart = selectedRange.start;
        const periodEnd = selectedRange.end;
        const salesSummary = await fetchWorkerSalesSummary(worker.id, periodStart, periodEnd);
        const calc = await fetchSessionCalculations({
          workerId: worker.id,
          branchId: branchId || undefined,
          periodStart,
          periodEnd,
        });

        return {
          worker: worker as WorkerInfo,
          lastAccounting: null,
          orderCount: salesSummary.orderCount,
          items: salesSummary.items,
          firstOrderTime: salesSummary.firstOrderTime,
          lastOrderTime: salesSummary.lastOrderTime,
          calc,
        } satisfies WorkerSummary;
      }));

      return settled
        .filter((result): result is PromiseFulfilledResult<WorkerSummary> => result.status === 'fulfilled')
        .map(result => result.value);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[96vw] sm:max-w-3xl max-h-[92dvh] overflow-hidden p-0 gap-0" dir="rtl">
        <div className="border-b border-slate-200 bg-gradient-to-l from-emerald-600 via-teal-600 to-cyan-500 px-5 py-4 text-white">
          <DialogHeader className="space-y-2">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <ShoppingBag className="h-5 w-5" />
              ØªØ¬Ù…ÙŠØ¹ Ù…Ø¨ÙŠØ¹Ø§Øª Ø§Ù„Ø¹Ù…Ø§Ù„
            </DialogTitle>
            <p className="text-sm text-white/85">
              Ù†Ø§ÙØ°Ø© Ù…ÙˆØ­Ù‘Ø¯Ø© Ù„Ù„Ù…Ø¯ÙŠØ± Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª ÙˆØ§Ù„Ø¯ÙŠÙˆÙ† ÙˆØ§Ù„ØªØ­ØµÙŠÙ„Ø§Øª ÙˆØ§Ù„Ù…Ù†ØªØ¬Ø§Øª Ù„ÙƒÙ„ Ø§Ù„Ø¹Ù…Ø§Ù„ Ø£Ùˆ Ù„ÙƒÙ„ Ø¹Ø§Ù…Ù„ Ø¹Ù„Ù‰ Ø­Ø¯Ø©.
            </p>
          </DialogHeader>
        </div>

        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-700">Ø§Ø®ØªÙŠØ§Ø± Ø§Ù„Ø¹Ø§Ù…Ù„</div>
            <Badge className="border-0 bg-white text-slate-700 shadow-sm">{aggregate.workerLabel}</Badge>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Button
              type="button"
              size="sm"
              variant={selectedWorkerId === 'all' ? 'default' : 'outline'}
              className="shrink-0 rounded-full"
              onClick={() => setSelectedWorkerId('all')}
            >
              Ø§Ù„ÙƒÙ„
            </Button>
            {workerButtons.map((worker) => (
              <Button
                key={worker.id}
                type="button"
                size="sm"
                variant={selectedWorkerId === worker.id ? 'default' : 'outline'}
                className="shrink-0 rounded-full"
                onClick={() => setSelectedWorkerId(worker.id)}
              >
                {worker.full_name || worker.username}
              </Button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">ÙÙ„ØªØ±Ø© Ø§Ù„ÙŠÙˆÙ…</div>
            <Badge variant="outline">{selectedDay.label}</Badge>
          </div>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {DAY_OPTIONS.map((day) => (
              <Button
                key={day.key}
                type="button"
                size="sm"
                variant={selectedDayKey === day.key ? 'default' : 'outline'}
                className="shrink-0 rounded-full"
                onClick={() => setSelectedDayKey(day.key)}
              >
                {day.label}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
          </div>
        ) : !data?.length ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-slate-500">
            <ClipboardList className="h-10 w-10 opacity-40" />
            <p className="text-center">
              {workerButtons.length > 0
                ? 'Ù„Ø§ ØªÙˆØ¬Ø¯ Ù…Ø¨ÙŠØ¹Ø§Øª ÙÙŠ Ù‡Ø°Ù‡ Ø§Ù„ÙØªØ±Ø© Ù„Ù„Ø¹Ù…Ø§Ù„ Ø§Ù„Ù…Ø­Ø¯Ø¯ÙŠÙ†'
                : 'Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ø¹Ù…Ø§Ù„ Ù…ØªØ§Ø­ÙˆÙ† Ù„Ù‡Ø°Ø§ Ø§Ù„ÙØ±Ø¹ Ø­Ø§Ù„ÙŠÙ‹Ø§'
              }
            </p>
            {workerButtons.length > 0 && (
              <p className="text-xs text-slate-400 text-center">
                Ø¬Ø±Ø¨ ØªØºÙŠÙŠØ± Ø§Ù„ÙØªØ±Ø© Ø§Ù„Ø²Ù…Ù†ÙŠØ© Ø£Ùˆ Ø§Ø®ØªÙŠØ§Ø± Ø¹Ù…Ø§Ù„ Ù…Ø®ØªÙ„ÙÙŠÙ†
              </p>
            )}
          </div>
        ) : (
          <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
            <div className="px-4 pt-3">
              <TabsList className="grid grid-cols-2">
                <TabsTrigger value="overview">Ø§Ù„Ù…Ù„Ø®Øµ</TabsTrigger>
                <TabsTrigger value="products">Ø§Ù„Ù…Ù†ØªØ¬Ø§Øª</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="min-h-0 flex-1 mt-0">
              <ScrollArea className="h-full">
                <div className="space-y-4 px-4 py-4">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <StatCard label="Ø¥Ø¬Ù…Ø§Ù„ÙŠ Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª" value={fmtMoney(aggregate.calc.totalSales)} icon={<ShoppingBag className="h-4 w-4" />} tone="text-emerald-600" />
                    <StatCard label="Ø§Ù„Ù…Ø¨Ù„Øº Ø§Ù„Ù…Ù‚Ø¨ÙˆØ¶" value={fmtMoney(aggregate.calc.totalPaid)} icon={<Banknote className="h-4 w-4" />} tone="text-blue-600" />
                    <StatCard label="Ø¯ÙŠÙˆÙ† Ø¬Ø¯ÙŠØ¯Ø©" value={fmtMoney(aggregate.calc.newDebts)} icon={<TrendingDown className="h-4 w-4" />} tone="text-red-600" />
                    <StatCard label="Ø¯ÙŠÙˆÙ† Ù…Ø­ØµÙ„Ø©" value={fmtMoney(aggregate.calc.debtCollections.total)} icon={<HandCoins className="h-4 w-4" />} tone="text-orange-600" />
                    <StatCard label="Ø§Ù„Ù†Ù‚Ø¯ Ø§Ù„ÙØ¹Ù„ÙŠ" value={fmtMoney(aggregate.calc.physicalCash)} icon={<Banknote className="h-4 w-4" />} tone="text-green-700" />
                    <StatCard label="Ø§Ù„Ù…ØµØ§Ø±ÙŠÙ" value={fmtMoney(aggregate.calc.expenses)} icon={<Wallet className="h-4 w-4" />} tone="text-amber-700" />
                    <StatCard label="Ù‚ÙŠÙ…Ø© Ø§Ù„Ø¹Ø±ÙˆØ¶" value={fmtMoney(aggregate.calc.giftOfferValue)} icon={<Gift className="h-4 w-4" />} tone="text-fuchsia-600" />
                    <StatCard label="Ø§Ù„Ø·Ù„Ø¨ÙŠØ§Øª / Ø§Ù„ÙƒÙ…ÙŠØ§Øª" value={`${aggregate.orderCount} / ${totalQuantity}`} icon={<Package className="h-4 w-4" />} tone="text-violet-600" />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
                        <Calendar className="h-4 w-4 text-primary" />
                        Ù…Ù„Ø®Øµ Ø·Ø±Ù‚ Ø§Ù„Ø¯ÙØ¹
                      </div>
                      <div className="space-y-2">
                        <BreakdownRow label="ÙÙˆØ§ØªÙŠØ± 1 - Ø¥Ø¬Ù…Ø§Ù„ÙŠ" value={aggregate.calc.invoice1.total} />
                        <BreakdownRow label="ÙÙˆØ§ØªÙŠØ± 1 - Ø´ÙŠÙƒ" value={aggregate.calc.invoice1.check} />
                        <BreakdownRow label="ÙÙˆØ§ØªÙŠØ± 1 - ØªØ­ÙˆÙŠÙ„" value={aggregate.calc.invoice1.transfer} />
                        <BreakdownRow label="ÙÙˆØ§ØªÙŠØ± 1 - ÙˆØµÙ„" value={aggregate.calc.invoice1.receipt} />
                        <BreakdownRow label="ÙÙˆØ§ØªÙŠØ± 1 - ÙƒØ§Ø´" value={aggregate.calc.invoice1.espaceCash + aggregate.calc.invoice1.versementCash} />
                        <BreakdownRow label="ÙÙˆØ§ØªÙŠØ± 2 - ÙƒØ§Ø´" value={aggregate.calc.invoice2.cash} />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
                        <HandCoins className="h-4 w-4 text-primary" />
                        ØªØ­ØµÙŠÙ„Ø§Øª ÙˆÙ…Ù„Ø­Ù‚Ø§Øª
                      </div>
                      <div className="space-y-2">
                        <BreakdownRow label="ØªØ­ØµÙŠÙ„Ø§Øª Ø§Ù„Ø¯ÙŠÙˆÙ† - ÙƒØ§Ø´" value={aggregate.calc.debtCollections.cash} />
                        <BreakdownRow label="ØªØ­ØµÙŠÙ„Ø§Øª Ø§Ù„Ø¯ÙŠÙˆÙ† - Ø´ÙŠÙƒ" value={aggregate.calc.debtCollections.check} />
                        <BreakdownRow label="ØªØ­ØµÙŠÙ„Ø§Øª Ø§Ù„Ø¯ÙŠÙˆÙ† - ØªØ­ÙˆÙŠÙ„" value={aggregate.calc.debtCollections.transfer} />
                        <BreakdownRow label="ØªØ­ØµÙŠÙ„Ø§Øª Ø§Ù„Ø¯ÙŠÙˆÙ† - ÙˆØµÙ„" value={aggregate.calc.debtCollections.receipt} />
                        <BreakdownRow label="ÙØ§Ø¦Ø¶ Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡" value={aggregate.calc.customerSurplusCash} />
                        <BreakdownRow label="Ø§Ù„Ù…ØµØ§Ø±ÙŠÙ Ø§Ù„Ù†Ù‚Ø¯ÙŠØ©" value={aggregate.calc.cashExpenses} />
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="products" className="min-h-0 flex-1 mt-0">
              <ScrollArea className="h-full">
                <div className="grid grid-cols-2 gap-3 px-4 py-4 md:grid-cols-4">
                  {aggregate.items.map((item) => (
                    <div key={item.productId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="aspect-square bg-slate-100">
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Package className="h-10 w-10 text-slate-300" />
                          </div>
                        )}
                      </div>
                      <div className="space-y-2 p-3">
                        <div className="line-clamp-2 min-h-[2.5rem] text-sm font-bold text-slate-800">{item.name}</div>
                        <div className="grid grid-cols-2 gap-2 text-center">
                          <div className="rounded-xl bg-emerald-50 px-2 py-2">
                            <div className="text-[11px] text-emerald-700">Ø§Ù„ÙƒÙ…ÙŠØ©</div>
                            <div className="text-sm font-bold text-emerald-800">{item.quantity}</div>
                          </div>
                          <div className="rounded-xl bg-fuchsia-50 px-2 py-2">
                            <div className="text-[11px] text-fuchsia-700">Ø§Ù„Ø¹Ø±ÙˆØ¶</div>
                            <div className="text-sm font-bold text-fuchsia-800">{item.giftQuantity}</div>
                          </div>
                        </div>
                        <div className="rounded-xl bg-slate-50 px-3 py-2 text-center">
                          <div className="text-[11px] text-slate-500">Ù‚ÙŠÙ…Ø© Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª</div>
                          <div className="text-sm font-bold text-slate-800">{fmtMoney(item.totalAmount)}</div>
                        </div>
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

