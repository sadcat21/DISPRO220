import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Product } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useWorkerPermissions } from '@/hooks/usePermissions';
import ProductGrid from '@/components/promo/ProductGrid';
import AddPromoDialog from '@/components/promo/AddPromoDialog';
import DirectSaleDialog from '@/components/warehouse/DirectSaleDialog';
import CustomerActionDialog from '@/components/orders/CustomerActionDialog';
import CreateOrderDialog from '@/components/orders/CreateOrderDialog';
import { useTrackVisit } from '@/hooks/useVisitTracking';
import { Customer } from '@/types/database';
import { toast } from 'sonner';
import { ShoppingCart, Gift, Loader2, ShoppingBag, Truck, Package, Banknote, Users, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const WorkerHome: React.FC = () => {
  const { user, workerId } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { data: permissions = [], isLoading: permissionsLoading } = useWorkerPermissions();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showPromoDialog, setShowPromoDialog] = useState(false);
  const [showDirectSaleDialog, setShowDirectSaleDialog] = useState(false);
  const [showCreateOrderDialog, setShowCreateOrderDialog] = useState(false);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [selectedCustomerForAction, setSelectedCustomerForAction] = useState<Customer | null>(null);

  const { trackVisit } = useTrackVisit();

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
    <div className="pb-4">
      {/* Welcome Section */}
      <div className="bg-gradient-to-l from-primary to-primary/80 text-primary-foreground p-6">
        <h2 className="text-xl font-bold mb-1">{t('common.welcome')} {user?.full_name} 👋</h2>
        <p className="text-primary-foreground/80 text-sm">
          {getWelcomeMessage()}
        </p>
      </div>

      {/* Content based on permissions */}
      {hasPromoAccess ? (
        <>
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
      ) : (hasOrdersAccess || hasDeliveryAccess || hasDebtAccess) ? (
        <div className="p-4 space-y-4">
          <h3 className="text-base font-bold">{t('common.quick_actions')}</h3>

          {hasDeliveryAccess && (
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => navigate('/my-deliveries')}
                className="rounded-xl bg-gradient-to-l from-primary to-primary/85 text-primary-foreground p-3 flex flex-col items-center justify-center gap-2 shadow-md active:scale-[0.97] transition-all duration-200 group"
              >
                <div className="bg-primary-foreground/20 rounded-lg p-2 group-hover:scale-110 transition-transform duration-200">
                  <Truck className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold">{t('deliveries.title')}</span>
              </button>

              <button
                onClick={() => setShowActionDialog(true)}
                className="rounded-xl bg-secondary text-secondary-foreground p-3 flex flex-col items-center justify-center gap-2 shadow-md active:scale-[0.97] transition-all duration-200 group"
              >
                <div className="bg-primary/20 rounded-lg p-2 group-hover:scale-110 transition-transform duration-200">
                  <ShoppingBag className="w-5 h-5 text-primary" />
                </div>
                <span className="text-xs font-bold">{t('stock.direct_sale')}</span>
              </button>

              <button
                onClick={() => navigate('/my-stock')}
                className="rounded-xl border border-border bg-card text-card-foreground p-3 flex flex-col items-center justify-center gap-2 shadow-md active:scale-[0.97] transition-all duration-200 group"
              >
                <div className="bg-muted rounded-lg p-2 group-hover:scale-110 transition-transform duration-200">
                  <Package className="w-5 h-5 text-foreground" />
                </div>
                <span className="text-xs font-bold">{t('stock.my_stock')}</span>
              </button>
            </div>
          )}

          {hasDebtAccess && (
            <button
              onClick={() => navigate('/customer-debts')}
              className="rounded-xl bg-destructive/10 border border-destructive/30 text-foreground p-3 flex flex-col items-center justify-center gap-2 shadow-md active:scale-[0.97] transition-all duration-200 group w-full"
            >
              <div className="bg-destructive/20 rounded-lg p-2 group-hover:scale-110 transition-transform duration-200">
                <Banknote className="w-5 h-5 text-destructive" />
              </div>
              <span className="text-xs font-bold">{t('debts.title')}</span>
            </button>
          )}

          {hasOrdersAccess && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => navigate('/orders')}
                className="rounded-xl bg-gradient-to-l from-primary to-primary/85 text-primary-foreground p-3 flex flex-col items-center justify-center gap-2 shadow-md active:scale-[0.97] transition-all duration-200 group"
              >
                <div className="bg-primary-foreground/20 rounded-lg p-2 group-hover:scale-110 transition-transform duration-200">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold">{t('orders.manage')}</span>
              </button>
              {!hasDeliveryAccess && (
                <button
                  onClick={() => navigate('/my-promos')}
                  className="rounded-xl bg-secondary text-secondary-foreground p-3 flex flex-col items-center justify-center gap-2 shadow-md active:scale-[0.97] transition-all duration-200 group"
                >
                  <div className="bg-primary/20 rounded-lg p-2 group-hover:scale-110 transition-transform duration-200">
                    <Gift className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-xs font-bold">{t('promos.add_new')}</span>
                </button>
              )}
            </div>
          )}

          {/* Quick actions: Customers & Expenses */}
          <div className="grid grid-cols-2 gap-2">
            {hasCustomerAccess && (
              <button
                onClick={() => navigate('/customers')}
                className="rounded-xl border border-border bg-card text-card-foreground p-3 flex flex-col items-center justify-center gap-2 shadow-md active:scale-[0.97] transition-all duration-200 group"
              >
                <div className="bg-muted rounded-lg p-2 group-hover:scale-110 transition-transform duration-200">
                  <Users className="w-5 h-5 text-foreground" />
                </div>
                <span className="text-xs font-bold">{t('nav.customers')}</span>
              </button>
            )}
            {hasExpenseAccess && (
              <button
                onClick={() => navigate('/expenses')}
                className="rounded-xl border border-border bg-card text-card-foreground p-3 flex flex-col items-center justify-center gap-2 shadow-md active:scale-[0.97] transition-all duration-200 group"
              >
                <div className="bg-muted rounded-lg p-2 group-hover:scale-110 transition-transform duration-200">
                  <Wallet className="w-5 h-5 text-foreground" />
                </div>
                <span className="text-xs font-bold">{t('expenses.my_expenses')}</span>
              </button>
            )}
          </div>
        </div>
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
        stockItems={(stockItems || []).map(s => ({
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
    </div>
  );
};

export default WorkerHome;
