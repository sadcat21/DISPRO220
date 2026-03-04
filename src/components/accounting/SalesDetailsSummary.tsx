import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, ShoppingBag, User, ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface SalesDetailsSummaryProps {
  workerId: string;
  periodStart: string;
  periodEnd: string;
}

interface OrderItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  price_subtype: string | null;
  payment_type: string | null;
  gift_quantity: number;
}

interface OrderDetail {
  id: string;
  customer_id: string;
  customer_name: string;
  total_amount: number;
  payment_status: string;
  payment_type: string;
  invoice_payment_method: string | null;
  price_subtype: string | null;
  partial_amount: number;
  notes: string | null;
  updated_at: string;
  items: OrderItem[];
}

interface CustomerSummary {
  customer_id: string;
  customer_name: string;
  orders: OrderDetail[];
  total_amount: number;
  order_count: number;
  has_debt: boolean;
}

interface CustomerDebt {
  id: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: string;
  due_date: string | null;
  notes: string | null;
}

const paymentStatusColor: Record<string, string> = {
  cash: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  partial: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  credit: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  check: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
};

const SalesDetailsSummary: React.FC<SalesDetailsSummaryProps> = ({ workerId, periodStart, periodEnd }) => {
  const { t, dir } = useLanguage();
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);

  // Helper to convert period values to proper timestamptz
  const toTz = (v: string, isEnd: boolean) => {
    if (v.includes('+') || v.includes('Z')) return v;
    if (v.includes('T')) return v + ':00+01:00';
    return isEnd ? v + 'T23:59:59+01:00' : v + 'T00:00:00+01:00';
  };

  // Fetch all orders grouped by customer
  const { data: customerSummaries, isLoading } = useQuery({
    queryKey: ['sales-by-customer', workerId, periodStart, periodEnd],
    queryFn: async (): Promise<CustomerSummary[]> => {
      const periodStartTz = toTz(periodStart, false);
      const periodEndTz = toTz(periodEnd, true);

      const { data: stockMovements } = await supabase
        .from('stock_movements')
        .select('order_id')
        .eq('worker_id', workerId)
        .eq('movement_type', 'delivery')
        .eq('status', 'approved')
        .gte('created_at', periodStartTz)
        .lte('created_at', periodEndTz);

      const orderIds = Array.from(new Set((stockMovements || []).map((m: any) => m.order_id).filter(Boolean)));
      if (orderIds.length === 0) return [];

      const { data: deliveredOrders } = await supabase
        .from('orders')
        .select('id, customer_id, total_amount, payment_status, payment_type, invoice_payment_method, partial_amount, notes, updated_at, customer:customers(name), order_items(price_subtype, payment_type)')
        .in('id', orderIds)
        .eq('assigned_worker_id', workerId)
        .eq('status', 'delivered')
        .order('updated_at', { ascending: false });

      if (!deliveredOrders || deliveredOrders.length === 0) return [];

      // Fetch order_items with actual unit_price and price_subtype
      const { data: orderItemsData } = await supabase
        .from('order_items')
        .select('order_id, quantity, unit_price, total_price, price_subtype, payment_type, gift_quantity, product:products(name)')
        .in('order_id', orderIds);

      const itemsByOrder: Record<string, OrderItem[]> = {};
      orderItemsData?.forEach(item => {
        const orderId = (item as any).order_id;
        if (!orderId) return;
        if (!itemsByOrder[orderId]) itemsByOrder[orderId] = [];
        itemsByOrder[orderId].push({
          product_name: (item as any).product?.name || '',
          quantity: Number(item.quantity || 0),
          unit_price: Number(item.unit_price || 0),
          total_price: Number(item.total_price || 0),
          price_subtype: (item as any).price_subtype || null,
          payment_type: (item as any).payment_type || null,
          gift_quantity: Number(item.gift_quantity || 0),
        });
      });

      // Group by customer
      const customerMap: Record<string, CustomerSummary> = {};
      for (const o of deliveredOrders) {
        const custId = o.customer_id;
        const custName = (o as any).customer?.name || '';
        if (!customerMap[custId]) {
          customerMap[custId] = {
            customer_id: custId,
            customer_name: custName,
            orders: [],
            total_amount: 0,
            order_count: 0,
            has_debt: false,
          };
        }
        const orderItems = itemsByOrder[o.id] || [];
        // Detect price_subtype from first order item
        const priceSubtype = (o as any).order_items?.[0]?.price_subtype || null;
        const order: OrderDetail = {
          id: o.id,
          customer_id: custId,
          customer_name: custName,
          total_amount: Number(o.total_amount || 0),
          payment_status: o.payment_status || 'pending',
          payment_type: o.payment_type || '',
          invoice_payment_method: (o as any).invoice_payment_method || null,
          price_subtype: priceSubtype,
          partial_amount: Number(o.partial_amount || 0),
          notes: o.notes,
          updated_at: o.updated_at,
          items: orderItems,
        };
        customerMap[custId].orders.push(order);
        customerMap[custId].total_amount += order.total_amount;
        customerMap[custId].order_count += 1;
        if (['credit', 'partial'].includes(order.payment_status)) {
          customerMap[custId].has_debt = true;
        }
      }

      return Object.values(customerMap).sort((a, b) => b.total_amount - a.total_amount);
    },
    enabled: !!workerId && !!periodStart && !!periodEnd,
  });

  // Fetch debts for selected customer in the period
  const { data: customerDebts } = useQuery({
    queryKey: ['customer-period-debts', selectedCustomer?.customer_id, workerId, periodStart, periodEnd],
    queryFn: async (): Promise<CustomerDebt[]> => {
      if (!selectedCustomer) return [];
      const { data } = await supabase
        .from('customer_debts')
        .select('id, total_amount, paid_amount, remaining_amount, status, due_date, notes')
        .eq('customer_id', selectedCustomer.customer_id)
        .eq('worker_id', workerId)
        .gte('created_at', toTz(periodStart, false))
        .lte('created_at', toTz(periodEnd, true));
      return (data || []).map(d => ({
        ...d,
        total_amount: Number(d.total_amount),
        paid_amount: Number(d.paid_amount),
        remaining_amount: Number(d.remaining_amount || 0),
      }));
    },
    enabled: !!selectedCustomer,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!customerSummaries || customerSummaries.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-3 text-sm">
        {t('accounting.no_sales_details')}
      </p>
    );
  }

  const totalSalesAmount = customerSummaries.reduce((s, c) => s + c.total_amount, 0);
  const totalOrdersCount = customerSummaries.reduce((s, c) => s + c.order_count, 0);
  const totalCustomersCount = customerSummaries.length;
  const allProductNames = new Set<string>();
  customerSummaries.forEach(c => c.orders.forEach(o => o.items.forEach(i => {
    if (i.product_name) allProductNames.add(i.product_name);
  })));
  const totalProductsCount = allProductNames.size;

  // Build product price breakdown by price_subtype
  const productPriceBreakdown: Record<string, { subtype: string; quantity: number; unitPrice: number; total: number }[]> = {};
  customerSummaries.forEach(c => c.orders.forEach(o => o.items.forEach(item => {
    if (!item.product_name) return;
    if (!productPriceBreakdown[item.product_name]) productPriceBreakdown[item.product_name] = [];
    const paidQty = Math.max(0, item.quantity - (item.gift_quantity || 0));
    if (paidQty <= 0) return;
    
    const rawSubtype = item.price_subtype || (o.price_subtype || 'gros');
    const isInvoice = (item.payment_type || o.payment_type) === 'with_invoice';
    const subtype = isInvoice ? `invoice_${rawSubtype}` : rawSubtype;
    const existing = productPriceBreakdown[item.product_name].find(e => e.subtype === subtype && Math.abs(e.unitPrice - item.unit_price) < 0.01);
    if (existing) {
      existing.quantity += paidQty;
      existing.total += paidQty * item.unit_price;
    } else {
      productPriceBreakdown[item.product_name].push({ subtype, quantity: paidQty, unitPrice: item.unit_price, total: paidQty * item.unit_price });
    }
  })));

  const subtypeLabels: Record<string, string> = {
    retail: 'تجزئة', gros: 'جملة', super_gros: 'سوبر جملة',
    invoice_gros: 'فاتورة 1 (جملة)', invoice_retail: 'فاتورة 1 (تجزئة)',
    invoice_super_gros: 'فاتورة 1 (سوبر جملة)', invoice: 'فاتورة 1',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <ShoppingBag className="w-4 h-4 text-primary" />
        <span className="font-semibold text-sm">{t('accounting.sales_details')}</span>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="text-xs">
          👥 {totalCustomersCount} {t('accounting.customers_count')}
        </Badge>
        <Badge variant="outline" className="text-xs">
          📦 {totalOrdersCount} {t('accounting.orders_count')}
        </Badge>
        <Badge variant="outline" className="text-xs">
          🏷️ {totalProductsCount} {t('accounting.products_count')}
        </Badge>
      </div>

      {/* Product Price Breakdown - Collapsible */}
      {Object.keys(productPriceBreakdown).length > 0 && (
        <div className="space-y-2">
          <p className="font-semibold text-sm flex items-center gap-1.5">📊 تفصيل المبيعات حسب التسعير</p>
          {Object.entries(productPriceBreakdown).sort((a, b) => {
            const totalA = a[1].reduce((s, e) => s + e.total, 0);
            const totalB = b[1].reduce((s, e) => s + e.total, 0);
            return totalB - totalA;
          }).map(([productName, entries]) => {
            const totalQty = entries.reduce((s, e) => s + e.quantity, 0);
            const totalVal = entries.reduce((s, e) => s + e.total, 0);
            const hasMultiplePrices = entries.length > 1;
            return (
              <Collapsible key={productName}>
                <div className="border rounded-lg overflow-hidden">
                  <CollapsibleTrigger className="w-full flex items-center justify-between p-2.5 hover:bg-muted/30 transition-colors">
                    <span className="font-medium text-sm">{productName}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{totalQty} صندوق • {totalVal.toLocaleString()} DA</span>
                      {hasMultiplePrices && <ChevronDown className="w-3.5 h-3.5 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t space-y-0.5 p-1.5">
                      {entries.sort((a, b) => b.quantity - a.quantity).map((entry, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1">
                          <span className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="text-[9px] px-1.5">{subtypeLabels[entry.subtype] || entry.subtype}</Badge>
                            <span className="text-muted-foreground">{entry.quantity} صندوق</span>
                          </span>
                          <span className="font-medium">{entry.unitPrice.toLocaleString()} DA/صندوق = {entry.total.toLocaleString()} DA</span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      )}

      {/* Customer Buttons */}
      <div className="space-y-1.5">
        {customerSummaries.map(customer => (
          <button
            key={customer.customer_id}
            className="w-full flex items-center gap-3 p-2.5 rounded-lg border hover:bg-muted/50 transition-colors text-start active:scale-[0.99]"
            onClick={() => setSelectedCustomer(customer)}
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-wrap">{customer.customer_name}</p>
              <p className="text-xs text-muted-foreground">
                {customer.order_count} {t('accounting.orders_count')} • {customer.orders.reduce((s, o) => s + o.items.length, 0)} {t('accounting.products_count')}
              </p>
            </div>
            <div className="text-end shrink-0">
              <p className="font-bold text-sm">{customer.total_amount.toLocaleString()} DA</p>
              {customer.has_debt && (
                <Badge variant="destructive" className="text-[10px] px-1.5">
                  {t('accounting.has_debt')}
                </Badge>
              )}
            </div>
            <ChevronLeft className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>

      {/* Totals */}
      <div className="border-2 border-primary/20 rounded-lg p-2.5 bg-primary/5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{t('common.total')}</span>
          <span className="font-bold text-primary">{totalSalesAmount.toLocaleString()} DA</span>
        </div>
      </div>

      {/* Customer Details Dialog */}
      {selectedCustomer && (
        <Dialog open={!!selectedCustomer} onOpenChange={(open) => !open && setSelectedCustomer(null)}>
          <DialogContent className="max-w-md max-h-[85vh] p-0 gap-0 overflow-hidden" dir={dir}>
            <DialogHeader className="p-4 pb-2 border-b">
              <DialogTitle className="flex items-center gap-2 text-base">
                <User className="w-5 h-5 text-primary" />
                {selectedCustomer.customer_name}
              </DialogTitle>
            </DialogHeader>

            <ScrollArea className="max-h-[calc(85vh-5rem)] px-4 py-3">
              <div className="space-y-4">
                {/* Customer Summary */}
                <div className="bg-muted/50 rounded-lg p-3 grid grid-cols-2 gap-3 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('accounting.orders_count')}</p>
                    <p className="text-lg font-bold">{selectedCustomer.order_count}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('common.total')}</p>
                    <p className="text-lg font-bold text-primary">{selectedCustomer.total_amount.toLocaleString()} DA</p>
                  </div>
                </div>

                {/* Orders */}
                <div className="space-y-2">
                  <p className="font-semibold text-sm">{t('accounting.sales_details')}</p>
                  {selectedCustomer.orders.map(order => (
                    <div key={order.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge className={`text-[10px] ${paymentStatusColor[order.payment_status] || ''}`}>
                          {t(`orders.payment_${order.payment_status}`)}
                        </Badge>
                        {/* Payment type: Invoice 1 or 2 */}
                        <Badge variant="outline" className="text-[10px]">
                          {order.payment_type === 'with_invoice' ? 'Facture 1' : 'Facture 2'}
                        </Badge>
                        <span className="font-bold text-sm">{order.total_amount.toLocaleString()} DA</span>
                      </div>

                      {/* Invoice method or price subtype */}
                      <div className="flex flex-wrap gap-1.5">
                        {order.payment_type === 'with_invoice' && order.invoice_payment_method && (
                          <Badge variant="secondary" className="text-[9px]">
                            {order.invoice_payment_method === 'check' ? 'Chèque' :
                             order.invoice_payment_method === 'transfer' ? 'Virement' :
                             order.invoice_payment_method === 'receipt' ? 'Versement' :
                             order.invoice_payment_method === 'cash' ? 'كاش' : order.invoice_payment_method}
                          </Badge>
                        )}
                        {order.payment_type !== 'with_invoice' && order.price_subtype && (
                          <Badge variant="secondary" className="text-[9px]">
                            {order.price_subtype === 'super_gros' ? 'سوبر جملة' :
                             order.price_subtype === 'gros' ? 'جملة' :
                             order.price_subtype === 'retail' ? 'تجزئة' : order.price_subtype}
                          </Badge>
                        )}
                      </div>

                      {order.payment_status === 'partial' && order.partial_amount > 0 && (
                        <div className="text-xs text-muted-foreground flex justify-between bg-orange-50 dark:bg-orange-900/10 rounded p-1.5">
                          <span>{t('orders.paid_amount')}: {order.partial_amount.toLocaleString()} DA</span>
                          <span className="text-destructive font-medium">
                            {t('accounting.remaining')}: {(order.total_amount - order.partial_amount).toLocaleString()} DA
                          </span>
                        </div>
                      )}

                      {/* Order Items */}
                      {order.items.length > 0 && (
                        <div className="bg-muted/30 rounded-lg overflow-hidden">
                          <div className="grid grid-cols-12 gap-1 text-[10px] text-muted-foreground font-medium p-1.5 border-b">
                            <span className="col-span-5">{t('stock.product')}</span>
                            <span className="col-span-2 text-center">{t('stock.quantity')}</span>
                            <span className="col-span-2 text-center">{t('accounting.unit_price')}</span>
                            <span className="col-span-3 text-end">{t('common.total')}</span>
                          </div>
                          {order.items.map((item, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-1 text-xs p-1.5 border-b border-dashed last:border-0 items-center">
                              <span className="col-span-5 text-wrap">{item.product_name}</span>
                              <span className="col-span-2 text-center font-bold">{item.quantity}</span>
                              <span className="col-span-2 text-center text-muted-foreground">{item.unit_price.toLocaleString()}</span>
                              <span className="col-span-3 text-end font-bold">{item.total_price.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {order.notes && (
                        <p className="text-xs text-muted-foreground bg-muted/30 rounded p-1.5">📝 {order.notes}</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Debts Section */}
                {customerDebts && customerDebts.length > 0 && (
                  <div className="space-y-2">
                    <p className="font-semibold text-sm text-destructive">{t('accounting.new_debts')}</p>
                    {customerDebts.map(debt => (
                      <div key={debt.id} className="border border-destructive/20 rounded-lg p-3 bg-destructive/5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">{t('debts.total_debt')}</span>
                          <span className="font-bold text-sm">{debt.total_amount.toLocaleString()} DA</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">{t('debts.paid')}</span>
                          <span className="text-sm text-green-600">{debt.paid_amount.toLocaleString()} DA</span>
                        </div>
                        <div className="flex items-center justify-between border-t pt-1.5">
                          <span className="text-xs font-medium">{t('accounting.remaining')}</span>
                          <span className="font-bold text-destructive">{debt.remaining_amount.toLocaleString()} DA</span>
                        </div>
                        {debt.due_date && (
                          <p className="text-xs text-muted-foreground">📅 {t('debts.due_date')}: {debt.due_date}</p>
                        )}
                        {debt.notes && (
                          <p className="text-xs text-muted-foreground">📝 {debt.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default SalesDetailsSummary;
