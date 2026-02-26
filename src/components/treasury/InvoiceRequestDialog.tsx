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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Search, ShoppingCart, Send, ArrowRight, X, MessageCircle, User, FileText, Clock, CheckCircle, RefreshCw, PackageCheck } from 'lucide-react';
import { toast } from 'sonner';
import { getLocalizedName } from '@/utils/sectorName';
import { format } from 'date-fns';

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
  const { activeBranch, workerId } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'manual' | 'worker_requests' | 'status'>('worker_requests');
  const [statusSubTab, setStatusSubTab] = useState<'sent' | 'received'>('sent');
  const [receivingOrderId, setReceivingOrderId] = useState<string | null>(null);
  const [invoiceNumberInput, setInvoiceNumberInput] = useState('');
  const [invoicePrefix, setInvoicePrefix] = useState('F');
  const [invoiceYear, setInvoiceYear] = useState(new Date().getFullYear().toString());

  const buildInvoiceNumber = (num: string) => {
    const padded = num.padStart(5, '0');
    return `${invoicePrefix}${padded}/${invoiceYear}`;
  };
  const [step, setStep] = useState<Step>('customer');
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod | null>(null);
  const [selectedWorkerOrder, setSelectedWorkerOrder] = useState<any>(null);

  // Fetch worker invoice orders (payment_type = 'with_invoice')
  const { data: invoiceOrders, isLoading: loadingOrders } = useQuery({
    queryKey: ['invoice-orders', activeBranch?.id],
    queryFn: async () => {
      let q = supabase
        .from('orders')
        .select(`
          id, customer_id, created_by, status, payment_type, invoice_payment_method, total_amount, created_at, notes, invoice_sent_at, invoice_number, invoice_received_at,
          customers!orders_customer_id_fkey(id, name, name_fr, store_name),
          workers!orders_created_by_fkey(id, full_name, username),
          order_items(id, product_id, quantity, unit_price, total_price, products!order_items_product_id_fkey(id, name))
        `)
        .eq('payment_type', 'with_invoice')
        .in('status', ['pending', 'assigned', 'in_progress', 'delivered'])
        .order('created_at', { ascending: false });
      if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: open && (activeTab === 'worker_requests' || activeTab === 'status'),
  });

  // Fetch manual invoice requests
  const { data: manualRequests, isLoading: loadingManual } = useQuery({
    queryKey: ['manual-invoice-requests', activeBranch?.id],
    queryFn: async () => {
      let q = supabase
        .from('manual_invoice_requests')
        .select(`
          *,
          customers!manual_invoice_requests_customer_id_fkey(id, name, name_fr, store_name)
        `)
        .order('created_at', { ascending: false });
      if (activeBranch?.id) q = q.eq('branch_id', activeBranch.id);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: open && activeTab === 'status',
  });

  const pendingInvoiceOrders = useMemo(() =>
    (invoiceOrders || []).filter((o: any) => !o.invoice_sent_at), [invoiceOrders]);
  const completedInvoiceOrders = useMemo(() =>
    (invoiceOrders || []).filter((o: any) => !!o.invoice_sent_at && !o.invoice_received_at), [invoiceOrders]);
  const receivedInvoiceOrders = useMemo(() =>
    (invoiceOrders || []).filter((o: any) => !!o.invoice_received_at), [invoiceOrders]);

  // Manual requests split by status
  const manualSentRequests = useMemo(() =>
    (manualRequests || []).filter((r: any) => r.status === 'sent'), [manualRequests]);
  const manualReceivedRequests = useMemo(() =>
    (manualRequests || []).filter((r: any) => r.status === 'received'), [manualRequests]);

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
    enabled: open && activeTab === 'manual',
  });

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ['products-for-invoice'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, name').eq('is_active', true).order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: open && ((activeTab === 'manual' && step === 'products') || (activeTab === 'worker_requests' && !!selectedWorkerOrder)),
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
    enabled: open && (step === 'whatsapp' || !!selectedWorkerOrder),
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

  const buildWorkerOrderWhatsAppMessage = (order: any) => {
    const customerName = order.customers?.name_fr || order.customers?.name || '';
    const paymentMethod = order.invoice_payment_method || '';
    const lines = [customerName, '', paymentMethod, ''];
    for (const item of (order.order_items || [])) {
      const name = item.products?.name || '';
      lines.push(`${item.quantity} ${name}`);
    }
    return lines.join('\n');
  };

  const markOrderAsSent = async (orderId: string) => {
    const { error } = await supabase
      .from('orders')
      .update({ invoice_sent_at: new Date().toISOString() } as any)
      .eq('id', orderId);
    if (error) {
      console.error('Failed to mark invoice as sent:', error);
    } else {
      queryClient.invalidateQueries({ queryKey: ['invoice-orders'] });
    }
  };

  const markOrderAsReceived = async (orderId: string, invoiceNumber: string) => {
    if (!invoiceNumber.trim()) {
      toast.error('الرجاء إدخال رقم الفاتورة');
      return;
    }
    const { error } = await supabase
      .from('orders')
      .update({ invoice_received_at: new Date().toISOString(), invoice_number: invoiceNumber.trim() } as any)
      .eq('id', orderId);
    if (error) {
      console.error('Failed to mark invoice as received:', error);
      toast.error('فشل تسجيل الاستلام');
    } else {
      queryClient.invalidateQueries({ queryKey: ['invoice-orders'] });
      toast.success('تم تسجيل استلام الفاتورة ✅');
      setReceivingOrderId(null);
      setInvoiceNumberInput('');
    }
  };

  const saveManualRequest = async (whatsappContact: string) => {
    if (!selectedCustomer || !workerId) return;
    const { error } = await supabase.from('manual_invoice_requests').insert({
      customer_id: selectedCustomer.id,
      worker_id: workerId,
      branch_id: activeBranch?.id || null,
      products: cart.map(i => ({ productId: i.productId, productName: i.productName, quantity: i.quantity })),
      payment_method: selectedPayment || null,
      whatsapp_contact: whatsappContact,
      status: 'sent',
    } as any);
    if (error) console.error('Failed to save manual request:', error);
    else queryClient.invalidateQueries({ queryKey: ['manual-invoice-requests'] });
  };

  const markManualAsReceived = async (requestId: string, invoiceNumber: string) => {
    if (!invoiceNumber.trim()) {
      toast.error('الرجاء إدخال رقم الفاتورة');
      return;
    }
    const { error } = await supabase
      .from('manual_invoice_requests')
      .update({ status: 'received', received_at: new Date().toISOString(), invoice_number: invoiceNumber.trim() } as any)
      .eq('id', requestId);
    if (error) {
      toast.error('فشل تسجيل الاستلام');
    } else {
      queryClient.invalidateQueries({ queryKey: ['manual-invoice-requests'] });
      toast.success('تم تسجيل استلام الفاتورة ✅');
      setReceivingOrderId(null);
      setInvoiceNumberInput('');
    }
  };

  const sendWhatsApp = async (phone: string, message?: string, orderId?: string) => {
    const msg = message || buildWhatsAppMessage();
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone.slice(1) : cleanPhone.startsWith('0') ? '213' + cleanPhone.slice(1) : cleanPhone;
    const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    
    if (orderId) {
      await markOrderAsSent(orderId);
      toast.success('تم فتح واتساب وتعليم الطلب كمنجز ✅');
      setSelectedWorkerOrder(null);
    } else {
      // Manual request - save to DB
      await saveManualRequest(phone);
      toast.success('تم فتح واتساب وحفظ الطلب ✅');
      onOpenChange(false);
      resetState();
    }
  };

  const resetState = () => {
    setStep('customer');
    setSelectedCustomer(null);
    setCart([]);
    setSearch('');
    setProductSearch('');
    setSelectedPayment(null);
    setSelectedWorkerOrder(null);
    setReceivingOrderId(null);
    setInvoiceNumberInput('');
  };

  const handleClose = (v: boolean) => {
    if (!v) resetState();
    onOpenChange(v);
  };

  const pendingCount = pendingInvoiceOrders.length;

  const renderOrderCard = (order: any, mode: 'pending' | 'sent' | 'received') => (
    <div key={order.id} className="border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">
            👤 {order.customers?.name || 'عميل'}
            {order.customers?.name_fr && <span className="text-muted-foreground text-xs mr-1" dir="ltr">({order.customers.name_fr})</span>}
          </p>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <User className="w-3 h-3" />
            {order.workers?.full_name || 'عامل'}
          </p>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {format(new Date(order.created_at), 'dd/MM HH:mm')}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant="outline" className="text-[10px] shrink-0">
            {order.invoice_payment_method || 'فاتورة'}
          </Badge>
          {mode === 'sent' && order.invoice_sent_at && (
            <Badge variant="secondary" className="text-[10px] gap-0.5">
              <CheckCircle className="w-3 h-3" /> تم الإرسال
            </Badge>
          )}
          {mode === 'received' && order.invoice_number && (
            <Badge variant="default" className="text-[10px] gap-0.5">
              <PackageCheck className="w-3 h-3" /> {order.invoice_number}
            </Badge>
          )}
        </div>
      </div>
      <div className="text-xs bg-muted/30 rounded p-2 space-y-0.5">
        {(order.order_items || []).map((item: any) => (
          <div key={item.id} className="flex justify-between">
            <span className="truncate flex-1">{item.products?.name || '—'}</span>
            <Badge variant="secondary" className="text-[10px] mr-1">{item.quantity}</Badge>
          </div>
        ))}
      </div>

      {/* Pending: send button */}
      {mode === 'pending' && (
        <Button
          size="sm"
          className="w-full gap-1 h-8 text-xs"
          onClick={() => setSelectedWorkerOrder(order)}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          إرسال عبر واتساب
        </Button>
      )}

      {/* Sent: resend + receive buttons */}
      {mode === 'sent' && (
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground text-center">
            أُرسل في {format(new Date(order.invoice_sent_at), 'dd/MM HH:mm')}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 gap-1 h-8 text-xs"
              onClick={() => setSelectedWorkerOrder(order)}
            >
              <RefreshCw className="w-3 h-3" />
              إعادة إرسال
            </Button>
            <Button
              size="sm"
              variant="default"
              className="flex-1 gap-1 h-8 text-xs"
              onClick={() => { setReceivingOrderId(order.id); setInvoiceNumberInput(''); }}
            >
              <PackageCheck className="w-3 h-3" />
              تأكيد الاستلام
            </Button>
          </div>
          {receivingOrderId === order.id && (
            <div className="p-2 border rounded-lg bg-muted/30 space-y-2">
              <p className="text-xs font-medium">أدخل رقم الفاتورة:</p>
              <div className="flex gap-1.5 items-center" dir="ltr">
                <Input
                  value={invoicePrefix}
                  onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
                  className="h-8 text-sm w-14 text-center font-mono"
                  dir="ltr"
                />
                <Input
                  value={invoiceNumberInput}
                  onChange={(e) => setInvoiceNumberInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="294"
                  className="h-8 text-sm flex-1 font-mono"
                  dir="ltr"
                  type="text"
                  inputMode="numeric"
                />
                <span className="text-muted-foreground text-sm">/</span>
                <Input
                  value={invoiceYear}
                  onChange={(e) => setInvoiceYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="h-8 text-sm w-16 text-center font-mono"
                  dir="ltr"
                />
              </div>
              {invoiceNumberInput && (
                <p className="text-[11px] text-muted-foreground text-center font-mono" dir="ltr">
                  المعاينة: <span className="font-semibold text-foreground">{buildInvoiceNumber(invoiceNumberInput)}</span>
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1 h-7 text-xs"
                  onClick={() => setReceivingOrderId(null)}
                >
                  إلغاء
                </Button>
                <Button
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  disabled={!invoiceNumberInput}
                  onClick={() => markOrderAsReceived(order.id, buildInvoiceNumber(invoiceNumberInput))}
                >
                  <CheckCircle className="w-3 h-3 ml-1" />
                  تأكيد
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Received: show invoice info */}
      {mode === 'received' && (
        <div className="text-[10px] text-muted-foreground text-center space-y-0.5">
          <p>📄 رقم الفاتورة: <span className="font-semibold text-foreground">{order.invoice_number}</span></p>
          {order.invoice_received_at && <p>تم الاستلام في {format(new Date(order.invoice_received_at), 'dd/MM HH:mm')}</p>}
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent dir={dir} className="max-h-[90vh] overflow-y-auto max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            📄 طلب فاتورة
            {pendingCount > 0 && (
              <Badge variant="destructive" className="text-xs">{pendingCount}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as any); resetState(); }}>
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="worker_requests" className="text-xs gap-1">
              <FileText className="w-3.5 h-3.5" />
              طلبات العمال
              {pendingCount > 0 && (
                <Badge variant="destructive" className="text-[10px] h-4 px-1">{pendingCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="status" className="text-xs gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              حالة الطلبات
            </TabsTrigger>
            <TabsTrigger value="manual" className="text-xs gap-1">
              <Send className="w-3.5 h-3.5" />
              طلب يدوي
            </TabsTrigger>
          </TabsList>

          {/* Worker Invoice Requests Tab - Only Pending */}
          <TabsContent value="worker_requests">
            {selectedWorkerOrder ? (
              <div className="space-y-3">
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setSelectedWorkerOrder(null)}>
                  <ArrowRight className="w-3 h-3 ml-1" /> رجوع
                </Button>
                <div className="p-3 rounded-lg bg-muted/50 text-xs space-y-1">
                  <p className="font-medium">معاينة الرسالة:</p>
                  <pre className="whitespace-pre-wrap text-[11px] bg-background rounded p-2 border" dir="ltr">
                    {buildWorkerOrderWhatsAppMessage(selectedWorkerOrder)}
                  </pre>
                </div>
                <p className="text-sm font-medium">اختر رقم واتساب:</p>
                <div className="space-y-2">
                  {(whatsappContacts || []).map((c: any) => (
                    <Button
                      key={c.id}
                      variant="outline"
                      className="w-full justify-start gap-2 h-auto py-3"
                      onClick={() => sendWhatsApp(c.phone || '', buildWorkerOrderWhatsAppMessage(selectedWorkerOrder), selectedWorkerOrder.id)}
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
            ) : (
              <ScrollArea className="h-[50vh]">
                {loadingOrders ? (
                  <p className="text-center text-muted-foreground text-sm py-8">جاري التحميل...</p>
                ) : pendingInvoiceOrders.length > 0 ? (
                  <div className="space-y-2">
                    {pendingInvoiceOrders.map((order: any) => renderOrderCard(order, 'pending'))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground text-sm py-8">لا توجد طلبات فواتير معلقة</p>
                )}
              </ScrollArea>
            )}
          </TabsContent>

          {/* Status Tab - Sent & Received */}
          <TabsContent value="status">
            <div className="space-y-3">
              <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
                <Button
                  size="sm"
                  variant={statusSubTab === 'sent' ? 'default' : 'ghost'}
                  className="flex-1 h-8 text-[10px] gap-1"
                  onClick={() => setStatusSubTab('sent')}
                >
                  تم الإرسال ({completedInvoiceOrders.length + manualSentRequests.length})
                </Button>
                <Button
                  size="sm"
                  variant={statusSubTab === 'received' ? 'default' : 'ghost'}
                  className="flex-1 h-8 text-[10px] gap-1"
                  onClick={() => setStatusSubTab('received')}
                >
                  <PackageCheck className="w-3 h-3" />
                  تم الاستلام ({receivedInvoiceOrders.length + manualReceivedRequests.length})
                </Button>
              </div>

              <ScrollArea className="h-[50vh]">
                {(loadingOrders || loadingManual) ? (
                  <p className="text-center text-muted-foreground text-sm py-8">جاري التحميل...</p>
                ) : statusSubTab === 'sent' ? (
                  (completedInvoiceOrders.length + manualSentRequests.length) > 0 ? (
                    <div className="space-y-2">
                      {/* Manual sent requests */}
                      {manualSentRequests.map((req: any) => (
                        <div key={req.id} className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold truncate">
                                👤 {req.customers?.name || 'عميل'}
                                {req.customers?.name_fr && <span className="text-muted-foreground text-xs mr-1" dir="ltr">({req.customers.name_fr})</span>}
                              </p>
                              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {format(new Date(req.sent_at), 'dd/MM HH:mm')}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <Badge variant="outline" className="text-[10px]">{req.payment_method || 'فاتورة'}</Badge>
                              <Badge variant="secondary" className="text-[10px] gap-0.5">
                                <Send className="w-3 h-3" /> يدوي
                              </Badge>
                            </div>
                          </div>
                          <div className="text-xs bg-muted/30 rounded p-2 space-y-0.5">
                            {(req.products || []).map((item: any, idx: number) => (
                              <div key={idx} className="flex justify-between">
                                <span className="truncate flex-1">{item.productName || '—'}</span>
                                <Badge variant="secondary" className="text-[10px] mr-1">{item.quantity}</Badge>
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="default"
                              className="flex-1 gap-1 h-8 text-xs"
                              onClick={() => { setReceivingOrderId(req.id); setInvoiceNumberInput(''); }}
                            >
                              <PackageCheck className="w-3 h-3" />
                              تأكيد الاستلام
                            </Button>
                          </div>
                          {receivingOrderId === req.id && (
                            <div className="p-2 border rounded-lg bg-muted/30 space-y-2">
                              <p className="text-xs font-medium">أدخل رقم الفاتورة:</p>
                              <div className="flex gap-1.5 items-center" dir="ltr">
                                <Input value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())} className="h-8 text-sm w-14 text-center font-mono" dir="ltr" />
                                <Input value={invoiceNumberInput} onChange={(e) => setInvoiceNumberInput(e.target.value.replace(/\D/g, ''))} placeholder="294" className="h-8 text-sm flex-1 font-mono" dir="ltr" type="text" inputMode="numeric" />
                                <span className="text-muted-foreground text-sm">/</span>
                                <Input value={invoiceYear} onChange={(e) => setInvoiceYear(e.target.value.replace(/\D/g, '').slice(0, 4))} className="h-8 text-sm w-16 text-center font-mono" dir="ltr" />
                              </div>
                              {invoiceNumberInput && (
                                <p className="text-[11px] text-muted-foreground text-center font-mono" dir="ltr">
                                  المعاينة: <span className="font-semibold text-foreground">{buildInvoiceNumber(invoiceNumberInput)}</span>
                                </p>
                              )}
                              <div className="flex gap-2">
                                <Button size="sm" variant="ghost" className="flex-1 h-7 text-xs" onClick={() => setReceivingOrderId(null)}>إلغاء</Button>
                                <Button size="sm" className="flex-1 h-7 text-xs" disabled={!invoiceNumberInput} onClick={() => markManualAsReceived(req.id, buildInvoiceNumber(invoiceNumberInput))}>
                                  <CheckCircle className="w-3 h-3 ml-1" /> تأكيد
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      {/* Worker sent orders */}
                      {completedInvoiceOrders.map((order: any) => renderOrderCard(order, 'sent'))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground text-sm py-8">لا توجد طلبات منجزة</p>
                  )
                ) : (
                  (receivedInvoiceOrders.length + manualReceivedRequests.length) > 0 ? (
                    <div className="space-y-2">
                      {/* Manual received requests */}
                      {manualReceivedRequests.map((req: any) => (
                        <div key={req.id} className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold truncate">
                                👤 {req.customers?.name || 'عميل'}
                              </p>
                              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {format(new Date(req.sent_at), 'dd/MM HH:mm')}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <Badge variant="default" className="text-[10px] gap-0.5">
                                <PackageCheck className="w-3 h-3" /> {req.invoice_number}
                              </Badge>
                              <Badge variant="secondary" className="text-[10px] gap-0.5">
                                <Send className="w-3 h-3" /> يدوي
                              </Badge>
                            </div>
                          </div>
                          <div className="text-xs bg-muted/30 rounded p-2 space-y-0.5">
                            {(req.products || []).map((item: any, idx: number) => (
                              <div key={idx} className="flex justify-between">
                                <span className="truncate flex-1">{item.productName || '—'}</span>
                                <Badge variant="secondary" className="text-[10px] mr-1">{item.quantity}</Badge>
                              </div>
                            ))}
                          </div>
                          <div className="text-[10px] text-muted-foreground text-center">
                            📄 رقم الفاتورة: <span className="font-semibold text-foreground">{req.invoice_number}</span>
                            {req.received_at && <p>تم الاستلام في {format(new Date(req.received_at), 'dd/MM HH:mm')}</p>}
                          </div>
                        </div>
                      ))}
                      {/* Worker received orders */}
                      {receivedInvoiceOrders.map((order: any) => renderOrderCard(order, 'received'))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground text-sm py-8">لا توجد فواتير مستلمة</p>
                  )
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          {/* Manual Invoice Request Tab */}
          <TabsContent value="manual">
            {step !== 'customer' && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs mb-2" onClick={() => {
                if (step === 'whatsapp') setStep('payment');
                else if (step === 'payment') setStep('products');
                else setStep('customer');
              }}>
                <ArrowRight className="w-3 h-3 ml-1" /> رجوع
              </Button>
            )}

            {step === 'customer' && (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="بحث عن عميل مسجل..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
                </div>
                <ScrollArea className="h-[45vh]">
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

            {step === 'products' && (
              <div className="space-y-3">
                <div className="p-2 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-sm font-medium">👤 {selectedCustomer?.name} {selectedCustomer?.name_fr ? `(${selectedCustomer.name_fr})` : ''}</p>
                </div>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="بحث عن منتج..." value={productSearch} onChange={e => setProductSearch(e.target.value)} className="pr-9" />
                </div>
                <ScrollArea className="h-[30vh]">
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
                {cart.length > 0 && (
                  <div className="border-t pt-2 space-y-1">
                    <div className="flex items-center gap-2 mb-1">
                      <ShoppingCart className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold">السلة ({cart.length})</span>
                    </div>
                    <div className="max-h-24 overflow-y-auto space-y-0.5">
                      {cart.map(item => (
                        <div key={item.productId} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                          <span className="truncate flex-1">{item.productName}</span>
                          <Badge variant="secondary" className="text-xs mx-1">{item.quantity}</Badge>
                          <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => updateCart(item.productId, item.productName, 0)}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button className="w-full gap-2 mt-2" onClick={() => setStep('payment')}>
                      <ArrowRight className="w-4 h-4" /> التالي: طريقة الدفع
                    </Button>
                  </div>
                )}
              </div>
            )}

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
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default InvoiceRequestDialog;
