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
  XCircle, Package, PlusCircle, Stamp, CheckCircle, PackageX, Gift
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { OrderWithDetails, OrderItem, Product } from '@/types/database';
import { useActiveStampTiers, calculateStampAmount } from '@/hooks/useStampTiers';
import { useCreateDebt } from '@/hooks/useCustomerDebts';
import { useLogActivity } from '@/hooks/useActivityLogs';
import { useTrackVisit } from '@/hooks/useVisitTracking';
import { useOrderItems } from '@/hooks/useOrders';
import DeliveryPaymentDialog from '@/components/orders/DeliveryPaymentDialog';
import ProductQuantityDialog from '@/components/orders/ProductQuantityDialog';
import { useQueryClient, useQuery } from '@tanstack/react-query';

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
}

const DeliverySaleDialog: React.FC<DeliverySaleDialogProps> = ({ open, onOpenChange, order }) => {
  const { workerId, activeBranch } = useAuth();
  const { t, dir } = useLanguage();
  const queryClient = useQueryClient();
  const { data: stampTiers } = useActiveStampTiers();
  const createDebt = useCreateDebt();
  const logActivity = useLogActivity();
  const { trackVisit } = useTrackVisit();

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
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [receiptDataState, setReceiptDataState] = useState<any>(null);
  const [showQuantityDialog, setShowQuantityDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [newProductId, setNewProductId] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Fetch products for adding
  useEffect(() => {
    if (!open) return;
    const fetch = async () => {
      const { data } = await supabase.from('products').select('*').eq('is_active', true).order('name');
      setAllProducts(data || []);
    };
    fetch();
  }, [open]);

  // Initialize sale items from order items
  useEffect(() => {
    if (open && orderItems && orderItems.length > 0 && !initialized) {
      setSaleItems(orderItems.map(item => {
        const giftQty = Number((item as any).gift_quantity || 0);
        const paidQty = item.quantity - giftQty;
        return {
          productId: item.product_id,
          productName: item.product?.name || '',
          quantity: item.quantity,
          unitPrice: Number(item.unit_price || 0),
          totalPrice: Number(item.total_price || 0) || (paidQty * Number(item.unit_price || 0)),
          originalItemId: item.id,
          originalQuantity: item.quantity,
          giftQuantity: giftQty,
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
    }
  }, [open]);

  const getAvailable = useCallback((productId: string) =>
    stockItems?.find(s => s.product_id === productId)?.quantity || 0,
  [stockItems]);

  // Quantity handlers
  const handleUpdateQuantity = (productId: string, delta: number) => {
    const available = getAvailable(productId);
    setSaleItems(prev =>
      prev.map(item => {
        if (item.productId !== productId) return item;
        const newQty = item.quantity + delta;
        if (newQty <= 0) return { ...item, quantity: 0, totalPrice: 0 };
        if (newQty > available && delta > 0) return item;
        const paidQty = Math.max(0, newQty - item.giftQuantity);
        return { ...item, quantity: newQty, totalPrice: paidQty * item.unitPrice };
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
    }]);
    setNewProductId('');
  };

  // Totals
  const totals = useMemo(() => {
    const activeItems = saleItems.filter(i => !shortageProductIds.has(i.productId));
    const totalItems = activeItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalGiftBoxes = activeItems.reduce((sum, item) => sum + item.giftQuantity, 0);
    const subtotal = activeItems.reduce((sum, item) => sum + item.totalPrice, 0);
    let stampAmount = 0;
    const invoiceMethod = (order as any).invoice_payment_method;
    if (order.payment_type === 'with_invoice' && invoiceMethod === 'cash' && stampTiers?.length) {
      stampAmount = calculateStampAmount(subtotal, stampTiers);
    }
    return { totalItems, totalGiftBoxes, subtotal, stampAmount, totalAmount: subtotal + stampAmount };
  }, [saleItems, order.payment_type, order, stampTiers, shortageProductIds]);

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
    setShowPaymentDialog(true);
  };

  const handlePaymentConfirm = async (paymentData: {
    paidAmount: number;
    remainingAmount: number;
    paymentMethod: string;
    notes?: string;
    isFullPayment: boolean;
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
          });
          changes.push({ منتج: item.productName, كمية: item.quantity, عملية: 'إضافة جديد' });
        }
      }

      // Determine correct payment status based on invoice payment method
      let paymentStatus: string;
      if (!paymentData.isFullPayment) {
        paymentStatus = 'partial';
      } else if (order.payment_type === 'with_invoice' && (order as any).invoice_payment_method === 'check') {
        paymentStatus = 'check';
      } else {
        paymentStatus = 'cash';
      }
      await supabase.from('orders').update({
        status: 'delivered',
        total_amount: totals.totalAmount,
        payment_status: paymentStatus,
        partial_amount: paymentData.isFullPayment ? null : paymentData.paidAmount,
        updated_at: new Date().toISOString(),
      }).eq('id', order.id);

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
                    {order.customer?.name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <p className="font-bold">{order.customer?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.customer?.wilaya}
                      {order.customer?.phone && ` • ${order.customer.phone}`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Current Items */}
              <section className="space-y-3">
                <Label className="text-base font-semibold">{t('nav.products')}</Label>
                <div className="space-y-2 bg-muted/50 rounded-lg p-3">
                  {saleItems.map((item) => {
                    const available = getAvailable(item.productId);
                    const changed = item.quantity !== item.originalQuantity;
                    const isShortage = shortageProductIds.has(item.productId);
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
                                <span className="text-xs text-muted-foreground">
                                  {item.unitPrice.toLocaleString()} {t('common.currency')} × {Math.max(0, item.quantity - item.giftQuantity)} = {item.totalPrice.toLocaleString()} {t('common.currency')}
                                </span>
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
                            <span className="w-8 text-center font-bold text-sm">{item.quantity}</span>
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
              {totals.totalAmount > 0 && (
                <Badge variant="secondary" className="mr-2 bg-white/20">
                  {totals.totalAmount.toLocaleString()} {t('common.currency')}
                </Badge>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <DeliveryPaymentDialog
        open={showPaymentDialog}
        onOpenChange={setShowPaymentDialog}
        orderTotal={totals.totalAmount}
        customerName={order.customer?.name || ''}
        onConfirm={handlePaymentConfirm}
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
