import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { useSelectedWorker } from '@/contexts/SelectedWorkerContext';
import { ArrowRight, Calculator, Truck, Banknote, Wallet, MapPin, ShoppingCart, Activity, Shield, HardHat, HandCoins, ArrowLeftRight, ClipboardList, Trophy, AlertTriangle, DollarSign, Package, PackageOpen, ClipboardCheck, TrendingUp, TrendingDown, Gift, CalendarDays, ShoppingBag } from 'lucide-react';
import { useWorkerLiability } from '@/hooks/useWorkerLiability';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Badge } from '@/components/ui/badge';
import { Worker } from '@/types/database';
import CoinExchangeDialog from '@/components/treasury/CoinExchangeDialog';
import WorkerHandoverPreviewDialog from '@/components/accounting/WorkerHandoverPreviewDialog';
import TodayCustomersDialog from '@/components/sectors/TodayCustomersDialog';
import WorkerFinancialDialog from '@/components/rewards/WorkerFinancialDialog';
import WorkerPointsDialog from '@/components/rewards/WorkerPointsDialog';
import StockVerificationDialog from '@/components/stock/StockVerificationDialog';
import WorkerAttendanceLogDialog from '@/components/attendance/WorkerAttendanceLogDialog';
import WorkerSalesSummaryDialog from '@/components/accounting/WorkerSalesSummaryDialog';

const workerActions = [
  { key: 'accounting', icon: Calculator, path: '/accounting', labelKey: 'accounting.title', color: 'bg-amber-50 border-amber-200 text-amber-700' },
  { key: 'load_stock', icon: Truck, path: '/load-stock', labelKey: 'stock.load_to_worker', color: 'bg-green-50 border-green-200 text-green-700' },
  { key: 'truck_stock', icon: Package, path: '', labelKey: 'رصيد الشاحنة', color: 'bg-lime-50 border-lime-200 text-lime-700', isDialog: true },
  { key: 'unload_truck', icon: PackageOpen, path: '/load-stock', labelKey: 'تفريغ الشاحنة', color: 'bg-red-50 border-red-200 text-red-700' },
  { key: 'stock_review', icon: ClipboardCheck, path: '', labelKey: 'جلسة مراجعة', color: 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700', isDialog: true },
  { key: 'worker_debts', icon: Banknote, path: '/worker-debts', labelKey: 'nav.worker_debts', color: 'bg-rose-50 border-rose-200 text-rose-700' },
  { key: 'liability', icon: HandCoins, path: '/worker-liability', labelKey: 'liability.title', color: 'bg-orange-50 border-orange-200 text-orange-700' },
  { key: 'coin_exchange', icon: ArrowLeftRight, path: '', labelKey: 'coin_exchange.title', color: 'bg-cyan-50 border-cyan-200 text-cyan-700', isDialog: true },
  { key: 'expenses', icon: Wallet, path: '/expenses-management', labelKey: 'expenses.title', color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
  { key: 'tracking', icon: MapPin, path: '/worker-tracking', labelKey: 'navigation.worker_tracking', color: 'bg-teal-50 border-teal-200 text-teal-700' },
  { key: 'orders', icon: ShoppingCart, path: '/orders', labelKey: 'nav.orders', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { key: 'activity', icon: Activity, path: '/activity-logs', labelKey: 'nav.activity_logs', color: 'bg-violet-50 border-violet-200 text-violet-700' },
  { key: 'permissions', icon: Shield, path: '/permissions', labelKey: 'nav.permissions', color: 'bg-slate-50 border-slate-200 text-slate-700' },
  { key: 'financial', icon: DollarSign, path: '', labelKey: 'البيانات المالية', color: 'bg-emerald-50 border-emerald-200 text-emerald-700', isDialog: true },
  { key: 'points_log', icon: Trophy, path: '', labelKey: 'سجل النقاط', color: 'bg-purple-50 border-purple-200 text-purple-700', isDialog: true },
  { key: 'rewards_page', icon: AlertTriangle, path: '/rewards', labelKey: 'المكافآت والعقوبات', color: 'bg-pink-50 border-pink-200 text-pink-700' },
  { key: 'handover_summary', icon: ClipboardList, path: '', labelKey: 'ملخص التسليم', color: 'bg-indigo-50 border-indigo-200 text-indigo-700', isDialog: true },
  { key: 'today_customers', icon: MapPin, path: '', labelKey: 'عملاء اليوم', color: 'bg-sky-50 border-sky-200 text-sky-700', isDialog: true },
  { key: 'attendance_log', icon: CalendarDays, path: '', labelKey: 'سجل المداومة', color: 'bg-teal-50 border-teal-200 text-teal-700', isDialog: true },
  { key: 'sales_summary', icon: ShoppingBag, path: '', labelKey: 'تجميع المبيعات', color: 'bg-amber-50 border-amber-200 text-amber-700', isDialog: true },
];

const WorkerActions: React.FC = () => {
  const { activeBranch } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { setSelectedWorker: setContextWorker } = useSelectedWorker();
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const { data: liability } = useWorkerLiability(selectedWorker?.id);
  const [coinExchangeOpen, setCoinExchangeOpen] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [todayCustomersOpen, setTodayCustomersOpen] = useState(false);
  const [financialOpen, setFinancialOpen] = useState(false);
  const [pointsLogOpen, setPointsLogOpen] = useState(false);
  const [truckStockOpen, setTruckStockOpen] = useState(false);
  const [stockReviewOpen, setStockReviewOpen] = useState(false);
  const [attendanceLogOpen, setAttendanceLogOpen] = useState(false);
  const [salesSummaryOpen, setSalesSummaryOpen] = useState(false);

  useRealtimeSubscription(
    `worker-actions-realtime-${selectedWorker?.id || 'none'}`,
    [
      { table: 'workers' },
      { table: 'worker_stock', filter: selectedWorker?.id ? `worker_id=eq.${selectedWorker.id}` : undefined },
      { table: 'loading_sessions', filter: selectedWorker?.id ? `worker_id=eq.${selectedWorker.id}` : undefined },
      { table: 'loading_session_items' },
      { table: 'orders' },
      { table: 'order_items' },
      { table: 'accounting_sessions', filter: selectedWorker?.id ? `worker_id=eq.${selectedWorker.id}` : undefined },
      { table: 'worker_locations' },
      { table: 'customer_debts' },
      { table: 'debt_collections' },
      { table: 'worker_debts' },
      { table: 'worker_debt_payments' },
    ],
    [
      ['workers-for-actions', activeBranch?.id],
      ['worker-truck-stock', selectedWorker?.id],
      ['worker-last-accounting', selectedWorker?.id],
      ['worker-truck-loaded', selectedWorker?.id],
      ['worker-truck-sold', selectedWorker?.id],
      ['worker-liability', selectedWorker?.id, activeBranch?.id],
      ['worker-sales-summary', selectedWorker?.id],
      ['worker-locations', activeBranch?.id],
      ['worker-debts', selectedWorker?.id, activeBranch?.id],
      ['visit-tracking', activeBranch?.id],
    ],
    !!selectedWorker?.id
  );

  const { data: workers = [] } = useQuery({
    queryKey: ['workers-for-actions', activeBranch?.id],
    queryFn: async () => {
      let query = supabase.from('workers').select('*').eq('is_active', true).order('full_name');
      if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);
      const { data } = await query;
      return (data || []) as Worker[];
    },
  });

  const { data: truckStock = [] } = useQuery({
    queryKey: ['worker-truck-stock', selectedWorker?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('worker_stock')
        .select('*, product:products(name, pieces_per_box)')
        .eq('worker_id', selectedWorker!.id)
        .gte('quantity', 0);
      return data || [];
    },
    enabled: !!selectedWorker?.id && truckStockOpen,
  });

  // Fetch last accounting session for selected worker
  const { data: lastWorkerAccounting } = useQuery({
    queryKey: ['worker-last-accounting', selectedWorker?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('accounting_sessions')
        .select('completed_at')
        .eq('worker_id', selectedWorker!.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .single();
      return data?.completed_at || null;
    },
    enabled: !!selectedWorker?.id && truckStockOpen,
  });

  // Fetch loaded quantities since last accounting
  const { data: truckLoadedData } = useQuery({
    queryKey: ['worker-truck-loaded', selectedWorker?.id, lastWorkerAccounting],
    queryFn: async () => {
      let sessionsQuery = supabase
        .from('loading_sessions')
        .select('id')
        .eq('worker_id', selectedWorker!.id)
        .in('status', ['completed', 'open']);
      if (lastWorkerAccounting) {
        sessionsQuery = sessionsQuery.gte('created_at', lastWorkerAccounting);
      }
      const { data: sessions } = await sessionsQuery;
      if (!sessions || sessions.length === 0) return [];
      const sessionIds = sessions.map(s => s.id);
      const { data: items } = await supabase
        .from('loading_session_items')
        .select('product_id, quantity, gift_quantity')
        .in('session_id', sessionIds);
      return items || [];
    },
    enabled: !!selectedWorker?.id && truckStockOpen,
  });

  // Fetch sold quantities since last accounting
  const { data: truckSoldData } = useQuery({
    queryKey: ['worker-truck-sold', selectedWorker?.id, lastWorkerAccounting],
    queryFn: async () => {
      let ordersQuery = supabase
        .from('orders')
        .select('id')
        .eq('status', 'delivered')
        .or(`assigned_worker_id.eq.${selectedWorker!.id},created_by.eq.${selectedWorker!.id}`);
      if (lastWorkerAccounting) {
        ordersQuery = ordersQuery.gte('updated_at', lastWorkerAccounting);
      }
      const { data: orders } = await ordersQuery;
      if (!orders || orders.length === 0) return [];
      const orderIds = orders.map(o => o.id);
      const { data: items } = await supabase
        .from('order_items')
        .select('product_id, quantity, gift_quantity, gift_offer_id')
        .in('order_id', orderIds);
      if (!items || items.length === 0) return [];
      const offerIds = [...new Set(items.map(i => i.gift_offer_id).filter(Boolean))] as string[];
      let offerUnits: Record<string, string> = {};
      if (offerIds.length > 0) {
        const { data: tiers } = await supabase
          .from('product_offer_tiers')
          .select('offer_id, gift_quantity_unit')
          .in('offer_id', offerIds);
        for (const t of (tiers || [])) {
          offerUnits[t.offer_id] = t.gift_quantity_unit || 'piece';
        }
      }
      return items.map(i => ({
        ...i,
        gift_unit: i.gift_offer_id ? (offerUnits[i.gift_offer_id] || 'piece') : 'piece',
      }));
    },
    enabled: !!selectedWorker?.id && truckStockOpen,
  });

  const truckMovementStats = useMemo(() => {
    const stats: Record<string, { loaded: number; sold: number; giftQty: number; giftUnit: string }> = {};
    for (const item of (truckLoadedData || [])) {
      if (!stats[item.product_id]) stats[item.product_id] = { loaded: 0, sold: 0, giftQty: 0, giftUnit: 'piece' };
      stats[item.product_id].loaded += item.quantity + (item.gift_quantity || 0);
    }
    for (const item of (truckSoldData || [])) {
      if (!stats[item.product_id]) stats[item.product_id] = { loaded: 0, sold: 0, giftQty: 0, giftUnit: 'piece' };
      stats[item.product_id].sold += item.quantity;
      if ((item.gift_quantity || 0) > 0) {
        stats[item.product_id].giftQty += item.gift_quantity;
        stats[item.product_id].giftUnit = (item as any).gift_unit || 'piece';
      }
    }
    // Also add gifts from loading sessions
    for (const item of (truckLoadedData || [])) {
      if ((item.gift_quantity || 0) > 0) {
        if (!stats[item.product_id]) stats[item.product_id] = { loaded: 0, sold: 0, giftQty: 0, giftUnit: 'piece' };
        stats[item.product_id].giftQty += item.gift_quantity;
      }
    }
    return stats;
  }, [truckLoadedData, truckSoldData]);

  const handleSelectWorker = (worker: Worker) => {
    setSelectedWorker(worker);
    setContextWorker(worker.id, worker.full_name);
  };

  const handleBack = () => {
    setSelectedWorker(null);
    setContextWorker(null);
  };

  const handleAction = (action: typeof workerActions[0]) => {
    if (!selectedWorker) return;
    if ((action as any).isDialog) {
      if (action.key === 'coin_exchange') {
        setCoinExchangeOpen(true);
      } else if (action.key === 'handover_summary') {
        setHandoverOpen(true);
      } else if (action.key === 'today_customers') {
        setTodayCustomersOpen(true);
      } else if (action.key === 'financial') {
        setFinancialOpen(true);
      } else if (action.key === 'points_log') {
        setPointsLogOpen(true);
      } else if (action.key === 'truck_stock') {
        setTruckStockOpen(true);
      } else if (action.key === 'stock_review') {
        setStockReviewOpen(true);
      } else if (action.key === 'attendance_log') {
        setAttendanceLogOpen(true);
      } else if (action.key === 'sales_summary') {
        setSalesSummaryOpen(true);
      }
      return;
    }
    if (action.key === 'tracking') {
      navigate(`${action.path}?worker=${selectedWorker.id}`);
      return;
    }
    navigate(action.path);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        {selectedWorker && (
          <button onClick={handleBack} className="p-1.5 rounded-lg hover:bg-muted">
            <ArrowRight className="w-5 h-5" />
          </button>
        )}
        <h2 className="text-xl font-bold">
          {selectedWorker ? selectedWorker.full_name : t('worker_actions.title')}
        </h2>
        {selectedWorker && liability && (
          <Badge variant={liability.totalLiability > 0 ? 'destructive' : 'outline'} className="mr-auto text-xs">
            {t('liability.title')}: {liability.totalLiability.toLocaleString('ar-DZ')} د.ج
          </Badge>
        )}
      </div>

      {!selectedWorker ? (
        <div className="grid grid-cols-3 gap-3">
          {workers.map((worker) => (
            <div
              key={worker.id}
              className="flex flex-col items-center justify-center p-4 gap-2 rounded-xl border border-border bg-card cursor-pointer active:scale-95 transition-all hover:shadow-md"
              onClick={() => handleSelectWorker(worker)}
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <HardHat className="w-6 h-6 text-primary" />
              </div>
              <span className="text-xs font-medium text-center leading-tight">{worker.full_name}</span>
              <span className="text-[10px] text-muted-foreground">{worker.role === 'worker' ? t('nav.workers') : worker.role}</span>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="grid !grid-cols-4 gap-1.5"
          style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}
        >
          {workerActions.map((action) => (
            <div
              key={action.key}
              className={`flex min-w-0 flex-col items-center justify-center p-2 gap-1 rounded-lg border cursor-pointer active:scale-95 transition-all hover:shadow-md ${action.color}`}
              onClick={() => handleAction(action)}
            >
              <action.icon className="w-4 h-4 shrink-0" />
              <span className="text-[10px] font-medium text-center leading-tight break-words">{t(action.labelKey)}</span>
            </div>
          ))}
        </div>
      )}
      <CoinExchangeDialog open={coinExchangeOpen} onOpenChange={setCoinExchangeOpen} preselectedWorkerId={selectedWorker?.id} />
      <WorkerHandoverPreviewDialog
        open={handoverOpen}
        onOpenChange={setHandoverOpen}
        targetWorkerId={selectedWorker?.id}
        targetWorkerName={selectedWorker?.full_name}
      />
      <TodayCustomersDialog
        open={todayCustomersOpen}
        onOpenChange={setTodayCustomersOpen}
        targetWorkerId={selectedWorker?.id}
        targetWorkerName={selectedWorker?.full_name}
      />
      <WorkerFinancialDialog
        open={financialOpen}
        onOpenChange={setFinancialOpen}
        workerId={selectedWorker?.id}
        workerName={selectedWorker?.full_name}
      />
      <WorkerPointsDialog
        open={pointsLogOpen}
        onOpenChange={setPointsLogOpen}
        workerId={selectedWorker?.id}
        workerName={selectedWorker?.full_name}
      />

      {/* Truck Stock Dialog */}
      {selectedWorker && (
        <Dialog open={truckStockOpen} onOpenChange={setTruckStockOpen}>
          <DialogContent className="max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                رصيد شاحنة {selectedWorker.full_name}
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              {truckStock.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p>لا يوجد رصيد في الشاحنة</p>
                </div>
              ) : (
                <div className="grid gap-2">
                  {[...truckStock]
                    .sort((a: any, b: any) => {
                      if (a.quantity === 0 && b.quantity > 0) return 1;
                      if (a.quantity > 0 && b.quantity === 0) return -1;
                      return ((a as any).product?.name || '').localeCompare((b as any).product?.name || '');
                    })
                    .map((item: any) => {
                      const stats = truckMovementStats[item.product_id];
                      const loaded = stats?.loaded || 0;
                      const sold = stats?.sold || 0;
                      const giftQty = stats?.giftQty || 0;
                      const giftUnit = stats?.giftUnit === 'piece' ? 'قطعة' : stats?.giftUnit === 'box' ? 'صندوق' : stats?.giftUnit === 'kg' ? 'كغ' : 'قطعة';
                      const isZero = item.quantity === 0;
                      return (
                        <div key={item.id} className={`p-3 rounded-lg border ${isZero ? 'bg-destructive/10 border-destructive/30' : 'bg-card'}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm">{item.product?.name}</span>
                            <span className={`font-bold text-lg ${isZero ? 'text-destructive' : 'text-primary'}`}>
                              {item.quantity}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground border-t pt-1 mt-1">
                            <span className="flex items-center gap-0.5">
                              <TrendingUp className="w-3 h-3 text-blue-500" />
                              شحن: {loaded}
                            </span>
                            <span className="flex items-center gap-0.5">
                              <TrendingDown className="w-3 h-3 text-green-500" />
                              مباع: {sold}
                            </span>
                            {giftQty > 0 && (
                              <span className="flex items-center gap-0.5">
                                <Gift className="w-3 h-3 text-orange-500" />
                                هدايا: {giftQty} {giftUnit}
                              </span>
                            )}
                            <span className="font-semibold">باقي: {item.quantity}</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}

      {/* Stock Review Dialog */}
      {selectedWorker && (
        <StockVerificationDialog
          open={stockReviewOpen}
          onOpenChange={setStockReviewOpen}
          workerId={selectedWorker.id}
        />
      )}
      <WorkerAttendanceLogDialog
        open={attendanceLogOpen}
        onOpenChange={setAttendanceLogOpen}
        workerId={selectedWorker?.id}
        workerName={selectedWorker?.full_name}
      />
      <WorkerSalesSummaryDialog
        open={salesSummaryOpen}
        onOpenChange={setSalesSummaryOpen}
        workerId={selectedWorker?.id}
        workerName={selectedWorker?.full_name}
      />
    </div>
  );
};

export default WorkerActions;
