import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Customer, Branch } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Plus, User, Loader2, Trash2, Phone, MapPin, Search, Pencil, Building2, ChevronDown, ChevronUp, Navigation, Shield, Tag, UserCircle, Store, CreditCard, Warehouse, Eye, PlusCircle, Banknote, Truck, AlertTriangle, ShoppingBag, Calendar, Package } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { ALGERIAN_WILAYAS, DEFAULT_WILAYA } from '@/data/algerianWilayas';
import LazyLocationPicker from '@/components/map/LazyLocationPicker';
import AddCustomerDialog from '@/components/promo/AddCustomerDialog';
import EditCustomerDialog from '@/components/orders/EditCustomerDialog';
import LazyCustomersMapView from '@/components/map/LazyCustomersMapView';
import CustomerSpecialPricesDialog from '@/components/customers/CustomerSpecialPricesDialog';
import ManageSectorsDialog from '@/components/customers/ManageSectorsDialog';
import { useSectors } from '@/hooks/useSectors';
import { useCustomerTypes, getCustomerTypeLabel } from '@/hooks/useCustomerTypes';
import { useTrackVisit } from '@/hooks/useVisitTracking';
import CustomerProfileDialog from '@/components/customers/CustomerProfileDialog';
import CustomerApprovalTab from '@/components/customers/CustomerApprovalTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNavigate } from 'react-router-dom';
import { format, differenceInDays } from 'date-fns';
import { ar } from 'date-fns/locale';
import { ScrollArea } from '@/components/ui/scroll-area';

// Collapsible sector group component
const SectorCustomerGroup: React.FC<{ label: string; count: number; defaultOpen: boolean; children: React.ReactNode }> = ({ label, count, defaultOpen, children }) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  React.useEffect(() => { setIsOpen(defaultOpen); }, [defaultOpen]);
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="sticky top-0 z-10 w-full bg-muted/80 backdrop-blur-sm px-4 py-2 border-b border-t flex items-center justify-between rounded-lg">
          <p className="text-xs font-bold text-primary">{label} ({count})</p>
          {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3 mt-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const Customers: React.FC = () => {
  const navigate = useNavigate();
  const { workerId, activeBranch, role } = useAuth();
  const { t, language } = useLanguage();
  const { sectors } = useSectors();
  const { customerTypes } = useCustomerTypes();
  const { trackVisit } = useTrackVisit();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSectorsDialog, setShowSectorsDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sectorFilter, setSectorFilter] = useState<string>('all');

  // Edit dialog state
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);

  // Delete state
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [profileCustomer, setProfileCustomer] = useState<Customer | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Special prices dialog
  const [customerForPrices, setCustomerForPrices] = useState<Customer | null>(null);

  const isManager = role === 'admin' || role === 'branch_admin';
  const [activeTab, setActiveTab] = useState('list');
  const [requestsCount, setRequestsCount] = useState(0);

  // Last orders cache
  const [lastOrders, setLastOrders] = useState<Record<string, any>>({});
  const [lastOrderDialogCustomer, setLastOrderDialogCustomer] = useState<Customer | null>(null);
  const [lastOrderDetails, setLastOrderDetails] = useState<any>(null);
  const [loadingLastOrder, setLoadingLastOrder] = useState(false);

  useEffect(() => {
    if (isManager) {
      fetchRequestsCount();
    }
  }, [isManager, activeBranch]);

  const fetchRequestsCount = async () => {
    try {
      const { count, error } = await supabase
        .from('customer_approval_requests' as any)
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      if (!error) {
        setRequestsCount(count || 0);
      }
    } catch (err) {
      console.error('Error fetching requests count:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter customers by activeBranch
  const filteredByBranch = useMemo(() => {
    if (role === 'admin' && activeBranch) {
      return customers.filter(c => c.branch_id === activeBranch.id || c.branch_id === null);
    }
    return customers;
  }, [customers, activeBranch, role]);

  // Then filter by search query and sector
  const filteredCustomers = useMemo(() => {
    let filtered = filteredByBranch;

    if (sectorFilter !== 'all') {
      if (sectorFilter === 'none') {
        filtered = filtered.filter(c => !c.sector_id);
      } else {
        filtered = filtered.filter(c => c.sector_id === sectorFilter);
      }
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.name_fr?.toLowerCase().includes(query) ||
        c.internal_name?.toLowerCase().includes(query) ||
        c.store_name?.toLowerCase().includes(query) ||
        (c as any).store_name_fr?.toLowerCase().includes(query) ||
        c.phone?.includes(searchQuery) ||
        c.wilaya?.toLowerCase().includes(query)
      );
    }
    return filtered;
  }, [searchQuery, filteredByBranch, sectorFilter]);

  // Fetch last delivered orders for all customers
  useEffect(() => {
    if (customers.length > 0) {
      fetchLastOrders();
    }
  }, [customers]);

  const fetchLastOrders = async () => {
    try {
      // Fetch last orders with item count
      const { data, error } = await supabase
        .from('orders')
        .select('id, customer_id, created_at, total_amount, payment_status, status, order_items(id)')
        .eq('status', 'delivered')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const map: Record<string, any> = {};
      for (const order of (data || [])) {
        if (!map[order.customer_id]) {
          map[order.customer_id] = { ...order, itemCount: order.order_items?.length || 0 };
        }
      }
      setLastOrders(map);
    } catch {
      // Silent fail
    }
  };

  const fetchData = async () => {
    try {
      const [customersRes, branchesRes] = await Promise.all([
        supabase.from('customers').select('*').order('name'),
        supabase.from('branches').select('*').eq('is_active', true).order('name')
      ]);

      if (customersRes.error) throw customersRes.error;
      if (branchesRes.error) throw branchesRes.error;

      setCustomers(customersRes.data || []);
      setBranches(branchesRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error(t('common.loading'));
    } finally {
      setIsLoading(false);
    }
  };

  const getBranchName = (branchId: string | null) => {
    if (!branchId) return null;
    return branches.find(b => b.id === branchId)?.name;
  };

  const getSectorName = (sectorId: string | null | undefined) => {
    if (!sectorId) return null;
    return sectors.find(s => s.id === sectorId)?.name;
  };

  const handleCustomerAdded = (newCustomer: Customer) => {
    setCustomers(prev => [...prev, newCustomer].sort((a, b) => a.name.localeCompare(b.name)));
    setShowAddDialog(false);
  };

  const handleCustomerUpdated = (updatedCustomer: Customer) => {
    setCustomers(prev => prev.map(c => c.id === updatedCustomer.id ? updatedCustomer : c));
    setShowEditDialog(false);
    setEditingCustomer(null);
  };

  const openEditDialog = (customer: Customer) => {
    setEditingCustomer(customer);
    setShowEditDialog(true);
  };

  const handleDeleteCustomer = async () => {
    if (!customerToDelete) return;

    if (isManager) {
      setIsDeleting(true);
      try {
        const { error } = await supabase.from('customers').delete().eq('id', customerToDelete.id);
        if (error) throw error;
        toast.success(t('common.delete') + ' ✓');
        setCustomerToDelete(null);
        fetchData();
      } catch (error: any) {
        console.error('Error deleting customer:', error);
        toast.error(error.message);
      } finally {
        setIsDeleting(false);
      }
    } else {
      setIsDeleting(true);
      try {
        const { error } = await supabase
          .from('customer_approval_requests' as any)
          .insert({
            operation_type: 'delete',
            customer_id: customerToDelete.id,
            payload: { customerName: customerToDelete.name },
            requested_by: workerId,
            branch_id: activeBranch?.id || customerToDelete.branch_id || null,
            status: 'pending'
          } as any);
        if (error) throw error;
        trackVisit({ customerId: customerToDelete.id, operationType: 'delete_customer', notes: `طلب حذف زبون: ${customerToDelete.name}` });
        toast.info('تم إرسال طلب حذف العميل للمراجعة.');
        setCustomerToDelete(null);
      } catch (error: any) {
        console.error('Error creating delete request:', error);
        toast.error(error.message);
      } finally {
        setIsDeleting(false);
      }
    }
  };

  // Fetch last order details
  const openLastOrderDetails = async (customer: Customer) => {
    const lastOrder = lastOrders[customer.id];
    if (!lastOrder) {
      toast.info('لا توجد طلبيات سابقة لهذا العميل');
      return;
    }
    setLastOrderDialogCustomer(customer);
    setLoadingLastOrder(true);
    try {
      const { data, error } = await supabase
        .from('order_items')
        .select('*, product:products(name)')
        .eq('order_id', lastOrder.id);
      if (error) throw error;
      setLastOrderDetails({ ...lastOrder, items: data || [] });
    } catch {
      setLastOrderDetails(lastOrder);
    } finally {
      setLoadingLastOrder(false);
    }
  };

  const getCustomerCompletion = (customer: Customer) => {
    const required = [
      { key: 'name', label: 'الاسم', icon: User, filled: !!customer.name?.trim() },
      { key: 'phone', label: 'الهاتف', icon: Phone, filled: !!customer.phone?.trim() },
      { key: 'store_name', label: 'المحل', icon: Store, filled: !!customer.store_name?.trim() },
      { key: 'sector_id', label: 'السكتور', icon: MapPin, filled: !!customer.sector_id },
      { key: 'location', label: 'الموقع GPS', icon: Navigation, filled: !!(customer.latitude && customer.longitude) },
    ];
    const optional = [
      { key: 'address', filled: !!customer.address?.trim() },
      { key: 'wilaya', filled: !!customer.wilaya },
      { key: 'name_fr', filled: !!customer.name_fr?.trim() },
      { key: 'internal_name', filled: !!customer.internal_name?.trim() },
      { key: 'sales_rep_name', filled: !!customer.sales_rep_name?.trim() },
      { key: 'zone_id', filled: !!customer.zone_id },
    ];
    const total = required.length + optional.length;
    const filled = [...required, ...optional].filter(f => f.filled).length;
    const percent = Math.round((filled / total) * 100);
    const missing = required.filter(f => !f.filled);
    return { percent, missing };
  };

  const renderCustomersList = () => (
    <div className="space-y-4">
      {/* Search and Filter */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('customers.search')}
            className="pr-10 text-right"
          />
        </div>
        {sectors.length > 0 && (
          <Select value={sectorFilter} onValueChange={setSectorFilter}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="فلترة حسب السكتور" />
            </SelectTrigger>
            <SelectContent className="bg-popover z-[100]">
              <SelectItem value="all">كل السكتورات</SelectItem>
              <SelectItem value="none">بدون سكتور</SelectItem>
              {sectors.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Customers List - Grouped by Sector */}
      <div className="space-y-2">
        {(() => {
          // Build sector groups
          const sectorGroups = new Map<string | null, Customer[]>();
          filteredCustomers.forEach(c => {
            const key = c.sector_id || null;
            if (!sectorGroups.has(key)) sectorGroups.set(key, []);
            sectorGroups.get(key)!.push(c);
          });

          const sectorIds = Array.from(sectorGroups.keys()).filter(k => k !== null) as string[];
          sectorIds.sort((a, b) => {
            const nameA = getSectorName(a) || '';
            const nameB = getSectorName(b) || '';
            return nameA.localeCompare(nameB, 'ar');
          });

          const groups: { key: string; label: string; customers: Customer[] }[] = [];
          sectorIds.forEach(sid => {
            groups.push({ key: sid, label: getSectorName(sid) || 'غير معروف', customers: sectorGroups.get(sid)! });
          });
          if (sectorGroups.has(null) && sectorGroups.get(null)!.length > 0) {
            groups.push({ key: 'no-sector', label: 'بدون سكتور', customers: sectorGroups.get(null)! });
          }

          return groups.map(group => (
            <SectorCustomerGroup
              key={group.key}
              label={group.label}
              count={group.customers.length}
              defaultOpen={!!searchQuery.trim()}
            >
              {group.customers.map((customer) => {
                const { percent, missing } = getCustomerCompletion(customer);
                const lastOrder = lastOrders[customer.id];
                return (
          <Card key={customer.id}>
            <CardContent className="p-3">
              {/* Customer Info Row */}
              <div className="flex items-start gap-2">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5 shrink-0">
                  <Store className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm leading-tight">
                    {customer.store_name
                      ? (language === 'fr' && (customer as any).store_name_fr ? (customer as any).store_name_fr : customer.store_name)
                      : (language === 'fr' && customer.name_fr ? customer.name_fr : customer.name)}
                  </p>
                  <div className="flex items-center gap-1 flex-wrap mt-0.5">
                    {getSectorName(customer.sector_id) && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-semibold">
                        <MapPin className="w-2.5 h-2.5 ml-0.5" />
                        {getSectorName(customer.sector_id)}
                      </Badge>
                    )}
                    {customer.customer_type && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-accent-foreground/20">
                        <Building2 className="w-2.5 h-2.5 ml-0.5" />
                        {getCustomerTypeLabel(customerTypes, customer.customer_type, language)}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    <User className="w-2.5 h-2.5 inline ml-0.5" />
                    {language === 'fr' && customer.name_fr ? customer.name_fr : customer.name}
                  </p>
                  <div className="flex items-center gap-1 flex-wrap mt-1">
                    {customer.internal_name && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
                        {customer.internal_name}
                      </Badge>
                    )}
                    {customer.is_trusted && (
                      <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px] px-1.5 py-0">
                        <Shield className="w-2.5 h-2.5 ml-0.5" />
                        {t('customers.trusted')}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {customer.default_payment_type === 'with_invoice' ? 'فاتورة 1' :
                        customer.default_price_subtype === 'super_gros' ? 'سوبر غرو' :
                          customer.default_price_subtype === 'retail' ? 'تجزئة' : 'غرو'
                      }
                    </Badge>
                  </div>
                  {customer.phone && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Phone className="w-3 h-3 shrink-0" />
                      <span dir="ltr">{customer.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                    {customer.wilaya && (
                      <span className="flex items-center gap-0.5">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {customer.wilaya}
                      </span>
                    )}
                    {customer.branch_id && (
                      <span className="flex items-center gap-0.5">
                        <Building2 className="w-3 h-3 shrink-0" />
                        {getBranchName(customer.branch_id)}
                      </span>
                    )}
                  </div>
                  {customer.address && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{customer.address}</p>
                  )}
                  {/* Last Order Date */}
                  {lastOrder && (
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 border-primary/20">
                        <Calendar className="w-2.5 h-2.5" />
                        آخر طلبية: {format(new Date(lastOrder.created_at), 'dd MMM yyyy', { locale: ar })}
                        {' '}({differenceInDays(new Date(), new Date(lastOrder.created_at))} يوم)
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                        {Number(lastOrder.total_amount || 0).toLocaleString()} دج ({lastOrder.itemCount || 0} منتج)
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
              {/* Completion & Missing Fields */}
              {(percent < 100 || missing.length > 0) && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <Progress value={percent} className="h-1.5 flex-1" />
                    <span className={`text-[10px] font-semibold ${percent === 100 ? 'text-primary' : percent >= 60 ? 'text-muted-foreground' : 'text-destructive'}`}>{percent}%</span>
                  </div>
                  {missing.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
                      {missing.map(m => (
                        <Badge key={m.key} variant="outline" className="text-[9px] px-1 py-0 border-destructive/40 text-destructive gap-0.5">
                          <m.icon className="w-2.5 h-2.5" />
                          {m.label}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-0 mt-2 border-t pt-1.5 flex-wrap">
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                  onClick={() => { setProfileCustomer(customer); setIsProfileOpen(true); }} title={t('customers.profile.title')}>
                  <Eye className="w-3.5 h-3.5" />
                </Button>
                {customer.phone && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                    onClick={() => window.location.href = `tel:${customer.phone}`} title={t('common.phone')}>
                    <Phone className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                  onClick={() => navigate('/orders', { state: { customerId: customer.id, paymentType: customer.default_payment_type } })} title={t('orders.new')}>
                  <PlusCircle className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                  onClick={() => navigate('/customer-debts', { state: { customerId: customer.id } })} title={t('debts.title')}>
                  <CreditCard className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                  onClick={() => navigate('/orders', { state: { customerId: customer.id, action: 'sale' } })} title={t('stock.direct_sale')}>
                  <Banknote className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                  onClick={() => navigate('/orders', { state: { customerId: customer.id, action: 'delivery' } })} title={t('deliveries.title')}>
                  <Truck className="w-3.5 h-3.5" />
                </Button>
                {/* Last Order Details button */}
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                  onClick={() => openLastOrderDetails(customer)} title="آخر طلبية">
                  <ShoppingBag className="w-3.5 h-3.5" />
                </Button>
                {customer.latitude && customer.longitude && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                    onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${customer.latitude},${customer.longitude}`, '_blank')} title={t('common.navigation')}>
                    <Navigation className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                  onClick={() => setCustomerForPrices(customer)} title={t('customers.special_prices')}>
                  <Tag className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
                  onClick={() => openEditDialog(customer)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setCustomerToDelete(customer)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </CardContent>
           </Card>
           );
              })}
            </SectorCustomerGroup>
          ));
        })()}

        {filteredCustomers.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>{searchQuery ? t('customers.no_results') : t('customers.no_customers')}</p>
          </div>
        )}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-bold">{t('customers.title')}</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowSectorsDialog(true)}>
            <MapPin className="w-4 h-4 ml-1" />
            السكتورات
          </Button>
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4 ml-2" />
            {t('customers.add')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <Card className="bg-secondary text-secondary-foreground">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('customers.total')}</p>
            <p className="text-xl font-bold">{filteredByBranch.length}</p>
          </div>
        </CardContent>
      </Card>

      {/* Customers Map - Collapsible */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            <span className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              خريطة المواقع
            </span>
            <ChevronDown className="w-4 h-4" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <LazyCustomersMapView
            customers={filteredCustomers}
            onCustomerClick={(customer) => { setProfileCustomer(customer); setIsProfileOpen(true); }}
            branchWilaya={activeBranch?.wilaya}
          />
        </CollapsibleContent>
      </Collapsible>

      {/* Tab Interface */}
      {isManager ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full" dir="rtl">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="list">{t('customers.title')}</TabsTrigger>
            <TabsTrigger value="requests" className="relative">
              طلبات المراجعة
              {requestsCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                  {requestsCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            {renderCustomersList()}
          </TabsContent>

          <TabsContent value="requests">
            <CustomerApprovalTab />
          </TabsContent>
        </Tabs>
      ) : (
        renderCustomersList()
      )}

      {/* Add Customer Dialog */}
      <AddCustomerDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={handleCustomerAdded}
      />

      {/* Edit Customer Dialog - using unified component */}
      <EditCustomerDialog
        open={showEditDialog}
        onOpenChange={(open) => {
          setShowEditDialog(open);
          if (!open) setEditingCustomer(null);
        }}
        customer={editingCustomer}
        onSuccess={handleCustomerUpdated}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!customerToDelete} onOpenChange={() => setCustomerToDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('customers.delete_confirm')} "{customerToDelete?.name}"؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCustomer}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? (<><Loader2 className="w-4 h-4 ml-2 animate-spin" />{t('common.loading')}</>) : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Special Prices Dialog */}
      <CustomerSpecialPricesDialog
        open={!!customerForPrices}
        onOpenChange={(open) => !open && setCustomerForPrices(null)}
        customer={customerForPrices}
      />

      <CustomerProfileDialog
        customer={profileCustomer}
        open={isProfileOpen}
        onOpenChange={setIsProfileOpen}
      />

      {/* Last Order Details Dialog */}
      <Dialog open={!!lastOrderDialogCustomer} onOpenChange={(open) => { if (!open) { setLastOrderDialogCustomer(null); setLastOrderDetails(null); } }}>
        <DialogContent className="max-w-sm max-h-[80vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <ShoppingBag className="w-4 h-4 text-primary" />
              آخر طلبية - {lastOrderDialogCustomer?.name}
            </DialogTitle>
          </DialogHeader>
          {loadingLastOrder ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : lastOrderDetails ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-[10px] text-muted-foreground">التاريخ</p>
                  <p className="font-semibold text-xs">
                    {format(new Date(lastOrderDetails.created_at), 'dd MMM yyyy', { locale: ar })}
                    {' '}({differenceInDays(new Date(), new Date(lastOrderDetails.created_at))} يوم)
                  </p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-[10px] text-muted-foreground">المبلغ الإجمالي</p>
                  <p className="font-semibold text-xs">
                    {Number(lastOrderDetails.total_amount || 0).toLocaleString()} دج
                    {' '}({lastOrderDetails.items?.length || 0} منتج)
                  </p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-[10px] text-muted-foreground">حالة الدفع</p>
                  <p className="font-semibold text-xs">
                    {lastOrderDetails.payment_status === 'cash' ? '💰 نقدي' :
                      lastOrderDetails.payment_status === 'credit' ? '📋 دين' :
                        lastOrderDetails.payment_status === 'check' ? '🏦 شيك' :
                          lastOrderDetails.payment_status === 'partial' ? '⚖️ جزئي' : '⏳ معلق'}
                  </p>
                </div>
                <div className="bg-muted/50 rounded-lg p-2">
                  <p className="text-[10px] text-muted-foreground">عدد المنتجات</p>
                  <p className="font-semibold text-xs">{lastOrderDetails.items?.length || 0}</p>
                </div>
              </div>
              {/* Items */}
              {lastOrderDetails.items && lastOrderDetails.items.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold flex items-center gap-1">
                    <Package className="w-3.5 h-3.5" />
                    المنتجات
                  </Label>
                  {lastOrderDetails.items.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between bg-muted/30 rounded-lg px-2 py-1.5 text-xs">
                      <span className="font-medium">{item.product?.name || 'منتج'}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{item.quantity} وحدة</span>
                        <span className="font-semibold">{Number(item.total_price || 0).toLocaleString()} دج</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-4 text-sm">لا توجد طلبيات سابقة</p>
          )}
        </DialogContent>
      </Dialog>

      <ManageSectorsDialog
        open={showSectorsDialog}
        onOpenChange={setShowSectorsDialog}
      />
    </div>
  );
};

export default Customers;
