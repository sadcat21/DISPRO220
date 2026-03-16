import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useUnreviewedModifications, useReviewModification } from '@/hooks/useReceipts';
import { useOrderItems } from '@/hooks/useOrders';
import { Bell, Check, FileEdit, Eye, Pencil } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import ModifyOrderDialog from '@/components/orders/ModifyOrderDialog';

const ReceiptModificationsNotification: React.FC = () => {
  const { data: modifications } = useUnreviewedModifications();
  const reviewMutation = useReviewModification();
  const [open, setOpen] = useState(false);
  const [selectedMod, setSelectedMod] = useState<string | null>(null);
  const [editOrder, setEditOrder] = useState<any>(null);

  const count = modifications?.length || 0;
  if (count === 0) return null;

  const handleEditOrder = async (mod: any) => {
    const orderId = mod.receipt?.order_id;
    if (!orderId) {
      return;
    }
    try {
      const { data } = await supabase
        .from('orders')
        .select('*, customer:customers(*), created_by_worker:workers!orders_created_by_fkey(id, full_name, username), assigned_worker:workers!orders_assigned_worker_id_fkey(id, full_name, username)')
        .eq('id', orderId)
        .single();
      if (data) {
        setEditOrder(data);
      }
    } catch {}
  };

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {count}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <FileEdit className="w-4 h-4" />
            تعديلات الفواتير ({count})
          </h4>
        </div>
        <ScrollArea className="max-h-[300px]">
          <div className="p-2 space-y-2">
            {modifications?.map((mod) => (
              <div key={mod.id} className="p-2 rounded-lg border bg-card text-sm space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-xs">
                    {mod.modifier?.full_name || 'عامل'}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(mod.created_at).toLocaleString('ar-DZ', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{mod.changes_summary}</p>
                
                {selectedMod === mod.id && (
                  <div className="space-y-2 mt-2 p-2 bg-muted/50 rounded text-[11px]">
                    <div>
                      <span className="font-semibold">الأصلي:</span>
                      <div className="mt-1">{JSON.stringify(mod.original_data?.total_amount)} DA</div>
                    </div>
                    <Separator />
                    <div>
                      <span className="font-semibold">المعدل:</span>
                      <div className="mt-1">{JSON.stringify(mod.modified_data?.total_amount)} DA</div>
                    </div>
                  </div>
                )}

                <div className="flex gap-1.5 mt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs flex-1"
                    onClick={() => setSelectedMod(selectedMod === mod.id ? null : mod.id)}
                  >
                    <Eye className="w-3 h-3 ml-1" />
                    {selectedMod === mod.id ? 'إخفاء' : 'مقارنة'}
                  </Button>
                  {mod.receipt?.order_id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => handleEditOrder(mod)}
                    >
                      <Pencil className="w-3 h-3 ml-1" />
                      تعديل
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs flex-1"
                    onClick={() => reviewMutation.mutate(mod.id)}
                    disabled={reviewMutation.isPending}
                  >
                    <Check className="w-3 h-3 ml-1" />
                    تمت المراجعة
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>

    {editOrder && (
      <ModifyOrderWrapper order={editOrder} onClose={() => setEditOrder(null)} />
    )}
    </>
  );
};

// Wrapper to fetch order items for ModifyOrderDialog
const ModifyOrderWrapper: React.FC<{ order: any; onClose: () => void }> = ({ order, onClose }) => {
  const { data: items } = useOrderItems(order.id);
  if (!items) return null;
  return (
    <ModifyOrderDialog
      open={true}
      onOpenChange={(open) => !open && onClose()}
      order={order}
      orderItems={items}
    />
  );
};

export default ReceiptModificationsNotification;
