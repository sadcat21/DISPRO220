import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNavigation } from '@/hooks/useNavigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFontSize } from '@/contexts/FontSizeContext';
import { Calculator, Banknote, ArrowLeft, Navigation, Users, Receipt, ShoppingCart } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useIsElementHidden } from '@/hooks/useUIOverrides';
import InvoiceRequestDialog from '@/components/treasury/InvoiceRequestDialog';
import CreateOrderDialog from '@/components/orders/CreateOrderDialog';

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

  const isAccountingHidden = useIsElementHidden('page', '/accounting');
  const isDebtsHidden = useIsElementHidden('page', '/customer-debts');
  const isGeoHidden = useIsElementHidden('page', '/geo-operations');
  const isWorkerActionsHidden = useIsElementHidden('page', '/worker-actions');
  const showInvoiceButton = role === 'admin' || role === 'branch_admin';

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

      {/* Quick Create Order Button */}
      <div
        className="relative overflow-hidden rounded-xl border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-blue-100 p-4 cursor-pointer active:scale-[0.97] transition-all hover:shadow-lg flex items-center gap-3"
        onClick={() => setShowCreateOrder(true)}
      >
        <ShoppingCart className="w-8 h-8 text-blue-600" />
        <div>
          <p className="font-bold text-sm text-blue-900">{t('orders.create_order')}</p>
          <p className="text-xs text-blue-700">{t('orders.create_order')}</p>
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
            <p className="font-bold text-sm text-foreground">طلب فاتورة</p>
            <p className="text-xs text-muted-foreground">إرسال طلب فاتورة عبر واتساب</p>
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
    </div>
  );
};

export default AdminHome;
