import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNavigation } from '@/hooks/useNavigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFontSize } from '@/contexts/FontSizeContext';
import {
  Calculator, Banknote, ArrowLeft, Navigation, Users, Receipt, ShoppingCart, Scale, Trophy,
  CalendarDays, Gift, ArrowDownToLine, Truck, ClipboardCheck, Building2, Warehouse, Package,
  Wallet, FileText, Vault, FolderOpen, MapPin, Activity, Store, UserCheck, UserCog, Settings,
  BookOpen, Shield, BarChart3, FileSpreadsheet, Split, Radar, ClipboardList, LucideIcon
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useIsElementHidden } from '@/hooks/useUIOverrides';
import InvoiceRequestDialog from '@/components/treasury/InvoiceRequestDialog';
import CreateOrderDialog from '@/components/orders/CreateOrderDialog';
import WorkerGiftsSummaryDialog from '@/components/accounting/WorkerGiftsSummaryDialog';
import ManualPromoEntryDialog from '@/components/offers/ManualPromoEntryDialog';
import FactoryReceiptQuickDialog from '@/components/stock/FactoryReceiptQuickDialog';
import FactoryDeliveryQuickDialog from '@/components/stock/FactoryDeliveryQuickDialog';
import { isAdminRole, isSuperAdminRole } from '@/lib/utils';

// ─── Functional Group Definitions ───

interface GroupItem {
  path: string;
  icon: LucideIcon;
  label: string;
  action?: () => void; // for dialog-opening buttons
}

interface FunctionalGroup {
  title: string;
  color: { bg: string; border: string; title: string; iconDefault: string };
  branchColor?: { bg: string; border: string; title: string; iconDefault: string };
  items: GroupItem[];
}

const itemColors: Record<string, { bg: string; icon: string; border: string }> = {
  '/accounting': { bg: 'bg-amber-50', icon: 'text-amber-600', border: 'border-amber-200' },
  '/customer-debts': { bg: 'bg-rose-50', icon: 'text-rose-600', border: 'border-rose-200' },
  '/surplus-deficit': { bg: 'bg-violet-50', icon: 'text-violet-600', border: 'border-violet-200' },
  '/expenses': { bg: 'bg-yellow-50', icon: 'text-yellow-600', border: 'border-yellow-200' },
  '/expenses-management': { bg: 'bg-red-50', icon: 'text-red-600', border: 'border-red-200' },
  '/manager-treasury': { bg: 'bg-emerald-50', icon: 'text-emerald-600', border: 'border-emerald-200' },
  '/shared-invoices': { bg: 'bg-orange-50', icon: 'text-orange-600', border: 'border-orange-200' },
  '/daily-receipts': { bg: 'bg-teal-50', icon: 'text-teal-600', border: 'border-teal-200' },
  '/worker-debts': { bg: 'bg-pink-50', icon: 'text-pink-600', border: 'border-pink-200' },
  '/orders': { bg: 'bg-blue-50', icon: 'text-blue-600', border: 'border-blue-200' },
  '/order-tracking': { bg: 'bg-indigo-50', icon: 'text-indigo-600', border: 'border-indigo-200' },
  '/my-deliveries': { bg: 'bg-teal-50', icon: 'text-teal-600', border: 'border-teal-200' },
  '/warehouse': { bg: 'bg-emerald-50', icon: 'text-emerald-600', border: 'border-emerald-200' },
  '/warehouse-review': { bg: 'bg-teal-50', icon: 'text-teal-600', border: 'border-teal-200' },
  '/stock-receipts': { bg: 'bg-lime-50', icon: 'text-lime-600', border: 'border-lime-200' },
  '/load-stock': { bg: 'bg-green-50', icon: 'text-green-600', border: 'border-green-200' },
  '/customers': { bg: 'bg-blue-50', icon: 'text-blue-700', border: 'border-blue-200' },
  '/customer-accounts': { bg: 'bg-cyan-50', icon: 'text-cyan-600', border: 'border-cyan-200' },
  '/nearby-stores': { bg: 'bg-sky-50', icon: 'text-sky-600', border: 'border-sky-200' },
  '/promo-table': { bg: 'bg-orange-50', icon: 'text-orange-600', border: 'border-orange-200' },
  '/product-offers': { bg: 'bg-rose-50', icon: 'text-rose-600', border: 'border-rose-200' },
  '/my-promos': { bg: 'bg-amber-50', icon: 'text-amber-600', border: 'border-amber-200' },
  '/promo-splits': { bg: 'bg-cyan-50', icon: 'text-cyan-600', border: 'border-cyan-200' },
  '/workers': { bg: 'bg-fuchsia-50', icon: 'text-fuchsia-600', border: 'border-fuchsia-200' },
  '/worker-actions': { bg: 'bg-indigo-50', icon: 'text-indigo-600', border: 'border-indigo-200' },
  '/worker-tracking': { bg: 'bg-sky-50', icon: 'text-sky-600', border: 'border-sky-200' },
  '/attendance': { bg: 'bg-emerald-50', icon: 'text-emerald-600', border: 'border-emerald-200' },
  '/rewards': { bg: 'bg-yellow-50', icon: 'text-yellow-600', border: 'border-yellow-200' },
  '/products': { bg: 'bg-pink-50', icon: 'text-pink-600', border: 'border-pink-200' },
  '/stats': { bg: 'bg-indigo-50', icon: 'text-indigo-600', border: 'border-indigo-200' },
  '/geo-operations': { bg: 'bg-teal-50', icon: 'text-teal-600', border: 'border-teal-200' },
  '/activity-logs': { bg: 'bg-violet-50', icon: 'text-violet-600', border: 'border-violet-200' },
  '/branches': { bg: 'bg-purple-50', icon: 'text-purple-600', border: 'border-purple-200' },
  '/permissions': { bg: 'bg-slate-50', icon: 'text-slate-600', border: 'border-slate-200' },
  '/settings': { bg: 'bg-gray-50', icon: 'text-gray-600', border: 'border-gray-200' },
  '/guide': { bg: 'bg-stone-50', icon: 'text-stone-600', border: 'border-stone-200' },
};

const defaultItemColor = { bg: 'bg-muted/30', icon: 'text-primary', border: 'border-border' };

const AdminHome: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { gridCols } = useFontSize();
  const { activeBranch, role } = useAuth();
  const [invoiceRequestOpen, setInvoiceRequestOpen] = useState(false);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [giftsOpen, setGiftsOpen] = useState(false);
  const [giftsWorkerIdx, setGiftsWorkerIdx] = useState(0);
  const [manualPromoOpen, setManualPromoOpen] = useState(false);
  const [factoryReceiptOpen, setFactoryReceiptOpen] = useState(false);
  const [factoryDeliveryOpen, setFactoryDeliveryOpen] = useState(false);

  const isBranchAdmin = role === 'branch_admin';

  const isAccountingHidden = useIsElementHidden('page', '/accounting');
  const isDebtsHidden = useIsElementHidden('page', '/customer-debts');
  const isGeoHidden = useIsElementHidden('page', '/geo-operations');
  const isWorkerActionsHidden = useIsElementHidden('page', '/worker-actions');
  const showInvoiceButton = isAdminRole(role);
  const showGiftsButton = isAdminRole(role);

  const { data: activeWorkers = [] } = useQuery({
    queryKey: ['admin-home-workers', activeBranch?.id],
    queryFn: async () => {
      let q = supabase.from('workers').select('id, full_name, username').eq('is_active', true).eq('role', 'worker');
      if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id);
      const { data } = await q.order('full_name');
      return data || [];
    },
    enabled: showGiftsButton,
  });

  const currentGiftsWorker = activeWorkers[giftsWorkerIdx] || null;

  const { data: activeDebts } = useQuery({
    queryKey: ['active-debts-count', activeBranch?.id],
    queryFn: async () => {
      let query = supabase.from('customer_debts').select('remaining_amount', { count: 'exact' }).in('status', ['active', 'partially_paid']);
      if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);
      const { data, count } = await query;
      const total = data?.reduce((sum, d) => sum + Number(d.remaining_amount || 0), 0) || 0;
      return { count: count || 0, total };
    },
  });

  const { data: openSessions } = useQuery({
    queryKey: ['open-sessions-count', activeBranch?.id],
    queryFn: async () => {
      let query = supabase.from('accounting_sessions').select('id', { count: 'exact' }).eq('status', 'open');
      if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);
      const { count } = await query;
      return count || 0;
    },
  });

  // ─── Build Functional Groups ───

  const groups: FunctionalGroup[] = [
    // 1. المحاسبة والمالية
    {
      title: 'المحاسبة والمالية',
      color: { bg: 'bg-amber-500/10', border: 'border-amber-300', title: 'text-amber-800', iconDefault: 'text-amber-600' },
      branchColor: { bg: 'bg-teal-500/10', border: 'border-teal-300', title: 'text-teal-800', iconDefault: 'text-teal-600' },
      items: [
        ...(!isAccountingHidden ? [{ path: '/accounting', icon: Calculator, label: t('accounting.title') }] : []),
        ...(!isDebtsHidden ? [{ path: '/customer-debts', icon: Banknote, label: t('debts.title') }] : []),
        { path: '/surplus-deficit', icon: Scale, label: 'الفائض والعجز' },
        { path: '/expenses', icon: Wallet, label: t('expenses.my_expenses') },
        { path: '/expenses-management', icon: Wallet, label: t('expenses.title') },
        { path: '/manager-treasury', icon: Vault, label: t('nav.manager_treasury') },
        { path: '/daily-receipts', icon: FileText, label: t('nav.daily_receipts') },
        { path: '/shared-invoices', icon: FolderOpen, label: 'الفواتير المشاركة' },
        { path: '/worker-debts', icon: Banknote, label: t('nav.worker_debts') },
      ],
    },
    // 2. الطلبات والتوصيل
    {
      title: 'الطلبات والتوصيل',
      color: { bg: 'bg-blue-500/10', border: 'border-blue-300', title: 'text-blue-800', iconDefault: 'text-blue-600' },
      branchColor: { bg: 'bg-cyan-500/10', border: 'border-cyan-300', title: 'text-cyan-800', iconDefault: 'text-cyan-600' },
      items: [
        { path: '/create-order', icon: ShoppingCart, label: t('orders.create_order'), action: () => setShowCreateOrder(true) },
        { path: '/orders', icon: ShoppingCart, label: t('nav.orders') },
        { path: '/order-tracking', icon: Radar, label: 'تتبع الطلبات' },
        { path: '/my-deliveries', icon: Truck, label: t('nav.my_deliveries') },
        ...(showInvoiceButton ? [{ path: '/invoice-request', icon: Receipt, label: t('admin.invoice_request'), action: () => setInvoiceRequestOpen(true) }] : []),
      ],
    },
    // 3. المخزون والمستودع
    {
      title: 'المخزون والمستودع',
      color: { bg: 'bg-emerald-500/10', border: 'border-emerald-300', title: 'text-emerald-800', iconDefault: 'text-emerald-600' },
      branchColor: { bg: 'bg-green-500/10', border: 'border-green-300', title: 'text-green-800', iconDefault: 'text-green-600' },
      items: [
        { path: '/warehouse', icon: Warehouse, label: t('stock.warehouse_stock') },
        { path: '/warehouse-review', icon: ClipboardCheck, label: 'مراجعة المخزون' },
        { path: '/stock-receipts', icon: ClipboardList, label: t('stock.receipts') },
        { path: '/load-stock', icon: Truck, label: t('stock.load_to_worker') },
        { path: '/factory-receipt', icon: ArrowDownToLine, label: 'استلام من المصنع', action: () => setFactoryReceiptOpen(true) },
        { path: '/factory-delivery', icon: Truck, label: 'تسليم للمصنع', action: () => setFactoryDeliveryOpen(true) },
      ],
    },
    // 4. العملاء
    {
      title: 'العملاء',
      color: { bg: 'bg-sky-500/10', border: 'border-sky-300', title: 'text-sky-800', iconDefault: 'text-sky-600' },
      items: [
        { path: '/customers', icon: UserCheck, label: t('nav.customers') },
        { path: '/customer-accounts', icon: UserCog, label: t('nav.customer_accounts') },
        { path: '/nearby-stores', icon: Store, label: t('nav.nearby_stores') },
      ],
    },
    // 5. العروض والترويج
    {
      title: 'العروض والترويج',
      color: { bg: 'bg-orange-500/10', border: 'border-orange-300', title: 'text-orange-800', iconDefault: 'text-orange-600' },
      branchColor: { bg: 'bg-amber-500/10', border: 'border-amber-300', title: 'text-amber-800', iconDefault: 'text-amber-600' },
      items: [
        { path: '/promo-table', icon: FileSpreadsheet, label: t('nav.table') },
        { path: '/product-offers', icon: Gift, label: t('nav.product_offers') },
        { path: '/my-promos', icon: BarChart3, label: t('nav.my_promos') },
        { path: '/promo-splits', icon: Split, label: 'تجزئة العروض' },
        { path: '/manual-promo', icon: Gift, label: t('admin.manual_promo'), action: () => setManualPromoOpen(true) },
        ...(isSuperAdminRole(role) ? [{ path: '/gifts-tracking', icon: Gift, label: t('admin.promo_tracking'), action: () => { setGiftsWorkerIdx(0); setGiftsOpen(true); } }] : []),
      ],
    },
    // 6. الموارد البشرية
    {
      title: 'الموارد البشرية',
      color: { bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-300', title: 'text-fuchsia-800', iconDefault: 'text-fuchsia-600' },
      branchColor: { bg: 'bg-purple-500/10', border: 'border-purple-300', title: 'text-purple-800', iconDefault: 'text-purple-600' },
      items: [
        { path: '/workers', icon: Users, label: t('nav.workers') },
        ...(!isWorkerActionsHidden ? [{ path: '/worker-actions', icon: Users, label: t('nav.worker_actions') }] : []),
        { path: '/worker-tracking', icon: MapPin, label: t('navigation.worker_tracking') },
        { path: '/attendance', icon: CalendarDays, label: 'المداومة' },
        { path: '/rewards', icon: Trophy, label: 'المكافآت والعقوبات' },
      ],
    },
    // 7. الإدارة والتقارير
    {
      title: 'الإدارة والتقارير',
      color: { bg: 'bg-slate-500/10', border: 'border-slate-300', title: 'text-slate-800', iconDefault: 'text-slate-600' },
      items: [
        { path: '/products', icon: Package, label: t('nav.products') },
        { path: '/stats', icon: BarChart3, label: t('nav.stats') },
        ...(!isGeoHidden ? [{ path: '/geo-operations', icon: Navigation, label: t('nav.geo_operations') }] : []),
        { path: '/activity-logs', icon: Activity, label: t('nav.activity_logs') },
        ...(isSuperAdminRole(role) ? [
          { path: '/branches', icon: Building2, label: t('nav.branches') },
          { path: '/permissions', icon: Shield, label: t('nav.permissions') },
        ] : []),
        { path: '/settings', icon: Settings, label: t('nav.settings') },
        { path: '/guide', icon: BookOpen, label: t('nav.guide') },
      ],
    },
  ];

  const gridColsClass: Record<number, string> = { 3: 'grid-cols-3', 4: 'grid-cols-4' };
  const cols = gridColsClass[gridCols] || 'grid-cols-4';

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      {isBranchAdmin ? (
        <div className="relative overflow-hidden rounded-2xl border-2 border-teal-300 bg-gradient-to-br from-teal-600 via-teal-500 to-cyan-500 p-5 text-white shadow-lg">
          <div className="absolute top-0 left-0 w-full h-full opacity-10">
            <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-white/20" />
            <div className="absolute -bottom-8 -right-8 w-32 h-32 rounded-full bg-white/15" />
          </div>
          <div className="relative flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <div>
              <p className="text-teal-100 text-xs font-medium">مدير الفرع</p>
              <h2 className="text-xl font-bold">{activeBranch?.name || 'الفرع'}</h2>
            </div>
          </div>
        </div>
      ) : (
        <h2 className="text-xl font-bold">{t('nav.home')}</h2>
      )}




      {/* Functional Groups */}
      {groups.map((group) => {
        if (group.items.length === 0) return null;
        const gColor = isBranchAdmin && group.branchColor ? group.branchColor : group.color;
        return (
          <div key={group.title} className={`rounded-xl border ${gColor.border} ${gColor.bg} p-3 space-y-2`}>
            <h3 className={`text-xs font-bold ${gColor.title} px-1`}>{group.title}</h3>
            <div className={`grid ${cols} gap-2`}>
              {group.items.map((item) => {
                const ic = itemColors[item.path] || defaultItemColor;
                return (
                  <div
                    key={item.path}
                    className={`flex flex-col items-center justify-center p-2.5 gap-1.5 rounded-xl border cursor-pointer active:scale-95 transition-all bg-white/80 ${ic.border} hover:shadow-md`}
                    onClick={() => item.action ? item.action() : navigate(item.path)}
                  >
                    <item.icon className={`w-5 h-5 ${ic.icon}`} />
                    <span className="text-[10px] font-medium text-center leading-tight text-foreground">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Dialogs */}
      <InvoiceRequestDialog open={invoiceRequestOpen} onOpenChange={setInvoiceRequestOpen} />
      <CreateOrderDialog open={showCreateOrder} onOpenChange={setShowCreateOrder} />
      <ManualPromoEntryDialog open={manualPromoOpen} onOpenChange={setManualPromoOpen} />
      <FactoryReceiptQuickDialog open={factoryReceiptOpen} onOpenChange={setFactoryReceiptOpen} />
      <FactoryDeliveryQuickDialog open={factoryDeliveryOpen} onOpenChange={setFactoryDeliveryOpen} />

      {giftsOpen && (
        <WorkerGiftsSummaryDialog
          open={giftsOpen}
          onOpenChange={setGiftsOpen}
          workerId={currentGiftsWorker?.id}
          workerName={currentGiftsWorker?.full_name || currentGiftsWorker?.username}
        />
      )}

      {giftsOpen && activeWorkers.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-[60] bg-background border-t p-2 flex items-center gap-1 overflow-x-auto" dir="rtl">
          {activeWorkers.map((w, idx) => (
            <button
              key={w.id}
              onClick={() => setGiftsWorkerIdx(idx)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                idx === giftsWorkerIdx
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {w.full_name || w.username}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminHome;
