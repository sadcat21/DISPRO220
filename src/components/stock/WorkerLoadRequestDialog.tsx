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
      <DialogContent className="max-w-md h-[90vh] max-h-[90vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            طلب شحن
          </DialogTitle>
          <DialogDescription>حدد الطلبيات أو راجع سجل طلباتك</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="mx-4 grid grid-cols-2">
            <TabsTrigger value="create" className="text-xs">
              <Truck className="w-3.5 h-3.5 me-1" />
              طلب جديد
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs">
              <History className="w-3.5 h-3.5 me-1" />
              السجل
              {history.filter(h => h.status === 'pending').length > 0 && (
                <Badge variant="destructive" className="ms-1 text-[10px] px-1 py-0">{history.filter(h => h.status === 'pending').length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* CREATE TAB */}
          <TabsContent value="create" className="flex-1 min-h-0 flex flex-col px-4 mt-2">
            {alreadyRequestedOrderIds.size > 0 && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-300 text-yellow-700 dark:text-yellow-400 text-xs mb-2">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{alreadyRequestedOrderIds.size} طلبية مدرجة في طلبات شحن سابقة</span>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : availableOrders.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">لا توجد طلبيات متاحة</p>
                {alreadyRequestedOrderIds.size > 0 && (
                  <p className="text-xs mt-1">جميع الطلبيات مدرجة في طلبات شحن معلّقة</p>
                )}
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex items-center justify-between px-1 mb-1">
                  <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs">
                    {selectedOrderIds.size === availableOrders.length ? 'إلغاء تحديد الكل' : `تحديد الكل (${availableOrders.length})`}
                  </Button>
                  {selectedOrderIds.size > 0 && (
                    <Badge variant="secondary" className="text-xs">{selectedOrderIds.size} طلبية</Badge>
                  )}
                </div>

                <div className="flex-1 min-h-0">
                  <ScrollArea className="h-full">
                    <div className="space-y-2 px-1 pb-2">
                      {availableOrders.map(order => {
                        const isSelected = selectedOrderIds.has(order.id);
                        return (
                          <Card
                            key={order.id}
                            className={`border cursor-pointer transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/30'}`}
                            onClick={() => toggleOrder(order.id)}
                          >
                            <CardContent className="p-3">
                              <div className="flex items-start gap-3">
                                <Checkbox checked={isSelected} onCheckedChange={() => toggleOrder(order.id)} className="mt-0.5" />
                                <div className="flex-1 min-w-0">
                                  {order.store_name && <p className="font-bold text-sm truncate">{order.store_name}</p>}
                                  <p className={`text-sm truncate ${order.store_name ? 'text-muted-foreground text-xs' : 'font-medium'}`}>{order.customer_name}</p>
                                  {order.sector_name && (
                                    <div className="flex items-center gap-1 text-[10px] text-primary mt-0.5">
                                      <MapPin className="w-3 h-3" />
                                      {order.sector_name}
                                    </div>
                                  )}
                                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                    <span>{format(new Date(order.created_at), 'MM/dd HH:mm')}</span>
                                    <span>{order.items.length} منتج</span>
                                    {order.total_amount && <span className="font-medium">{order.total_amount.toLocaleString()} د.ج</span>}
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

                {selectedOrderIds.size > 0 && (
                  <div className="border-t pt-2">
                    <p className="text-sm font-semibold mb-1 flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      المنتجات المطلوبة ({aggregatedProducts.length})
                    </p>
                    <ScrollArea className="max-h-[18vh]">
                      <div className="space-y-1 px-1">
                        {aggregatedProducts.map(p => (
                          <div key={p.productId} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                            <span className="text-sm">{p.productName}</span>
                            <Badge variant="secondary" className="text-xs">{p.quantity}</Badge>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2 pb-4">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">إلغاء</Button>
              <Button onClick={handleSend} disabled={selectedOrderIds.size === 0 || isSending} className="flex-1">
                {isSending && <Loader2 className="w-4 h-4 animate-spin me-1" />}
                <Truck className="w-4 h-4 me-1" />
                إرسال طلب شحن
              </Button>
            </div>
          </TabsContent>

          {/* HISTORY TAB */}
          <TabsContent value="history" className="flex-1 min-h-0 flex flex-col px-4 mt-2">
            {isLoadingHistory ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">لا توجد طلبات شحن سابقة</p>
              </div>
            ) : (
              <ScrollArea className="flex-1">
                <div className="space-y-2 pb-4">
                  {history.map(req => {
                    const sl = statusLabel(req.status);
                    const isExpanded = expandedRequestId === req.id;
                    return (
                      <Card key={req.id} className="border">
                        <CardContent className="p-3">
                          <div
                            className="flex items-center justify-between cursor-pointer"
                            onClick={() => setExpandedRequestId(isExpanded ? null : req.id)}
                          >
                            <div className="flex items-center gap-2">
                              <Truck className="w-4 h-4 text-primary" />
                              <span className="text-sm font-medium">{req.notes || 'طلب شحن'}</span>
                              <Badge variant={sl.variant} className="text-[10px]">{sl.text}</Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">{format(new Date(req.created_at), 'MM/dd HH:mm')}</span>
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="mt-3 space-y-2">
                              {/* Customers */}
                              {req.customers.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                                    <User className="w-3 h-3" />
                                    العملاء ({req.customers.length})
                                  </p>
                                  <div className="flex flex-wrap gap-1">
                                    {req.customers.map((c, i) => (
                                      <Badge key={i} variant="outline" className="text-[10px]">{c}</Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {/* Products */}
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                                  <Package className="w-3 h-3" />
                                  المنتجات ({req.products.length})
                                </p>
                                <div className="space-y-1">
                                  {req.products.map((p, i) => (
                                    <div key={i} className="flex items-center justify-between bg-muted/50 rounded px-2 py-1 text-xs">
                                      <span>{p.productName}</span>
                                      <Badge variant="secondary" className="text-[10px]">{p.quantity}</Badge>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <p className="text-[10px] text-muted-foreground text-center">{req.orderIds.length} طلبية</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
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
