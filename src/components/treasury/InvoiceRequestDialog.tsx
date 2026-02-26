import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, ShoppingCart, Send, ArrowRight, X, MessageCircle, User } from 'lucide-react';
import { toast } from 'sonner';
import { getLocalizedName } from '@/utils/sectorName';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
}

type PaymentMethod = 'Chèque' | 'Virement' | 'Versement';
type Step = 'customer' | 'products' | 'payment' | 'whatsapp';

const InvoiceRequestDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  const { language, dir } = useLanguage();
  const { activeBranch } = useAuth();
  const [step, setStep] = useState<Step>('customer');
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod | null>(null);

  // Fetch registered customers with sector info
  const { data: customers } = useQuery({
    queryKey: ['registered-customers', activeBranch?.id],
    queryFn: async () => {
      let q = supabase.from('customers').select('id, name, name_fr, store_name, store_name_fr, sector_id, sectors(id, name, name_fr)').eq('is_registered', true).eq('status', 'active').order('name');
      if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ['products-for-invoice'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, name').eq('is_active', true).order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: open && step === 'products',
  });

  // Fetch WhatsApp contacts
  const { data: whatsappContacts } = useQuery({
    queryKey: ['treasury-whatsapp-contacts', activeBranch?.id],
    queryFn: async () => {
      let q = supabase.from('treasury_contacts').select('*').eq('contact_type', 'whatsapp').eq('is_active', true).order('name');
      if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: open && step === 'whatsapp',
  });

  // Group customers by sector
  const groupedCustomers = useMemo(() => {
    if (!customers) return {};
    const filtered = search
      ? customers.filter((c: any) => c.name?.includes(search) || c.name_fr?.toLowerCase().includes(search.toLowerCase()) || c.store_name?.includes(search))
      : customers;
    const groups: Record<string, any[]> = {};
    for (const c of filtered) {
      const sectorName = c.sectors ? getLocalizedName(c.sectors, language) : 'بدون سكتور';
      if (!groups[sectorName]) groups[sectorName] = [];
      groups[sectorName].push(c);
    }
    return groups;
  }, [customers, search, language]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (!productSearch) return products;
    return products.filter((p: any) => p.name?.includes(productSearch));
  }, [products, productSearch]);

  const updateCart = (productId: string, productName: string, qty: number) => {
    setCart(prev => {
      const existing = prev.find(i => i.productId === productId);
      if (qty <= 0) return prev.filter(i => i.productId !== productId);
      if (existing) return prev.map(i => i.productId === productId ? { ...i, quantity: qty } : i);
      return [...prev, { productId, productName, quantity: qty }];
    });
  };

  const getCartQty = (productId: string) => cart.find(i => i.productId === productId)?.quantity || 0;

  const buildWhatsAppMessage = () => {
    const customerName = selectedCustomer?.name_fr || selectedCustomer?.name || '';
    const lines = [customerName, '', selectedPayment || '', ''];
    for (const item of cart) {
      const product = products?.find((p: any) => p.id === item.productId);
      const name = product?.name || item.productName;
      lines.push(`${item.quantity} ${name}`);
    }
    return lines.join('\n');
  };

  const sendWhatsApp = (phone: string) => {
    const message = buildWhatsAppMessage();
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone.slice(1) : cleanPhone.startsWith('0') ? '213' + cleanPhone.slice(1) : cleanPhone;
    const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
    toast.success('تم فتح واتساب');
    onOpenChange(false);
    resetState();
  };

  const resetState = () => {
    setStep('customer');
    setSelectedCustomer(null);
    setCart([]);
    setSearch('');
    setProductSearch('');
    setSelectedPayment(null);
  };

  const handleClose = (v: boolean) => {
    if (!v) resetState();
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent dir={dir} className="max-h-[90vh] overflow-y-auto max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            📄 طلب فاتورة
            {step !== 'customer' && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => {
                if (step === 'whatsapp') setStep('payment');
                else if (step === 'payment') setStep('products');
                else setStep('customer');
              }}>
                <ArrowRight className="w-3 h-3 ml-1" /> رجوع
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Choose registered customer */}
        {step === 'customer' && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="بحث عن عميل مسجل..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <ScrollArea className="h-[50vh]">
              <div className="space-y-3">
                {Object.entries(groupedCustomers).map(([sector, custs]) => (
                  <div key={sector}>
                    <p className="text-xs font-semibold text-muted-foreground mb-1 px-1">📍 {sector}</p>
                    <div className="space-y-1">
                      {(custs as any[]).map((c: any) => (
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
                      ))}
                    </div>
                  </div>
                ))}
                {Object.keys(groupedCustomers).length === 0 && (
                  <p className="text-center text-muted-foreground text-sm py-8">لا يوجد عملاء مسجلين</p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Step 2: Product grid + cart */}
        {step === 'products' && (
          <div className="space-y-3">
            <div className="p-2 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-sm font-medium">👤 {selectedCustomer?.name} {selectedCustomer?.name_fr ? `(${selectedCustomer.name_fr})` : ''}</p>
            </div>

            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="بحث عن منتج..." value={productSearch} onChange={e => setProductSearch(e.target.value)} className="pr-9" />
            </div>

            <ScrollArea className="h-[35vh]">
              <div className="grid grid-cols-2 gap-2">
                {filteredProducts.map((p: any) => {
                  const qty = getCartQty(p.id);
                  return (
                    <div key={p.id} className={`border rounded-lg p-2 text-center space-y-1 ${qty > 0 ? 'border-primary bg-primary/5' : ''}`}>
                      <p className="text-xs font-medium truncate">{p.name}</p>
                      <Input
                        type="number"
                        min="0"
                        value={qty || ''}
                        onChange={e => updateCart(p.id, p.name, parseInt(e.target.value) || 0)}
                        className="h-8 text-center text-sm"
                        placeholder="0"
                      />
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Cart summary */}
            {cart.length > 0 && (
              <div className="border-t pt-2 space-y-1">
                <div className="flex items-center gap-2 mb-1">
                  <ShoppingCart className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">السلة ({cart.length})</span>
                </div>
                <div className="max-h-24 overflow-y-auto space-y-0.5">
                  {cart.map(item => {
                    const product = products?.find((p: any) => p.id === item.productId);
                    return (
                      <div key={item.productId} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                        <span className="truncate flex-1">{product?.name || item.productName}</span>
                        <Badge variant="secondary" className="text-xs mx-1">{item.quantity}</Badge>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => updateCart(item.productId, item.productName, 0)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
                <Button className="w-full gap-2 mt-2" onClick={() => setStep('payment')}>
                  <ArrowRight className="w-4 h-4" /> التالي: طريقة الدفع
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Payment method */}
        {step === 'payment' && (
          <div className="space-y-4">
            <p className="text-sm font-medium">اختر طريقة الدفع:</p>
            <div className="grid grid-cols-3 gap-2">
              {(['Chèque', 'Virement', 'Versement'] as PaymentMethod[]).map(method => (
                <Button
                  key={method}
                  variant={selectedPayment === method ? 'default' : 'outline'}
                  className="h-12 text-sm font-semibold"
                  onClick={() => setSelectedPayment(method)}
                >
                  {method}
                </Button>
              ))}
            </div>
            {selectedPayment && (
              <Button className="w-full gap-2 mt-2" onClick={() => setStep('whatsapp')}>
                <Send className="w-4 h-4" /> إرسال عبر واتساب
              </Button>
            )}
          </div>
        )}

        {/* Step 4: WhatsApp contact selection */}
        {step === 'whatsapp' && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-muted/50 text-xs space-y-1">
              <p className="font-medium">معاينة الرسالة:</p>
              <pre className="whitespace-pre-wrap text-[11px] bg-background rounded p-2 border" dir="ltr">
                {buildWhatsAppMessage()}
              </pre>
            </div>

            <p className="text-sm font-medium">اختر رقم واتساب:</p>
            <div className="space-y-2">
              {(whatsappContacts || []).map((c: any) => (
                <Button
                  key={c.id}
                  variant="outline"
                  className="w-full justify-start gap-2 h-auto py-3"
                  onClick={() => sendWhatsApp(c.phone || '')}
                >
                  <MessageCircle className="w-5 h-5 text-green-600 shrink-0" />
                  <div className="text-start min-w-0">
                    <span className="text-sm font-medium block">{c.name}</span>
                    {c.phone && <span className="text-xs text-muted-foreground block" dir="ltr">{c.phone}</span>}
                  </div>
                </Button>
              ))}
              {(whatsappContacts || []).length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-4">
                  لا توجد أرقام واتساب. أضفها من ⚙️ الإعدادات
                </p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default InvoiceRequestDialog;
