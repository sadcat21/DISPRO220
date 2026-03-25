import React, { useState, useEffect, useMemo } from 'react';

import { supabase } from '@/integrations/supabase/client';
import { Product } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useWorkerPermissions } from '@/hooks/usePermissions';
import { useIsElementHidden } from '@/hooks/useUIOverrides';
import ProductGrid from '@/components/promo/ProductGrid';
import AddPromoDialog from '@/components/promo/AddPromoDialog';
import DirectSaleDialog from '@/components/warehouse/DirectSaleDialog';
import FactoryReceiptQuickDialog from '@/components/stock/FactoryReceiptQuickDialog';
import CustomerActionDialog from '@/components/orders/CustomerActionDialog';
import CreateOrderDialog from '@/components/orders/CreateOrderDialog';
import CustomerPickerDialog from '@/components/orders/CustomerPickerDialog';
import { useTrackVisit } from '@/hooks/useVisitTracking';
import { Customer } from '@/types/database';
import { toast } from 'sonner';
import { ShoppingCart, Gift, Loader2, ShoppingBag, Truck, Package, Banknote, Users, Wallet, ClipboardList, MapPin, Trophy, MessageCircle, HardHat, CalendarCheck, ArrowDownToLine } from 'lucide-react';

import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import WorkerHandoverPreviewDialog from '@/components/accounting/WorkerHandoverPreviewDialog';
import TodayCustomersDialog from '@/components/sectors/TodayCustomersDialog';
import PalletCalculatorDialog from '@/components/stock/PalletCalculatorDialog';
import AttendanceButton from '@/components/attendance/AttendanceButton';
import ManualPromoEntryDialog from '@/components/offers/ManualPromoEntryDialog';

const WorkerHome: React.FC = () => {
  const { user, workerId, role, activeRole, activeBranch } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { data: permissions = [], isLoading: permissionsLoading } = useWorkerPermissions();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showPromoDialog, setShowPromoDialog] = useState(false);
  const [showDirectSaleDialog, setShowDirectSaleDialog] = useState(false);
  const [showCreateOrderDialog, setShowCreateOrderDialog] = useState(false);
  const [showCustomerPickerForOrder, setShowCustomerPickerForOrder] = useState(false);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [selectedCustomerForAction, setSelectedCustomerForAction] = useState<Customer | null>(null);
  const [showHandoverPreview, setShowHandoverPreview] = useState(false);
  const [showTodayCustomers, setShowTodayCustomers] = useState(false);
  const [showPalletCalculator, setShowPalletCalculator] = useState(false);
  const [showManualPromoEntry, setShowManualPromoEntry] = useState(false);
  const [showFactoryReceipt, setShowFactoryReceipt] = useState(false);

  const { trackVisit } = useTrackVisit();
  const isDirectSaleHidden = useIsElementHidden('button', 'home_direct_sale');
  const isCreateOrderHidden = useIsElementHidden('button', 'home_orders');
  const isAddCustomerHidden = useIsElementHidden('button', 'home_customers');
  const isAddPromoHidden = useIsElementHidden('button', 'home_promos');
  const isCollectDebtHidden = useIsElementHidden('button', 'home_debts');
  const isDeliveriesHidden = useIsElementHidden('button', 'home_deliveries');
  const isMyStockHidden = useIsElementHidden('button', 'home_my_stock');
  const isExpensesHidden = useIsElementHidden('button', 'home_expenses');
  const isOrdersPageHidden = useIsElementHidden('page', '/orders');
  const isDeliveriesPageHidden = useIsElementHidden('page', '/my-deliveries');
  const isMyStockPageHidden = useIsElementHidden('page', '/my-stock');
  const isCustomersPageHidden = useIsElementHidden('page', '/customers');
  const isExpensesPageHidden = useIsElementHidden('page', '/expenses');
  const isMyPromosPageHidden = useIsElementHidden('page', '/my-promos');
  const isDebtsPageHidden = useIsElementHidden('page', '/customer-debts');
  const isRewardsHidden = useIsElementHidden('button', 'home_rewards');
  const isRewardsPageHidden = useIsElementHidden('page', '/my-rewards');
  const isDailyReceiptsHidden = useIsElementHidden('button', 'home_daily_receipts');
  const isDailyReceiptsPageHidden = useIsElementHidden('page', '/daily-receipts');
  const isAvailableOffersHidden = useIsElementHidden('button', 'home_available_offers');
  const isAvailableOffersPageHidden = useIsElementHidden('page', '/available-offers');
  const isWorkerActionsHidden = useIsElementHidden('page', '/worker-actions');
  const isWorkerActionsButtonHidden = useIsElementHidden('button', 'home_worker_actions');
  const isWarehouseStockHidden = useIsElementHidden('page', '/warehouse');
  const isWarehouseStockButtonHidden = useIsElementHidden('button', 'home_warehouse_stock');
  const isTodayCustomersHidden = useIsElementHidden('button', 'home_today_customers');
  const isSupervisor = role === 'supervisor';
  const isWarehouseManager = activeRole?.custom_role_code === 'warehouse_manager';

  const JS_DAY_TO_NAME: Record<number, string> = {
    6: 'saturday', 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday',
  };
  const DAY_NAMES: Record<string, string> = {
    saturday: t('days.saturday'), sunday: t('days.sunday'), monday: t('days.monday'),
    tuesday: t('days.tuesday'), wednesday: t('days.wednesday'), thursday: t('days.thursday'),
  };
  const todayName = JS_DAY_TO_NAME[new Date().getDay()] || '';
  const todayDayLabel = DAY_NAMES[todayName] || todayName;

  // Fetch today's scheduled sectors for current worker
  const { data: todaySectorNames = [] } = useQuery({
    queryKey: ['home-today-sector-names', workerId, todayName],
    queryFn: async () => {
      // Get sector_schedules for today
      const { data: schedules } = await supabase
        .from('sector_schedules')
        .select('sector_id')
        .eq('worker_id', workerId!)
        .eq('day', todayName);
      const sectorIds = (schedules || []).map(s => s.sector_id);
      if (sectorIds.length === 0) return [];
      const { data: sectors } = await supabase
        .from('sectors')
        .select('name')
        .in('id', sectorIds);
      return (sectors || []).map(s => s.name);
    },
    enabled: !!workerId && !!todayName,
    staleTime: 5 * 60 * 1000,
  });

  const todayCustomersLabel = useMemo(() => {
    const parts = [t('worker.today_customers'), todayDayLabel];
    if (todaySectorNames.length > 0) parts.push(todaySectorNames.join(' / '));
    return parts.join(' — ');
  }, [todayDayLabel, todaySectorNames]);

  const { data: stockItems } = useQuery({
    queryKey: ['my-worker-stock', workerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worker_stock')
        .select('*, product:products(*)')
        .eq('worker_id', workerId!)
        .gt('quantity', 0);
      if (error) throw error;
      return data;
    },
    enabled: !!workerId,
  });

  // Resolve branch for warehouse manager (activeBranch may be null for non-admin roles)
  const { data: workerBranchId } = useQuery({
    queryKey: ['worker-branch-id', workerId],
    queryFn: async () => {
      const { data } = await supabase.from('workers').select('branch_id').eq('id', workerId!).maybeSingle();
      return data?.branch_id || null;
    },
    enabled: isWarehouseManager && !activeBranch?.id && !!workerId,
  });
  const effectiveBranchId = activeBranch?.id || workerBranchId;

  // Warehouse stock for warehouse manager direct sales
  const { data: warehouseStockItems } = useQuery({
    queryKey: ['warehouse-stock-for-sale', effectiveBranchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouse_stock')
        .select('*, product:products(*)')
        .eq('branch_id', effectiveBranchId!)
        .gt('quantity', 0);
      if (error) throw error;
      return data;
    },
    enabled: isWarehouseManager && !!effectiveBranchId,
  });

  const { data: allCustomers = [], isLoading: customersLoading } = useQuery({
    queryKey: ['customers-for-order-picker'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return data as Customer[];
    },
    enabled: showCustomerPickerForOrder,
  });

  // Check permissions
  const hasPromoAccess = permissions.some(p =>
    ['view_promos', 'create_promos', 'page_promos'].includes(p.permission_code)
  );
  const hasOrdersAccess = permissions.some(p =>
    ['view_orders', 'create_orders', 'page_orders'].includes(p.permission_code)
  );
  const hasDeliveryAccess = permissions.some(p =>
    ['view_assigned_orders', 'update_order_status'].includes(p.permission_code)
  );
  const hasDebtAccess = permissions.some(p =>
    ['page_customer_debts', 'view_customer_debts', 'collect_debts'].includes(p.permission_code)
  );
  const hasCustomerAccess = permissions.some(p =>
    ['page_customers'].includes(p.permission_code)
  );
  const hasExpenseAccess = true; // All workers can access expenses

  useEffect(() => {
    if (!permissionsLoading && hasPromoAccess) {
      fetchProducts();
    } else if (!permissionsLoading) {
      setIsLoading(false);
    }
  }, [hasPromoAccess, permissionsLoading]);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error(t('products.loading_failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleProductSelect = (product: Product) => {
    setSelectedProduct(product);
    setShowPromoDialog(true);
  };

  // Determine welcome message based on permissions
  const getWelcomeMessage = () => {
    if (permissionsLoading) return t('common.loading_permissions');
    if (hasPromoAccess) {
      return t('products.choose');
    }
    if (hasOrdersAccess) {
      return t('orders.manage');
    }
    return t('common.welcome');
  };



  // Loading skeleton for permissions
  if (permissionsLoading) {
    return (
      <div className="pb-4">
        {/* Welcome Section */}
        <div className="bg-gradient-to-l from-primary to-primary/80 text-primary-foreground p-6">
          <h2 className="text-xl font-bold mb-1">{t('common.welcome')} {user?.full_name} 👋</h2>
          <p className="text-primary-foreground/80 text-sm">{t('common.loading_permissions')}</p>
        </div>

        {/* Loading Skeleton */}
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
          <div className="grid grid-cols-1 gap-3">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24 touch-pan-y">
      {/* Welcome Section */}
      <div className="bg-gradient-to-l from-primary to-primary/80 text-primary-foreground p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold mb-1">{t('common.welcome')} {user?.full_name} 👋</h2>
            <p className="text-primary-foreground/80 text-sm">
              {getWelcomeMessage()}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <AttendanceButton />
            <button
              onClick={() => setShowPalletCalculator(true)}
              className="bg-white/20 hover:bg-white/30 rounded-xl p-2.5 transition-colors"
              title={t('worker.pallet_calculator')}
            >
              <Package className="w-5 h-5" />
            </button>
            <Link
              to="/chat"
              className="bg-white/20 hover:bg-white/30 rounded-xl p-2.5 transition-colors"
              title={t('worker.chat')}
            >
              <MessageCircle className="w-5 h-5" />
            </Link>
            <button
              onClick={() => setShowHandoverPreview(true)}
              className="bg-white/20 hover:bg-white/30 rounded-xl p-2.5 transition-colors"
              title={t('worker.handover_summary')}
            >
              <ClipboardList className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Today's Customers Notification for Supervisors */}
      {isSupervisor && (
        <div className="px-4 mt-3">
          <div
            onClick={() => setShowTodayCustomers(true)}
            className="relative overflow-hidden rounded-xl border-2 border-sky-300 bg-gradient-to-br from-sky-50 to-blue-100 p-4 cursor-pointer active:scale-[0.97] transition-all hover:shadow-lg flex items-center gap-3"
          >
            <CalendarCheck className="w-8 h-8 text-sky-600 shrink-0" />
            <div>
              <p className="font-bold text-sm text-sky-900">{todayCustomersLabel}</p>
              <p className="text-xs text-sky-700">{t('worker.today_schedule_desc')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Warehouse Manager: Today's Customers */}
      {isWarehouseManager && !isSupervisor && (
        <div className="px-4 mt-3">
          <div
            onClick={() => setShowTodayCustomers(true)}
            className="relative overflow-hidden rounded-xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-100 p-4 cursor-pointer active:scale-[0.97] transition-all hover:shadow-lg flex items-center gap-3"
          >
            <CalendarCheck className="w-8 h-8 text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold text-sm text-emerald-900">{todayCustomersLabel}</p>
              <p className="text-xs text-emerald-700">{t('worker.today_schedule_desc')}</p>
            </div>
          </div>
        </div>
      )}


      {hasPromoAccess ? (
        <>
          <div className="px-4 mt-4">
            <button
              onClick={() => setShowManualPromoEntry(true)}
              className="w-full rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 text-white p-4 flex items-center justify-center gap-2 shadow-lg active:scale-[0.97] transition-all"
            >
              <Gift className="w-5 h-5" />
              <span className="font-bold text-sm">{t('worker.manual_promo')}</span>
            </button>
          </div>

          {/* Products Section for Promo */}
          <div className="mt-4">
            <div className="px-4 mb-2">
              <h3 className="text-lg font-bold">{t('products.list')}</h3>
            </div>
            <ProductGrid
              products={products}
              onProductSelect={handleProductSelect}
              isLoading={isLoading}
            />
          </div>

          {/* Add Promo Dialog */}
          <AddPromoDialog
            open={showPromoDialog}
            onOpenChange={setShowPromoDialog}
            product={selectedProduct}
            onSuccess={() => {
              // Optionally refresh data
            }}
          />
        </>
      ) : (hasOrdersAccess || hasDeliveryAccess || hasDebtAccess || isWarehouseManager) ? (
        (() => {
          // Build visible actions dynamically
          const quickActions: { key: string; icon: React.ReactNode; label: string; onClick: () => void }[] = [];

          if (hasDeliveryAccess && !isDeliveriesPageHidden && !isDeliveriesHidden) {
            quickActions.push({ key: 'deliveries', icon: <Truck className="w-6 h-6" />, label: t('deliveries.title'), onClick: () => navigate('/my-deliveries') });
          }
          if ((hasDeliveryAccess || isWarehouseManager) && !isDirectSaleHidden) {
            quickActions.push({ key: 'direct-sale', icon: <ShoppingBag className="w-6 h-6" />, label: isWarehouseManager ? 'بيع مخزن - Vente Dépôt' : t('stock.direct_sale'), onClick: () => setShowActionDialog(true) });
          }
          // Warehouse stock for warehouse manager
          if (isWarehouseManager && !isWarehouseStockHidden && !isWarehouseStockButtonHidden) {
            quickActions.push({ key: 'warehouse-stock', icon: <Package className="w-6 h-6" />, label: 'مخزون الفرع', onClick: () => navigate('/warehouse') });
          }
          // Factory receipt for warehouse manager
          if (isWarehouseManager) {
            quickActions.push({ key: 'factory-receipt', icon: <ArrowDownToLine className="w-6 h-6" />, label: 'استلام من المصنع', onClick: () => setShowFactoryReceipt(true) });
          }
          if (hasDeliveryAccess && !isMyStockPageHidden && !isMyStockHidden) {
            quickActions.push({ key: 'my-stock', icon: <Package className="w-6 h-6" />, label: t('stock.my_stock'), onClick: () => navigate('/my-stock') });
          }
          if (hasOrdersAccess && !isOrdersPageHidden && !isCreateOrderHidden) {
            quickActions.push({ key: 'orders', icon: <ShoppingCart className="w-6 h-6" />, label: t('orders.manage'), onClick: () => navigate('/orders') });
            quickActions.push({ key: 'create-order', icon: <ShoppingCart className="w-6 h-6" />, label: t('orders.create_new'), onClick: () => setShowCustomerPickerForOrder(true) });
          }
          if (hasOrdersAccess && !hasDeliveryAccess && !isWarehouseManager && !isMyPromosPageHidden) {
            quickActions.push({ key: 'promos', icon: <Gift className="w-6 h-6" />, label: t('promos.add_new'), onClick: () => navigate('/my-promos') });
          }
          if (hasDebtAccess && !isCollectDebtHidden && !isDebtsPageHidden) {
            quickActions.push({ key: 'debts', icon: <Banknote className="w-6 h-6" />, label: t('debts.title'), onClick: () => navigate('/customer-debts') });
          }
          if (hasCustomerAccess && !isCustomersPageHidden && !isAddCustomerHidden) {
            quickActions.push({ key: 'customers', icon: <Users className="w-6 h-6" />, label: t('nav.customers'), onClick: () => navigate('/customers') });
          }
          if (hasExpenseAccess && !isExpensesPageHidden && !isExpensesHidden) {
            quickActions.push({ key: 'expenses', icon: <Wallet className="w-6 h-6" />, label: t('expenses.my_expenses'), onClick: () => navigate('/expenses') });
          }
          // Today's customers
          if (!isTodayCustomersHidden) {
            quickActions.push({ key: 'today-customers', icon: <MapPin className="w-6 h-6" />, label: todayCustomersLabel, onClick: () => setShowTodayCustomers(true) });
          }
          // Rewards page
          if (!isRewardsHidden && !isRewardsPageHidden) {
            quickActions.push({ key: 'rewards', icon: <Trophy className="w-6 h-6" />, label: t('worker.rewards'), onClick: () => navigate('/my-rewards') });
          }
          // Worker Actions for supervisor or warehouse_manager
          if ((isSupervisor || activeRole?.custom_role_code === 'warehouse_manager') && !isWorkerActionsHidden && !isWorkerActionsButtonHidden) {
            quickActions.push({ key: 'worker-actions', icon: <HardHat className="w-6 h-6" />, label: t('worker.worker_actions'), onClick: () => navigate('/worker-actions') });
          }
          // Worker Actions for regular workers (self-view)
          if (!isSupervisor && activeRole?.custom_role_code !== 'warehouse_manager' && !isWorkerActionsHidden && !isWorkerActionsButtonHidden) {
            quickActions.push({ key: 'worker-actions', icon: <HardHat className="w-6 h-6" />, label: t('worker.my_actions'), onClick: () => navigate('/worker-actions') });
          }

          const colorSchemes: Record<string, { bg: string; iconBg: string; iconColor: string; text: string; border: string }> = {
            deliveries: { bg: 'bg-gradient-to-br from-blue-500 to-blue-600', iconBg: 'bg-white/20', iconColor: 'text-white', text: 'text-white', border: '' },
            'direct-sale': { bg: 'bg-gradient-to-br from-emerald-500 to-teal-600', iconBg: 'bg-white/20', iconColor: 'text-white', text: 'text-white', border: '' },
            'my-stock': { bg: 'bg-gradient-to-br from-violet-500 to-purple-600', iconBg: 'bg-white/20', iconColor: 'text-white', text: 'text-white', border: '' },
            orders: { bg: 'bg-gradient-to-br from-primary to-primary/80', iconBg: 'bg-white/20', iconColor: 'text-white', text: 'text-primary-foreground', border: '' },
            'create-order': { bg: 'bg-gradient-to-br from-indigo-500 to-blue-700', iconBg: 'bg-white/20', iconColor: 'text-white', text: 'text-white', border: '' },
            promos: { bg: 'bg-gradient-to-br from-amber-400 to-orange-500', iconBg: 'bg-white/20', iconColor: 'text-white', text: 'text-white', border: '' },
            debts: { bg: 'bg-gradient-to-br from-rose-500 to-red-600', iconBg: 'bg-white/20', iconColor: 'text-white', text: 'text-white', border: '' },
            customers: { bg: 'bg-gradient-to-br from-cyan-500 to-sky-600', iconBg: 'bg-white/20', iconColor: 'text-white', text: 'text-white', border: '' },
            expenses: { bg: 'bg-gradient-to-br from-fuchsia-500 to-pink-600', iconBg: 'bg-white/20', iconColor: 'text-white', text: 'text-white', border: '' },
            'today-customers': { bg: 'bg-gradient-to-br from-sky-400 to-blue-500', iconBg: 'bg-white/20', iconColor: 'text-white', text: 'text-white', border: '' },
            'rewards': { bg: 'bg-gradient-to-br from-yellow-400 to-amber-500', iconBg: 'bg-white/20', iconColor: 'text-white', text: 'text-white', border: '' },
            'worker-actions': { bg: 'bg-gradient-to-br from-indigo-500 to-indigo-700', iconBg: 'bg-white/20', iconColor: 'text-white', text: 'text-white', border: '' },
            'warehouse-stock': { bg: 'bg-gradient-to-br from-teal-500 to-emerald-700', iconBg: 'bg-white/20', iconColor: 'text-white', text: 'text-white', border: '' },
            'factory-receipt': { bg: 'bg-gradient-to-br from-lime-500 to-green-700', iconBg: 'bg-white/20', iconColor: 'text-white', text: 'text-white', border: '' },
          };

          const gridCols = quickActions.length === 1 ? 'grid-cols-1' : quickActions.length === 2 ? 'grid-cols-2' : 'grid-cols-3';

          return quickActions.length > 0 ? (
            <div className="p-4 space-y-4">
              <h3 className="text-base font-bold">{t('common.quick_actions')}</h3>
              <div className={`grid ${gridCols} gap-3`}>
                {quickActions.map((action, index) => {
                  const scheme = colorSchemes[action.key] || colorSchemes['orders'];
                  return (
                    <button
                      key={action.key}
                      onClick={action.onClick}
                      className={`${scheme.bg} ${scheme.border} rounded-2xl p-4 flex flex-col items-center justify-center gap-2.5 shadow-lg hover:shadow-xl active:scale-[0.96] transition-all duration-300 group animate-in fade-in slide-in-from-bottom-2`}
                      style={{ animationDelay: `${index * 60}ms` }}
                    >
                      <div className={`${scheme.iconBg} rounded-xl p-2.5 group-hover:scale-110 transition-transform duration-300`}>
                        {React.cloneElement(action.icon as React.ReactElement, { className: `w-6 h-6 ${scheme.iconColor}` })}
                      </div>
                      <span className={`text-xs font-bold ${scheme.text} text-center leading-tight`}>{action.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null;
        })()
      ) : (
        /* No specific permissions */
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Gift className="w-12 h-12 mb-3 opacity-50" />
          <p className="text-lg font-medium">{t('common.no_permissions')}</p>
          <p className="text-sm">{t('common.contact_admin')}</p>
        </div>
      )}

      <DirectSaleDialog
        open={showDirectSaleDialog}
        onOpenChange={setShowDirectSaleDialog}
        initialCustomerId={selectedCustomerForAction?.id}
        stockSource={isWarehouseManager ? 'warehouse' : 'worker'}
        stockItems={(isWarehouseManager ? (warehouseStockItems || []) : (stockItems || [])).map(s => ({
          id: s.id,
          product_id: s.product_id,
          quantity: s.quantity,
          product: (s as any).product,
        }))}
      />

      <CreateOrderDialog
        open={showCreateOrderDialog}
        onOpenChange={setShowCreateOrderDialog}
        initialCustomerId={selectedCustomerForAction?.id}
      />

      <CustomerActionDialog
        open={showActionDialog}
        onOpenChange={setShowActionDialog}
        onSale={(customer) => {
          setSelectedCustomerForAction(customer);
          setShowDirectSaleDialog(true);
        }}
        directAction="sale"
        allowedActions={['sale']}
      />
      <CustomerPickerDialog
        open={showCustomerPickerForOrder}
        onOpenChange={setShowCustomerPickerForOrder}
        customers={allCustomers}
        isLoading={customersLoading}
        onSelect={(customer) => {
          setSelectedCustomerForAction(customer);
          setShowCustomerPickerForOrder(false);
          setShowCreateOrderDialog(true);
        }}
      />
      <WorkerHandoverPreviewDialog
        open={showHandoverPreview}
        onOpenChange={setShowHandoverPreview}
      />
      <TodayCustomersDialog
        open={showTodayCustomers}
        onOpenChange={setShowTodayCustomers}
      />
      <PalletCalculatorDialog
        open={showPalletCalculator}
        onOpenChange={setShowPalletCalculator}
      />
      <ManualPromoEntryDialog
        open={showManualPromoEntry}
        onOpenChange={setShowManualPromoEntry}
      />
      <FactoryReceiptQuickDialog
        open={showFactoryReceipt}
        onOpenChange={setShowFactoryReceipt}
      />
    </div>
  );
};

export default WorkerHome;
