import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Customer, Branch } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, User, Loader2, Trash2, Phone, MapPin, Search, Pencil, Building2, ChevronDown, ChevronUp, Navigation, Shield, Tag, UserCircle, Store, CreditCard, Warehouse, Eye, PlusCircle, Banknote, Truck, AlertTriangle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { ALGERIAN_WILAYAS, DEFAULT_WILAYA } from '@/data/algerianWilayas';
import LazyLocationPicker from '@/components/map/LazyLocationPicker';
import AddCustomerDialog from '@/components/promo/AddCustomerDialog';
import LazyCustomersMapView from '@/components/map/LazyCustomersMapView';
import CustomerSpecialPricesDialog from '@/components/customers/CustomerSpecialPricesDialog';
import ManageSectorsDialog from '@/components/customers/ManageSectorsDialog';
import { useSectors } from '@/hooks/useSectors';
import { useCustomerDebtSummary, useCreateDebt, useUpdateDebtPayment } from '@/hooks/useCustomerDebts';
import { useTrackVisit } from '@/hooks/useVisitTracking';
import CustomerProfileDialog from '@/components/customers/CustomerProfileDialog';
import CustomerApprovalTab from '@/components/customers/CustomerApprovalTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNavigate } from 'react-router-dom';

// Force rebuild
const Customers: React.FC = () => {
  const navigate = useNavigate();
  const { workerId, activeBranch, role } = useAuth();
  const { t } = useLanguage();
  const { sectors } = useSectors();
  const createDebt = useCreateDebt();
  const updateDebtPayment = useUpdateDebtPayment();
  const { trackVisit } = useTrackVisit();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showSectorsDialog, setShowSectorsDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sectorFilter, setSectorFilter] = useState<string>('all');

  // Edit form state
  const [name, setName] = useState('');
  const [internalName, setInternalName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [wilaya, setWilaya] = useState(DEFAULT_WILAYA);
  const [branchId, setBranchId] = useState<string>('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTrusted, setIsTrusted] = useState(false);
  const [trustNotes, setTrustNotes] = useState('');
  const [defaultPaymentType, setDefaultPaymentType] = useState<string>('without_invoice');
  const [defaultPriceSubtype, setDefaultPriceSubtype] = useState<string>('gros');
  const [salesRepName, setSalesRepName] = useState('');
  const [salesRepPhone, setSalesRepPhone] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [locationType, setLocationType] = useState<'store' | 'warehouse' | 'office'>('store');
  const [searchAddressQuery, setSearchAddressQuery] = useState('');
  // Edit state
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

  const { data: editDebtSummary } = useCustomerDebtSummary(editingCustomer?.id || null);

  // Sync debt amount when summary loads
  useEffect(() => {
    if (editDebtSummary) {
      setDebtAmount(editDebtSummary.totalDebt.toString());
    }
  }, [editDebtSummary]);
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

    // Sector filter
    if (sectorFilter !== 'all') {
      if (sectorFilter === 'none') {
        filtered = filtered.filter(c => !c.sector_id);
      } else {
        filtered = filtered.filter(c => c.sector_id === sectorFilter);
      }
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.internal_name?.toLowerCase().includes(query) ||
        c.phone?.includes(searchQuery) ||
        c.wilaya?.toLowerCase().includes(query)
      );
    }
    return filtered;
  }, [searchQuery, filteredByBranch, sectorFilter]);

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

  const handleEditCustomer = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingCustomer || !name.trim()) {
      toast.error(t('customers.name'));
      return;
    }

    setIsSaving(true);
    const isManager = role === 'admin' || role === 'branch_admin';

    if (isManager) {
      try {
        const { error } = await supabase
          .from('customers')
          .update({
            name: name.trim(),
            internal_name: internalName.trim() || null,
            store_name: storeName.trim() || null,
            phone: phone.trim() || null,
            address: address.trim() || null,
            wilaya: wilaya,
            branch_id: branchId && branchId !== 'none' ? branchId : null,
            latitude: latitude,
            longitude: longitude,
            location_type: locationType,
            is_trusted: isTrusted,
            trust_notes: trustNotes.trim() || null,
            default_payment_type: defaultPaymentType,
            default_price_subtype: defaultPriceSubtype,
            sector_id: sectorId && sectorId !== 'none' ? sectorId : null,
            sales_rep_name: salesRepName.trim() || null,
            sales_rep_phone: salesRepPhone.trim() || null,
          })
          .eq('id', editingCustomer.id);

        if (error) throw error;

        // Handle debt changes
        const currentDebt = editDebtSummary?.totalDebt || 0;
        const newDebt = parseFloat(debtAmount) || 0;
        const difference = newDebt - currentDebt;

        if (difference > 0 && workerId) {
          try {
            await createDebt.mutateAsync({
              customer_id: editingCustomer.id,
              worker_id: workerId,
              branch_id: activeBranch?.id || editingCustomer.branch_id || undefined,
              total_amount: difference,
              paid_amount: 0,
              notes: 'تعديل دين من بيانات العميل',
            });
            toast.success(`تم إضافة دين بقيمة ${difference} دج`);
          } catch (debtError: any) {
            console.error('Error creating debt:', debtError);
            toast.error('فشل في إنشاء الدين: ' + (debtError.message || ''));
          }
        } else if (difference < 0 && workerId) {
          const absDiff = Math.abs(difference);
          try {
            const { data: activeDebts } = await supabase
              .from('customer_debts')
              .select('id, total_amount, paid_amount, remaining_amount')
              .eq('customer_id', editingCustomer.id)
              .eq('status', 'active')
              .order('created_at', { ascending: true });

            if (activeDebts && activeDebts.length > 0) {
              let remainingPayment = absDiff;
              for (const debt of activeDebts) {
                if (remainingPayment <= 0) break;
                const debtRemaining = Number(debt.remaining_amount) || (Number(debt.total_amount) - Number(debt.paid_amount));
                const payAmount = Math.min(remainingPayment, debtRemaining);
                if (payAmount > 0) {
                  await updateDebtPayment.mutateAsync({
                    debtId: debt.id,
                    amount: payAmount,
                    workerId,
                    paymentMethod: 'cash',
                    notes: 'تخفيض دين من بيانات العميل',
                  });
                  remainingPayment -= payAmount;
                }
              }
              toast.success(`تم تخفيض الدين بقيمة ${absDiff} دج`);
            }
          } catch (debtError: any) {
            console.error('Error updating debt:', debtError);
            toast.error('فشل في تحديث الدين: ' + (debtError.message || ''));
          }
        }

        toast.success(t('common.save') + ' ✓');
        setShowEditDialog(false);
        setEditingCustomer(null);
        resetForm();
        fetchData();
      } catch (error: any) {
        console.error('Error updating customer:', error);
        toast.error(error.message);
      } finally {
        setIsSaving(false);
      }
    } else {
      // Worker/Sales_rep case: Create update approval request
      try {
        const payload = {
          name: name.trim(),
          internal_name: internalName.trim() || null,
          store_name: storeName.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          wilaya: wilaya,
          branch_id: branchId && branchId !== 'none' ? branchId : null,
          latitude: latitude,
          longitude: longitude,
          location_type: locationType,
          is_trusted: isTrusted,
          trust_notes: trustNotes.trim() || null,
          default_payment_type: defaultPaymentType,
          default_price_subtype: defaultPriceSubtype,
          sector_id: sectorId && sectorId !== 'none' ? sectorId : null,
          sales_rep_name: salesRepName.trim() || null,
          sales_rep_phone: salesRepPhone.trim() || null,
          debtAmount: parseFloat(debtAmount) || 0,
        };

        const { error } = await supabase
          .from('customer_approval_requests' as any)
          .insert({
            operation_type: 'update',
            customer_id: editingCustomer.id,
            payload,
            requested_by: workerId,
            branch_id: activeBranch?.id || editingCustomer.branch_id || null,
            status: 'pending'
          } as any);

        if (error) throw error;

        // Track the visit even if it's pending approval
        trackVisit({
          customerId: editingCustomer.id,
          operationType: 'update_customer',
          notes: `طلب تعديل زبون: ${name.trim()}`
        });

        toast.info('تم إرسال طلب تعديل العميل للمراجعة. بانتظار موافقة المدير.');
        setShowEditDialog(false);
        setEditingCustomer(null);
        resetForm();
      } catch (error: any) {
        console.error('Error creating update request:', error);
        toast.error(error.message);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleLocationChange = (lat: number, lng: number, addressFromMap?: string) => {
    setLatitude(lat);
    setLongitude(lng);
    if (addressFromMap) {
      // Format address with dashes: حي الاستقلال - ماماش - مستغانم
      const parts = addressFromMap.split(',').map(p => p.trim()).filter(Boolean);
      const formattedAddress = parts.join(' - ');
      setAddress(formattedAddress);
    }
  };

  const openEditDialog = (customer: Customer) => {
    setEditingCustomer(customer);
    setName(customer.name);
    setInternalName(customer.internal_name || '');
    setStoreName(customer.store_name || '');
    setSectorId(customer.sector_id || '');
    setPhone(customer.phone || '');
    setAddress(customer.address || '');
    setWilaya(customer.wilaya || DEFAULT_WILAYA);
    setBranchId(customer.branch_id || '');
    setLatitude(customer.latitude);
    setLongitude(customer.longitude);
    setIsTrusted(customer.is_trusted || false);
    setTrustNotes(customer.trust_notes || '');
    setDefaultPaymentType(customer.default_payment_type || 'without_invoice');
    setDefaultPriceSubtype(customer.default_price_subtype || 'gros');
    setSalesRepName(customer.sales_rep_name || '');
    setSalesRepPhone(customer.sales_rep_phone || '');
    setLocationType((customer.location_type as 'store' | 'warehouse' | 'office') || 'store');
    setDebtAmount('0');
    setShowMap(!!(customer.latitude && customer.longitude));
    setShowEditDialog(true);
  };

  const resetForm = () => {
    setName('');
    setInternalName('');
    setStoreName('');
    setSectorId('');
    setPhone('');
    setAddress('');
    setWilaya(DEFAULT_WILAYA);
    setBranchId('');
    setLatitude(null);
    setLongitude(null);
    setShowMap(false);
    setIsTrusted(false);
    setTrustNotes('');
    setDefaultPaymentType('without_invoice');
    setDefaultPriceSubtype('gros');
    setSalesRepName('');
    setSalesRepPhone('');
    setDebtAmount('');
    setLocationType('store');
    setSearchAddressQuery('');
  };

  const handleDeleteCustomer = async () => {
    if (!customerToDelete) return;

    const isManager = role === 'admin' || role === 'branch_admin';

    if (isManager) {
      setIsDeleting(true);
      try {
        const { error } = await supabase
          .from('customers')
          .delete()
          .eq('id', customerToDelete.id);

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
      // Worker/Sales_rep case: Create delete approval request
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

        // Track the visit even if it's pending approval
        trackVisit({
          customerId: customerToDelete.id,
          operationType: 'delete_customer',
          notes: `طلب حذف زبون: ${customerToDelete.name}`
        });

        toast.info('تم إرسال طلب حذف العميل للمراجعة. بانتظار موافقة المدير.');
        setCustomerToDelete(null);
      } catch (error: any) {
        console.error('Error creating delete request:', error);
        toast.error(error.message);
      } finally {
        setIsDeleting(false);
      }
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

      {/* Customers List */}
      <div className="space-y-3">
        {filteredCustomers.map((customer) => {
          const { percent, missing } = getCustomerCompletion(customer);
          return (
          <Card key={customer.id}>
            <CardContent className="p-3">
              {/* Customer Info Row */}
              <div className="flex items-start gap-2">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5 shrink-0">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm leading-tight">{customer.name}</p>
                  <div className="flex items-center gap-1 flex-wrap mt-1">
                    {getSectorName(customer.sector_id) && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        <MapPin className="w-2.5 h-2.5 ml-0.5" />
                        {getSectorName(customer.sector_id)}
                      </Badge>
                    )}
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
              {/* Action Buttons - compact grid */}
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
            customers={filteredByBranch}
            onCustomerClick={(customer) => openEditDialog(customer)}
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

      {/* Add Customer Dialog - Using unified component */}
      <AddCustomerDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={handleCustomerAdded}
      />

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => {
        setShowEditDialog(open);
        if (!open) {
          setEditingCustomer(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{t('customers.edit')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditCustomer} className="space-y-4">
            {/* --- Section 1: Basic Info & Contact (المعلومات الأساسية واتصال) --- */}
            <div className="space-y-4 border-b pb-4">
              <div className="space-y-2">
                <Label>{t('customers.name')} *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('customers.name')}
                  className="text-right"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label>{t('common.phone')} الخاص بالزبون</Label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t('common.phone')}
                  className="text-right"
                  dir="ltr"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-primary" />
                  اسم المحل
                </Label>
                <Input
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="اسم المحل التجاري"
                  className="text-right"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <UserCircle className="w-4 h-4 text-primary" />
                  الاسم الداخلي (للفريق فقط)
                </Label>
                <Input
                  value={internalName}
                  onChange={(e) => setInternalName(e.target.value)}
                  placeholder="اسم مختصر أو لقب داخلي..."
                  className="text-right"
                />
                <p className="text-xs text-muted-foreground">هذا الاسم يظهر لفريق العمل فقط ولا يراه التاجر</p>
              </div>

              {/* Sales Representative */}
              <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
                <Label className="flex items-center gap-1 text-sm font-semibold">
                  <User className="w-3.5 h-3.5" />
                  مسؤول المبيعات / المشتريات (عند الزبون)
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={salesRepName}
                    onChange={(e) => setSalesRepName(e.target.value)}
                    placeholder="الاسم"
                    className="text-right text-sm"
                  />
                  <Input
                    value={salesRepPhone}
                    onChange={(e) => setSalesRepPhone(e.target.value)}
                    placeholder="رقم الهاتف"
                    className="text-right text-sm"
                    dir="ltr"
                  />
                </div>
              </div>
            </div>

            {/* --- Section 2: Finance & Preferences (المالية والتفضيلات) --- */}
            <div className="space-y-4 border-b pb-4">
              <Label className="font-bold flex items-center gap-2 text-sm">
                <CreditCard className="w-4 h-4 text-primary" />
                الوضعية المالية والتفضيلات
              </Label>

              <div className="space-y-2">
                <Label className="text-xs">الدين الحالي (دج)</Label>
                <Input
                  type="number"
                  min="0"
                  value={debtAmount}
                  onChange={(e) => setDebtAmount(e.target.value)}
                  placeholder="0"
                  className="text-right"
                  dir="ltr"
                />
                {editDebtSummary && editDebtSummary.count > 0 && (
                  <p className="text-xs text-muted-foreground">{editDebtSummary.count} سند(ات) نشطة</p>
                )}
              </div>

              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    <Label htmlFor="trust-switch">عميل موثوق (البيع بالدين)</Label>
                  </div>
                  <Switch
                    id="trust-switch"
                    checked={isTrusted}
                    onCheckedChange={setIsTrusted}
                  />
                </div>
                {isTrusted && (
                  <Input
                    value={trustNotes}
                    onChange={(e) => setTrustNotes(e.target.value)}
                    placeholder="ملاحظات حول حالة الثقة (اختياري)"
                    className="text-right"
                  />
                )}
              </div>

              <div className="border rounded-lg p-4 space-y-3">
                <div className="space-y-2">
                  <Label className="text-sm">نوع الشراء الافتراضي</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={defaultPaymentType === 'with_invoice' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setDefaultPaymentType('with_invoice')}
                    >
                      فاتورة 1
                    </Button>
                    <Button
                      type="button"
                      variant={defaultPaymentType === 'without_invoice' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setDefaultPaymentType('without_invoice')}
                    >
                      فاتورة 2
                    </Button>
                  </div>
                </div>
                {defaultPaymentType === 'without_invoice' && (
                  <div className="space-y-2">
                    <Label className="text-sm">تسعير فاتورة 2</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        type="button"
                        variant={defaultPriceSubtype === 'super_gros' ? 'default' : 'outline'}
                        size="sm"
                        className="text-xs"
                        onClick={() => setDefaultPriceSubtype('super_gros')}
                      >
                        سوبر غرو
                      </Button>
                      <Button
                        type="button"
                        variant={defaultPriceSubtype === 'gros' ? 'default' : 'outline'}
                        size="sm"
                        className="text-xs"
                        onClick={() => setDefaultPriceSubtype('gros')}
                      >
                        غرو
                      </Button>
                      <Button
                        type="button"
                        variant={defaultPriceSubtype === 'retail' ? 'default' : 'outline'}
                        size="sm"
                        className="text-xs"
                        onClick={() => setDefaultPriceSubtype('retail')}
                      >
                        تجزئة
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* --- Section 3: Location & Sector (الموقع والسكتور) --- */}
            <div className="space-y-4">
              <Label className="font-bold flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-primary" />
                تفاصيل الموقع والسكتور
              </Label>

              {sectors.length > 0 && (
                <div className="space-y-2">
                  <Label>السكتور</Label>
                  <Select value={sectorId} onValueChange={setSectorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="اختر السكتور" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون سكتور</SelectItem>
                      {sectors.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>{t('customers.wilaya')}</Label>
                <Select value={wilaya} onValueChange={setWilaya}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('customers.select_wilaya')} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {ALGERIAN_WILAYAS.map((w) => (
                      <SelectItem key={w.code} value={w.name}>
                        {w.code} - {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {role === 'admin' && (
                <div className="space-y-2">
                  <Label>{t('nav.branches')}</Label>
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('branches.select_branch')} />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      <SelectItem value="none">بدون فرع</SelectItem>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>نوع الموقع</Label>
                <div className="flex gap-2">
                  <Button type="button" variant={locationType === 'store' ? 'default' : 'outline'} size="sm" className="flex-1" onClick={() => setLocationType('store')}>
                    <Store className="w-4 h-4 ml-1" />
                    محل
                  </Button>
                  <Button type="button" variant={locationType === 'warehouse' ? 'default' : 'outline'} size="sm" className="flex-1" onClick={() => setLocationType('warehouse')}>
                    <Warehouse className="w-4 h-4 ml-1" />
                    مخزن
                  </Button>
                  <Button type="button" variant={locationType === 'office' ? 'default' : 'outline'} size="sm" className="flex-1" onClick={() => setLocationType('office')}>
                    <Building2 className="w-4 h-4 ml-1" />
                    مكتب
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('common.address')}</Label>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={t('common.address')}
                  className="text-right"
                />
              </div>

              {/* Location Map Section - GPS Feature */}
              <Collapsible open={showMap} onOpenChange={setShowMap}>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between border-primary/30 hover:bg-primary/5"
                  >
                    <span className="flex items-center gap-2">
                      <Navigation className="w-4 h-4 text-primary" />
                      <span>تحديد الموقع على الخريطة (GPS)</span>
                      {latitude && longitude && (
                        <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded">✓</span>
                      )}
                    </span>
                    {showMap ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <LazyLocationPicker
                    latitude={latitude}
                    longitude={longitude}
                    onLocationChange={handleLocationChange}
                    initialSearchQuery={searchAddressQuery}
                    addressToSearch={address}
                    defaultWilaya={activeBranch?.wilaya}
                  />
                </CollapsibleContent>
              </Collapsible>

            </div>

            <Button type="submit" className="w-full" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                t('common.save')
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

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
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                t('common.delete')
              )}
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
    </div >
  );
};

export default Customers;
