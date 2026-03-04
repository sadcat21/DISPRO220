import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Package, ShoppingCart, Truck, MapPin, CheckCircle } from 'lucide-react';
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

const WorkerLoadRequestDialog: React.FC<WorkerLoadRequestDialogProps> = ({ open, onOpenChange }) => {
  const { workerId, activeBranch } = useAuth();
  const [orders, setOrders] = useState<OrderForRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [hasPendingRequest, setHasPendingRequest] = useState(false);

  useEffect(() => {
    if (!open || !workerId) return;
    setSelectedOrderIds(new Set());
    fetchOrders();
    checkPendingRequest();
  }, [open, workerId]);

  const checkPendingRequest = async () => {
    const { data } = await supabase
      .from('worker_load_requests')
      .select('id')
      .eq('worker_id', workerId!)
      .eq('status', 'pending')
      .limit(1);
    setHasPendingRequest((data || []).length > 0);
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

  const toggleOrder = (id: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedOrderIds(prev =>
      prev.size === orders.length ? new Set() : new Set(orders.map(o => o.id))
    );
  };

  const aggregatedProducts = useMemo(() => {
    const map = new Map<string, { productId: string; productName: string; quantity: number }>();
    for (const order of orders) {
      if (!selectedOrderIds.has(order.id)) continue;
      for (const item of order.items) {
        const existing = map.get(item.product_id);
        if (existing) existing.quantity += item.quantity;
        else map.set(item.product_id, { productId: item.product_id, productName: item.product_name, quantity: item.quantity });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.productName.localeCompare(b.productName));
  }, [orders, selectedOrderIds]);

  const handleSend = async () => {
    if (aggregatedProducts.length === 0) return;
    setIsSending(true);
    try {
      // Create request
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

      // Insert items
      const selectedOrders = orders.filter(o => selectedOrderIds.has(o.id));
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
      onOpenChange(false);
    } catch {
      toast.error('خطأ في إرسال طلب الشحن');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            طلب شحن
          </DialogTitle>
          <DialogDescription>حدد الطلبيات التي تريد شحنها</DialogDescription>
        </DialogHeader>

        {hasPendingRequest && (
          <div className="flex items-center gap-2 p-2 rounded-md bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-300 text-yellow-700 dark:text-yellow-400 text-xs">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>لديك طلب شحن معلّق بالفعل</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">لا توجد طلبيات معلّقة</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-1">
              <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs">
                {selectedOrderIds.size === orders.length ? 'إلغاء تحديد الكل' : `تحديد الكل (${orders.length})`}
              </Button>
              {selectedOrderIds.size > 0 && (
                <Badge variant="secondary" className="text-xs">{selectedOrderIds.size} طلبية</Badge>
              )}
            </div>

            <ScrollArea className="flex-1" style={{ maxHeight: '45vh' }}>
              <div className="space-y-2 px-1 pb-2">
                {orders.map(order => {
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
          </>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={handleSend} disabled={selectedOrderIds.size === 0 || isSending}>
            {isSending && <Loader2 className="w-4 h-4 animate-spin me-1" />}
            <Truck className="w-4 h-4 me-1" />
            إرسال طلب شحن
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WorkerLoadRequestDialog;
