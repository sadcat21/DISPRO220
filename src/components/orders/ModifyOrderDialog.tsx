import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Minus, Loader2, Package, Save, PlusCircle, Trash2, Truck, Gift, CalendarDays, CreditCard, Banknote, AlertTriangle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { cn, isAdminRole } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLogActivity } from '@/hooks/useActivityLogs';
import { useQueryClient } from '@tanstack/react-query';
import { OrderWithDetails, OrderItem, Product, PriceSubType } from '@/types/database';
import DeliveryWorkerSelect from './DeliveryWorkerSelect';
import PostDeliveryConfirmDialog from './PostDeliveryConfirmDialog';
import InvoicePaymentMethodSelect from './InvoicePaymentMethodSelect';
import { useProductOffers } from '@/hooks/useProductOffers';
import { InvoicePaymentMethod } from '@/types/stamp';

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
  item_subtype?: string; // per-item override: 'super_gros' | 'gros' | 'retail' | 'invoice'
  is_unit_sale?: boolean;
}

const getBoxMultiplier = (pricingUnit: string, weightPerBox: number, piecesPerBox: number): number => {
  if (pricingUnit === 'kg') return Math.max(1, weightPerBox);
  if (pricingUnit === 'unit') return Math.max(1, piecesPerBox);
  return 1;
};

const supportsUnitSale = (product?: Product | null): boolean => {
  if (!product) return false;
  return !!product.allow_unit_sale && Number(product.pieces_per_box || 0) > 1;
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
  const [newProductSaleUnit, setNewProductSaleUnit] = useState<'box' | 'piece'>('box');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assignedWorkerId, setAssignedWorkerId] = useState(order.assigned_worker_id || '');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [customerDebtTotal, setCustomerDebtTotal] = useState(0);
  const [customerCreditTotal, setCustomerCreditTotal] = useState(0);
  const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(order.delivery_date ? new Date(order.delivery_date) : undefined);
  const [paymentType, setPaymentType] = useState<string>(order.payment_type || 'with_invoice');
  const [invoicePaymentMethod, setInvoicePaymentMethod] = useState<InvoicePaymentMethod | null>((order.invoice_payment_method as InvoicePaymentMethod) || null);
  const [priceSubType, setPriceSubType] = useState<PriceSubType>('gros');

  // Payment adjustment for delivered orders — use partial_amount (actual DB column)
  const initPaid = (() => {
    const ps = String(order.payment_status || '').toLowerCase();
    if (ps === 'partial' && order.partial_amount != null) return Number(order.partial_amount);
    if (['pending', 'credit'].includes(ps)) return 0;
    return Number(order.total_amount || 0);
  })();
  const [adjustPaidAmount, setAdjustPaidAmount] = useState<number>(initPaid);
  const [adjustRemainingAmount, setAdjustRemainingAmount] = useState<number>(Math.max(0, Number(order.total_amount || 0) - initPaid));

  const canChangeWorker = isAdminRole(role) || order.created_by === workerId;

  // Initialize items from orderItems
  useEffect(() => {
    if (open && orderItems.length > 0) {
      setItems(orderItems.map(item => {
        const piecesPerBox = Number((item as any).pieces_per_box || item.product?.pieces_per_box || 1);
        const pricingUnit = (item as any).pricing_unit || item.product?.pricing_unit || 'box';
        const weightPerBox = Number((item as any).weight_per_box || item.product?.weight_per_box || 1);
        // unit_price in order_items is already the BOX price (pre-multiplied).
        // Reverse the multiplier so getBoxPrice() doesn't double-multiply.
        const storedUnitPrice = Number(item.unit_price || 0);
        const multiplier = getBoxMultiplier(pricingUnit, weightPerBox, piecesPerBox);
        const rawUnitPrice = multiplier > 0 ? storedUnitPrice / multiplier : storedUnitPrice;
        return {
          id: item.id,
          product_id: item.product_id,
          product_name: item.product?.name || '',
          original_quantity: item.quantity,
          new_quantity: item.quantity,
          unit_price: rawUnitPrice,
          gift_quantity: Number(item.gift_quantity || 0),
          original_gift_quantity: Number(item.gift_quantity || 0),
          pieces_per_box: piecesPerBox,
          pricing_unit: pricingUnit,
          weight_per_box: weightPerBox,
          is_unit_sale: false,
        };
      }));
      setAssignedWorkerId(order.assigned_worker_id || '');
      setDeliveryDate(order.delivery_date ? new Date(order.delivery_date) : undefined);
      setPaymentType(order.payment_type || 'with_invoice');
      setInvoicePaymentMethod((order.invoice_payment_method as InvoicePaymentMethod) || null);
      // Initialize price subtype from first order item or customer default
      const firstItemSubtype = orderItems[0] && (orderItems[0] as any).price_subtype;
      const customerDefault = order.customer?.default_price_subtype;
      setPriceSubType((firstItemSubtype || customerDefault || 'gros') as PriceSubType);
      // Resolve paid amount from partial_amount + payment_status
      const ps = String(order.payment_status || '').toLowerCase();
      const resolvedPaid = (() => {
        if (ps === 'partial' && order.partial_amount != null) return Number(order.partial_amount);
        if (['pending', 'credit'].includes(ps)) return 0;
        return Number(order.total_amount || 0);
      })();
      setAdjustPaidAmount(resolvedPaid);
      setAdjustRemainingAmount(Math.max(0, Number(order.total_amount || 0) - resolvedPaid));
    }
  }, [open, orderItems, order.assigned_worker_id, order.delivery_date, order.payment_type, order.invoice_payment_method, order.partial_amount, order.payment_status, order.total_amount]);

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

  useEffect(() => {
    const selectedProduct = products.find((p) => p.id === newProductId);
    if (!supportsUnitSale(selectedProduct)) {
      setNewProductSaleUnit('box');
    }
  }, [newProductId, products]);

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

      if (item.is_unit_sale) {
        return {
          ...item,
          new_quantity: newPaidQty,
          gift_quantity: 0,
        };
      }

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

      if (item.is_unit_sale) {
        return {
          ...item,
          new_quantity: paidQty,
          gift_quantity: 0,
        };
      }

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
    let unitPrice: number;
    if (paymentType === 'with_invoice') {
      unitPrice = Number(product.price_invoice || 0);
    } else {
      switch (priceSubType) {
        case 'super_gros': unitPrice = Number(product.price_super_gros || product.price_no_invoice || 0); break;
        case 'retail': unitPrice = Number(product.price_retail || 0); break;
        default: unitPrice = Number(product.price_gros || product.price_no_invoice || 0); break;
      }
    }
    const piecesPerBox = Number(product.pieces_per_box || 1);
    const pricingUnit = product.pricing_unit || 'box';
    const weightPerBox = Number(product.weight_per_box || 1);
    const isUnitSale = supportsUnitSale(product) && newProductSaleUnit === 'piece';
    const effectiveUnitPrice = isUnitSale
      ? unitPrice / Math.max(1, piecesPerBox)
      : unitPrice;
    const recalculated = isUnitSale
      ? { gift_quantity: 0, total_quantity: initialPaidQuantity }
      : recalcFromPaidQuantity(product.id, initialPaidQuantity, piecesPerBox);

    setItems(prev => [...prev, {
      product_id: product.id,
      product_name: product.name,
      original_quantity: 0,
      new_quantity: recalculated.total_quantity,
      unit_price: effectiveUnitPrice,
      gift_quantity: recalculated.gift_quantity,
      original_gift_quantity: 0,
      pieces_per_box: piecesPerBox,
      pricing_unit: pricingUnit,
      weight_per_box: weightPerBox,
      is_unit_sale: isUnitSale,
    }]);
    setNewProductId('');
    setNewProductSaleUnit('box');
  };

  const removeNewItem = (index: number) => {
    const item = items[index];
    if (item.id) return; // Can't remove existing items, set qty to 0
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  // Recalculate item prices when payment type or price subtype changes
  const recalcItemPrices = useCallback((pt: string, pst: PriceSubType) => {
    setItems(prev => prev.map(item => {
      const product = products.find(p => p.id === item.product_id);
      if (!product) return item;
      let newUnitPrice: number;
      if (pt === 'with_invoice') {
        newUnitPrice = Number(product.price_invoice || 0);
      } else {
        switch (pst) {
          case 'super_gros': newUnitPrice = Number(product.price_super_gros || product.price_no_invoice || 0); break;
          case 'retail': newUnitPrice = Number(product.price_retail || 0); break;
          default: newUnitPrice = Number(product.price_gros || product.price_no_invoice || 0); break;
        }
      }

      const adjustedUnitPrice = item.is_unit_sale
        ? newUnitPrice / Math.max(1, item.pieces_per_box)
        : newUnitPrice;

      return { ...item, unit_price: adjustedUnitPrice };
    }));
  }, [products]);

  // Change pricing subtype for a single item
  const changeItemSubtype = useCallback((index: number, subtype: string) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const product = products.find(p => p.id === item.product_id);
      if (!product) return { ...item, item_subtype: subtype };
      let newUnitPrice: number;
      if (subtype === 'invoice') {
        newUnitPrice = Number(product.price_invoice || 0);
      } else {
        switch (subtype) {
          case 'super_gros': newUnitPrice = Number(product.price_super_gros || product.price_no_invoice || 0); break;
          case 'retail': newUnitPrice = Number(product.price_retail || 0); break;
          default: newUnitPrice = Number(product.price_gros || product.price_no_invoice || 0); break;
        }
      }

      const adjustedUnitPrice = item.is_unit_sale
        ? newUnitPrice / Math.max(1, item.pieces_per_box)
        : newUnitPrice;

      return { ...item, unit_price: adjustedUnitPrice, item_subtype: subtype };
    }));
  }, [products]);

  const workerChanged = assignedWorkerId !== (order.assigned_worker_id || '');
  const deliveryDateChanged = (() => {
    const origDate = order.delivery_date ? order.delivery_date.split('T')[0] : '';
    const newDate = deliveryDate ? format(deliveryDate, 'yyyy-MM-dd') : '';
    return origDate !== newDate;
  })();
  const paymentTypeChanged = paymentType !== (order.payment_type || 'with_invoice');
  const invoiceMethodChanged = (invoicePaymentMethod || null) !== (order.invoice_payment_method || null);
  const originalPriceSubType = ((orderItems[0] as any)?.price_subtype || order.customer?.default_price_subtype || 'gros') as string;
  const priceSubTypeChanged = paymentType === 'without_invoice' && priceSubType !== originalPriceSubType;
  const originalPaidAmount = Number((order as any).paid_amount || order.total_amount || 0);
  const originalRemainingAmount = Number((order as any).remaining_amount || 0);
  const paymentAmountChanged = order.status === 'delivered' && (adjustPaidAmount !== originalPaidAmount || adjustRemainingAmount !== originalRemainingAmount);

  const hasItemSubtypeChanges = items.some(i => i.item_subtype !== undefined);

  const hasChanges = items.some(i => i.new_quantity !== i.original_quantity) ||
    items.some(i => !i.id && i.new_quantity > 0) || workerChanged || deliveryDateChanged || paymentTypeChanged || invoiceMethodChanged || priceSubTypeChanged || paymentAmountChanged || hasItemSubtypeChanges;

  const getBoxPrice = useCallback((item: ModifiedItem) => {
    const multiplier = getBoxMultiplier(item.pricing_unit, item.weight_per_box, item.pieces_per_box);
    return item.unit_price * multiplier;
  }, []);

  const originalTotal = orderItems.reduce((sum, item) => {
    const giftQty = Number((item as any).gift_quantity || 0);
    const paidQty = Math.max(0, Number(item.quantity) - giftQty);
    // unit_price in order_items is already the box price
    return sum + (paidQty * Number(item.unit_price || 0));
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
        const itemSubtype = item.item_subtype || (paymentType === 'with_invoice' ? 'invoice' : priceSubType);
        const itemPayType = itemSubtype === 'invoice' ? 'with_invoice' : 'without_invoice';
        const itemInvMethod = itemSubtype === 'invoice' ? (invoicePaymentMethod || null) : null;

        if (item.id && (item.new_quantity !== item.original_quantity || item.item_subtype !== undefined)) {
          if (item.new_quantity === 0) {
            // Delete the item
            const { error: delErr } = await supabase.from('order_items').delete().eq('id', item.id);
            if (delErr) throw new Error('فشل حذف المنتج: ' + delErr.message);
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
            const boxPrice = item.unit_price * multiplier;
            const { error: updErr } = await supabase.from('order_items')
              .update({
                quantity: item.new_quantity,
                gift_quantity: item.gift_quantity || 0,
                unit_price: boxPrice,
                total_price: paidQty * boxPrice,
                price_subtype: itemSubtype,
                payment_type: itemPayType,
                invoice_payment_method: itemInvMethod,
              })
              .eq('id', item.id);
            if (updErr) throw new Error('فشل تحديث المنتج: ' + updErr.message);
            changes.push({
              منتج: item.product_name,
              كمية_سابقة: item.original_quantity,
              كمية_جديدة: item.new_quantity,
              هدية_سابقة: item.original_gift_quantity || 0,
              هدية_جديدة: item.gift_quantity || 0,
              تسعير: itemSubtype,
              عملية: item.item_subtype ? 'تعديل تسعير' : 'تعديل كمية',
            });
          }
        } else if (!item.id && item.new_quantity > 0) {
          // New product added
          const paidQty = Math.max(0, item.new_quantity - (item.gift_quantity || 0));
          const multiplier = getBoxMultiplier(item.pricing_unit, item.weight_per_box, item.pieces_per_box);
          const boxPrice = item.unit_price * multiplier;
          const { error: insErr } = await supabase.from('order_items').insert({
            order_id: order.id,
            product_id: item.product_id,
            quantity: item.new_quantity,
            gift_quantity: item.gift_quantity || 0,
            unit_price: boxPrice,
            total_price: paidQty * boxPrice,
            pricing_unit: item.pricing_unit,
            weight_per_box: item.weight_per_box,
            pieces_per_box: item.pieces_per_box,
            price_subtype: itemSubtype,
            payment_type: itemPayType,
            invoice_payment_method: itemInvMethod,
          });
          if (insErr) throw new Error('فشل إضافة المنتج: ' + insErr.message);
          changes.push({
            منتج: item.product_name,
            كمية: item.new_quantity,
            هدية: item.gift_quantity || 0,
            تسعير: itemSubtype,
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
        // unit_price in DB is already the box price, no need to multiply again
        return sum + (paidQty * Number(i.unit_price || 0));
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

      // Update payment type / pricing tier if changed
      if (paymentTypeChanged || invoiceMethodChanged || priceSubTypeChanged) {
        orderUpdate.payment_type = paymentType;
        orderUpdate.invoice_payment_method = paymentType === 'with_invoice' ? (invoicePaymentMethod || null) : null;
        changes.push({ عملية: 'تغيير طريقة الدفع', نوع: paymentType, طريقة_فرعية: invoicePaymentMethod || 'بدون', تسعير: priceSubType });

        // Update price_subtype AND recalculated prices on all order items
        const newSubtype = paymentType === 'with_invoice' ? 'invoice' : priceSubType;
        for (const item of items) {
          if (!item.id) continue; // new items handled separately
          const paidQty = Math.max(0, item.new_quantity - (item.gift_quantity || 0));
          const multiplier = getBoxMultiplier(item.pricing_unit, item.weight_per_box, item.pieces_per_box);
          const boxPrice = item.unit_price * multiplier;
          await supabase.from('order_items')
            .update({ 
              price_subtype: newSubtype,
              payment_type: paymentType,
              invoice_payment_method: paymentType === 'with_invoice' ? (invoicePaymentMethod || null) : null,
              unit_price: boxPrice,
              total_price: paidQty * boxPrice,
            })
            .eq('id', item.id);
        }
      }

      // Update paid/remaining amounts for delivered orders using partial_amount + payment_status
      if (paymentAmountChanged) {
        // Map to actual DB columns
        if (adjustRemainingAmount <= 0) {
          orderUpdate.payment_status = 'cash';
          orderUpdate.partial_amount = null;
        } else if (adjustPaidAmount <= 0) {
          orderUpdate.payment_status = 'pending';
          orderUpdate.partial_amount = null;
        } else {
          orderUpdate.payment_status = 'partial';
          orderUpdate.partial_amount = adjustPaidAmount;
        }
        changes.push({
          عملية: 'تعديل المبلغ المدفوع',
          مدفوع_سابق: originalPaidAmount,
          مدفوع_جديد: adjustPaidAmount,
          متبقي_سابق: originalRemainingAmount,
          متبقي_جديد: adjustRemainingAmount,
        });

        // Handle debt changes from payment adjustment
        const debtIncrease = adjustRemainingAmount - originalRemainingAmount;
        if (debtIncrease > 0) {
          // More remaining = new/increased debt
          // Check if there's already a debt for this order
          const { data: existingDebt } = await supabase
            .from('customer_debts')
            .select('id, total_amount, paid_amount, remaining_amount')
            .eq('order_id', order.id)
            .in('status', ['active', 'partially_paid'])
            .maybeSingle();

          if (existingDebt) {
            const newDebtTotal = Number(existingDebt.total_amount) + debtIncrease;
            const newDebtRemaining = (existingDebt.remaining_amount ?? (existingDebt.total_amount - existingDebt.paid_amount)) + debtIncrease;
            await supabase.from('customer_debts').update({
              total_amount: newDebtTotal,
              remaining_amount: newDebtRemaining,
              notes: `تعديل دفع بعد التوصيل - زيادة ${debtIncrease.toLocaleString()} دج`,
            }).eq('id', existingDebt.id);
          } else {
            await supabase.from('customer_debts').insert({
              customer_id: order.customer_id,
              order_id: order.id,
              worker_id: workerId,
              branch_id: order.branch_id,
              total_amount: debtIncrease,
              paid_amount: 0,
              remaining_amount: debtIncrease,
              status: 'active',
              notes: 'دين من تعديل الدفع بعد التوصيل',
            });
          }
        } else if (debtIncrease < 0) {
          // Less remaining = debt reduced/cleared
          const debtReduction = Math.abs(debtIncrease);
          let remaining = debtReduction;

          const { data: debts } = await supabase
            .from('customer_debts')
            .select('id, total_amount, paid_amount, remaining_amount')
            .eq('customer_id', order.customer_id)
            .in('status', ['active', 'partially_paid'])
            .order('created_at', { ascending: true });

          for (const debt of (debts || [])) {
            if (remaining <= 0) break;
            const debtRemaining = (debt.remaining_amount ?? (debt.total_amount - debt.paid_amount));
            const deduct = Math.min(debtRemaining, remaining);
            const newPaid = debt.paid_amount + deduct;
            const newRemaining = debt.total_amount - newPaid;
            await supabase.from('customer_debts').update({
              paid_amount: newPaid,
              remaining_amount: newRemaining,
              status: newRemaining <= 0 ? 'paid' : 'partially_paid',
            }).eq('id', debt.id);
            remaining -= deduct;
          }

          // If there's still surplus, create customer credit
          if (remaining > 0) {
            await supabase.from('customer_credits').insert({
              customer_id: order.customer_id,
              order_id: order.id,
              worker_id: workerId!,
              branch_id: order.branch_id,
              amount: remaining,
              credit_type: 'financial',
              status: 'approved',
              approved_by: workerId,
              approved_at: new Date().toISOString(),
              notes: 'فائض من تعديل الدفع بعد التوصيل',
            });
          }
        }
      }

      if (Object.keys(orderUpdate).length > 0) {
        const { error: orderErr } = await supabase.from('orders')
          .update(orderUpdate)
          .eq('id', order.id);
        if (orderErr) throw new Error('فشل تحديث الطلبية: ' + orderErr.message);
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

      // Update receipt if anything changed (so reprinted receipts reflect the change)
      const shouldUpdateReceipt = paymentAmountChanged || paymentTypeChanged || invoiceMethodChanged || priceSubTypeChanged || hasItemSubtypeChanges || productChanges.length > 0;
      if (shouldUpdateReceipt) {
        // Re-fetch updated order items for receipt sync
        const { data: freshItems } = await supabase
          .from('order_items')
          .select('*, product:products(name)')
          .eq('order_id', order.id);

        const receiptUpdate: Record<string, any> = {};
        if (paymentAmountChanged) {
          receiptUpdate.paid_amount = adjustPaidAmount;
          receiptUpdate.remaining_amount = adjustRemainingAmount;
        }
        if (paymentTypeChanged || invoiceMethodChanged) {
          receiptUpdate.payment_method = paymentType === 'with_invoice' ? (invoicePaymentMethod || 'cash') : 'cash';
        }
        // Always update receipt items and total when items/prices change
        if (freshItems && freshItems.length > 0) {
          const receiptItems = freshItems.map((fi: any) => ({
            product_id: fi.product_id,
            product_name: fi.product?.name || '',
            quantity: fi.quantity,
            gift_quantity: fi.gift_quantity || 0,
            unit_price: fi.unit_price,
            total_price: fi.total_price,
            pricing_unit: fi.pricing_unit || 'box',
            weight_per_box: fi.weight_per_box || 1,
            pieces_per_box: fi.pieces_per_box || 1,
          }));
          receiptUpdate.items = receiptItems;
          receiptUpdate.total_amount = newTotal;
        }
        if (Object.keys(receiptUpdate).length > 0) {
          await supabase.from('receipts')
            .update(receiptUpdate)
            .eq('order_id', order.id);
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
          ...(paymentAmountChanged && { تعديل_الدفع: { مدفوع: adjustPaidAmount, متبقي: adjustRemainingAmount } }),
        },
      });

      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['assigned-orders'] });
      queryClient.invalidateQueries({ queryKey: ['order-items'] });
      queryClient.invalidateQueries({ queryKey: ['my-worker-stock'] });
      queryClient.invalidateQueries({ queryKey: ['my-stock-sold'] });
      queryClient.invalidateQueries({ queryKey: ['my-stock-loaded'] });
      queryClient.invalidateQueries({ queryKey: ['worker-truck-stock'] });
      queryClient.invalidateQueries({ queryKey: ['customer-debts'] });
      queryClient.invalidateQueries({ queryKey: ['customer-debt-summary'] });
      queryClient.invalidateQueries({ queryKey: ['customer-debts-summary-all'] });
      queryClient.invalidateQueries({ queryKey: ['due-debts'] });
      queryClient.invalidateQueries({ queryKey: ['debt-payments'] });
      queryClient.invalidateQueries({ queryKey: ['pending-collections'] });
      queryClient.invalidateQueries({ queryKey: ['today-debt-collections-dialog'] });
      queryClient.invalidateQueries({ queryKey: ['order-debt-details'] });
      queryClient.invalidateQueries({ queryKey: ['customer-credits'] });
      queryClient.invalidateQueries({ queryKey: ['receipts'] });

      toast.success(t('orders.order_modified'));
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const availableProducts = products.filter(p => !items.some(i => i.product_id === p.id));
  const selectedNewProduct = products.find((p) => p.id === newProductId);
  const canToggleNewProductUnit = supportsUnitSale(selectedNewProduct);

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
            <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5" />
                طريقة الدفع
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={paymentType === 'with_invoice' ? 'default' : 'outline'}
                  className={`h-10 text-sm font-bold ${paymentType === 'with_invoice' ? '' : 'opacity-60'}`}
                  onClick={() => { setPaymentType('with_invoice'); recalcItemPrices('with_invoice', priceSubType); }}
                >
                  بفاتورة
                </Button>
                <Button
                  type="button"
                  variant={paymentType === 'without_invoice' ? 'default' : 'outline'}
                  className={`h-10 text-sm font-bold ${paymentType === 'without_invoice' ? '' : 'opacity-60'}`}
                  onClick={() => { setPaymentType('without_invoice'); setInvoicePaymentMethod(null); recalcItemPrices('without_invoice', priceSubType); }}
                >
                  بدون فاتورة
                </Button>
              </div>
              {paymentType === 'without_invoice' && (
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'super_gros' as PriceSubType, label: 'Super Gros', colors: { active: 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 ring-2 ring-indigo-400', inactive: 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600' } },
                    { value: 'gros' as PriceSubType, label: 'Gros', colors: { active: 'bg-cyan-600 hover:bg-cyan-700 text-white border-cyan-600 ring-2 ring-cyan-400', inactive: 'bg-cyan-600 hover:bg-cyan-700 text-white border-cyan-600' } },
                    { value: 'retail' as PriceSubType, label: 'Détail', colors: { active: 'bg-rose-600 hover:bg-rose-700 text-white border-rose-600 ring-2 ring-rose-400', inactive: 'bg-rose-600 hover:bg-rose-700 text-white border-rose-600' } },
                  ]).map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant={priceSubType === option.value ? 'default' : 'outline'}
                      size="sm"
                      className={`h-10 text-sm font-bold transition-opacity ${priceSubType === option.value ? option.colors.active : option.colors.inactive} ${priceSubType !== option.value ? 'opacity-50' : ''}`}
                      onClick={() => { setPriceSubType(option.value); recalcItemPrices('without_invoice', option.value); }}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              )}
              {paymentType === 'with_invoice' && (
                <InvoicePaymentMethodSelect
                  value={invoicePaymentMethod}
                  onChange={setInvoicePaymentMethod}
                />
              )}
            </div>

            {/* Payment amount adjustment for delivered orders */}
            {order.status === 'delivered' && (
              <div className="border rounded-lg p-3 space-y-3 bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                <label className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                  <Banknote className="w-3.5 h-3.5" />
                  تعديل المبلغ المدفوع / المتبقي
                </label>
                <p className="text-[10px] text-amber-700 dark:text-amber-400">
                  إذا لم يدفع العميل أو دفع جزئياً بعد التسليم، عدّل المبالغ هنا وسيتم تحديث الديون والوصل تلقائياً.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">المبلغ المدفوع</label>
                    <Input
                      type="number"
                      value={adjustPaidAmount}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(Number(e.target.value) || 0, orderTotal || Number(order.total_amount)));
                        setAdjustPaidAmount(val);
                        setAdjustRemainingAmount(Math.max(0, (orderTotal || Number(order.total_amount)) - val));
                      }}
                      className="h-9"
                      min={0}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">المبلغ المتبقي (دين)</label>
                    <Input
                      type="number"
                      value={adjustRemainingAmount}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(Number(e.target.value) || 0, orderTotal || Number(order.total_amount)));
                        setAdjustRemainingAmount(val);
                        setAdjustPaidAmount(Math.max(0, (orderTotal || Number(order.total_amount)) - val));
                      }}
                      className="h-9"
                      min={0}
                    />
                  </div>
                </div>
                {/* Quick shortcuts */}
                <div className="flex gap-1.5 flex-wrap">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] px-2"
                    onClick={() => { setAdjustPaidAmount(orderTotal || Number(order.total_amount)); setAdjustRemainingAmount(0); }}>
                    دفع كامل
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] px-2"
                    onClick={() => { setAdjustPaidAmount(0); setAdjustRemainingAmount(orderTotal || Number(order.total_amount)); }}>
                    بدون دفع (دين)
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] px-2"
                    onClick={() => { const half = Math.round((orderTotal || Number(order.total_amount)) / 2); setAdjustPaidAmount(half); setAdjustRemainingAmount((orderTotal || Number(order.total_amount)) - half); }}>
                    نصف المبلغ
                  </Button>
                </div>
                {paymentAmountChanged && (
                  <div className="bg-amber-100 dark:bg-amber-900/30 rounded-md p-2 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">سيتم تحديث:</p>
                      <ul className="list-disc list-inside text-[10px] mt-0.5 space-y-0.5">
                        <li>المبلغ المدفوع: {originalPaidAmount.toLocaleString()} → {adjustPaidAmount.toLocaleString()} دج</li>
                        <li>المبلغ المتبقي: {originalRemainingAmount.toLocaleString()} → {adjustRemainingAmount.toLocaleString()} دج</li>
                        {adjustRemainingAmount > originalRemainingAmount && <li className="text-red-700">سيتم إنشاء/تحديث دين بقيمة {(adjustRemainingAmount - originalRemainingAmount).toLocaleString()} دج</li>}
                        {adjustRemainingAmount < originalRemainingAmount && <li className="text-green-700">سيتم تسوية ديون بقيمة {(originalRemainingAmount - adjustRemainingAmount).toLocaleString()} دج</li>}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}

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
                          {item.is_unit_sale && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {t('offers.unit_piece')}
                            </Badge>
                          )}
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
                  {/* Per-item pricing subtype override */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {([
                      { value: 'invoice', label: 'F1', color: 'bg-blue-600 text-white border-blue-600' },
                      { value: 'super_gros', label: 'SG', color: 'bg-indigo-600 text-white border-indigo-600' },
                      { value: 'gros', label: 'G', color: 'bg-cyan-600 text-white border-cyan-600' },
                      { value: 'retail', label: 'D', color: 'bg-rose-600 text-white border-rose-600' },
                    ]).map((opt) => {
                      const currentSubtype = item.item_subtype || (paymentType === 'with_invoice' ? 'invoice' : priceSubType);
                      const isActive = currentSubtype === opt.value;
                      return (
                        <Button
                          key={opt.value}
                          type="button"
                          variant="outline"
                          size="sm"
                          className={`h-6 px-2 text-[10px] font-bold transition-all ${isActive ? `${opt.color} ring-1 ring-offset-1` : `${opt.color} opacity-30`}`}
                          onClick={() => changeItemSubtype(index, opt.value)}
                        >
                          {opt.label}
                        </Button>
                      );
                    })}
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
              {canToggleNewProductUnit && (
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">وحدة إضافة المنتج</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={newProductSaleUnit === 'box' ? 'default' : 'outline'}
                      className="h-8"
                      onClick={() => setNewProductSaleUnit('box')}
                    >
                      {t('offers.unit_box')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={newProductSaleUnit === 'piece' ? 'default' : 'outline'}
                      className="h-8"
                      onClick={() => setNewProductSaleUnit('piece')}
                    >
                      {t('offers.unit_piece')}
                    </Button>
                  </div>
                </div>
              )}
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
