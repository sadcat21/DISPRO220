import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ReceiptDialog from '@/components/printing/ReceiptDialog';
import { ReceiptItem, ReceiptType } from '@/types/receipt';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Truck, Plus, Minus, Loader2, User,
  Receipt, ReceiptText, XCircle, Package, Check, ChevronsUpDown, Stamp, Gift
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Customer, Product, PaymentType, PriceSubType } from '@/types/database';
import { InvoicePaymentMethod } from '@/types/stamp';
import { useActiveStampTiers, calculateStampAmount } from '@/hooks/useStampTiers';
import { useCreateDebt } from '@/hooks/useCustomerDebts';
import ProductQuantityDialog from '@/components/orders/ProductQuantityDialog';
import InvoicePaymentMethodSelect from '@/components/orders/InvoicePaymentMethodSelect';
import DeliveryPaymentDialog from '@/components/orders/DeliveryPaymentDialog';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useTrackVisit } from '@/hooks/useVisitTracking';

interface StockItem {
  id: string;
  product_id: string;
  quantity: number;
  product?: Product;
}

interface DirectSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stockItems: StockItem[];
  initialCustomerId?: string;
}

interface OrderItemWithPrice {
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  giftQuantity?: number;
  giftOfferId?: string;
}

const DirectSaleDialog: React.FC<DirectSaleDialogProps> = ({ open, onOpenChange, stockItems, initialCustomerId }) => {
  const { workerId, activeBranch, user } = useAuth();
  const { t, dir } = useLanguage();
  const queryClient = useQueryClient();
  const { data: stampTiers } = useActiveStampTiers();
  const createDebt = useCreateDebt();
  const { trackVisit } = useTrackVisit();
  // Data states
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Form states
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [orderItems, setOrderItems] = useState<OrderItemWithPrice[]>([]);
  const [notes, setNotes] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('with_invoice');
  const [priceSubType, setPriceSubType] = useState<PriceSubType>('gros');
  const [invoicePaymentMethod, setInvoicePaymentMethod] = useState<InvoicePaymentMethod | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // CRITICAL: Frozen state values captured at save time - immune to customer defaults
  const [frozenPaymentType, setFrozenPaymentType] = useState<PaymentType>('with_invoice');
  const [frozenInvoiceMethod, setFrozenInvoiceMethod] = useState<InvoicePaymentMethod | null>(null);

  // Pricing groups
  const [pricingGroupMappings, setPricingGroupMappings] = useState<{ group_id: string; product_id: string }[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);

  // Dialogs
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [showQuantityDialog, setShowQuantityDialog] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);

  // Derived
  const selectedCustomer = useMemo(() =>
    customers.find(c => c.id === selectedCustomerId),
    [customers, selectedCustomerId]
  );

  // Available products from worker stock
  const availableProducts = useMemo(() => {
    return stockItems
      .filter(s => s.quantity > 0 && s.product)
      .map(s => s.product!)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [stockItems]);

  useEffect(() => {
    if (open && workerId) {
      fetchData();
      if (initialCustomerId) {
        setSelectedCustomerId(initialCustomerId);
      }
    }
  }, [open, workerId, activeBranch, initialCustomerId]);

  const fetchData = async () => {
    setIsLoadingData(true);
    try {
      let customersQuery = supabase.from('customers').select('*').order('name');
      if (activeBranch) customersQuery = customersQuery.eq('branch_id', activeBranch.id);

      const [customersRes, mappingsRes, productsRes] = await Promise.all([
        customersQuery,
        supabase.from('product_pricing_groups').select('group_id, product_id'),
        supabase.from('products').select('*').eq('is_active', true),
      ]);

      setCustomers(customersRes.data || []);
      setPricingGroupMappings(mappingsRes.data || []);
      setAllProducts(productsRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoadingData(false);
    }
  };

  const resetForm = useCallback(() => {
    setSelectedCustomerId('');
    setOrderItems([]);
    setNotes('');
    setPaymentType('with_invoice');
    setPriceSubType('gros');
    setInvoicePaymentMethod(null);
    setCustomerDropdownOpen(false);
  }, []);

  const handleClose = useCallback((isOpen: boolean) => {
    if (!isOpen) resetForm();
    onOpenChange(isOpen);
  }, [onOpenChange, resetForm]);

  // Pricing group logic
  const getEffectiveProduct = useCallback((productId: string): Product | undefined => {
    const directProduct = allProducts.find(p => p.id === productId) ||
      stockItems.find(s => s.product_id === productId)?.product;
    if (!directProduct) return undefined;

    const mapping = pricingGroupMappings.find(m => m.product_id === productId);
    if (!mapping) return directProduct;

    const groupProductIds = pricingGroupMappings.filter(m => m.group_id === mapping.group_id).map(m => m.product_id);
    const refProduct = groupProductIds
      .map(id => allProducts.find(p => p.id === id))
      .filter(Boolean)
      .find(p => p!.price_invoice !== null && p!.price_invoice !== 0) as Product | undefined;

    if (!refProduct || refProduct.id === productId) return directProduct;

    return {
      ...directProduct,
      price_invoice: directProduct.price_invoice || refProduct.price_invoice,
      price_super_gros: directProduct.price_super_gros || refProduct.price_super_gros,
      price_gros: directProduct.price_gros || refProduct.price_gros,
      price_retail: directProduct.price_retail || refProduct.price_retail,
    };
  }, [allProducts, stockItems, pricingGroupMappings]);

  const getProductPrice = useCallback((product: Product): number => {
    const effective = getEffectiveProduct(product.id) || product;
    let basePrice = 0;
    if (paymentType === 'with_invoice') {
      basePrice = effective.price_invoice || 0;
    } else {
      switch (priceSubType) {
        case 'super_gros': basePrice = effective.price_super_gros || effective.price_no_invoice || 0; break;
        case 'gros': basePrice = effective.price_gros || effective.price_no_invoice || 0; break;
        case 'retail': basePrice = effective.price_retail || effective.price_no_invoice || 0; break;
        default: basePrice = effective.price_gros || effective.price_no_invoice || 0;
      }
    }
    // If pricing is per kg, multiply by weight_per_box to get box price
    if (effective.pricing_unit === 'kg' && effective.weight_per_box) {
      return basePrice * effective.weight_per_box;
    }
    return basePrice;
  }, [paymentType, priceSubType, getEffectiveProduct]);

  const getAvailable = (productId: string) =>
    stockItems.find(s => s.product_id === productId)?.quantity || 0;

  // Product handlers
  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setShowQuantityDialog(true);
  };

  const handleAddProductWithQuantity = (productId: string, quantity: number, giftInfo?: any, isUnitSale?: boolean) => {
    const product = availableProducts.find(p => p.id === productId);
    if (!product) return;

    const available = getAvailable(productId);

    if (isUnitSale) {
      const boxPrice = getProductPrice(product);
      const piecePrice = product.pieces_per_box > 0 ? boxPrice / product.pieces_per_box : boxPrice;
      const totalPrice = piecePrice * quantity;
      setOrderItems(prev => [...prev, { productId, quantity, unitPrice: piecePrice, totalPrice }]);
      return;
    }

    const unitPrice = getProductPrice(product);
    const giftQuantity = giftInfo?.giftQuantity || 0;
    const paidQuantity = quantity - giftQuantity;

    setOrderItems(prev => {
      const existing = prev.find(item => item.productId === productId);
      if (existing) {
        const newQuantity = Math.min(existing.quantity + quantity, available);
        const newPaid = Math.max(0, newQuantity - giftQuantity);
        return prev.map(item =>
          item.productId === productId
            ? { ...item, quantity: newQuantity, totalPrice: newPaid * unitPrice }
            : item
        );
      }
      const clampedQty = Math.min(quantity, available);
      const clampedPaid = Math.max(0, clampedQty - giftQuantity);
      return [...prev, { productId, quantity: clampedQty, unitPrice, totalPrice: clampedPaid * unitPrice, giftQuantity: giftQuantity || undefined, giftOfferId: giftInfo?.offerId }];
    });
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    const available = getAvailable(productId);
    setOrderItems(prev =>
      prev.map(item => {
        if (item.productId === productId) {
          const newQuantity = item.quantity + delta;
          if (newQuantity > 0 && newQuantity <= available) {
            return { ...item, quantity: newQuantity, totalPrice: newQuantity * item.unitPrice };
          }
          if (newQuantity <= 0) return { ...item, quantity: 0 };
        }
        return item;
      }).filter(item => item.quantity > 0)
    );
  };

  const handleRemoveProduct = (productId: string) => {
    setOrderItems(prev => prev.filter(item => item.productId !== productId));
  };

  const getProductName = (productId: string) =>
    availableProducts.find(p => p.id === productId)?.name || '';

  // Recalculate prices when payment type / sub-type changes
  useEffect(() => {
    if (orderItems.length > 0) {
      setOrderItems(prev => prev.map(item => {
        const product = availableProducts.find(p => p.id === item.productId);
        if (product) {
          const unitPrice = getProductPrice(product);
          return { ...item, unitPrice, totalPrice: item.quantity * unitPrice };
        }
        return item;
      }));
    }
  }, [paymentType, priceSubType, availableProducts]);

  // Totals
  const orderTotals = useMemo(() => {
    const totalItems = orderItems.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = orderItems.reduce((sum, item) => sum + item.totalPrice, 0);
    let stampAmount = 0;
    if (paymentType === 'with_invoice' && invoicePaymentMethod === 'cash' && stampTiers?.length) {
      stampAmount = calculateStampAmount(subtotal, stampTiers);
    }
    return { totalItems, subtotal, stampAmount, totalAmount: subtotal + stampAmount };
  }, [orderItems, paymentType, invoicePaymentMethod, stampTiers]);

  // Show payment dialog before completing
  const handleSave = () => {
    if (!selectedCustomerId) { toast.error(t('orders.select_customer_error')); return; }
    if (orderItems.length === 0) { toast.error(t('orders.add_products_error')); return; }

    // Validate stock
    for (const item of orderItems) {
      const available = getAvailable(item.productId);
      if (item.quantity > available) {
        toast.error(`${getProductName(item.productId)}: ${t('stock.available')} ${available}`);
        return;
      }
    }

    // CRITICAL: Freeze the current values into state BEFORE opening dialog
    // React 18 batches these setState calls, so all values are consistent in the next render
    setFrozenPaymentType(paymentType);
    setFrozenInvoiceMethod(invoicePaymentMethod);
    console.log('[DirectSale] FROZEN VALUES SET:', JSON.stringify({
      paymentType: paymentType,
      invoiceMethod: invoicePaymentMethod,
    }));

    setShowPaymentDialog(true);
  };

  const handlePaymentConfirm = async (paymentData: {
    paidAmount: number;
    remainingAmount: number;
    paymentMethod: string;
    notes?: string;
    isFullPayment: boolean;
    confirmedPaymentType?: string;
    confirmedInvoiceMethod?: string | null;
  }) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      // USE FROZEN STATE directly - these were captured at save time before dialog opened
      const finalPaymentType = frozenPaymentType;
      const finalInvoiceMethod = frozenInvoiceMethod;
      console.log('[DirectSale] SAVING WITH:', JSON.stringify({ finalPaymentType, finalInvoiceMethod }));

      // Determine payment status based on invoice payment method
      let paymentStatus: string;
      if (!paymentData.isFullPayment) {
        paymentStatus = 'partial';
      } else if (finalPaymentType === 'with_invoice' && finalInvoiceMethod === 'check') {
        paymentStatus = 'check';
      } else {
        paymentStatus = 'cash';
      }

      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
          customer_id: selectedCustomerId,
          created_by: workerId!,
          assigned_worker_id: workerId!,
          branch_id: activeBranch?.id || null,
          status: 'delivered',
          payment_type: finalPaymentType,
          payment_status: paymentStatus,
          invoice_payment_method: finalPaymentType === 'with_invoice' ? (finalInvoiceMethod || null) : null,
          partial_amount: paymentData.isFullPayment ? null : paymentData.paidAmount,
          total_amount: orderTotals.totalAmount,
          notes: notes || 'بيع مباشر من الشاحنة',
        })
        .select()
        .single();

      if (orderErr) throw orderErr;

      const orderItemsData = orderItems.map(item => ({
        order_id: order.id,
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.totalPrice,
      }));

      await supabase.from('order_items').insert(orderItemsData);

      // Deduct from worker stock & log movements
      for (const item of orderItems) {
        const ws = stockItems.find(s => s.product_id === item.productId);
        if (ws) {
          await supabase.from('worker_stock').update({ quantity: ws.quantity - item.quantity }).eq('id', ws.id);
        }
        await supabase.from('stock_movements').insert({
          product_id: item.productId,
          branch_id: activeBranch?.id || null,
          quantity: item.quantity,
          movement_type: 'delivery',
          status: 'approved',
          created_by: workerId!,
          worker_id: workerId!,
          order_id: order.id,
          notes: 'بيع مباشر من الشاحنة',
        });
      }

      // Create debt if partial payment
      if (!paymentData.isFullPayment && paymentData.remainingAmount > 0) {
        await createDebt.mutateAsync({
          customer_id: selectedCustomerId,
          order_id: order.id,
          worker_id: workerId!,
          branch_id: activeBranch?.id,
          total_amount: paymentData.remainingAmount,
          paid_amount: 0,
          notes: paymentData.notes,
        });
        toast.success(t('debts.debt_recorded'));
      } else {
        toast.success(t('stock.direct_sale_success'));
      }

      queryClient.invalidateQueries({ queryKey: ['my-worker-stock'] });

      // Track direct sale visit GPS
      trackVisit({ customerId: selectedCustomerId, operationType: 'direct_sale', operationId: order.id });

      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['assigned-orders'] });
      setShowPaymentDialog(false);

      // Build receipt data and show receipt dialog
      const receiptItems: ReceiptItem[] = orderItems.map(item => ({
        productId: item.productId,
        productName: getProductName(item.productId),
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        giftQuantity: item.giftQuantity,
      }));

      setReceiptData({
        receiptType: 'direct_sale' as ReceiptType,
        orderId: order.id,
        debtId: null,
        customerId: selectedCustomerId,
        customerName: selectedCustomer?.name || '',
        customerPhone: selectedCustomer?.phone || null,
        workerId: workerId!,
        workerName: user?.full_name || '',
        workerPhone: null,
        branchId: activeBranch?.id || null,
        items: receiptItems,
        totalAmount: orderTotals.totalAmount,
        discountAmount: 0,
        paidAmount: paymentData.paidAmount,
        remainingAmount: paymentData.remainingAmount,
        paymentMethod: paymentData.paymentMethod,
        notes: notes || null,
      });
      setShowReceiptDialog(true);
      handleClose(false);
    } catch (error: any) {
      console.error('Direct sale error:', error);
      toast.error(error.message || t('common.error'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg max-h-[90vh] p-0 gap-0 overflow-hidden" dir={dir}>
          <DialogHeader className="p-4 pb-2 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              {t('stock.direct_sale')}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[calc(90vh-8rem)] px-4">
            <div className="py-4 space-y-5">
              {/* Customer Section */}
              <section className="space-y-3">
                <Label className="text-base font-semibold">{t('orders.customer')}</Label>

                <Popover open={customerDropdownOpen} onOpenChange={setCustomerDropdownOpen} modal={true}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={customerDropdownOpen}
                      className="w-full justify-between h-11"
                      disabled={isLoadingData}
                    >
                      {isLoadingData ? (
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {t('common.loading')}
                        </span>
                      ) : selectedCustomer ? (
                        <span className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                            {selectedCustomer.name?.charAt(0) || '?'}
                          </div>
                          <span className="truncate">{selectedCustomer.name}</span>
                          {selectedCustomer.wilaya && (
                            <span className="text-xs text-muted-foreground">({selectedCustomer.wilaya})</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{t('orders.select_customer')}</span>
                      )}
                      <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 z-[10050]" align="start">
                    <Command>
                      <CommandInput placeholder={t('orders.search_customer')} className="h-10" />
                      <CommandList>
                        <CommandEmpty>
                          <div className="py-4 text-center">
                            <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm text-muted-foreground">{t('orders.no_customers')}</p>
                          </div>
                        </CommandEmpty>
                        <CommandGroup>
                          {customers.map((customer) => (
                            <CommandItem
                              key={customer.id}
                              value={`${customer.name} ${customer.wilaya || ''} ${customer.phone || ''}`}
                              onSelect={() => {
                                setSelectedCustomerId(customer.id);
                                if (customer.default_payment_type) {
                                  setPaymentType(customer.default_payment_type as PaymentType);
                                }
                                if (customer.default_price_subtype) {
                                  setPriceSubType(customer.default_price_subtype as PriceSubType);
                                }
                                setCustomerDropdownOpen(false);
                              }}
                              className="flex items-center gap-3 py-2.5"
                            >
                              <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                                selectedCustomerId === customer.id
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground"
                              )}>
                                {customer.name?.charAt(0) || '?'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{customer.name}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {customer.wilaya}
                                  {customer.phone && ` • ${customer.phone}`}
                                </p>
                              </div>
                              <Check className={cn("h-4 w-4 shrink-0", selectedCustomerId === customer.id ? "opacity-100" : "opacity-0")} />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {/* Selected Customer Info */}
                {selectedCustomer && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
                        {selectedCustomer.name?.charAt(0) || '?'}
                      </div>
                      <div>
                        <p className="font-bold">{selectedCustomer.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-xs text-muted-foreground">
                            {selectedCustomer.wilaya}
                            {selectedCustomer.phone && ` • ${selectedCustomer.phone}`}
                          </p>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {selectedCustomer.default_payment_type === 'with_invoice' ? t('orders.with_invoice') :
                              selectedCustomer.default_price_subtype === 'super_gros' ? t('products.price_super_gros') :
                                selectedCustomer.default_price_subtype === 'retail' ? t('products.price_retail') : t('products.price_gros')
                            }
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* Payment Type */}
              <section className="space-y-3">
                <Label className="text-base font-semibold">{t('orders.purchase_method')}</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant={paymentType === 'with_invoice' ? 'default' : 'outline'}
                    className="h-16 flex flex-col gap-1.5"
                    onClick={() => setPaymentType('with_invoice')}
                  >
                    <Receipt className="w-5 h-5" />
                    <span className="text-sm">{t('orders.with_invoice')}</span>
                  </Button>
                  <Button
                    type="button"
                    variant={paymentType === 'without_invoice' ? 'default' : 'outline'}
                    className="h-16 flex flex-col gap-1.5"
                    onClick={() => setPaymentType('without_invoice')}
                  >
                    <ReceiptText className="w-5 h-5" />
                    <span className="text-sm">{t('orders.without_invoice')}</span>
                  </Button>
                </div>

                {/* Price Sub-Type for without invoice */}
                {paymentType === 'without_invoice' && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">{t('orders.price_type')}</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: 'super_gros' as PriceSubType, label: t('products.price_super_gros') },
                        { value: 'gros' as PriceSubType, label: t('products.price_gros') },
                        { value: 'retail' as PriceSubType, label: t('products.price_retail') },
                      ]).map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          variant={priceSubType === option.value ? 'default' : 'outline'}
                          size="sm"
                          className="h-10 text-xs"
                          onClick={() => setPriceSubType(option.value)}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                    {selectedCustomer?.default_price_subtype && (
                      <p className="text-xs text-muted-foreground">
                        ⓘ {t('orders.customer_default')}: {
                          selectedCustomer.default_price_subtype === 'super_gros' ? t('products.price_super_gros') :
                            selectedCustomer.default_price_subtype === 'gros' ? t('products.price_gros') :
                              t('products.price_retail')
                        }
                      </p>
                    )}
                  </div>
                )}

                {/* Invoice Payment Method */}
                {paymentType === 'with_invoice' && (
                  <InvoicePaymentMethodSelect
                    value={invoicePaymentMethod}
                    onChange={setInvoicePaymentMethod}
                  />
                )}
              </section>

              {/* Products - Grid like CreateOrderDialog */}
              <section className="space-y-3">
                <Label className="text-base font-semibold">{t('products.title')}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {availableProducts.map((product) => {
                    const inCart = orderItems.find(item => item.productId === product.id);
                    const available = getAvailable(product.id);
                    const price = getProductPrice(product);
                    return (
                      <Button
                        key={product.id}
                        variant={inCart ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => handleProductClick(product)}
                        className="text-xs h-auto py-2.5 justify-start flex-wrap"
                      >
                        <Plus className="w-3.5 h-3.5 ms-1.5 shrink-0" />
                        <span className="truncate">{product.name}</span>
                        <Badge variant="outline" className="mr-auto text-[10px] px-1">
                          {available}
                        </Badge>
                        {price > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1 text-primary">
                            {price.toLocaleString()} {t('common.currency')}
                          </Badge>
                        )}
                        {inCart && (
                          <Badge variant="default" className="text-[10px] px-1.5">
                            {inCart.quantity}
                          </Badge>
                        )}
                      </Button>
                    );
                  })}
                </div>
              </section>

              {/* Cart / Selected Items */}
              {orderItems.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">{t('orders.cart')}</Label>
                    <Badge variant="secondary" className="text-xs">
                      <Package className="w-3 h-3 ms-1" />
                      {orderTotals.totalItems} {t('common.piece')}
                    </Badge>
                  </div>
                  <div className="space-y-2 bg-muted/50 rounded-lg p-3">
                    {orderItems.map((item) => (
                      <div key={item.productId} className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm truncate block">
                            {getProductName(item.productId)}
                            {item.giftQuantity && item.giftQuantity > 0 && (
                              <Badge variant="outline" className="ms-1 text-[10px] px-1 py-0 border-green-500 text-green-600">
                                <Gift className="w-3 h-3 ms-0.5" />
                                {item.giftQuantity} {t('common.free')}
                              </Badge>
                            )}
                          </span>
                          {item.unitPrice > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {item.unitPrice.toLocaleString()} {t('common.currency')} × {item.quantity - (item.giftQuantity || 0)} = {item.totalPrice.toLocaleString()} {t('common.currency')}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => handleUpdateQuantity(item.productId, -1)}>
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="w-8 text-center font-bold text-sm">{item.quantity}</span>
                          <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => handleUpdateQuantity(item.productId, 1)}>
                            <Plus className="w-3 h-3" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleRemoveProduct(item.productId)}>
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}

                    {/* Summary */}
                    <div className="pt-3 mt-3 border-t border-border/50">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{t('products.total')}:</span>
                        <span className="font-medium">{orderItems.length} {t('products.title')}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{t('common.quantity')}:</span>
                        <span className="font-medium">{orderTotals.totalItems} {t('common.piece')}</span>
                      </div>
                      {orderTotals.subtotal > 0 && (
                        <>
                          <div className="flex items-center justify-between text-sm mt-1">
                            <span className="text-muted-foreground">{t('orders.subtotal')}:</span>
                            <span className="font-medium">{orderTotals.subtotal.toLocaleString()} {t('common.currency')}</span>
                          </div>
                          {orderTotals.stampAmount > 0 && (
                            <div className="flex items-center justify-between text-sm text-amber-600 dark:text-amber-400">
                              <span className="flex items-center gap-1">
                                <Stamp className="w-3 h-3" />
                                {t('orders.stamp_tax')}:
                              </span>
                              <span className="font-medium">{orderTotals.stampAmount.toLocaleString('ar-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {t('common.currency')}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-base font-bold mt-2 pt-2 border-t border-border/50">
                            <span>{t('orders.grand_total')}:</span>
                            <span className="text-primary">{orderTotals.totalAmount.toLocaleString('ar-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {t('common.currency')}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {/* Notes */}
              <section className="space-y-2">
                <Label>{t('common.notes')} ({t('common.optional')})</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('orders.add_notes')}
                  rows={2}
                />
              </section>
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="p-4 border-t bg-background">
            <Button
              onClick={handleSave}
              className="w-full h-12 text-base"
              disabled={isSaving || !selectedCustomerId || orderItems.length === 0}
            >
              {isSaving ? (
                <Loader2 className="w-5 h-5 ms-2 animate-spin" />
              ) : (
                <Truck className="w-5 h-5 ms-2" />
              )}
              {t('stock.confirm_sale')}
              {orderTotals.totalAmount > 0 ? (
                <Badge variant="secondary" className="mr-2 bg-primary-foreground/20">
                  {orderTotals.totalAmount.toLocaleString()} {t('common.currency')}
                </Badge>
              ) : orderItems.length > 0 ? (
                <Badge variant="secondary" className="mr-2 bg-primary-foreground/20">
                  {orderTotals.totalItems}
                </Badge>
              ) : null}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quantity Dialog */}
      <ProductQuantityDialog
        open={showQuantityDialog}
        onOpenChange={setShowQuantityDialog}
        product={selectedProduct}
        onConfirm={handleAddProductWithQuantity}
        unitPrice={selectedProduct ? getProductPrice(selectedProduct) : 0}
        unitPiecePrice={selectedProduct ? (getProductPrice(selectedProduct) / (selectedProduct.pieces_per_box || 1)) : 0}
      />

      {/* Payment Dialog */}
      <DeliveryPaymentDialog
        open={showPaymentDialog}
        onOpenChange={setShowPaymentDialog}
        orderTotal={orderTotals.totalAmount}
        customerName={selectedCustomer?.name || ''}
        frozenPaymentType={frozenPaymentType}
        frozenInvoiceMethod={frozenInvoiceMethod}
        onConfirm={handlePaymentConfirm}
      />

      {/* Receipt Dialog */}
      {receiptData && (
        <ReceiptDialog
          open={showReceiptDialog}
          onOpenChange={setShowReceiptDialog}
          receiptData={receiptData}
        />
      )}
    </>
  );
};

export default DirectSaleDialog;
