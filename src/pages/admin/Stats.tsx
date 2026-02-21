import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PromoWithDetails, Worker, OrderWithDetails, Customer } from '@/types/database';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PromoStats from '@/components/stats/PromoStats';
import OrderStats from '@/components/stats/OrderStats';
import SalesStats from '@/components/stats/SalesStats';
import ProductStats from '@/components/stats/ProductStats';
import CustomerStats from '@/components/stats/CustomerStats';
import DateRangeFilter, { DateFilterType, getDateRangeFromFilter } from '@/components/stats/DateRangeFilter';

const Stats: React.FC = () => {
  const { activeBranch } = useAuth();
  const { t } = useLanguage();
  const [promos, setPromos] = useState<PromoWithDetails[]>([]);
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Shared date filter - default to today
  const [selectedPeriod, setSelectedPeriod] = useState<DateFilterType>('today');
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>();
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>();
  
  // Promo specific filter
  const [selectedWorker, setSelectedWorker] = useState<string>('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [promosRes, ordersRes, workersRes, customersRes] = await Promise.all([
        supabase
          .from('promos')
          .select(`
            *,
            customer:customers(*),
            product:products(*),
            worker:workers(*)
          `)
          .order('promo_date', { ascending: false }),
        supabase
          .from('orders')
          .select(`
            *,
            customer:customers(*),
            created_by_worker:workers!orders_created_by_fkey(id, full_name, username),
            assigned_worker:workers!orders_assigned_worker_id_fkey(id, full_name, username)
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('workers_safe')
          .select('*')
          .eq('role', 'worker'),
        supabase
          .from('customers')
          .select('*')
          .order('name'),
      ]);

      if (promosRes.error) throw promosRes.error;
      if (ordersRes.error) throw ordersRes.error;
      if (workersRes.error) throw workersRes.error;
      if (customersRes.error) throw customersRes.error;

      setPromos(promosRes.data || []);
      setOrders((ordersRes.data || []) as OrderWithDetails[]);
      setWorkers(workersRes.data || []);
      setCustomers(customersRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error(t('stats.load_failed'));
    } finally {
      setIsLoading(false);
    }
  };

  // Get selected branch ID from context
  const selectedBranchId = activeBranch?.id || null;

  // Get date range based on filter
  const dateRange = useMemo(() => {
    return getDateRangeFromFilter(selectedPeriod, customDateFrom, customDateTo);
  }, [selectedPeriod, customDateFrom, customDateTo]);

  // Filter workers by active branch
  const filteredWorkers = useMemo(() => {
    if (!selectedBranchId) return workers;
    return workers.filter(w => w.branch_id === selectedBranchId);
  }, [workers, selectedBranchId]);

  // Filter customers by active branch
  const filteredCustomers = useMemo(() => {
    if (!selectedBranchId) return customers;
    return customers.filter(c => c.branch_id === selectedBranchId || !c.branch_id);
  }, [customers, selectedBranchId]);

  // Filtered promos
  const filteredPromos = useMemo(() => {
    const { start, end } = dateRange;
    
    return promos.filter((promo) => {
      const promoDate = new Date(promo.promo_date);
      const inDateRange = promoDate >= start && promoDate <= end;
      const matchesWorker = selectedWorker === 'all' || promo.worker_id === selectedWorker;
      const matchesBranch = !selectedBranchId || promo.worker?.branch_id === selectedBranchId;
      
      return inDateRange && matchesWorker && matchesBranch;
    });
  }, [promos, selectedWorker, dateRange, selectedBranchId]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    const { start, end } = dateRange;
    
    return orders.filter((order) => {
      const orderDate = new Date(order.created_at);
      const inDateRange = orderDate >= start && orderDate <= end;
      const matchesBranch = !selectedBranchId || order.branch_id === selectedBranchId || order.branch_id === null;
      
      return inDateRange && matchesBranch;
    });
  }, [orders, dateRange, selectedBranchId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold">{t('stats.title')}</h2>

      {/* Shared Date Filter */}
      <DateRangeFilter
        selectedPeriod={selectedPeriod}
        setSelectedPeriod={setSelectedPeriod}
        customDateFrom={customDateFrom}
        setCustomDateFrom={setCustomDateFrom}
        customDateTo={customDateTo}
        setCustomDateTo={setCustomDateTo}
      />

      <Tabs defaultValue="orders" className="w-full">
        <TabsList className="w-full grid grid-cols-5 h-auto">
          <TabsTrigger value="orders" className="text-xs py-2">{t('stats.orders_tab')}</TabsTrigger>
          <TabsTrigger value="sales" className="text-xs py-2">{t('stats.sales_tab')}</TabsTrigger>
          <TabsTrigger value="products" className="text-xs py-2">{t('stats.products_tab')}</TabsTrigger>
          <TabsTrigger value="customers" className="text-xs py-2">{t('stats.customers_tab')}</TabsTrigger>
          <TabsTrigger value="promos" className="text-xs py-2">{t('stats.promos_tab')}</TabsTrigger>
        </TabsList>
        
        <TabsContent value="orders" className="mt-4">
          <OrderStats
            orders={filteredOrders}
            workers={filteredWorkers}
          />
        </TabsContent>
        
        <TabsContent value="sales" className="mt-4">
          <SalesStats orders={filteredOrders} />
        </TabsContent>
        
        <TabsContent value="products" className="mt-4">
          <ProductStats orders={filteredOrders} promos={filteredPromos} />
        </TabsContent>
        
        <TabsContent value="customers" className="mt-4">
          <CustomerStats 
            orders={filteredOrders} 
            promos={filteredPromos} 
            customers={filteredCustomers}
          />
        </TabsContent>
        
        <TabsContent value="promos" className="mt-4">
          <PromoStats
            promos={filteredPromos}
            workers={filteredWorkers}
            selectedWorker={selectedWorker}
            setSelectedWorker={setSelectedWorker}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Stats;
