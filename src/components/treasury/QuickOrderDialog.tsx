import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, ArrowRight, User, Shuffle, Trash2, Check, MapPin, Package } from 'lucide-react';
import { toast } from 'sonner';
import { getLocalizedName } from '@/utils/sectorName';
import { useSectors } from '@/hooks/useSectors';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ProductItem {
  id: string;
  name: string;
  quantity: number;
  selected: boolean;
}

type Step = 'sectors' | 'customers' | 'products';

const QuickOrderDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  const { language, dir } = useLanguage();
  const { activeBranch, workerId } = useAuth();
  const queryClient = useQueryClient();
  const { sectors, isLoading: loadingSectors } = useSectors();

  const [step, setStep] = useState<Step>('sectors');
  const [selectedSector, setSelectedSector] = useState<any>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [sectorSearch, setSectorSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [productItems, setProductItems] = useState<ProductItem[]>([]);
  const [defaultQty, setDefaultQty] = useState('10');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch registered customer counts per sector to filter empty sectors
  const { data: sectorCustomerCounts } = useQuery({
    queryKey: ['sector-registered-counts', activeBranch?.id],
    queryFn: async () => {
      let q = supabase.from('customers')
        .select('sector_id')
        .eq('is_registered', true)
        .eq('status', 'active')
        .not('sector_id', 'is', null);
      if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id);
      const { data, error } = await q;
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach(c => { counts[c.sector_id!] = (counts[c.sector_id!] || 0) + 1; });
      return counts;
    },
    enabled: open,
  });

  // Fetch customers for selected sector
  const { data: sectorCustomers, isLoading: loadingCustomers } = useQuery({
    queryKey: ['sector-customers', selectedSector?.id, activeBranch?.id],
    queryFn: async () => {
      let q = supabase.from('customers')
        .select('id, name, name_fr, store_name, phone')
        .eq('sector_id', selectedSector.id)
        .eq('is_registered', true)
        .eq('status', 'active')
        .order('name');
      if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!selectedSector?.id && step === 'customers',
  });

  // Fetch products for order
  const { data: products } = useQuery({
    queryKey: ['products-quick-order'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: open && step === 'products',
  });

  // Initialize products when entering products step
  React.useEffect(() => {
    if (step === 'products' && products && productItems.length === 0) {
      const qty = parseInt(defaultQty) || 10;
      setProductItems(products.map(p => ({
        id: p.id,
        name: p.name,
        quantity: qty,
        selected: true,
      })));
    }
  }, [step, products]);

  // Only show sectors that have registered customers
  const sectorsWithCustomers = useMemo(() => {
    if (!sectorCustomerCounts) return [];
    return sectors.filter(s => sectorCustomerCounts[s.id] > 0);
  }, [sectors, sectorCustomerCounts]);

  const filteredSectors = useMemo(() => {
    if (!sectorSearch) return sectorsWithCustomers;
    return sectorsWithCustomers.filter(s =>
      s.name?.includes(sectorSearch) || s.name_fr?.toLowerCase().includes(sectorSearch.toLowerCase())
    );
  }, [sectorsWithCustomers, sectorSearch]);

  const filteredCustomers = useMemo(() => {
    if (!sectorCustomers) return [];
    if (!customerSearch) return sectorCustomers;
    return sectorCustomers.filter((c: any) =>
      c.name?.includes(customerSearch) || c.name_fr?.toLowerCase().includes(customerSearch.toLowerCase()) || c.phone?.includes(customerSearch)
    );
  }, [sectorCustomers, customerSearch]);

  const applyDefaultQty = () => {
    const qty = parseInt(defaultQty) || 10;
    setProductItems(prev => prev.map(p => ({ ...p, quantity: qty })));
  };

  const applyRandomQty = () => {
    setProductItems(prev => prev.map(p => ({
      ...p,
      quantity: Math.floor(Math.random() * 100) + 1,
    })));
  };

  const toggleProduct = (id: string) => {
    setProductItems(prev => prev.map(p =>
      p.id === id ? { ...p, selected: !p.selected } : p
    ));
  };

  const removeProduct = (id: string) => {
    setProductItems(prev => prev.filter(p => p.id !== id));
  };

  const updateProductQty = (id: string, qty: number) => {
    setProductItems(prev => prev.map(p =>
      p.id === id ? { ...p, quantity: Math.max(0, qty) } : p
    ));
  };

  const selectedProducts = productItems.filter(p => p.selected && p.quantity > 0);

  const handleSubmit = async () => {
    if (!selectedCustomer || !workerId || selectedProducts.length === 0) return;
    setIsSubmitting(true);

    try {
      // Create order
      const { data: order, error: orderErr } = await supabase.from('orders').insert({
        customer_id: selectedCustomer.id,
        created_by: workerId,
        branch_id: activeBranch?.id || null,
        status: 'pending',
        payment_type: 'with_invoice',
        invoice_payment_method: 'trigg',
        total_amount: 0,
      }).select('id').single();

      if (orderErr) throw orderErr;

      // Insert order items
      const items = selectedProducts.map(p => ({
        order_id: order.id,
        product_id: p.id,
        quantity: p.quantity,
      }));

      const { error: itemsErr } = await supabase.from('order_items').insert(items);
      if (itemsErr) throw itemsErr;

      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['invoice-orders'] });
      toast.success('تم إنشاء الطلب بنجاح ✅');
      handleClose();
    } catch (error: any) {
      toast.error(error.message || 'فشل إنشاء الطلب');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetState = () => {
    setStep('sectors');
    setSelectedSector(null);
    setSelectedCustomer(null);
    setSectorSearch('');
    setCustomerSearch('');
    setProductItems([]);
    setDefaultQty('10');
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const goBack = () => {
    if (step === 'products') { setStep('customers'); setProductItems([]); }
    else if (step === 'customers') { setStep('sectors'); setSelectedSector(null); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else onOpenChange(true); }}>
      <DialogContent dir={dir} className="max-h-[90vh] overflow-hidden max-w-md p-0 gap-0">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MapPin className="w-5 h-5 text-primary" />
            إنشاء طلب سريع
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 space-y-3">
          {step !== 'sectors' && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={goBack}>
              <ArrowRight className="w-3 h-3 ml-1" /> رجوع
            </Button>
          )}

          {/* Step 1: Sectors */}
          {step === 'sectors' && (
            <>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="بحث عن سكتور..." value={sectorSearch} onChange={e => setSectorSearch(e.target.value)} className="pr-9" />
              </div>
              <ScrollArea className="h-[55vh]">
                <div className="space-y-1">
                  {loadingSectors ? (
                    <p className="text-center text-muted-foreground text-sm py-8">جاري التحميل...</p>
                  ) : filteredSectors.length > 0 ? (
                    filteredSectors.map(sector => (
                      <Button
                        key={sector.id}
                        variant="ghost"
                        className="w-full justify-start text-start h-auto py-3 px-3"
                        onClick={() => { setSelectedSector(sector); setStep('customers'); }}
                      >
                        <MapPin className="w-4 h-4 ml-2 shrink-0 text-primary" />
                        <span className="text-sm font-medium">{getLocalizedName(sector, language)}</span>
                      </Button>
                    ))
                  ) : (
                    <p className="text-center text-muted-foreground text-sm py-8">لا توجد سكتورات</p>
                  )}
                </div>
              </ScrollArea>
            </>
          )}

          {/* Step 2: Customers */}
          {step === 'customers' && (
            <>
              <div className="bg-muted/50 rounded-lg p-2 text-sm font-medium flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                {selectedSector && getLocalizedName(selectedSector, language)}
              </div>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="بحث عن عميل..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} className="pr-9" />
              </div>
              <ScrollArea className="h-[50vh]">
                <div className="space-y-1">
                  {loadingCustomers ? (
                    <p className="text-center text-muted-foreground text-sm py-8">جاري التحميل...</p>
                  ) : filteredCustomers.length > 0 ? (
                    filteredCustomers.map((c: any) => (
                      <Button
                        key={c.id}
                        variant="ghost"
                        className="w-full justify-start text-start h-auto py-2 px-3"
                        onClick={() => { setSelectedCustomer(c); setStep('products'); }}
                      >
                        <User className="w-4 h-4 ml-2 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <span className="text-sm font-medium block truncate">{c.name}</span>
                          {c.name_fr && <span className="text-[11px] text-muted-foreground block" dir="ltr">{c.name_fr}</span>}
                        </div>
                      </Button>
                    ))
                  ) : (
                    <p className="text-center text-muted-foreground text-sm py-8">لا يوجد عملاء مسجلين في هذا السكتور</p>
                  )}
                </div>
              </ScrollArea>
            </>
          )}

          {/* Step 3: Products */}
          {step === 'products' && (
            <>
              <div className="bg-muted/50 rounded-lg p-2 text-sm font-medium flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                {selectedCustomer?.name}
                {selectedCustomer?.name_fr && <span className="text-xs text-muted-foreground" dir="ltr">({selectedCustomer.name_fr})</span>}
              </div>

              {/* Controls row */}
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={defaultQty}
                  onChange={e => setDefaultQty(e.target.value)}
                  className="h-8 w-20 text-center text-sm"
                  placeholder="كمية"
                  min={1}
                />
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={applyDefaultQty}>
                  <Check className="w-3 h-3" /> تطبيق
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={applyRandomQty}>
                  <Shuffle className="w-3 h-3" /> عشوائي
                </Button>
                <Badge variant="secondary" className="text-xs shrink-0">
                  {selectedProducts.length}/{productItems.length}
                </Badge>
              </div>

              <ScrollArea className="h-[40vh]">
                <div className="space-y-1">
                  {productItems.map(p => (
                    <div
                      key={p.id}
                      className={`flex items-center gap-2 border rounded-lg p-2 cursor-pointer transition-colors ${p.selected ? 'border-primary/50 bg-primary/5' : 'opacity-50'}`}
                    >
                      <div
                        className="flex-1 min-w-0 flex items-center gap-2"
                        onClick={() => toggleProduct(p.id)}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${p.selected ? 'bg-primary border-primary' : 'border-muted-foreground/30'}`}>
                          {p.selected && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>
                        <span className="text-sm truncate">{p.name}</span>
                      </div>
                      <Input
                        type="number"
                        value={p.quantity}
                        onChange={e => updateProductQty(p.id, parseInt(e.target.value) || 0)}
                        className="h-7 w-16 text-center text-xs"
                        min={0}
                        onClick={e => e.stopPropagation()}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        onClick={(e) => { e.stopPropagation(); removeProduct(p.id); }}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Submit */}
              <Button
                className="w-full gap-2"
                onClick={handleSubmit}
                disabled={selectedProducts.length === 0 || isSubmitting}
              >
                <Package className="w-4 h-4" />
                {isSubmitting ? 'جاري الإنشاء...' : `إنشاء طلب (${selectedProducts.length} منتج)`}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuickOrderDialog;
