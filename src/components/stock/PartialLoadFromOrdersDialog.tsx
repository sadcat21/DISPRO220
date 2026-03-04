import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Package, ShoppingCart, Truck, User, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { format } from 'date-fns';

interface PartialLoadFromOrdersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerId: string;
  workerName: string;
  branchId: string | null;
  onConfirm: (aggregatedProducts: { productId: string; productName: string; quantity: number; piecesPerBox: number }[]) => void;
}

interface OrderForLoad {
  id: string;
  customer_name: string;
  store_name: string | null;
  sector_name: string | null;
  created_at: string;
  total_amount: number | null;
  status: string;
  items: { product_id: string; product_name: string; quantity: number; pieces_per_box: number }[];
}

const PartialLoadFromOrdersDialog: React.FC<PartialLoadFromOrdersDialogProps> = ({
  open, onOpenChange, workerId, workerName, branchId, onConfirm
}) => {
  const { t } = useLanguage();
  const [orders, setOrders] = useState<OrderForLoad[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [showProducts, setShowProducts] = useState(false);

  useEffect(() => {
    if (!open || !workerId) return;
    setSelectedOrderIds(new Set());
    setShowProducts(false);
    fetchOrders();
  }, [open, workerId]);

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const { data: ordersData, error } = await supabase
        .from('orders')
        .select(`
          id, created_at, total_amount, status, notes,
          customer:customers(name, store_name, sector:sectors(name)),
          order_items(product_id, quantity, product:products(name, pieces_per_box))
        `)
        .eq('assigned_worker_id', workerId)
        .in('status', ['pending', 'assigned', 'in_progress'])
        .order('created_at', { ascending: true });

      if (error) throw error;

      const mapped: OrderForLoad[] = (ordersData || []).map((o: any) => ({
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
          pieces_per_box: oi.product?.pieces_per_box || 20,
        })),
      }));

      setOrders(mapped);
    } catch (err) {
      console.error('Error fetching orders:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleOrder = (orderId: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedOrderIds.size === orders.length) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(orders.map(o => o.id)));
    }
  };

  // Aggregate products from selected orders
  const aggregatedProducts = useMemo(() => {
    const map = new Map<string, { productId: string; productName: string; quantity: number; piecesPerBox: number }>();
    for (const order of orders) {
      if (!selectedOrderIds.has(order.id)) continue;
      for (const item of order.items) {
        const existing = map.get(item.product_id);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          map.set(item.product_id, {
            productId: item.product_id,
            productName: item.product_name,
            quantity: item.quantity,
            piecesPerBox: item.pieces_per_box,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.productName.localeCompare(b.productName));
  }, [orders, selectedOrderIds]);

  const totalBoxes = aggregatedProducts.reduce((s, p) => s + p.quantity, 0);

  const handleConfirm = () => {
    onConfirm(aggregatedProducts);
    onOpenChange(false);
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'معلّقة';
      case 'assigned': return 'مُسندة';
      case 'in_progress': return 'قيد التوصيل';
      default: return status;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-primary" />
            شحن جزئي من الطلبيات
          </DialogTitle>
          <DialogDescription>
            حدد الطلبيات التي يمكن للشاحنة استيعابها — {workerName}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">لا توجد طلبيات معلّقة لهذا العامل</p>
          </div>
        ) : (
          <>
            {/* Select all */}
            <div className="flex items-center justify-between px-1">
              <Button variant="ghost" size="sm" onClick={toggleAll} className="text-xs">
                {selectedOrderIds.size === orders.length ? 'إلغاء تحديد الكل' : `تحديد الكل (${orders.length})`}
              </Button>
              {selectedOrderIds.size > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {selectedOrderIds.size} طلبية محددة
                </Badge>
              )}
            </div>

            {/* Orders list */}
            <ScrollArea className="flex-1 max-h-[35vh]">
              <div className="space-y-2 px-1 pb-2">
                {orders.map(order => {
                  const isSelected = selectedOrderIds.has(order.id);
                  return (
                    <Card
                      key={order.id}
                      className={`border cursor-pointer transition-colors ${
                        isSelected ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/30'
                      }`}
                      onClick={() => toggleOrder(order.id)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleOrder(order.id)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                {order.store_name && (
                                  <p className="font-bold text-sm truncate">{order.store_name}</p>
                                )}
                                <p className={`text-sm truncate ${order.store_name ? 'text-muted-foreground text-xs' : 'font-medium'}`}>
                                  {order.customer_name}
                                </p>
                              </div>
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                {statusLabel(order.status)}
                              </Badge>
                            </div>
                            {order.sector_name && (
                              <div className="flex items-center gap-1 text-[10px] text-primary mt-0.5">
                                <MapPin className="w-3 h-3" />
                                {order.sector_name}
                              </div>
                            )}
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span>{format(new Date(order.created_at), 'MM/dd HH:mm')}</span>
                              <span>{order.items.length} منتج</span>
                              {order.total_amount && (
                                <span className="font-medium">{order.total_amount.toLocaleString()} د.ج</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Aggregated products preview */}
            {selectedOrderIds.size > 0 && (
              <div className="border-t pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between text-sm font-semibold"
                  onClick={() => setShowProducts(!showProducts)}
                >
                  <span className="flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    المنتجات المطلوبة ({aggregatedProducts.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge>{totalBoxes} صندوق</Badge>
                    {showProducts ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </Button>
                {showProducts && (
                  <ScrollArea className="max-h-[20vh] mt-1">
                    <div className="space-y-1 px-1">
                      {aggregatedProducts.map(p => (
                        <div key={p.productId} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                          <span className="text-sm">{p.productName}</span>
                          <Badge variant="secondary" className="text-xs">{p.quantity}</Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            )}
          </>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedOrderIds.size === 0 || aggregatedProducts.length === 0}
          >
            <Truck className="w-4 h-4 me-1" />
            شحن {selectedOrderIds.size} طلبية ({totalBoxes} صندوق)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PartialLoadFromOrdersDialog;
