import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Package, ShoppingCart, Truck, MapPin, CheckCircle, History, ChevronDown, ChevronUp, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface WorkerLoadRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface OrderForRequest {
  id: string;
  customer_name: string;
  store_name: string | null;
  sector_name: string | null;
  created_at: string;
  total_amount: number | null;
  status: string;
  items: { product_id: string; product_name: string; quantity: number }[];
}

interface LoadRequestHistory {
  id: string;
  status: string;
  notes: string | null;
  created_at: string;
  orderIds: string[];
  products: { productName: string; quantity: number }[];
  customers: string[];
}

const WorkerLoadRequestDialog: React.FC<WorkerLoadRequestDialogProps> = ({ open, onOpenChange }) => {
  const { workerId, activeBranch } = useAuth();
  const [orders, setOrders] = useState<OrderForRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [alreadyRequestedOrderIds, setAlreadyRequestedOrderIds] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<LoadRequestHistory[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('create');

  useEffect(() => {
    if (!open || !workerId) return;
    setSelectedOrderIds(new Set());
    setExpandedRequestId(null);
    fetchAlreadyRequestedOrders().then(() => fetchOrders());
    fetchHistory();
  }, [open, workerId]);

  const fetchAlreadyRequestedOrders = async () => {
    // Get order IDs from pending/loaded requests
    const { data: requests } = await supabase
      .from('worker_load_requests')
      .select('id')
      .eq('worker_id', workerId!)
      .in('status', ['pending']);

    if (!requests || requests.length === 0) {
      setAlreadyRequestedOrderIds(new Set());
      return;
    }

    const requestIds = requests.map(r => r.id);
    const { data: items } = await supabase
      .from('worker_load_request_items')
      .select('order_id')
      .in('request_id', requestIds);

    const ids = new Set((items || []).map(i => i.order_id).filter(Boolean) as string[]);
    setAlreadyRequestedOrderIds(ids);
  };

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id, created_at, total_amount, status,
          customer:customers(name, store_name, sector:sectors(name)),
          order_items(product_id, quantity, product:products(name))
        `)
        .eq('assigned_worker_id', workerId!)
        .in('status', ['pending', 'assigned', 'in_progress'])
        .order('created_at', { ascending: true });

      if (error) throw error;

      const mapped: OrderForRequest[] = (data || []).map((o: any) => ({
        id: o.id,
        customer_name: o.customer?.name || '—',
        store_name: o.customer?.store_name || null,
        sector_name: o.customer?.sector?.name || null,
        created_at: o.created_at,
        total_amount: o.total_amount,
        status: o.status,
        items: (o.order_items || []).map((oi: any) => ({
          product_id: oi.product_id,
          product_name: oi.product?.name || '—',
          quantity: oi.quantity || 0,
        })),
      }));
      setOrders(mapped);
    } catch {
      toast.error('خطأ في جلب الطلبيات');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const { data: requests } = await supabase
        .from('worker_load_requests')
        .select('id, status, notes, created_at')
        .eq('worker_id', workerId!)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!requests || requests.length === 0) {
        setHistory([]);
        return;
      }

      // Fetch all items for these requests
      const reqIds = requests.map(r => r.id);
      const { data: allItems } = await supabase
        .from('worker_load_request_items')
        .select('request_id, order_id, product_id, quantity, product:products(name), order:orders(customer:customers(name, store_name))')
        .in('request_id', reqIds);

      const historyList: LoadRequestHistory[] = requests.map(req => {
        const items = (allItems || []).filter(i => i.request_id === req.id);
        // Aggregate products
        const prodMap = new Map<string, { productName: string; quantity: number }>();
        const customerSet = new Set<string>();
        const orderIdSet = new Set<string>();
        for (const item of items) {
          if (item.order_id) orderIdSet.add(item.order_id);
          const pname = (item.product as any)?.name || '—';
          const existing = prodMap.get(item.product_id);
          if (existing) existing.quantity += Number(item.quantity);
          else prodMap.set(item.product_id, { productName: pname, quantity: Number(item.quantity) });
          const cname = (item.order as any)?.customer?.store_name || (item.order as any)?.customer?.name;
          if (cname) customerSet.add(cname);
        }
        return {
          id: req.id,
          status: req.status,
          notes: req.notes,
          created_at: req.created_at,
          orderIds: Array.from(orderIdSet),
          products: Array.from(prodMap.values()).sort((a, b) => a.productName.localeCompare(b.productName)),
          customers: Array.from(customerSet),
        };
      });
      setHistory(historyList);
    } catch {
      console.error('Error fetching history');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Filter out already-requested orders
  const availableOrders = useMemo(() =>
    orders.filter(o => !alreadyRequestedOrderIds.has(o.id)),
    [orders, alreadyRequestedOrderIds]
  );

  const toggleOrder = (id: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedOrderIds(prev =>
      prev.size === availableOrders.length ? new Set() : new Set(availableOrders.map(o => o.id))
    );
  };

  const aggregatedProducts = useMemo(() => {
    const map = new Map<string, { productId: string; productName: string; quantity: number }>();
    for (const order of availableOrders) {
      if (!selectedOrderIds.has(order.id)) continue;
      for (const item of order.items) {
        const existing = map.get(item.product_id);
        if (existing) existing.quantity += item.quantity;
        else map.set(item.product_id, { productId: item.product_id, productName: item.product_name, quantity: item.quantity });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.productName.localeCompare(b.productName));
  }, [availableOrders, selectedOrderIds]);

  const handleSend = async () => {
    if (aggregatedProducts.length === 0) return;
    setIsSending(true);
    try {
      const { data: request, error: reqError } = await supabase
        .from('worker_load_requests')
        .insert({
          worker_id: workerId!,
          branch_id: activeBranch?.id || null,
          status: 'pending',
          notes: `${selectedOrderIds.size} طلبية`,
        })
        .select()
        .single();
      if (reqError) throw reqError;

      const selectedOrders = availableOrders.filter(o => selectedOrderIds.has(o.id));
      const itemRows: any[] = [];
      for (const order of selectedOrders) {
        for (const item of order.items) {
          itemRows.push({
            request_id: request.id,
            order_id: order.id,
            product_id: item.product_id,
            quantity: item.quantity,
          });
        }
      }
      const { error: itemsError } = await supabase.from('worker_load_request_items').insert(itemRows);
      if (itemsError) throw itemsError;

      toast.success('تم إرسال طلب الشحن بنجاح');
      setSelectedOrderIds(new Set());
      // Refresh data
      await fetchAlreadyRequestedOrders();
      await fetchHistory();
      setActiveTab('history');
    } catch {
      toast.error('خطأ في إرسال طلب الشحن');
    } finally {
      setIsSending(false);
    }
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case 'pending': return { text: 'معلّق', variant: 'default' as const };
      case 'loaded': return { text: 'تم الشحن', variant: 'secondary' as const };
      case 'rejected': return { text: 'مرفوض', variant: 'destructive' as const };
      default: return { text: s, variant: 'outline' as const };
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-md h-[92vh] max-h-[92vh] flex flex-col overflow-hidden p-0 gap-0 rounded-2xl">
        {/* HEADER */}
        <div className="bg-primary/5 border-b px-4 pt-4 pb-3 shrink-0">
          <DialogHeader className="p-0 space-y-1">
            <DialogTitle className="flex items-center gap-2.5 text-base">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Truck className="w-5 h-5 text-primary" />
              </div>
              طلب شحن
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground/80 ps-[46px]">
              حدد الطلبيات أو راجع سجل طلباتك
            </DialogDescription>
          </DialogHeader>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
          <div className="px-3 pt-2 shrink-0">
            <TabsList className="grid grid-cols-2 h-9 bg-muted/60 rounded-lg p-0.5">
              <TabsTrigger value="create" className="text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5 h-full">
                <Truck className="w-3.5 h-3.5" />
                طلب جديد
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1.5 h-full">
                <History className="w-3.5 h-3.5" />
                السجل
                {history.filter(h => h.status === 'pending').length > 0 && (
                  <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 min-w-4 flex items-center justify-center rounded-full">
                    {history.filter(h => h.status === 'pending').length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* CREATE TAB */}
          <TabsContent value="create" className="flex-1 min-h-0 flex flex-col mt-0 px-0">
            {alreadyRequestedOrderIds.size > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 mx-3 mt-2 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-[11px]">
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{alreadyRequestedOrderIds.size} طلبية مدرجة في طلبات شحن سابقة</span>
              </div>
            )}

            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-7 h-7 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">جاري تحميل الطلبيات...</span>
                </div>
              </div>
            ) : availableOrders.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center px-6">
                  <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                    <ShoppingCart className="w-8 h-8 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">لا توجد طلبيات متاحة</p>
                  {alreadyRequestedOrderIds.size > 0 && (
                    <p className="text-[11px] text-muted-foreground/70 mt-1">جميع الطلبيات مدرجة في طلبات شحن معلّقة</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col">
                {/* Selection toolbar */}
                <div className="flex items-center justify-between px-4 py-2 shrink-0">
                  <Button variant="ghost" size="sm" onClick={toggleAll} className="text-[11px] h-7 px-2 text-primary hover:text-primary">
                    {selectedOrderIds.size === availableOrders.length ? 'إلغاء الكل' : `تحديد الكل (${availableOrders.length})`}
                  </Button>
                  {selectedOrderIds.size > 0 && (
                    <Badge className="bg-primary/10 text-primary border-0 text-[11px] font-semibold px-2.5">
                      {selectedOrderIds.size} محددة
                    </Badge>
                  )}
                </div>

                {/* Orders list */}
                <div className="flex-1 min-h-0 overflow-hidden">
                  <ScrollArea className="h-full">
                    <div className="space-y-1.5 px-3 pb-2">
                      {availableOrders.map(order => {
                        const isSelected = selectedOrderIds.has(order.id);
                        return (
                          <div
                            key={order.id}
                            onClick={() => toggleOrder(order.id)}
                            className={`relative flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150 active:scale-[0.98] ${
                              isSelected 
                                ? 'bg-primary/5 ring-1.5 ring-primary/30 shadow-sm' 
                                : 'bg-card hover:bg-muted/40 ring-1 ring-border/50'
                            }`}
                          >
                            <Checkbox 
                              checked={isSelected} 
                              onCheckedChange={() => toggleOrder(order.id)} 
                              className="mt-1 shrink-0 data-[state=checked]:bg-primary data-[state=checked]:border-primary" 
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  {order.store_name && (
                                    <p className="font-semibold text-[13px] leading-tight truncate">{order.store_name}</p>
                                  )}
                                  <p className={`truncate leading-tight ${order.store_name ? 'text-[11px] text-muted-foreground' : 'text-[13px] font-medium'}`}>
                                    {order.customer_name}
                                  </p>
                                </div>
                                {order.total_amount != null && order.total_amount > 0 && (
                                  <span className="text-[11px] font-bold text-foreground whitespace-nowrap tabular-nums">
                                    {order.total_amount.toLocaleString()} د.ج
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                {order.sector_name && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-primary bg-primary/5 rounded-full px-1.5 py-0.5">
                                    <MapPin className="w-2.5 h-2.5" />
                                    {order.sector_name}
                                  </span>
                                )}
                                <span className="text-[10px] text-muted-foreground">{format(new Date(order.created_at), 'MM/dd HH:mm')}</span>
                                <span className="text-[10px] text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5">{order.items.length} منتج</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

                {/* Aggregated products summary */}
                {selectedOrderIds.size > 0 && (
                  <div className="border-t-2 border-primary/20 bg-muted/40 px-3 pt-2.5 pb-1 shrink-0 relative z-10 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
                    <p className="text-[11px] font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-primary" />
                      ملخص المنتجات ({aggregatedProducts.length})
                    </p>
                    <ScrollArea className="max-h-[14vh]">
                      <div className="grid grid-cols-1 gap-1">
                        {aggregatedProducts.map(p => (
                          <div key={p.productId} className="flex items-center justify-between bg-background rounded-lg px-2.5 py-1.5 ring-1 ring-border/30">
                            <span className="text-[12px] truncate flex-1 min-w-0">{p.productName}</span>
                            <Badge variant="secondary" className="text-[10px] ms-2 shrink-0 tabular-nums font-bold">{p.quantity}</Badge>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 px-3 pt-2 pb-3 border-t bg-background shrink-0">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 h-10 text-xs rounded-xl">
                إلغاء
              </Button>
              <Button 
                onClick={handleSend} 
                disabled={selectedOrderIds.size === 0 || isSending} 
                className="flex-1 h-10 text-xs rounded-xl gap-1.5 shadow-sm"
              >
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                إرسال الطلب
              </Button>
            </div>
          </TabsContent>

          {/* HISTORY TAB */}
          <TabsContent value="history" className="flex-1 min-h-0 flex flex-col mt-0 px-0">
            {isLoadingHistory ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-7 h-7 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">جاري تحميل السجل...</span>
                </div>
              </div>
            ) : history.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center px-6">
                  <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                    <History className="w-8 h-8 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">لا توجد طلبات شحن سابقة</p>
                </div>
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="space-y-1.5 px-3 py-2">
                  {history.map(req => {
                    const sl = statusLabel(req.status);
                    const isExpanded = expandedRequestId === req.id;
                    return (
                      <div key={req.id} className="rounded-xl ring-1 ring-border/50 bg-card overflow-hidden">
                        <div
                          className="flex items-center justify-between p-3 cursor-pointer active:bg-muted/30 transition-colors"
                          onClick={() => setExpandedRequestId(isExpanded ? null : req.id)}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                              req.status === 'loaded' ? 'bg-green-100 dark:bg-green-900/20' :
                              req.status === 'rejected' ? 'bg-destructive/10' : 'bg-primary/10'
                            }`}>
                              <Truck className={`w-3.5 h-3.5 ${
                                req.status === 'loaded' ? 'text-green-600 dark:text-green-400' :
                                req.status === 'rejected' ? 'text-destructive' : 'text-primary'
                              }`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[12px] font-medium truncate">{req.notes || 'طلب شحن'}</span>
                                <Badge variant={sl.variant} className="text-[9px] px-1.5 py-0 h-4 rounded-full shrink-0">{sl.text}</Badge>
                              </div>
                              <span className="text-[10px] text-muted-foreground">{format(new Date(req.created_at), 'MM/dd HH:mm')}</span>
                            </div>
                          </div>
                          <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>

                        {isExpanded && (
                          <div className="border-t px-3 py-2.5 space-y-2.5 bg-muted/10">
                            {/* Customers */}
                            {req.customers.length > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  العملاء ({req.customers.length})
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {req.customers.map((c, i) => (
                                    <Badge key={i} variant="outline" className="text-[10px] rounded-full">{c}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {/* Products */}
                            <div>
                              <p className="text-[10px] font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                                <Package className="w-3 h-3" />
                                المنتجات ({req.products.length})
                              </p>
                              <div className="space-y-0.5">
                                {req.products.map((p, i) => (
                                  <div key={i} className="flex items-center justify-between bg-background rounded-lg px-2.5 py-1.5 text-[11px] ring-1 ring-border/20">
                                    <span className="truncate">{p.productName}</span>
                                    <Badge variant="secondary" className="text-[9px] tabular-nums font-bold shrink-0 ms-2">{p.quantity}</Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground/70 text-center pt-0.5">{req.orderIds.length} طلبية</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default WorkerLoadRequestDialog;
