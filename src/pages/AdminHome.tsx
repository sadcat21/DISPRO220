import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNavigation } from '@/hooks/useNavigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFontSize } from '@/contexts/FontSizeContext';
import { Calculator, Banknote, ArrowLeft, Navigation, Users, Receipt, ShoppingCart, Scale, Trophy, CalendarDays, Gift, ArrowDownToLine, Truck } from 'lucide-react';
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
import { isAdminRole } from '@/lib/utils';

// Color mapping by path for semantic meaning
const pathColors: Record<string, { bg: string; icon: string; border: string }> = {
  '/promo-table': { bg: 'bg-orange-50', icon: 'text-orange-600', border: 'border-orange-200' },
  '/stats': { bg: 'bg-indigo-50', icon: 'text-indigo-600', border: 'border-indigo-200' },
  '/orders': { bg: 'bg-blue-50', icon: 'text-blue-600', border: 'border-blue-200' },
  '/my-deliveries': { bg: 'bg-teal-50', icon: 'text-teal-600', border: 'border-teal-200' },
  '/my-promos': { bg: 'bg-amber-50', icon: 'text-amber-600', border: 'border-amber-200' },
  '/product-offers': { bg: 'bg-rose-50', icon: 'text-rose-600', border: 'border-rose-200' },
  '/customer-accounts': { bg: 'bg-cyan-50', icon: 'text-cyan-600', border: 'border-cyan-200' },
  '/warehouse': { bg: 'bg-emerald-50', icon: 'text-emerald-600', border: 'border-emerald-200' },
  '/stock-receipts': { bg: 'bg-lime-50', icon: 'text-lime-600', border: 'border-lime-200' },
  '/load-stock': { bg: 'bg-green-50', icon: 'text-green-600', border: 'border-green-200' },
  '/expenses': { bg: 'bg-yellow-50', icon: 'text-yellow-600', border: 'border-yellow-200' },
  '/expenses-management': { bg: 'bg-red-50', icon: 'text-red-600', border: 'border-red-200' },
  '/customer-debts': { bg: 'bg-rose-50', icon: 'text-rose-700', border: 'border-rose-200' },
  '/accounting': { bg: 'bg-amber-50', icon: 'text-amber-700', border: 'border-amber-200' },
  '/activity-logs': { bg: 'bg-violet-50', icon: 'text-violet-600', border: 'border-violet-200' },
  '/nearby-stores': { bg: 'bg-sky-50', icon: 'text-sky-600', border: 'border-sky-200' },
  '/branches': { bg: 'bg-purple-50', icon: 'text-purple-600', border: 'border-purple-200' },
  '/customers': { bg: 'bg-blue-50', icon: 'text-blue-700', border: 'border-blue-200' },
  '/workers': { bg: 'bg-fuchsia-50', icon: 'text-fuchsia-600', border: 'border-fuchsia-200' },
  '/products': { bg: 'bg-pink-50', icon: 'text-pink-600', border: 'border-pink-200' },
  '/permissions': { bg: 'bg-slate-50', icon: 'text-slate-600', border: 'border-slate-200' },
  '/settings': { bg: 'bg-gray-50', icon: 'text-gray-600', border: 'border-gray-200' },
  '/guide': { bg: 'bg-stone-50', icon: 'text-stone-600', border: 'border-stone-200' },
  '/shared-invoices': { bg: 'bg-orange-50', icon: 'text-orange-700', border: 'border-orange-200' },
  '/surplus-deficit': { bg: 'bg-violet-50', icon: 'text-violet-600', border: 'border-violet-200' },
  '/rewards': { bg: 'bg-yellow-50', icon: 'text-yellow-600', border: 'border-yellow-200' },
  '/promo-splits': { bg: 'bg-cyan-50', icon: 'text-cyan-600', border: 'border-cyan-200' },
};

const defaultColor = { bg: 'bg-muted/30', icon: 'text-primary', border: 'border-border' };

const gridColsClass: Record<number, string> = {
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

const AdminHome: React.FC = () => {
  const navigate = useNavigate();
  const { main, more } = useNavigation();
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

  const isAccountingHidden = useIsElementHidden('page', '/accounting');
  const isDebtsHidden = useIsElementHidden('page', '/customer-debts');
  const isGeoHidden = useIsElementHidden('page', '/geo-operations');
  const isWorkerActionsHidden = useIsElementHidden('page', '/worker-actions');
  const showInvoiceButton = isAdminRole(role);
  const showGiftsButton = isAdminRole(role);

  // Fetch active workers for gifts navigation
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

  const allItems = [...main, ...more].filter(item => item.path !== '/' && item.path !== '/accounting' && item.path !== '/customer-debts' && item.path !== '/geo-operations' && item.path !== '/worker-actions');

  // Quick stats
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

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">{t('nav.home')}</h2>

      {/* Quick Access Buttons */}
      <div className="grid grid-cols-2 gap-3">
        {!isAccountingHidden && (
          <div
            className="relative overflow-hidden rounded-xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100 p-4 cursor-pointer active:scale-[0.97] transition-all hover:shadow-lg"
            onClick={() => navigate('/accounting')}
          >
            <Calculator className="w-8 h-8 text-amber-600 mb-2" />
            <p className="font-bold text-sm text-amber-900">{t('accounting.title')}</p>
            {openSessions !== undefined && openSessions > 0 && (
              <p className="text-xs text-amber-700 mt-1">{openSessions} {t('accounting.status_open')}</p>
            )}
            <ArrowLeft className="absolute top-3 left-3 w-4 h-4 text-amber-400" />
          </div>
        )}

        {!isDebtsHidden && (
          <div
            className="relative overflow-hidden rounded-xl border-2 border-rose-300 bg-gradient-to-br from-rose-50 to-rose-100 p-4 cursor-pointer active:scale-[0.97] transition-all hover:shadow-lg"
            onClick={() => navigate('/customer-debts')}
          >
            <Banknote className="w-8 h-8 text-rose-600 mb-2" />
            <p className="font-bold text-sm text-rose-900">{t('debts.title')}</p>
            {activeDebts && activeDebts.count > 0 && (
              <p className="text-xs text-rose-700 mt-1">{activeDebts.count} • {activeDebts.total.toLocaleString()} DA</p>
            )}
            <ArrowLeft className="absolute top-3 left-3 w-4 h-4 text-rose-400" />
          </div>
        )}
      </div>

      {/* Surplus/Deficit Treasury & Rewards */}
      {isAdminRole(role) && (
        <div className="grid grid-cols-4 gap-3">
          <div
            className="relative overflow-hidden rounded-xl border-2 border-violet-300 bg-gradient-to-br from-violet-50 to-violet-100 p-3 cursor-pointer active:scale-[0.97] transition-all hover:shadow-lg"
            onClick={() => navigate('/surplus-deficit')}
          >
            <Scale className="w-6 h-6 text-violet-600 mb-1" />
            <p className="font-bold text-[10px] text-violet-900">{t('admin.surplus_treasury')}</p>
          </div>
          <div
            className="relative overflow-hidden rounded-xl border-2 border-yellow-300 bg-gradient-to-br from-yellow-50 to-yellow-100 p-3 cursor-pointer active:scale-[0.97] transition-all hover:shadow-lg"
            onClick={() => navigate('/rewards')}
          >
            <Trophy className="w-6 h-6 text-yellow-600 mb-1" />
            <p className="font-bold text-[10px] text-yellow-900">{t('admin.rewards')}</p>
          </div>
          <div
            className="relative overflow-hidden rounded-xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-emerald-100 p-3 cursor-pointer active:scale-[0.97] transition-all hover:shadow-lg"
            onClick={() => navigate('/attendance')}
          >
            <CalendarDays className="w-6 h-6 text-emerald-600 mb-1" />
            <p className="font-bold text-[10px] text-emerald-900">{t('admin.attendance')}</p>
          </div>
          <div
            className="relative overflow-hidden rounded-xl border-2 border-purple-300 bg-gradient-to-br from-purple-50 to-purple-100 p-3 cursor-pointer active:scale-[0.97] transition-all hover:shadow-lg"
            onClick={() => { setGiftsWorkerIdx(0); setGiftsOpen(true); }}
          >
            <Gift className="w-6 h-6 text-purple-600 mb-1" />
            <p className="font-bold text-[10px] text-purple-900">{t('admin.promo_tracking')}</p>
          </div>
        </div>
      )}

      {/* Quick Create Order Button */}
      <div
        className="relative overflow-hidden rounded-xl border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-blue-100 p-4 cursor-pointer active:scale-[0.97] transition-all hover:shadow-lg flex items-center gap-3"
        onClick={() => setShowCreateOrder(true)}
      >
        <ShoppingCart className="w-8 h-8 text-blue-600" />
        <div>
          <p className="font-bold text-sm text-blue-900">{t('orders.create_order')}</p>
          <p className="text-xs text-blue-700">{t('orders.create_order_desc')}</p>
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-xl border-2 border-purple-300 bg-gradient-to-br from-purple-50 to-purple-100 p-4 cursor-pointer active:scale-[0.97] transition-all hover:shadow-lg flex items-center gap-3"
        onClick={() => setManualPromoOpen(true)}
      >
        <Gift className="w-8 h-8 text-purple-600" />
        <div>
          <p className="font-bold text-sm text-purple-900">{t('admin.manual_promo')}</p>
          <p className="text-xs text-purple-700">{t('admin.manual_promo_desc')}</p>
        </div>
      </div>

      {/* Factory Receipt Quick Button */}
      <div
        className="relative overflow-hidden rounded-xl border-2 border-lime-300 bg-gradient-to-br from-lime-50 to-green-100 p-4 cursor-pointer active:scale-[0.97] transition-all hover:shadow-lg flex items-center gap-3"
        onClick={() => setFactoryReceiptOpen(true)}
      >
        <ArrowDownToLine className="w-8 h-8 text-lime-600" />
        <div>
          <p className="font-bold text-sm text-lime-900">استلام من المصنع</p>
          <p className="text-xs text-lime-700">تسجيل وصل استلام منتجات</p>
      </div>

      {/* Factory Delivery Quick Button */}
      <div
        className="relative overflow-hidden rounded-xl border-2 border-red-300 bg-gradient-to-br from-red-50 to-orange-100 p-4 cursor-pointer active:scale-[0.97] transition-all hover:shadow-lg flex items-center gap-3"
        onClick={() => setFactoryDeliveryOpen(true)}
      >
        <Truck className="w-8 h-8 text-red-600" />
        <div>
          <p className="font-bold text-sm text-red-900">تسليم للمصنع</p>
          <p className="text-xs text-red-700">تسليم تالف وباليطات</p>
        </div>
      </div>
      </div>

      {/* Invoice Request Quick Button */}
      {showInvoiceButton && (
        <div
          className="relative overflow-hidden rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10 p-4 cursor-pointer active:scale-[0.97] transition-all hover:shadow-lg flex items-center gap-3"
          onClick={() => setInvoiceRequestOpen(true)}
        >
          <Receipt className="w-8 h-8 text-primary" />
          <div>
            <p className="font-bold text-sm text-foreground">{t('admin.invoice_request')}</p>
            <p className="text-xs text-muted-foreground">{t('admin.invoice_request_desc')}</p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {!isGeoHidden && (
          <div
            className="relative overflow-hidden rounded-xl border-2 border-teal-300 bg-gradient-to-br from-teal-50 to-emerald-100 p-4 cursor-pointer active:scale-[0.97] transition-all hover:shadow-lg"
            onClick={() => navigate('/geo-operations')}
          >
            <Navigation className="w-8 h-8 text-teal-600 mb-2" />
            <p className="font-bold text-sm text-teal-900">{t('nav.geo_operations')}</p>
          </div>
        )}

        {!isWorkerActionsHidden && (
          <div
            className="relative overflow-hidden rounded-xl border-2 border-indigo-300 bg-gradient-to-br from-indigo-50 to-indigo-100 p-4 cursor-pointer active:scale-[0.97] transition-all hover:shadow-lg"
            onClick={() => navigate('/worker-actions')}
          >
            <Users className="w-8 h-8 text-indigo-600 mb-2" />
            <p className="font-bold text-sm text-indigo-900">{t('nav.worker_actions')}</p>
          </div>
        )}
      </div>

      {/* Regular Navigation Grid */}
      <div className={`grid ${gridColsClass[gridCols] || 'grid-cols-4'} gap-2`}>
        {allItems.map((item) => {
          const colors = pathColors[item.path] || defaultColor;
          return (
            <div
              key={item.path}
              className={`flex flex-col items-center justify-center p-2.5 gap-1.5 rounded-xl border cursor-pointer active:scale-95 transition-all ${colors.bg} ${colors.border} hover:shadow-md`}
              onClick={() => navigate(item.path)}
            >
              <item.icon className={`w-5 h-5 ${colors.icon}`} />
              <span className="text-[10px] font-medium text-center leading-tight text-foreground">{item.label}</span>
            </div>
          );
        })}
      </div>

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

      {/* Worker navigation bar for gifts - shown when gifts dialog is open */}
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

