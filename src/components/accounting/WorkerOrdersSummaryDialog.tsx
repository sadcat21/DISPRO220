import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ClipboardList, Package, User, Calendar, ChevronLeft, ChevronRight, Loader2, ShoppingCart, UserCheck } from 'lucide-react';
import { format, addDays, subDays } from 'date-fns';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerId?: string;
  workerName?: string;
}

interface CustomerBreakdown {
  customerId: string;
  customerName: string;
  storeName: string | null;
  quantity: number;
}

interface ProductAgg {
  productId: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
  customerCount: number;
  customers: CustomerBreakdown[];
}

const WorkerOrdersSummaryDialog: React.FC<Props> = ({ open, onOpenChange, workerId, workerName }) => {
  const [activeTab, setActiveTab] = useState<'created' | 'assigned'>('assigned');
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['worker-orders-summary', workerId, selectedDate],
    queryFn: async () => {
      if (!workerId) return { created: [], assigned: [] };

      const dayStart = `${selectedDate}T00:00:00+01:00`;
      const dayEnd = `${selectedDate}T23:59:59+01:00`;

      // Orders created by this worker
      const { data: createdOrders } = await supabase
        .from('orders')
        .select('id, customer_id, customer:customers(name, store_name)')
        .eq('created_by', workerId)
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd)
        .in('status', ['pending', 'assigned', 'in_progress', 'delivered', 'completed', 'confirmed']);

      // Orders assigned to this worker
      const { data: assignedOrders } = await supabase
        .from('orders')
        .select('id, customer_id, created_by, customer:customers(name, store_name)')
        .eq('assigned_worker_id', workerId)
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd)
        .in('status', ['pending', 'assigned', 'in_progress', 'delivered', 'completed', 'confirmed']);

      const allOrderIds = [...new Set([
        ...(createdOrders || []).map(o => o.id),
        ...(assignedOrders || []).map(o => o.id),
      ])];

      if (allOrderIds.length === 0) return { created: [], assigned: [] };

      const { data: items } = await supabase
        .from('order_items')
        .select('order_id, product_id, quantity, product:products(name, image_url)')
        .in('order_id', allOrderIds);

      const buildAgg = (orders: any[]): ProductAgg[] => {
        const map = new Map<string, ProductAgg>();
        for (const order of orders) {
          const orderItems = (items || []).filter(i => i.order_id === order.id);
          for (const item of orderItems) {
            const pid = item.product_id;
            if (!map.has(pid)) {
              map.set(pid, {
                productId: pid,
                name: (item.product as any)?.name || '—',
                imageUrl: (item.product as any)?.image_url || null,
                quantity: 0,
                customerCount: 0,
                customers: [],
              });
            }
            const agg = map.get(pid)!;
            agg.quantity += item.quantity || 0;
            const custId = order.customer_id;
            const existing = agg.customers.find(c => c.customerId === custId);
            if (existing) {
              existing.quantity += item.quantity || 0;
            } else {
              agg.customers.push({
                customerId: custId,
                customerName: (order.customer as any)?.name || '—',
                storeName: (order.customer as any)?.store_name || null,
                quantity: item.quantity || 0,
              });
            }
          }
        }
        for (const agg of map.values()) {
          agg.customerCount = agg.customers.length;
        }
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
      };

      return {
        created: buildAgg(createdOrders || []),
        assigned: buildAgg(assignedOrders || []),
      };
    },
    enabled: open && !!workerId,
  });

  const currentData = activeTab === 'created' ? data?.created || [] : data?.assigned || [];
  const totalQuantity = currentData.reduce((s, p) => s + p.quantity, 0);
  const totalCustomers = new Set(currentData.flatMap(p => p.customers.map(c => c.customerId))).size;
  const createdCustomers = new Set((data?.created || []).flatMap(p => p.customers.map(c => c.customerId))).size;
  const assignedCustomers = new Set((data?.assigned || []).flatMap(p => p.customers.map(c => c.customerId))).size;

  const goDay = (dir: number) => {
    const d = dir > 0 ? addDays(new Date(selectedDate), 1) : subDays(new Date(selectedDate), 1);
    setSelectedDate(format(d, 'yyyy-MM-dd'));
    setExpandedProduct(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[92dvh] flex flex-col overflow-hidden p-0 gap-0 rounded-2xl" dir="rtl">
        {/* Header */}
        <div className="bg-primary/5 border-b px-4 pt-4 pb-3 shrink-0">
          <DialogHeader className="p-0 space-y-1">
            <DialogTitle className="flex items-center gap-2.5 text-base">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-primary" />
              </div>
              تجميع الطلبيات {workerName ? `- ${workerName}` : ''}
            </DialogTitle>
          </DialogHeader>

          {/* Date navigation */}
          <div className="flex items-center justify-center gap-3 mt-3">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => goDay(1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-1.5 text-xs font-semibold bg-background rounded-lg px-3 py-1.5 border">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              {format(new Date(selectedDate), 'dd/MM/yyyy')}
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => goDay(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as any); setExpandedProduct(null); }} className="flex-1 min-h-0 flex flex-col">
          <div className="px-3 pt-2 shrink-0">
            <TabsList className="grid grid-cols-2 h-9 bg-muted/60 rounded-lg p-0.5">
             <TabsTrigger value="assigned" className="text-[11px] rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1 h-full">
                <UserCheck className="w-3.5 h-3.5" />
                معيّنة ({assignedCustomers})
              </TabsTrigger>
              <TabsTrigger value="created" className="text-[11px] rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm gap-1 h-full">
                <ShoppingCart className="w-3.5 h-3.5" />
                طلبياته ({createdCustomers})
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Stats bar */}
          {currentData.length > 0 && (
            <div className="flex items-center justify-center gap-4 px-3 py-2 shrink-0">
              <span className="text-[11px] font-semibold flex items-center gap-1 text-primary">
                <Package className="w-3.5 h-3.5" />
                {currentData.length} منتج
              </span>
              <span className="text-[11px] font-semibold flex items-center gap-1 text-foreground">
                {totalQuantity} صندوق
              </span>
              <span className="text-[11px] font-semibold flex items-center gap-1 text-muted-foreground">
                <User className="w-3.5 h-3.5" />
                {totalCustomers} عميل
              </span>
            </div>
          )}

          <TabsContent value={activeTab} className="flex-1 min-h-0 mt-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
              </div>
            ) : currentData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <ClipboardList className="w-12 h-12 opacity-30 mb-2" />
                <p className="text-sm">لا توجد طلبيات في هذا التاريخ</p>
              </div>
            ) : (
              <ScrollArea className="h-full">
                <div className="grid grid-cols-3 gap-2 px-3 pb-4">
                  {currentData.map(product => {
                    const isExpanded = expandedProduct === product.productId;
                    return (
                      <div key={product.productId} className="col-span-1">
                        <div
                          onClick={() => setExpandedProduct(isExpanded ? null : product.productId)}
                          className={`rounded-xl border cursor-pointer transition-all active:scale-[0.97] overflow-hidden ${
                            isExpanded ? 'ring-2 ring-primary/40 shadow-md' : 'hover:shadow-sm'
                          }`}
                        >
                          {/* Product image */}
                          <div className="aspect-square bg-muted/30 relative overflow-hidden">
                            {product.imageUrl ? (
                              <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Package className="w-8 h-8 text-muted-foreground/30" />
                              </div>
                            )}
                            {/* Quantity badge */}
                            <Badge className="absolute top-1 end-1 text-[10px] px-1.5 py-0 h-5 bg-primary text-primary-foreground shadow">
                              {product.quantity}
                            </Badge>
                          </div>
                          {/* Info */}
                          <div className="p-1.5 text-center">
                            <p className="text-[10px] font-semibold leading-tight line-clamp-2">{product.name}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">
                              <User className="w-2.5 h-2.5 inline me-0.5" />
                              {product.customerCount} عميل
                            </p>
                          </div>
                        </div>

                        {/* Expanded customer list */}
                        {isExpanded && (
                          <div className="mt-1 rounded-lg border bg-background p-2 shadow-sm col-span-3">
                            <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                              <User className="w-3 h-3" />
                              العملاء ({product.customerCount})
                            </p>
                            <div className="space-y-1 max-h-[25vh] overflow-y-auto">
                              {product.customers.sort((a, b) => b.quantity - a.quantity).map(c => (
                                <div key={c.customerId} className="flex items-center justify-between text-[11px] bg-muted/30 rounded-lg px-2 py-1.5">
                                  <div className="min-w-0 flex-1">
                                    {c.storeName && <span className="font-semibold block truncate">{c.storeName}</span>}
                                    <span className={`truncate block ${c.storeName ? 'text-[10px] text-muted-foreground' : 'font-medium'}`}>
                                      {c.customerName}
                                    </span>
                                  </div>
                                  <Badge variant="secondary" className="text-[10px] ms-2 shrink-0 tabular-nums font-bold">
                                    {c.quantity}
                                  </Badge>
                                </div>
                              ))}
                            </div>
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

export default WorkerOrdersSummaryDialog;
