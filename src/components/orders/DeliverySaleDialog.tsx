import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ReceiptDialog from '@/components/printing/ReceiptDialog';
import { ReceiptItem, ReceiptType } from '@/types/receipt';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Truck, Plus, Minus, Loader2,
  XCircle, Package, PlusCircle, Stamp, CheckCircle, PackageX, Gift, AlertTriangle, Copy, DollarSign, Banknote
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { OrderWithDetails, OrderItem, Product } from '@/types/database';
import { useActiveStampTiers, calculateStampAmount } from '@/hooks/useStampTiers';
import { useCreateDebt } from '@/hooks/useCustomerDebts';
import { useLogActivity } from '@/hooks/useActivityLogs';
import { useCreateCustomerCredit, useCustomerCredits, useCustomerCreditSummary, useMarkCreditUsed } from '@/hooks/useCustomerCredits';
import CustomerCreditBadges from '@/components/orders/CustomerCreditBadges';
import { useTrackVisit } from '@/hooks/useVisitTracking';
import { useOrderItems } from '@/hooks/useOrders';
import { useProductOffers } from '@/hooks/useProductOffers';
import { INVOICE_PAYMENT_METHODS, InvoicePaymentMethod } from '@/types/stamp';
import DeliveryPaymentDialog from '@/components/orders/DeliveryPaymentDialog';
import CheckVerificationDialog from '@/components/orders/CheckVerificationDialog';
import ReceiptPaymentDialog from '@/components/orders/ReceiptPaymentDialog';
import ProductQuantityDialog from '@/components/orders/ProductQuantityDialog';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import CustomerDistanceIndicator from './CustomerDistanceIndicator';

interface DeliverySaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderWithDetails;
}

interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  originalItemId?: string; // existing order_item id
  originalQuantity: number;
  giftQuantity: number; // gift boxes included in quantity
  giftOfferId?: string | null;
  piecesPerBox: number;
  pricingUnit?: string;
  weightPerBox?: number | null;
}

const DeliverySaleDialog: React.FC<DeliverySaleDialogProps> = ({ open, onOpenChange, order }) => {
  const { workerId, activeBranch } = useAuth();
  const { t, dir } = useLanguage();
  const queryClient = useQueryClient();
  const { data: stampTiers } = useActiveStampTiers();
  const createDebt = useCreateDebt();
  const createCredit = useCreateCustomerCredit();
  const markCreditUsed = useMarkCreditUsed();
  const logActivity = useLogActivity();
  const { trackVisit } = useTrackVisit();
  const { activeOffers } = useProductOffers();
  const creditSummary = useCustomerCreditSummary(order.customer_id);
  const { data: customerCredits } = useCustomerCredits(order.customer_id);
  const [useCreditBalance, setUseCreditBalance] = useState(false);

  const { data: orderItems, isLoading: isLoadingItems } = useOrderItems(open ? order.id : null);

  // Worker stock
  const { data: stockItems } = useQuery({
    queryKey: ['my-worker-stock', workerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worker_stock')
        .select('*, product:products(*)')
        .eq('worker_id', workerId!);
      if (error) throw error;
      return data as { id: string; product_id: string; quantity: number; product?: Product }[];
    },
    enabled: !!workerId && open,
  });

  // Shortage tracking - products marked as unavailable for this order
  const { data: shortageProducts } = useQuery({
    queryKey: ['order-shortage', order.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('product_shortage_tracking')
        .select('product_id')
        .eq('order_id', order.id)
        .eq('status', 'pending');
      return new Set((data || []).map(d => d.product_id));
    },
    enabled: open,
  });

  const shortageProductIds = shortageProducts || new Set<string>();

  // All active products for adding new ones
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showCheckDialog, setShowCheckDialog] = useState(false);
  const [showReceiptPaymentDialog, setShowReceiptPaymentDialog] = useState(false);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [receiptDataState, setReceiptDataState] = useState<any>(null);
  const [showQuantityDialog, setShowQuantityDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [newProductId, setNewProductId] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [partialDeliveryAction, setPartialDeliveryAction] = useState<'none' | 'create_order' | 'deliver_only'>('none');

  // Fetch products for adding
  useEffect(() => {
    if (!open) return;
    const fetch = async () => {
      const { data } = await supabase.from('products').select('*').eq('is_active', true).order('sort_order', { ascending: true }).order('name');
      setAllProducts(data || []);
    };
    fetch();
  }, [open]);

  // Initialize sale items from order items
  // Helper: recalculate gift for a product based on paid quantity and active offers
  const recalcGift = useCallback((productId: string, paidQty: number, piecesPerBox: number): number => {
    const offersForProduct = activeOffers.filter(o => o.product_id === productId);
    if (offersForProduct.length === 0) return 0;

    let totalGiftPieces = 0;
    for (const offer of offersForProduct) {
      const tiers = offer.tiers && offer.tiers.length > 0 ? offer.tiers : null;
      if (tiers) {
        if (offer.condition_type === 'multiplier') {
          const sortedTiers = [...tiers].sort((a, b) => b.min_quantity - a.min_quantity);
          let remaining = paidQty;
          for (const tier of sortedTiers) {
            if (remaining < tier.min_quantity) continue;
            const timesApplied = Math.floor(remaining / tier.min_quantity);
            remaining = remaining % tier.min_quantity;
            const giftUnit = tier.gift_quantity_unit || 'piece';
            const giftAmount = timesApplied * tier.gift_quantity;
            totalGiftPieces += giftUnit === 'box' ? giftAmount * piecesPerBox : giftAmount;
          }
        } else {
          for (const tier of [...tiers].sort((a, b) => b.min_quantity - a.min_quantity)) {
            if (paidQty >= tier.min_quantity && (tier.max_quantity === null || paidQty <= tier.max_quantity)) {
              const giftUnit = tier.gift_quantity_unit || 'piece';
              totalGiftPieces += giftUnit === 'box' ? tier.gift_quantity * piecesPerBox : tier.gift_quantity;
              break;
            }
          }
        }
      } else {
        if (paidQty < offer.min_quantity) continue;
        const timesApplied = offer.condition_type === 'multiplier' ? Math.floor(paidQty / offer.min_quantity) : 1;
        const giftPerThreshold = offer.gift_quantity;
        if (offer.gift_quantity_unit === 'box') {
          totalGiftPieces += timesApplied * giftPerThreshold * piecesPerBox;
        } else {
          totalGiftPieces += timesApplied * giftPerThreshold;
        }
      }
    }
    // Convert pieces to boxes (gift is tracked in boxes in saleItems)
    return piecesPerBox > 0 ? Math.floor(totalGiftPieces / piecesPerBox) : 0;
  }, [activeOffers]);

  useEffect(() => {
    if (open && orderItems && orderItems.length > 0 && !initialized) {
      setSaleItems(orderItems.map(item => {
        const giftQty = Number((item as any).gift_quantity || 0);
        const paidQty = item.quantity - giftQty;
        const ppb = item.product?.pieces_per_box || 1;
        return {
          productId: item.product_id,
          productName: item.product?.name || '',
          quantity: item.quantity,
          unitPrice: Number(item.unit_price || 0),
          totalPrice: Number(item.total_price || 0) || (paidQty * Number(item.unit_price || 0)),
          originalItemId: item.id,
          originalQuantity: item.quantity,
          giftQuantity: giftQty,
          giftOfferId: (item as any).gift_offer_id || null,
          piecesPerBox: ppb,
          pricingUnit: item.product?.pricing_unit || 'box',
          weightPerBox: item.product?.weight_per_box ?? null,
        };
      }));
      setNotes(order.notes || '');
      setInitialized(true);
    }
  }, [open, orderItems, initialized, order.notes]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setSaleItems([]);
      setNotes('');
      setInitialized(false);
      setNewProductId('');
      setPartialDeliveryAction('none');
      setUseCreditBalance(false);
    }
  }, [open]);

  const getAvailable = useCallback((productId: string) =>
    stockItems?.find(s => s.product_id === productId)?.quantity || 0,
  [stockItems]);

  // Quantity handlers
  // Delta applies to PAID quantity, gift is recalculated on top (same logic as ModifyOrderDialog)
  const handleUpdateQuantity = (productId: string, delta: number) => {
    const available = getAvailable(productId);
    setSaleItems(prev =>
      prev.map(item => {
        if (item.productId !== productId) return item;
        // Current paid quantity
        const currentPaidQty = Math.max(0, item.quantity - item.giftQuantity);
        const newPaidQty = currentPaidQty + delta;
        if (newPaidQty <= 0) return { ...item, quantity: 0, totalPrice: 0, giftQuantity: 0 };
        // Recalculate gift based on new paid quantity
        const newGiftQty = recalcGift(item.productId, newPaidQty, item.piecesPerBox);
        const newTotal = newPaidQty + newGiftQty;
        // Check stock availability for the full total (paid + gift)
        if (newTotal > available && delta > 0) {
          // Try without gift if stock is limited
          if (newPaidQty > available && delta > 0) return item;
        }
        // Warn if gift changed
        const oldGift = item.giftQuantity;
        if (oldGift > 0 && newGiftQty === 0) {
          toast.warning(`⚠️ ${item.productName}: تم فقدان الهدية (${oldGift} صندوق) لأن الكمية أقل من شرط العرض`, { duration: 5000 });
        } else if (oldGift > 0 && newGiftQty < oldGift) {
          toast.warning(`⚠️ ${item.productName}: تغيرت الهدية من ${oldGift} إلى ${newGiftQty} صندوق`, { duration: 4000 });
        } else if (oldGift === 0 && newGiftQty > 0) {
          toast.success(`🎁 ${item.productName}: تم تفعيل هدية ${newGiftQty} صندوق`, { duration: 3000 });
        }
        return { 
          ...item, 
          quantity: newTotal, 
          giftQuantity: newGiftQty,
          totalPrice: newPaidQty * item.unitPrice 
        };
      }).filter(item => item.quantity > 0 || item.originalItemId)
    );
  };

  const handleRemoveItem = (productId: string) => {
    setSaleItems(prev => {
      const item = prev.find(i => i.productId === productId);
      if (item?.originalItemId) {
        // Mark as 0 quantity instead of removing
        return prev.map(i => i.productId === productId ? { ...i, quantity: 0, totalPrice: 0 } : i);
      }
      return prev.filter(i => i.productId !== productId);
    });
  };

  // Add new product from worker stock
  const handleAddNewProduct = () => {
    if (!newProductId) return;
    if (saleItems.some(i => i.productId === newProductId)) {
      toast.error(t('orders.product_already_added'));
      return;
    }
    const product = allProducts.find(p => p.id === newProductId);
    if (!product) return;
    const available = getAvailable(newProductId);
    if (available <= 0) {
      toast.error(`${product.name}: ${t('stock.no_stock')}`);
      return;
    }
    // Use a default price (gros or invoice)
    const price = Number(product.price_gros || product.price_invoice || 0);
    setSaleItems(prev => [...prev, {
      productId: product.id,
      productName: product.name,
      quantity: 1,
      unitPrice: price,
      totalPrice: price,
      originalQuantity: 0,
      giftQuantity: 0,
      giftOfferId: null,
      piecesPerBox: product.pieces_per_box || 1,
      pricingUnit: product.pricing_unit || 'box',
      weightPerBox: product.weight_per_box ?? null,
    }]);
    setNewProductId('');
  };

  // Totals
  const prepaidAmount = Number(order.prepaid_amount || 0);

  const totals = useMemo(() => {
    const activeItems = saleItems.filter(i => !shortageProductIds.has(i.productId));
    const totalItems = activeItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalGiftBoxes = activeItems.reduce((sum, item) => sum + item.giftQuantity, 0);
    const subtotal = activeItems.reduce((sum, item) => sum + item.totalPrice, 0);
    let stampAmount = 0;
    let stampPercentage = 0;
    const invoiceMethod = (order as any).invoice_payment_method;
    if (order.payment_type === 'with_invoice' && invoiceMethod === 'cash' && stampTiers?.length) {
      stampAmount = calculateStampAmount(subtotal, stampTiers);
      const activeTiers = stampTiers.filter(t => t.is_active);
      const matchedTier = activeTiers.find(t => subtotal >= t.min_amount && (t.max_amount === null || subtotal <= t.max_amount));
      if (matchedTier) stampPercentage = matchedTier.percentage;
    }
    const totalAmount = subtotal + stampAmount;
    const creditDeduction = useCreditBalance ? creditSummary.financialTotal : 0;
    const amountAfterPrepaid = Math.max(0, totalAmount - prepaidAmount - creditDeduction);
    return { totalItems, totalGiftBoxes, subtotal, stampAmount, stampPercentage, totalAmount, amountAfterPrepaid, creditDeduction };
  }, [saleItems, order.payment_type, order, stampTiers, shortageProductIds, prepaidAmount, useCreditBalance, creditSummary.financialTotal]);

  // Detect partial delivery (items reduced or removed)
  const partialDeliveryDiff = useMemo(() => {
    const diffs: { productId: string; productName: string; originalQty: number; newQty: number; diffQty: number; unitPrice: number }[] = [];
    for (const item of saleItems) {
      if (item.originalItemId && item.originalQuantity > 0 && item.quantity < item.originalQuantity) {
        diffs.push({
          productId: item.productId,
          productName: item.productName,
          originalQty: item.originalQuantity,
          newQty: item.quantity,
          diffQty: item.originalQuantity - item.quantity,
          unitPrice: item.unitPrice,
        });
      }
    }
    return diffs;
  }, [saleItems]);

  const hasPartialDelivery = partialDeliveryDiff.length > 0;

  // Validate and show payment dialog
  const handleProceedToPayment = () => {
    const activeItems = saleItems.filter(i => i.quantity > 0 && !shortageProductIds.has(i.productId));
    if (activeItems.length === 0) {
      toast.error(t('orders.add_products_error'));
      return;
    }
    // Validate stock
    for (const item of activeItems) {
      const available = getAvailable(item.productId);
      if (item.quantity > available) {
        toast.error(`${item.productName}: ${t('stock.available')} ${available}`);
        return;
      }
    }
    // If partial delivery and no action chosen
    if (hasPartialDelivery && partialDeliveryAction === 'none') {
      toast.error('يرجى اختيار إجراء التوصيل الجزئي أولاً');
      return;
    }
    // Route based on invoice payment method
    const invoiceMethod = (order as any).invoice_payment_method;
    if (order.payment_type === 'with_invoice' && invoiceMethod === 'check') {
      setShowCheckDialog(true);
    } else if (order.payment_type === 'with_invoice' && (invoiceMethod === 'receipt' || invoiceMethod === 'transfer')) {
      setShowReceiptPaymentDialog(true);
    } else {
      setShowPaymentDialog(true);
    }
  };

  // Handle check verification confirmation
  const handleCheckConfirm = async (data: {
    checkReceived: boolean;
    verification: any;
    skippedVerification: boolean;
    checkAmount?: number;
    remainingAction?: 'debt' | 'another_check';
    remainingAmount?: number;
  }) => {
    const actualCheckAmount = data.checkAmount ?? (data.checkReceived ? totals.amountAfterPrepaid : 0);
    const paidAmount = data.checkReceived ? actualCheckAmount : 0;
    const remaining = data.checkReceived ? Math.max(0, totals.amountAfterPrepaid - actualCheckAmount) : totals.amountAfterPrepaid;
    const isFullPayment = data.checkReceived && remaining <= 0;

    // Update document status on order
    const docStatus = data.checkReceived ? (data.skippedVerification ? 'pending' : 'received') : 'pending';
    const docVerification = data.checkReceived ? {
      type: 'check',
      ...data.verification,
      check_amount: actualCheckAmount,
      remaining_action: data.remainingAction,
      skipped: data.skippedVerification,
      verified_at: new Date().toISOString(),
    } : { type: 'check', status: 'not_received' };

    await supabase.from('orders').update({
      document_status: docStatus,
      document_verification: docVerification,
      check_due_date: data.verification?.due_date || null,
    }).eq('id', order.id);

    // If remaining amount exists and action is 'another_check', create a pending document collection
    if (data.remainingAction === 'another_check' && remaining > 0) {
      await supabase.from('orders').update({
        doc_collection_type: 'weekly',
        doc_due_date: null,
      }).eq('id', order.id);
    }

    await handlePaymentConfirm({
      paidAmount,
      remainingAmount: remaining,
      paymentMethod: 'check',
      isFullPayment,
      isNoPayment: !data.checkReceived,
      notes: data.remainingAction === 'another_check' && remaining > 0
        ? `شيك جزئي - المتبقي ${remaining.toLocaleString()} دج مسند لشيك آخر`
        : undefined,
    });
    setShowCheckDialog(false);
  };

  // Handle receipt/transfer payment confirmation
  const handleReceiptPaymentConfirm = async (data: {
    receiptReceived: boolean;
    paidByCash: boolean;
    receiptAmount: number;
    cashAmount: number;
    remainingDebt: number;
  }) => {
    const invoiceMethod = (order as any).invoice_payment_method;
    const docStatus = data.receiptReceived ? 'received' : (data.paidByCash ? 'none' : 'pending');
    const docVerification = {
      type: invoiceMethod,
      receipt_received: data.receiptReceived,
      paid_by_cash: data.paidByCash,
      receipt_amount: data.receiptAmount,
      cash_amount: data.cashAmount,
      verified_at: new Date().toISOString(),
    };

    await supabase.from('orders').update({
      document_status: docStatus,
      document_verification: docVerification,
    }).eq('id', order.id);

    const paid = data.receiptAmount + data.cashAmount;
    const isFullPayment = paid >= totals.amountAfterPrepaid;

    await handlePaymentConfirm({
      paidAmount: Math.min(paid, totals.amountAfterPrepaid),
      remainingAmount: data.remainingDebt,
      paymentMethod: data.paidByCash ? 'cash' : invoiceMethod,
      isFullPayment,
      isNoPayment: paid === 0,
    });
    setShowReceiptPaymentDialog(false);
  };

  const handlePaymentConfirm = async (paymentData: {
    paidAmount: number;
    remainingAmount: number;
    paymentMethod: string;
    notes?: string;
    isFullPayment: boolean;
    isNoPayment?: boolean;
    overpaymentAction?: 'refund' | 'credit';
    overpaymentAmount?: number;
  }) => {
    setIsSaving(true);
    try {
      const activeItems = saleItems.filter(i => i.quantity > 0 && !shortageProductIds.has(i.productId));
      const changes: Record<string, any>[] = [];

      // Update order items in DB
      for (const item of saleItems) {
        if (item.originalItemId) {
          if (item.quantity === 0) {
            // Delete removed item
            await supabase.from('order_items').delete().eq('id', item.originalItemId);
            changes.push({ منتج: item.productName, من: item.originalQuantity, إلى: 0, عملية: 'حذف' });
          } else if (item.quantity !== item.originalQuantity) {
            // Update changed quantity
            await supabase.from('order_items').update({
              quantity: item.quantity,
              unit_price: item.unitPrice,
              total_price: item.totalPrice,
              gift_quantity: item.giftQuantity || 0,
            }).eq('id', item.originalItemId);
            changes.push({ منتج: item.productName, من: item.originalQuantity, إلى: item.quantity });
          }
        } else if (item.quantity > 0) {
          // Insert new item
          await supabase.from('order_items').insert({
            order_id: order.id,
            product_id: item.productId,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            total_price: item.totalPrice,
            gift_quantity: item.giftQuantity || 0,
          });
          changes.push({ منتج: item.productName, كمية: item.quantity, عملية: 'إضافة جديد' });
        }
      }

      // Determine correct payment status based on invoice payment method
      let paymentStatus: string;
      if (paymentData.isNoPayment) {
        paymentStatus = 'pending';
      } else if (!paymentData.isFullPayment) {
        paymentStatus = 'partial';
      } else if (order.payment_type === 'with_invoice' && (order as any).invoice_payment_method === 'check') {
        paymentStatus = 'check';
      } else {
        paymentStatus = 'cash';
      }
      const { error: statusError } = await supabase.from('orders').update({
        status: 'delivered',
        total_amount: totals.totalAmount,
        payment_status: paymentStatus,
        partial_amount: paymentData.isFullPayment ? null : paymentData.paidAmount,
        updated_at: new Date().toISOString(),
      }).eq('id', order.id);

      if (statusError) {
        console.error('Failed to update order status:', statusError);
        throw new Error('فشل تحديث حالة الطلبية: ' + statusError.message);
      }

      // Deduct from worker stock
      for (const item of activeItems) {
        const ws = stockItems?.find(s => s.product_id === item.productId);
        if (ws) {
          await supabase.from('worker_stock')
            .update({ quantity: ws.quantity - item.quantity })
            .eq('id', ws.id);
        }
        // Record stock movement
        await supabase.from('stock_movements').insert({
          product_id: item.productId,
          branch_id: order.branch_id || activeBranch?.id || null,
          quantity: item.quantity,
          movement_type: 'delivery',
          status: 'approved',
          created_by: workerId!,
          worker_id: workerId!,
          order_id: order.id,
          notes: 'بيع بالتوصيل',
        });
      }

      // Record gifts in promos table
      const giftItems = activeItems.filter(i => i.giftQuantity > 0);
      for (const item of giftItems) {
        await supabase.from('promos').insert({
          worker_id: workerId!,
          customer_id: order.customer_id,
          product_id: item.productId,
          vente_quantity: item.quantity - item.giftQuantity,
          gratuite_quantity: item.giftQuantity,
          has_bonus: false,
          bonus_amount: 0,
          notes: `هدية عرض - طلبية ${order.id.slice(0, 8)}`,
        });
      }

      // Create debt if partial payment
      if (!paymentData.isFullPayment && paymentData.remainingAmount > 0) {
        await createDebt.mutateAsync({
          customer_id: order.customer_id,
          order_id: order.id,
          worker_id: workerId!,
          branch_id: order.branch_id || activeBranch?.id,
          total_amount: paymentData.remainingAmount,
          paid_amount: 0,
          notes: paymentData.notes,
        });
        toast.success(t('debts.debt_recorded'));
      } else {
        toast.success(t('debts.payment_success'));
      }

      // Handle overpayment - add to customer credit balance + record in surplus treasury
      if (paymentData.overpaymentAction === 'credit' && paymentData.overpaymentAmount && paymentData.overpaymentAmount > 0) {
        await createCredit.mutateAsync({
          customer_id: order.customer_id,
          credit_type: 'financial',
          amount: paymentData.overpaymentAmount,
          order_id: order.id,
          worker_id: workerId!,
          branch_id: order.branch_id || activeBranch?.id,
          notes: `فائض مالي من الطلبية ${order.id.slice(0, 8)}`,
        });
        // Also record in surplus/deficit treasury
        await supabase.from('manager_treasury').insert({
          manager_id: workerId!,
          branch_id: order.branch_id || activeBranch?.id || null,
          source_type: 'customer_surplus',
          payment_method: 'cash',
          amount: paymentData.overpaymentAmount,
          customer_name: order.customer?.name || '',
          notes: `فائض مالي من عميل - طلبية ${order.id.slice(0, 8)}`,
        });
      }

      // Use credit balance if opted
      if (useCreditBalance && customerCredits && customerCredits.length > 0) {
        const financialCredits = customerCredits.filter(c => c.credit_type === 'financial' && c.status === 'approved' && !c.is_used);
        for (const credit of financialCredits) {
          await markCreditUsed.mutateAsync({ creditId: credit.id, orderId: order.id });
        }
      }

      // Log activity
      await logActivity.mutateAsync({
        actionType: 'status_change',
        entityType: 'order',
        entityId: order.id,
        details: {
          الحالة_الجديدة: t('orders.delivered'),
          المبلغ_المدفوع: paymentData.paidAmount,
          الدين: paymentData.remainingAmount,
          ...(changes.length > 0 ? { التعديلات: changes } : {}),
        },
      });

      queryClient.invalidateQueries({ queryKey: ['orders'] });

      // Create new order for remaining quantities if partial delivery with create_order action
      if (partialDeliveryAction === 'create_order' && partialDeliveryDiff.length > 0) {
        try {
          const { data: newOrder, error: newOrderError } = await supabase
            .from('orders')
            .insert({
              customer_id: order.customer_id,
              created_by: workerId!,
              assigned_worker_id: order.assigned_worker_id,
              branch_id: order.branch_id,
              status: order.assigned_worker_id ? 'assigned' : 'pending',
              payment_type: order.payment_type,
              invoice_payment_method: order.invoice_payment_method,
              notes: `طلبية فارق - توصيل جزئي من الطلبية ${order.id.slice(0, 8)}`,
            })
            .select()
            .single();

          if (!newOrderError && newOrder) {
            const newItems = partialDeliveryDiff.map(diff => ({
              order_id: newOrder.id,
              product_id: diff.productId,
              quantity: diff.diffQty,
              unit_price: diff.unitPrice,
              total_price: diff.diffQty * diff.unitPrice,
            }));
            await supabase.from('order_items').insert(newItems);
            const newTotal = newItems.reduce((s, i) => s + i.total_price, 0);
            await supabase.from('orders').update({ total_amount: newTotal }).eq('id', newOrder.id);
            toast.success(`تم إنشاء طلبية جديدة بالفارق (${partialDeliveryDiff.map(d => `${d.diffQty} ${d.productName}`).join(', ')})`);
          }
        } catch (err) {
          console.error('Error creating partial delivery order:', err);
          toast.error('فشل إنشاء طلبية الفارق');
        }
      }

      // Track delivery visit GPS
      trackVisit({ customerId: order.customer_id, operationType: 'delivery', operationId: order.id });
      queryClient.invalidateQueries({ queryKey: ['assigned-orders'] });
      queryClient.invalidateQueries({ queryKey: ['order-items'] });
      queryClient.invalidateQueries({ queryKey: ['my-worker-stock'] });

      setShowPaymentDialog(false);

      // Build receipt data and show receipt dialog
      const receiptItems: ReceiptItem[] = activeItems.map(item => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        giftQuantity: item.giftQuantity > 0 ? item.giftQuantity : undefined,
        giftPieces: (item as any).giftPieces > 0 ? (item as any).giftPieces : undefined,
      }));

      setReceiptDataState({
        receiptType: 'delivery' as ReceiptType,
        orderId: order.id,
        debtId: null,
        customerId: order.customer_id,
        customerName: order.customer?.name || '',
        customerPhone: order.customer?.phone || null,
        workerId: workerId!,
        workerName: '',
        workerPhone: null,
        branchId: order.branch_id || activeBranch?.id || null,
        items: receiptItems,
        totalAmount: totals.totalAmount,
        discountAmount: 0,
        paidAmount: paymentData.paidAmount,
        remainingAmount: paymentData.remainingAmount,
        paymentMethod: paymentData.paymentMethod,
        notes: notes || null,
        orderPaymentType: order.payment_type || undefined,
        orderPriceSubtype: order.customer?.default_price_subtype || undefined,
        orderInvoicePaymentMethod: order.invoice_payment_method || undefined,
        stampAmount: totals.stampAmount > 0 ? totals.stampAmount : undefined,
        stampPercentage: totals.stampPercentage > 0 ? totals.stampPercentage : undefined,
      });
      setShowReceiptDialog(true);
      onOpenChange(false);
    } catch (error: any) {
      console.error('Delivery sale error:', error);
      toast.error(error.message || t('common.error'));
    } finally {
      setIsSaving(false);
    }
  };

  // Products available in worker stock but not in current items
  const availableNewProducts = useMemo(() => {
    const existingIds = new Set(saleItems.map(i => i.productId));
    return (stockItems || [])
      .filter(s => s.quantity > 0 && s.product && !existingIds.has(s.product_id))
      .map(s => s.product!)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [stockItems, saleItems]);

  if (isLoadingItems) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg" dir={dir}>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] p-0 gap-0 overflow-hidden" dir={dir}>
          <DialogHeader className="p-4 pb-2 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              {t('orders.delivery_sale') || 'بيع بالتوصيل'}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(90vh-8rem)] px-4">
            <div className="py-4 space-y-5">
              {/* Customer Info */}
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
                    {(order.customer?.store_name || order.customer?.name)?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-bold">{order.customer?.store_name || order.customer?.name}</p>
                      {(order.customer as any)?.sector && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 h-4">
                          {(order.customer as any).sector?.name}
                        </Badge>
                      )}
                      <CustomerCreditBadges customerId={order.customer_id} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {order.customer?.store_name ? order.customer?.name : ''}
                      {order.customer?.phone && `${order.customer?.store_name ? ' • ' : ''}${order.customer.phone}`}
                      {order.customer?.wilaya && ` • ${order.customer.wilaya}`}
                    </p>
                    {/* Payment info badges */}
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      <Badge variant="outline" className="text-[10px] px-1.5 h-4">
                        {order.payment_type === 'with_invoice' ? 'فاتورة' : 'بدون فاتورة'}
                      </Badge>
                      {order.payment_type === 'with_invoice' && order.invoice_payment_method && (
                        <Badge variant="outline" className="text-[10px] px-1.5 h-4 border-primary/50 text-primary">
                          {INVOICE_PAYMENT_METHODS[order.invoice_payment_method as InvoicePaymentMethod]?.label || order.invoice_payment_method}
                        </Badge>
                      )}
                      {order.payment_type === 'with_invoice' && orderItems?.[0]?.price_subtype && (
                        <Badge variant="outline" className="text-[10px] px-1.5 h-4 border-accent-foreground/30">
                          {orderItems[0].price_subtype === 'super_gros' ? 'Super Gros' : orderItems[0].price_subtype === 'gros' ? 'Gros' : 'Détail'}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <CustomerDistanceIndicator
                  customerLatitude={order.customer?.latitude}
                  customerLongitude={order.customer?.longitude}
                />
              </div>

              {/* Prominent prepaid alert banner */}
              {prepaidAmount > 0 && (
                <Alert className="border-2 border-emerald-400 dark:border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30">
                  <Banknote className="h-5 w-5 text-emerald-600" />
                  <AlertDescription className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-emerald-700 dark:text-emerald-400">💰 هذه الطلبية مدفوعة مسبقاً</p>
                      <p className="text-sm text-emerald-600 dark:text-emerald-400">
                        تم دفع <strong>{prepaidAmount.toLocaleString()} {t('common.currency')}</strong> مسبقاً — حصّل المتبقي فقط
                      </p>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Current Items */}
              <section className="space-y-3">
                <Label className="text-base font-semibold">{t('nav.products')}</Label>
                <div className="space-y-2 bg-muted/50 rounded-lg p-3">
                  {saleItems.map((item) => {
                    const available = getAvailable(item.productId);
                    const changed = item.quantity !== item.originalQuantity;
                    const isShortage = shortageProductIds.has(item.productId);
                    const unitCount = item.pricingUnit === 'kg' && item.weightPerBox && item.weightPerBox > 0
                      ? item.weightPerBox
                      : item.pricingUnit === 'unit' && item.piecesPerBox > 1
                        ? item.piecesPerBox
                        : null;
                    return (
                      <div
                        key={item.productId}
                        className={`flex items-center justify-between gap-2 p-2 rounded-lg ${
                          isShortage ? 'opacity-50 bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800' :
                          item.quantity === 0 ? 'opacity-40 bg-destructive/5' :
                          changed ? 'bg-primary/5 border border-primary/20' : ''
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`font-medium text-sm truncate block ${isShortage ? 'line-through text-muted-foreground' : ''}`}>{item.productName}</span>
                            {isShortage && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <PackageX className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{t('stock.product_unavailable_short')}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          {isShortage ? (
                            <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">
                              {t('stock.product_unavailable_short')}
                            </span>
                          ) : (
                            <>
                          {item.giftQuantity > 0 && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 border-green-500 text-green-600">
                                  <Gift className="w-3 h-3 ms-0.5" />
                                  {item.giftQuantity} {t('common.free')}
                                </Badge>
                              )}
                              {item.unitPrice > 0 && item.quantity > 0 && (
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-xs text-muted-foreground">
                                    {item.unitPrice.toLocaleString()} {t('common.currency')} × {Math.max(0, item.quantity - item.giftQuantity)} = {item.totalPrice.toLocaleString()} {t('common.currency')}
                                  </span>
                                  {unitCount !== null && (
                                    <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                                      {Number.isInteger(unitCount) ? unitCount : unitCount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    </span>
                                  )}
                                </div>
                              )}
                              {available > 0 && (
                                <span className="text-xs text-muted-foreground block">
                                  {t('stock.available')}: {available}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        {!isShortage && (
                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button" variant="outline" size="icon" className="h-7 w-7"
                              onClick={() => handleUpdateQuantity(item.productId, -1)}
                            >
                              <Minus className="w-3 h-3" />
                            </Button>
                            <div className="flex flex-col items-center min-w-8">
                              <span className="font-bold text-sm">{Math.max(0, item.quantity - item.giftQuantity)}</span>
                              {item.giftQuantity > 0 && (
                                <span className="text-[9px] text-green-600 dark:text-green-400 leading-none">+{item.giftQuantity} 🎁</span>
                              )}
                            </div>
                            <Button
                              type="button" variant="outline" size="icon" className="h-7 w-7"
                              onClick={() => handleUpdateQuantity(item.productId, 1)}
                              disabled={item.quantity >= available}
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                            <Button
                              type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleRemoveItem(item.productId)}
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                        {changed && item.originalQuantity > 0 && !isShortage && (
                          <Badge variant="secondary" className="text-[10px]">
                            {item.originalQuantity} → {item.quantity}
                          </Badge>
                        )}
                        {!item.originalItemId && !isShortage && (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-[10px]">
                            {t('common.new')}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Add new product from worker stock */}
              {availableNewProducts.length > 0 && (
                <section className="space-y-2">
                  <Label className="text-sm font-medium text-muted-foreground">{t('orders.add_product')}</Label>
                  <div className="flex gap-2">
                    <Select value={newProductId} onValueChange={setNewProductId}>
                      <SelectTrigger className="flex-1 h-9">
                        <SelectValue placeholder={t('stock.product')} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableNewProducts.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({getAvailable(p.id)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" onClick={handleAddNewProduct} disabled={!newProductId}>
                      <PlusCircle className="w-4 h-4" />
                    </Button>
                  </div>
                </section>
              )}

              {/* Partial Delivery Alert */}
              {hasPartialDelivery && (
                <section className="space-y-3">
                  <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-sm">
                      <p className="font-semibold mb-2">توصيل جزئي - منتجات ناقصة:</p>
                      <ul className="space-y-1 mb-3">
                        {partialDeliveryDiff.map(diff => (
                          <li key={diff.productId} className="flex justify-between text-xs">
                            <span>{diff.productName}</span>
                            <span className="font-mono">{diff.originalQty} → {diff.newQty} (ناقص: {diff.diffQty})</span>
                          </li>
                        ))}
                      </ul>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={partialDeliveryAction === 'create_order' ? 'default' : 'outline'}
                          className="text-xs h-9"
                          onClick={() => setPartialDeliveryAction('create_order')}
                        >
                          <Copy className="w-3 h-3 me-1" />
                          إنشاء طلبية بالفارق
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={partialDeliveryAction === 'deliver_only' ? 'default' : 'outline'}
                          className="text-xs h-9"
                          onClick={() => setPartialDeliveryAction('deliver_only')}
                        >
                          <Package className="w-3 h-3 me-1" />
                          توصيل المتوفر فقط
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                </section>
              )}

              {/* Summary */}
              {saleItems.some(i => i.quantity > 0) && (
                <section className="bg-muted/50 rounded-lg p-3 space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t('common.quantity')}:</span>
                    <span className="font-medium">{totals.totalItems} {totals.totalItems > 1 ? t('common.boxes') : t('common.box')}</span>
                  </div>
                  {totals.totalGiftBoxes > 0 && (
                    <div className="flex items-center justify-between text-sm text-green-600 dark:text-green-400">
                      <span className="flex items-center gap-1">
                        <Gift className="w-3 h-3" />
                        {t('offers.gift')}:
                      </span>
                      <span className="font-medium">{totals.totalGiftBoxes} {t('common.free')}</span>
                    </div>
                  )}
                  {totals.subtotal > 0 && (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{t('orders.subtotal')}:</span>
                        <span className="font-medium">{totals.subtotal.toLocaleString()} {t('common.currency')}</span>
                      </div>
                      {totals.stampAmount > 0 && (
                        <div className="flex items-center justify-between text-sm text-amber-600 dark:text-amber-400">
                          <span className="flex items-center gap-1">
                            <Stamp className="w-3 h-3" />
                            {t('orders.stamp_tax')}:
                          </span>
                          <span className="font-medium">
                            {totals.stampAmount.toLocaleString('ar-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {t('common.currency')}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-base font-bold pt-2 border-t border-border/50">
                        <span>{t('orders.grand_total')}:</span>
                        <span className="text-primary">
                          {totals.totalAmount.toLocaleString('ar-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {t('common.currency')}
                        </span>
                      </div>
                      {prepaidAmount > 0 && (
                        <div className="bg-emerald-100 dark:bg-emerald-900/30 border-2 border-emerald-400 dark:border-emerald-600 rounded-lg p-3 space-y-1 animate-pulse-once">
                          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                            <Banknote className="w-5 h-5" />
                            <span className="font-bold text-sm">⚠️ طلبية بدفع مسبق!</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-emerald-600 dark:text-emerald-400">المبلغ المدفوع مسبقاً:</span>
                            <span className="font-bold text-emerald-700 dark:text-emerald-300 text-base">
                              {prepaidAmount.toLocaleString()} {t('common.currency')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm font-bold">
                            <span className="text-primary">المتبقي للتحصيل:</span>
                            <span className="text-primary text-base">
                              {totals.amountAfterPrepaid.toLocaleString('ar-DZ', { minimumFractionDigits: 2 })} {t('common.currency')}
                            </span>
                          </div>
                        </div>
                      )}
                      {/* Credit balance usage prompt */}
                      {creditSummary.hasFinancial && (
                        <div className="flex items-center justify-between text-sm py-1">
                          <button
                            type="button"
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                              useCreditBalance
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                            }`}
                            onClick={() => setUseCreditBalance(!useCreditBalance)}
                          >
                            <DollarSign className="w-3.5 h-3.5" />
                            {useCreditBalance ? 'تم خصم رصيد العميل' : 'خصم رصيد العميل؟'}
                          </button>
                          {useCreditBalance && (
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">
                              - {creditSummary.financialTotal.toLocaleString()} {t('common.currency')}
                            </span>
                          )}
                        </div>
                      )}
                      {(prepaidAmount > 0 || useCreditBalance) && (
                        <div className="flex items-center justify-between text-base font-bold text-primary">
                          <span>المبلغ المتبقي:</span>
                          <span>{totals.amountAfterPrepaid.toLocaleString('ar-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {t('common.currency')}</span>
                        </div>
                      )}
                    </>
                  )}
                </section>
              )}

              {/* Notes */}
              <section className="space-y-2">
                <Label>{t('common.notes')} ({t('common.optional')})</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </section>
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="p-4 border-t bg-background">
            <Button
              onClick={handleProceedToPayment}
              className="w-full h-12 text-base bg-green-600 hover:bg-green-700"
              disabled={isSaving || !saleItems.some(i => i.quantity > 0 && !shortageProductIds.has(i.productId))}
            >
              {isSaving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <CheckCircle className="w-5 h-5 ms-2" />
              )}
              {t('orders.confirm_delivery') || 'تأكيد التوصيل'}
              {totals.amountAfterPrepaid > 0 && (
                <Badge variant="secondary" className="mr-2 bg-white/20">
                  {totals.amountAfterPrepaid.toLocaleString()} {t('common.currency')}
                </Badge>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog - Cash/Without Invoice */}
      <DeliveryPaymentDialog
        open={showPaymentDialog}
        onOpenChange={setShowPaymentDialog}
        orderTotal={totals.amountAfterPrepaid}
        customerName={order.customer?.name || ''}
        prepaidAmount={prepaidAmount}
        onConfirm={handlePaymentConfirm}
      />

      {/* Check Verification Dialog */}
      <CheckVerificationDialog
        open={showCheckDialog}
        onOpenChange={setShowCheckDialog}
        orderTotal={totals.amountAfterPrepaid}
        customerName={order.customer?.name || ''}
        onConfirm={handleCheckConfirm}
      />

      {/* Receipt/Transfer Payment Dialog */}
      <ReceiptPaymentDialog
        open={showReceiptPaymentDialog}
        onOpenChange={setShowReceiptPaymentDialog}
        orderTotal={totals.amountAfterPrepaid}
        customerName={order.customer?.name || ''}
        paymentMethod={((order as any).invoice_payment_method === 'transfer' ? 'transfer' : 'receipt') as 'receipt' | 'transfer'}
        onConfirm={handleReceiptPaymentConfirm}
      />

      {/* Receipt Dialog */}
      {receiptDataState && (
        <ReceiptDialog
          open={showReceiptDialog}
          onOpenChange={setShowReceiptDialog}
          receiptData={receiptDataState}
        />
      )}
    </>
  );
};

export default DeliverySaleDialog;
