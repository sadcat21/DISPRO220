import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Minus, Loader2, Package, Save, PlusCircle, Trash2, Truck } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLogActivity } from '@/hooks/useActivityLogs';
import { useQueryClient } from '@tanstack/react-query';
import { OrderWithDetails, OrderItem, Product } from '@/types/database';
import DeliveryWorkerSelect from './DeliveryWorkerSelect';
import PostDeliveryConfirmDialog from './PostDeliveryConfirmDialog';

interface ModifyOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderWithDetails;
  orderItems: (OrderItem & { product?: Product })[];
}

interface ModifiedItem {
  id?: string; // existing item id, undefined for new
  product_id: string;
  product_name: string;
  original_quantity: number;
  new_quantity: number;
  unit_price: number;
}

const ModifyOrderDialog: React.FC<ModifyOrderDialogProps> = ({
  open, onOpenChange, order, orderItems,
}) => {
  const { t, dir } = useLanguage();
  const { workerId, role } = useAuth();
  const logActivity = useLogActivity();
  const queryClient = useQueryClient();

  const [items, setItems] = useState<ModifiedItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [newProductId, setNewProductId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assignedWorkerId, setAssignedWorkerId] = useState(order.assigned_worker_id || '');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const canChangeWorker = role === 'admin' || role === 'branch_admin' || order.created_by === workerId;

  // Initialize items from orderItems
  useEffect(() => {
    if (open && orderItems.length > 0) {
      setItems(orderItems.map(item => ({
        id: item.id,
        product_id: item.product_id,
        product_name: item.product?.name || '',
        original_quantity: item.quantity,
        new_quantity: item.quantity,
        unit_price: Number(item.unit_price || 0),
      })));
      setAssignedWorkerId(order.assigned_worker_id || '');
    }
  }, [open, orderItems, order.assigned_worker_id]);

  // Fetch available products for adding
  useEffect(() => {
    if (!open) return;
    const fetchProducts = async () => {
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('name');
      setProducts(data || []);
    };
    fetchProducts();
  }, [open]);

  const updateQuantity = (index: number, delta: number) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const newQty = Math.max(0, item.new_quantity + delta);
      return { ...item, new_quantity: newQty };
    }));
  };

  const setQuantity = (index: number, value: string) => {
    const qty = Math.max(0, Number(value) || 0);
    setItems(prev => prev.map((item, i) => i === index ? { ...item, new_quantity: qty } : item));
  };

  const addProduct = () => {
    if (!newProductId) return;
    if (items.some(i => i.product_id === newProductId)) {
      toast.error(t('orders.product_already_added'));
      return;
    }
    const product = products.find(p => p.id === newProductId);
    if (!product) return;

    setItems(prev => [...prev, {
      product_id: product.id,
      product_name: product.name,
      original_quantity: 0,
      new_quantity: 1,
      unit_price: Number(product.price_gros || product.price_invoice || 0),
    }]);
    setNewProductId('');
  };

  const removeNewItem = (index: number) => {
    const item = items[index];
    if (item.id) return; // Can't remove existing items, set qty to 0
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const workerChanged = assignedWorkerId !== (order.assigned_worker_id || '');
  const hasChanges = items.some(i => i.new_quantity !== i.original_quantity) ||
    items.some(i => !i.id && i.new_quantity > 0) || workerChanged;

  const originalTotal = orderItems.reduce((sum, item) => sum + (item.quantity * Number(item.unit_price || 0)), 0);
  const orderTotal = items.reduce((sum, item) => sum + (item.new_quantity * item.unit_price), 0);

  const productChanges = items
    .filter(i => i.new_quantity !== i.original_quantity)
    .map(i => ({
      product_name: i.product_name,
      original_quantity: i.original_quantity,
      new_quantity: i.new_quantity,
      unit_price: i.unit_price,
      difference: i.new_quantity - i.original_quantity,
    }));

  const handleSaveClick = () => {
    if (!hasChanges || !workerId) return;
    // For delivered orders with product changes, show confirmation dialog
    if (order.status === 'delivered' && productChanges.length > 0) {
      setShowConfirmDialog(true);
      return;
    }
    handleSave();
  };

  const handlePostDeliveryConfirm = async (paymentType: 'full' | 'partial' | 'no_payment', paidAmount?: number) => {
    setShowConfirmDialog(false);
    await handleSave(paymentType, paidAmount);
  };

  const handleSave = async (paymentType?: 'full' | 'partial' | 'no_payment', paidAmount?: number) => {
    if (!hasChanges || !workerId) return;
    setIsSubmitting(true);

    try {
      const changes: Record<string, any>[] = [];

      for (const item of items) {
        if (item.id && item.new_quantity !== item.original_quantity) {
          if (item.new_quantity === 0) {
            // Delete the item
            await supabase.from('order_items').delete().eq('id', item.id);
            changes.push({
              منتج: item.product_name,
              من: item.original_quantity,
              إلى: 0,
              عملية: 'حذف',
            });
          } else {
            // Update quantity
            await supabase.from('order_items')
              .update({ quantity: item.new_quantity })
              .eq('id', item.id);
            changes.push({
              منتج: item.product_name,
              من: item.original_quantity,
              إلى: item.new_quantity,
              عملية: item.new_quantity > item.original_quantity ? 'زيادة' : 'تقليص',
            });
          }
        } else if (!item.id && item.new_quantity > 0) {
          // New product added
          await supabase.from('order_items').insert({
            order_id: order.id,
            product_id: item.product_id,
            quantity: item.new_quantity,
          });
          changes.push({
            منتج: item.product_name,
            كمية: item.new_quantity,
            عملية: 'إضافة جديد',
          });
        }
      }

      // Recalculate total
      const { data: updatedItems } = await supabase
        .from('order_items')
        .select('quantity, unit_price')
        .eq('order_id', order.id);

      const newTotal = updatedItems?.reduce((sum, i) =>
        sum + (Number(i.quantity) * Number(i.unit_price || 0)), 0) || 0;

      const orderUpdate: Record<string, any> = {};
      if (newTotal > 0) orderUpdate.total_amount = newTotal;

      // Update assigned worker if changed
      if (workerChanged) {
        const newWorker = assignedWorkerId && assignedWorkerId !== 'none' ? assignedWorkerId : null;
        orderUpdate.assigned_worker_id = newWorker;
        if (newWorker && order.status === 'pending') {
          orderUpdate.status = 'assigned';
        }
        changes.push({ عملية: 'تغيير عامل التوصيل' });
      }

      if (Object.keys(orderUpdate).length > 0) {
        await supabase.from('orders')
          .update(orderUpdate)
          .eq('id', order.id);
      }

      // Handle post-delivery payment difference
      const totalDiff = orderTotal - originalTotal;
      if (order.status === 'delivered' && totalDiff > 0 && paymentType) {
        if (paymentType === 'no_payment') {
          // Register as debt
          await supabase.from('customer_debts').insert({
            customer_id: order.customer_id,
            order_id: order.id,
            worker_id: workerId,
            branch_id: order.branch_id,
            total_amount: totalDiff,
            paid_amount: 0,
            status: 'active',
            notes: 'فارق تعديل طلبية بعد التوصيل',
          });
        } else if (paymentType === 'partial' && paidAmount && paidAmount < totalDiff) {
          const debtAmount = totalDiff - paidAmount;
          await supabase.from('customer_debts').insert({
            customer_id: order.customer_id,
            order_id: order.id,
            worker_id: workerId,
            branch_id: order.branch_id,
            total_amount: debtAmount,
            paid_amount: 0,
            status: 'active',
            notes: 'فارق تعديل طلبية بعد التوصيل (دفع جزئي)',
          });
        }
      }

      // Log activity
      await logActivity.mutateAsync({
        actionType: 'update',
        entityType: 'order',
        entityId: order.id,
        details: {
          نوع_التعديل: order.status === 'delivered' ? 'تعديل بعد التوصيل' : 'تعديل أثناء التوصيل',
          العميل: order.customer?.name,
          التغييرات: changes,
          ...(paymentType && { طريقة_دفع_الفارق: paymentType, المبلغ_المدفوع: paidAmount }),
        },
      });

      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['assigned-orders'] });
      queryClient.invalidateQueries({ queryKey: ['order-items'] });
      // Refresh worker stock so returned products show in truck
      queryClient.invalidateQueries({ queryKey: ['my-worker-stock'] });
      queryClient.invalidateQueries({ queryKey: ['my-stock-sold'] });
      queryClient.invalidateQueries({ queryKey: ['my-stock-loaded'] });
      queryClient.invalidateQueries({ queryKey: ['worker-truck-stock'] });
      queryClient.invalidateQueries({ queryKey: ['customer-debts'] });
      queryClient.invalidateQueries({ queryKey: ['customer-debt-summary'] });

      toast.success(t('orders.order_modified'));
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const availableProducts = products.filter(p => !items.some(i => i.product_id === p.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] p-0 gap-0 overflow-hidden" dir={dir}>
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            {t('orders.modify_order')}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-10rem)] px-4 py-3">
          <div className="space-y-3">
            {/* Customer info */}
            <div className="bg-muted/50 rounded-lg p-2 text-sm">
              <span className="font-bold">{order.customer?.name}</span>
            </div>

            {/* Assign delivery worker */}
            {canChangeWorker && (
              <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                <DeliveryWorkerSelect
                  customerBranchId={order.branch_id || order.customer?.branch_id || null}
                  value={assignedWorkerId}
                  onChange={setAssignedWorkerId}
                />
              </div>
            )}

            {/* Current items */}
            {items.map((item, index) => {
              const changed = item.new_quantity !== item.original_quantity;
              return (
                <div key={item.product_id} className={`border rounded-lg p-3 space-y-2 ${changed ? 'border-primary/50 bg-primary/5' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm">{item.product_name}</span>
                      {item.unit_price > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {item.unit_price.toLocaleString()} دج × {item.new_quantity} = {(item.unit_price * item.new_quantity).toLocaleString()} دج
                        </p>
                      )}
                    </div>
                    {!item.id && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeNewItem(index)}>
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQuantity(index, -1)}>
                      <Minus className="w-3 h-3" />
                    </Button>
                    <Input
                      type="number"
                      value={item.new_quantity}
                      onChange={(e) => setQuantity(index, e.target.value)}
                      className="h-8 w-20 text-center"
                      min={0}
                    />
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => updateQuantity(index, 1)}>
                      <Plus className="w-3 h-3" />
                    </Button>
                    {item.id && changed && (
                      <Badge variant="secondary" className="text-xs">
                        {item.original_quantity} → {item.new_quantity}
                      </Badge>
                    )}
                    {!item.id && (
                      <Badge className="bg-green-100 text-green-800 text-xs">{t('common.new')}</Badge>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Add new product */}
            <div className="border-2 border-dashed rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-muted-foreground">{t('orders.add_product')}</p>
              <div className="flex gap-2">
                <Select value={newProductId} onValueChange={setNewProductId}>
                  <SelectTrigger className="flex-1 h-9">
                    <SelectValue placeholder={t('stock.product')} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProducts.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={addProduct} disabled={!newProductId}>
                  <PlusCircle className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Total + Save button */}
        <div className="p-4 border-t space-y-2">
          {orderTotal > 0 && (
            <div className="flex items-center justify-between text-sm font-bold">
              <span>{t('orders.grand_total')}:</span>
              <span className="text-primary">{orderTotal.toLocaleString()} دج</span>
            </div>
          )}
          <Button
            className="w-full"
            onClick={handleSaveClick}
            disabled={!hasChanges || isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Save className="w-4 h-4 me-2" />
                {t('orders.save_changes')}
              </>
            )}
          </Button>
        </div>
      </DialogContent>

      {/* Post-delivery confirmation dialog */}
      <PostDeliveryConfirmDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        changes={productChanges}
        originalTotal={originalTotal}
        newTotal={orderTotal}
        onConfirm={handlePostDeliveryConfirm}
        isSubmitting={isSubmitting}
      />
    </Dialog>
  );
};

export default ModifyOrderDialog;
