import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Minus, Loader2, Package, Save, PlusCircle, Trash2, Truck, Gift, CalendarDays, CreditCard } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLogActivity } from '@/hooks/useActivityLogs';
import { useQueryClient } from '@tanstack/react-query';
import { OrderWithDetails, OrderItem, Product } from '@/types/database';
import DeliveryWorkerSelect from './DeliveryWorkerSelect';
import PostDeliveryConfirmDialog from './PostDeliveryConfirmDialog';
import { useProductOffers } from '@/hooks/useProductOffers';

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
  unit_price: number; // per-unit price (per kg, per piece, or per box)
  gift_quantity: number;
  original_gift_quantity: number;
  pieces_per_box: number;
  pricing_unit: string; // 'box' | 'kg' | 'unit'
  weight_per_box: number;
}

const getBoxMultiplier = (pricingUnit: string, weightPerBox: number, piecesPerBox: number): number => {
  if (pricingUnit === 'kg') return Math.max(1, weightPerBox);
  if (pricingUnit === 'unit') return Math.max(1, piecesPerBox);
  return 1;
};

const ModifyOrderDialog: React.FC<ModifyOrderDialogProps> = ({
  open, onOpenChange, order, orderItems,
}) => {
  const { t, dir } = useLanguage();
  const { workerId, role } = useAuth();
  const logActivity = useLogActivity();
  const queryClient = useQueryClient();
  const { activeOffers } = useProductOffers();

  const [items, setItems] = useState<ModifiedItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [newProductId, setNewProductId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assignedWorkerId, setAssignedWorkerId] = useState(order.assigned_worker_id || '');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [customerDebtTotal, setCustomerDebtTotal] = useState(0);
  const [customerCreditTotal, setCustomerCreditTotal] = useState(0);
  const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(order.delivery_date ? new Date(order.delivery_date) : undefined);
  const [paymentType, setPaymentType] = useState<string>(order.payment_type || 'with_invoice');
  const [invoicePaymentMethod, setInvoicePaymentMethod] = useState<string>(order.invoice_payment_method || '');

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
        gift_quantity: Number(item.gift_quantity || 0),
        original_gift_quantity: Number(item.gift_quantity || 0),
        pieces_per_box: Number((item as any).pieces_per_box || item.product?.pieces_per_box || 1),
        pricing_unit: (item as any).pricing_unit || item.product?.pricing_unit || 'box',
        weight_per_box: Number((item as any).weight_per_box || item.product?.weight_per_box || 1),
      })));
      setAssignedWorkerId(order.assigned_worker_id || '');
      setDeliveryDate(order.delivery_date ? new Date(order.delivery_date) : undefined);
      setPaymentType(order.payment_type || 'with_invoice');
      setInvoicePaymentMethod(order.invoice_payment_method || '');
    }
  }, [open, orderItems, order.assigned_worker_id, order.delivery_date, order.payment_type, order.invoice_payment_method]);

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

  const recalcGiftBoxes = useCallback((productId: string, paidQty: number, piecesPerBox: number) => {
    const offersForProduct = activeOffers.filter((o: any) => o.product_id === productId);
    if (offersForProduct.length === 0) return 0;

    let totalGiftPieces = 0;
    const safePiecesPerBox = piecesPerBox > 0 ? piecesPerBox : 1;

    for (const offer of offersForProduct as any[]) {
      const tiers = offer.tiers && offer.tiers.length > 0 ? offer.tiers : null;
      if (tiers) {
        if (offer.condition_type === 'multiplier') {
          const sortedTiers = [...tiers].sort((a: any, b: any) => b.min_quantity - a.min_quantity);
          let remaining = paidQty;
          for (const tier of sortedTiers) {
            if (remaining < tier.min_quantity) continue;
            const timesApplied = Math.floor(remaining / tier.min_quantity);
            remaining = remaining % tier.min_quantity;
            const giftUnit = tier.gift_quantity_unit || 'piece';
            const giftAmount = timesApplied * tier.gift_quantity;
            totalGiftPieces += giftUnit === 'box' ? giftAmount * safePiecesPerBox : giftAmount;
          }
        } else {
          for (const tier of [...tiers].sort((a: any, b: any) => b.min_quantity - a.min_quantity)) {
            if (paidQty >= tier.min_quantity && (tier.max_quantity === null || paidQty <= tier.max_quantity)) {
              const giftUnit = tier.gift_quantity_unit || 'piece';
              totalGiftPieces += giftUnit === 'box' ? tier.gift_quantity * safePiecesPerBox : tier.gift_quantity;
              break;
            }
          }
        }
      } else {
        if (paidQty < offer.min_quantity) continue;
        const timesApplied = offer.condition_type === 'multiplier' ? Math.floor(paidQty / offer.min_quantity) : 1;
        const giftPerThreshold = offer.gift_quantity;
        if (offer.gift_quantity_unit === 'box') {
          totalGiftPieces += timesApplied * giftPerThreshold * safePiecesPerBox;
        } else {
          totalGiftPieces += timesApplied * giftPerThreshold;
        }
      }
    }

    return Math.floor(totalGiftPieces / safePiecesPerBox);
  }, [activeOffers]);

  const recalcFromPaidQuantity = useCallback((productId: string, paidQty: number, piecesPerBox: number) => {
    const safePaidQty = Math.max(0, paidQty);
    const giftQty = Math.max(0, recalcGiftBoxes(productId, safePaidQty, piecesPerBox));

    return {
      gift_quantity: giftQty,
      total_quantity: safePaidQty + giftQty,
    };
  }, [recalcGiftBoxes]);

  const getPaidQuantity = useCallback((item: ModifiedItem) => {
    return Math.max(0, item.new_quantity - (item.gift_quantity || 0));
  }, []);

  const updateQuantity = (index: number, delta: number) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const currentPaidQty = Math.max(0, item.new_quantity - (item.gift_quantity || 0));
      const newPaidQty = Math.max(0, currentPaidQty + delta);
      const recalculated = recalcFromPaidQuantity(item.product_id, newPaidQty, item.pieces_per_box);
      return {
        ...item,
        new_quantity: recalculated.total_quantity,
        gift_quantity: recalculated.gift_quantity,
      };
    }));
  };

  const setQuantity = (index: number, value: string) => {
    const paidQty = Math.max(0, Math.floor(Number(value) || 0));
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const recalculated = recalcFromPaidQuantity(item.product_id, paidQty, item.pieces_per_box);
      return {
        ...item,
        new_quantity: recalculated.total_quantity,
        gift_quantity: recalculated.gift_quantity,
      };
    }));
  };

  const addProduct = () => {
    if (!newProductId) return;
    if (items.some(i => i.product_id === newProductId)) {
      toast.error(t('orders.product_already_added'));
      return;
    }
    const product = products.find(p => p.id === newProductId);
    if (!product) return;

    const initialPaidQuantity = 1;
    const unitPrice = Number(product.price_gros || product.price_invoice || 0);
    const piecesPerBox = Number(product.pieces_per_box || 1);
    const pricingUnit = product.pricing_unit || 'box';
    const weightPerBox = Number(product.weight_per_box || 1);
    const recalculated = recalcFromPaidQuantity(product.id, initialPaidQuantity, piecesPerBox);

    setItems(prev => [...prev, {
      product_id: product.id,
      product_name: product.name,
      original_quantity: 0,
      new_quantity: recalculated.total_quantity,
      unit_price: unitPrice,
      gift_quantity: recalculated.gift_quantity,
      original_gift_quantity: 0,
      pieces_per_box: piecesPerBox,
      pricing_unit: pricingUnit,
      weight_per_box: weightPerBox,
    }]);
    setNewProductId('');
  };

  const removeNewItem = (index: number) => {
    const item = items[index];
    if (item.id) return; // Can't remove existing items, set qty to 0
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const workerChanged = assignedWorkerId !== (order.assigned_worker_id || '');
  const deliveryDateChanged = (() => {
    const origDate = order.delivery_date ? order.delivery_date.split('T')[0] : '';
    const newDate = deliveryDate ? format(deliveryDate, 'yyyy-MM-dd') : '';
    return origDate !== newDate;
  })();
  const paymentTypeChanged = paymentType !== (order.payment_type || 'with_invoice');
  const invoiceMethodChanged = invoicePaymentMethod !== (order.invoice_payment_method || '');

  const hasChanges = items.some(i => i.new_quantity !== i.original_quantity) ||
    items.some(i => !i.id && i.new_quantity > 0) || workerChanged || deliveryDateChanged || paymentTypeChanged || invoiceMethodChanged;

  const getBoxPrice = useCallback((item: ModifiedItem) => {
    const multiplier = getBoxMultiplier(item.pricing_unit, item.weight_per_box, item.pieces_per_box);
    return item.unit_price * multiplier;
  }, []);

  const originalTotal = orderItems.reduce((sum, item) => {
    const giftQty = Number((item as any).gift_quantity || 0);
    const paidQty = Math.max(0, Number(item.quantity) - giftQty);
    const pricingUnit = (item as any).pricing_unit || item.product?.pricing_unit || 'box';
    const weightPerBox = Number((item as any).weight_per_box || item.product?.weight_per_box || 1);
    const piecesPerBox = Number((item as any).pieces_per_box || item.product?.pieces_per_box || 1);
    const multiplier = getBoxMultiplier(pricingUnit, weightPerBox, piecesPerBox);
    return sum + (paidQty * Number(item.unit_price || 0) * multiplier);
  }, 0);

  const orderTotal = items.reduce((sum, item) => {
    const paidQty = Math.max(0, item.new_quantity - (item.gift_quantity || 0));
    const multiplier = getBoxMultiplier(item.pricing_unit, item.weight_per_box, item.pieces_per_box);
    return sum + (paidQty * item.unit_price * multiplier);
  }, 0);

  const productChanges = items
    .filter(i => i.new_quantity !== i.original_quantity)
    .map(i => ({
      product_name: i.product_name,
      original_quantity: i.original_quantity,
      new_quantity: i.new_quantity,
      unit_price: i.unit_price,
      difference: i.new_quantity - i.original_quantity,
    }));

  const handleSaveClick = async () => {
    if (!hasChanges || !workerId) return;
    if (order.status === 'delivered' && productChanges.length > 0) {
      // Fetch customer debts and credits before showing dialog
      const { data: debts } = await supabase
        .from('customer_debts')
        .select('total_amount, paid_amount, remaining_amount')
        .eq('customer_id', order.customer_id)
        .in('status', ['active', 'partially_paid']);
      const debtSum = (debts || []).reduce((s, d) => s + (d.remaining_amount ?? (d.total_amount - d.paid_amount)), 0);
      setCustomerDebtTotal(debtSum);

      const { data: credits } = await supabase
        .from('customer_credits')
        .select('amount')
        .eq('customer_id', order.customer_id)
        .eq('is_used', false)
        .eq('status', 'approved')
        .eq('credit_type', 'financial');
      const creditSum = (credits || []).reduce((s, c) => s + c.amount, 0);
      setCustomerCreditTotal(creditSum);

      setShowConfirmDialog(true);
      return;
    }
    handleSave();
  };

  const handlePostDeliveryConfirm = async (diffPaymentType: 'full' | 'partial' | 'no_payment', paidAmount?: number) => {
    setShowConfirmDialog(false);
    await handleSave(diffPaymentType, paidAmount);
  };

  const handleSave = async (diffPaymentType?: 'full' | 'partial' | 'no_payment', paidAmount?: number) => {
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
              كمية_سابقة: item.original_quantity,
              كمية_جديدة: 0,
              هدية_سابقة: item.original_gift_quantity || 0,
              هدية_جديدة: 0,
              عملية: 'حذف',
            });
          } else {
            // Update quantity + gift after recalculation
            const paidQty = Math.max(0, item.new_quantity - (item.gift_quantity || 0));
            const multiplier = getBoxMultiplier(item.pricing_unit, item.weight_per_box, item.pieces_per_box);
            await supabase.from('order_items')
              .update({
                quantity: item.new_quantity,
                gift_quantity: item.gift_quantity || 0,
                unit_price: item.unit_price,
                total_price: paidQty * item.unit_price * multiplier,
              })
              .eq('id', item.id);
            changes.push({
              منتج: item.product_name,
              كمية_سابقة: item.original_quantity,
              كمية_جديدة: item.new_quantity,
              هدية_سابقة: item.original_gift_quantity || 0,
              هدية_جديدة: item.gift_quantity || 0,
              عملية: 'تعديل كمية',
            });
          }
        } else if (!item.id && item.new_quantity > 0) {
          // New product added
          const paidQty = Math.max(0, item.new_quantity - (item.gift_quantity || 0));
          const multiplier = getBoxMultiplier(item.pricing_unit, item.weight_per_box, item.pieces_per_box);
          await supabase.from('order_items').insert({
            order_id: order.id,
            product_id: item.product_id,
            quantity: item.new_quantity,
            gift_quantity: item.gift_quantity || 0,
            unit_price: item.unit_price,
            total_price: paidQty * item.unit_price * multiplier,
            pricing_unit: item.pricing_unit,
            weight_per_box: item.weight_per_box,
            pieces_per_box: item.pieces_per_box,
          });
          changes.push({
            منتج: item.product_name,
            كمية: item.new_quantity,
            هدية: item.gift_quantity || 0,
            عملية: 'إضافة جديد',
          });
        }
      }

      // Recalculate total (paid qty only, with box multiplier)
      const { data: updatedItems } = await supabase
        .from('order_items')
        .select('quantity, unit_price, gift_quantity, pricing_unit, weight_per_box, pieces_per_box')
        .eq('order_id', order.id);

      const newTotal = updatedItems?.reduce((sum, i: any) => {
        const paidQty = Math.max(0, Number(i.quantity) - Number(i.gift_quantity || 0));
        const mult = getBoxMultiplier(i.pricing_unit || 'box', Number(i.weight_per_box || 1), Number(i.pieces_per_box || 1));
        return sum + (paidQty * Number(i.unit_price || 0) * mult);
      }, 0) || 0;

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

      // Update delivery date if changed
      if (deliveryDateChanged) {
        orderUpdate.delivery_date = deliveryDate ? format(deliveryDate, 'yyyy-MM-dd') : null;
        changes.push({ عملية: 'تغيير تاريخ التوصيل', تاريخ_جديد: deliveryDate ? format(deliveryDate, 'yyyy-MM-dd') : 'بدون' });
      }

      // Update payment type if changed
      if (paymentTypeChanged || invoiceMethodChanged) {
        orderUpdate.payment_type = paymentType;
        orderUpdate.invoice_payment_method = paymentType === 'with_invoice' ? (invoicePaymentMethod || null) : null;
        changes.push({ عملية: 'تغيير طريقة الدفع', نوع: paymentType, طريقة_فرعية: invoicePaymentMethod || 'بدون' });
      }

      if (Object.keys(orderUpdate).length > 0) {
        await supabase.from('orders')
          .update(orderUpdate)
          .eq('id', order.id);
      }

      // Update worker_stock for delivered orders when quantities change
      if (order.status === 'delivered' && order.assigned_worker_id) {
        for (const item of items) {
          const qtyDiff = item.new_quantity - item.original_quantity;
          if (qtyDiff === 0) continue;

          const { data: ws } = await supabase
            .from('worker_stock')
            .select('id, quantity')
            .eq('worker_id', order.assigned_worker_id)
            .eq('product_id', item.product_id)
            .maybeSingle();

          if (ws) {
            // qtyDiff > 0 means increase (deduct from truck), qtyDiff < 0 means decrease (return to truck)
            const newStockQty = Math.max(0, ws.quantity - qtyDiff);
            await supabase.from('worker_stock')
              .update({ quantity: newStockQty })
              .eq('id', ws.id);
          } else if (qtyDiff < 0) {
            // Item was reduced but no stock record exists - create one with returned qty
            await supabase.from('worker_stock').insert({
              worker_id: order.assigned_worker_id,
              product_id: item.product_id,
              quantity: Math.abs(qtyDiff),
              branch_id: order.branch_id,
            });
          }
        }
      }

      // Handle post-delivery payment difference
      const totalDiff = orderTotal - originalTotal;
      if (order.status === 'delivered' && totalDiff !== 0 && diffPaymentType) {
        if (totalDiff > 0) {
          // INCREASE: customer owes more
          let remainingDiff = totalDiff;
          
          if (diffPaymentType === 'partial' && paidAmount) {
            remainingDiff = totalDiff - paidAmount;
          } else if (diffPaymentType === 'full') {
            remainingDiff = 0;
          }

          if (remainingDiff > 0) {
            // Check customer credits first
            const { data: credits } = await supabase
              .from('customer_credits')
              .select('id, amount')
              .eq('customer_id', order.customer_id)
              .eq('is_used', false)
              .eq('status', 'approved')
              .eq('credit_type', 'financial')
              .order('created_at', { ascending: true });

            let creditDeducted = 0;
            for (const credit of (credits || [])) {
              if (remainingDiff <= 0) break;
              const deduct = Math.min(credit.amount, remainingDiff);
              if (deduct >= credit.amount) {
                await supabase.from('customer_credits').update({ is_used: true, used_at: new Date().toISOString(), used_in_order_id: order.id }).eq('id', credit.id);
              } else {
                await supabase.from('customer_credits').update({ amount: credit.amount - deduct }).eq('id', credit.id);
              }
              remainingDiff -= deduct;
              creditDeducted += deduct;
            }

            // Remainder becomes debt
            if (remainingDiff > 0) {
              await supabase.from('customer_debts').insert({
                customer_id: order.customer_id,
                order_id: order.id,
                worker_id: workerId,
                branch_id: order.branch_id,
                total_amount: remainingDiff,
                paid_amount: 0,
                status: 'active',
                notes: creditDeducted > 0 
                  ? `فارق تعديل طلبية بعد التوصيل (تم خصم ${creditDeducted.toLocaleString()} دج من رصيد العميل)`
                  : 'فارق تعديل طلبية بعد التوصيل',
              });
            }
          }
        } else {
          // DECREASE: customer is owed money (totalDiff < 0)
          const refundAmount = Math.abs(totalDiff);
          let remainingRefund = refundAmount;

          if (diffPaymentType === 'full') {
            remainingRefund = 0; // Refunded in cash
          } else if (diffPaymentType === 'partial' && paidAmount) {
            remainingRefund = refundAmount - paidAmount;
          }

          if (remainingRefund > 0) {
            // Try to deduct from customer's existing debts
            const { data: debts } = await supabase
              .from('customer_debts')
              .select('id, total_amount, paid_amount, remaining_amount')
              .eq('customer_id', order.customer_id)
              .in('status', ['active', 'partially_paid'])
              .order('created_at', { ascending: true });

            let debtDeducted = 0;
            for (const debt of (debts || [])) {
              if (remainingRefund <= 0) break;
              const debtRemaining = (debt.remaining_amount ?? (debt.total_amount - debt.paid_amount));
              const deduct = Math.min(debtRemaining, remainingRefund);
              const newPaid = debt.paid_amount + deduct;
              const newRemaining = debt.total_amount - newPaid;
              await supabase.from('customer_debts').update({
                paid_amount: newPaid,
                remaining_amount: newRemaining,
                status: newRemaining <= 0 ? 'paid' : 'partially_paid',
                notes: (debt as any).notes ? `${(debt as any).notes} | خصم ${deduct.toLocaleString()} دج من فارق تعديل` : `خصم ${deduct.toLocaleString()} دج من فارق تعديل`,
              }).eq('id', debt.id);
              remainingRefund -= deduct;
              debtDeducted += deduct;
            }

            // Remainder becomes customer credit (surplus)
            if (remainingRefund > 0) {
              await supabase.from('customer_credits').insert({
                customer_id: order.customer_id,
                order_id: order.id,
                worker_id: workerId!,
                branch_id: order.branch_id,
                amount: remainingRefund,
                credit_type: 'financial',
                status: 'approved',
                approved_by: workerId,
                approved_at: new Date().toISOString(),
                notes: debtDeducted > 0
                  ? `فائض من تعديل طلبية بعد التوصيل (تم خصم ${debtDeducted.toLocaleString()} دج من ديون العميل)`
                  : 'فائض من تعديل طلبية بعد التوصيل',
              });
              // Also record in surplus/deficit treasury
              await supabase.from('manager_treasury').insert({
                manager_id: workerId!,
                branch_id: order.branch_id || null,
                source_type: 'customer_surplus',
                payment_method: 'cash',
                amount: remainingRefund,
                customer_name: order.customer?.name || '',
                notes: `فائض عميل من تعديل طلبية ${order.id.slice(0, 8)}`,
              });
            }
          }
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
          ...(diffPaymentType && { طريقة_دفع_الفارق: diffPaymentType, المبلغ_المدفوع: paidAmount }),
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
      queryClient.invalidateQueries({ queryKey: ['customer-credits'] });

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

            {/* Delivery date */}
            <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5" />
                تاريخ التوصيل
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-start h-9", !deliveryDate && "text-muted-foreground")}>
                    <CalendarDays className="w-4 h-4 me-2" />
                    {deliveryDate ? format(deliveryDate, 'yyyy-MM-dd') : 'بدون تاريخ'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[10060]" align="start">
                  <Calendar
                    mode="single"
                    selected={deliveryDate}
                    onSelect={setDeliveryDate}
                    className={cn("p-3 pointer-events-auto")}
                    locale={ar}
                  />
                </PopoverContent>
              </Popover>
              {deliveryDate && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setDeliveryDate(undefined)}>
                  إزالة التاريخ
                </Button>
              )}
            </div>

            {/* Payment type */}
            <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5" />
                طريقة الدفع
              </label>
              <Select value={paymentType} onValueChange={(v) => { setPaymentType(v); if (v !== 'with_invoice') setInvoicePaymentMethod(''); }}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="with_invoice">بفاتورة</SelectItem>
                  <SelectItem value="without_invoice">بدون فاتورة</SelectItem>
                </SelectContent>
              </Select>
              {paymentType === 'with_invoice' && (
                <Select value={invoicePaymentMethod} onValueChange={setInvoicePaymentMethod}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="طريقة الدفع الفرعية" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">نقدي</SelectItem>
                    <SelectItem value="check">شيك</SelectItem>
                    <SelectItem value="receipt">وصل</SelectItem>
                    <SelectItem value="transfer">تحويل</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Current items */}
            {items.map((item, index) => {
              const changed = item.new_quantity !== item.original_quantity;
              return (
                <div key={item.product_id} className={`border rounded-lg p-3 space-y-2 ${changed ? 'border-primary/50 bg-primary/5' : ''}`}>
                    <div className="flex items-center justify-between">
                      {(() => {
                        const product = products.find(p => p.id === item.product_id);
                        const imgUrl = product?.image_url || (orderItems.find(oi => oi.product_id === item.product_id)?.product as any)?.image_url;
                        return imgUrl ? (
                          <img src={imgUrl} alt={item.product_name} className="w-10 h-10 rounded-md object-cover flex-shrink-0" />
                        ) : null;
                      })()}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm">{item.product_name}</span>
                          {item.gift_quantity > 0 && (
                            <Badge className="bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300 text-[10px] px-1.5 py-0 gap-0.5">
                              <Gift className="w-3 h-3" />
                              عرض {item.gift_quantity}
                            </Badge>
                          )}
                        </div>
                        {item.unit_price > 0 && (() => {
                          const boxPrice = getBoxPrice(item);
                          const paidQty = getPaidQuantity(item);
                          return (
                          <p className="text-xs text-muted-foreground">
                            {boxPrice.toLocaleString()} دج × {paidQty} = {(boxPrice * paidQty).toLocaleString()} دج
                            {item.gift_quantity > 0 ? ` (${paidQty} + ${item.gift_quantity} عرض = ${item.new_quantity})` : ''}
                          </p>
                          );
                        })()}
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
                      value={getPaidQuantity(item)}
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
        customerHasDebt={customerDebtTotal > 0}
        customerDebtAmount={customerDebtTotal}
        customerCreditBalance={customerCreditTotal}
      />
    </Dialog>
  );
};

export default ModifyOrderDialog;
