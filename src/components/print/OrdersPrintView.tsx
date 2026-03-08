import React, { forwardRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { OrderWithDetails, Product } from '@/types/database';
import { format } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';
import logoImage from '@/assets/logo.png';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface OrderItemWithProduct {
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price?: number | null;
  total_price?: number | null;
  gift_quantity?: number;
  product?: Product;
}

interface PrintColumnConfig {
  id: string;
  labelKey: string;
  visible: boolean;
}

interface ExtraRow {
  label: string;
  productQuantities: Record<string, number>;
  totalAmount?: number;
  style?: 'highlight' | 'normal';
}

interface OrdersPrintViewProps {
  orders: OrderWithDetails[];
  orderItems: Map<string, OrderItemWithProduct[]>;
  products: Product[];
  title?: string;
  dateRange?: string;
  isVisible?: boolean;
  columnConfig?: PrintColumnConfig[];
  usePortal?: boolean;
  extraRows?: ExtraRow[];
}

const OrdersPrintView = forwardRef<HTMLDivElement, OrdersPrintViewProps>(
  ({ orders, orderItems, products, title, dateRange, isVisible = false, columnConfig = [], usePortal = true, extraRows = [] }, ref) => {
    const [container, setContainer] = useState<HTMLDivElement | null>(null);
    const [customerDebts, setCustomerDebts] = useState<Record<string, number>>({});
    const [shortageProductIds, setShortageProductIds] = useState<Set<string>>(new Set());
    const { tp, printDir } = useLanguage();
    const { activeBranch } = useAuth();
    
    // Use translated title if not provided
    const displayTitle = title || tp('print.order_list');

    // Column visibility helper
    const isColVisible = (id: string): boolean => {
      if (!columnConfig || columnConfig.length === 0) {
        // Default: all visible except order_id and qr
        return id !== 'order_id' && id !== 'qr';
      }
      const col = columnConfig.find(c => c.id === id);
      return col ? col.visible : true;
    };

    // Count visible static columns for totals row colspan
    const staticColIds = ['number', 'order_id', 'qr', 'customer', 'store_name', 'phone', 'address', 'delivery_worker', 'payment_info'];
    const visibleStaticCols = staticColIds.filter(id => isColVisible(id)).length;

    useEffect(() => {
      if (!usePortal) return;

      const div = document.createElement('div');
      div.id = 'print-portal';
      document.body.appendChild(div);
      setContainer(div);

      return () => {
        document.body.removeChild(div);
      };
    }, [usePortal]);

    // Fetch active customer debts
    useEffect(() => {
      const customerIds = [...new Set(orders.map(o => o.customer_id).filter(Boolean))];
      if (customerIds.length === 0) {
        setCustomerDebts({});
        return;
      }
      
      const fetchDebts = async () => {
        const { data } = await supabase
          .from('customer_debts')
          .select('customer_id, remaining_amount')
          .in('customer_id', customerIds)
          .eq('status', 'active');
        
        if (!data) return;
        const debts: Record<string, number> = {};
        data.forEach(d => {
          debts[d.customer_id] = (debts[d.customer_id] || 0) + (d.remaining_amount || 0);
        });
        setCustomerDebts(debts);
      };
      fetchDebts();
    }, [orders.length, orders.map(o => o.customer_id).join(',')]);

    // Fetch shortage product IDs (products marked as unavailable)
    useEffect(() => {
      const branchId = activeBranch?.id;
      const fetchShortages = async () => {
        let query = supabase
          .from('product_shortage_tracking')
          .select('product_id')
          .eq('status', 'pending');
        if (branchId) query = query.eq('branch_id', branchId);
        const { data } = await query;
        if (data) {
          setShortageProductIds(new Set(data.map(d => d.product_id)));
        }
      };
      fetchShortages();
    }, [activeBranch?.id]);
    // Build filter criteria text
    const getFilterCriteria = () => {
      const criteria: string[] = [];
      
      if (dateRange) {
        criteria.push(`${tp('print.header.period')}: ${dateRange}`);
      }
      
      return criteria;
    };

    const filterCriteria = getFilterCriteria();

    // Get quantity for a specific order and product
    const getQuantity = (orderId: string, productId: string): number => {
      const items = orderItems.get(orderId);
      if (!items) return 0;
      const item = items.find(i => i.product_id === productId);
      return item?.quantity || 0;
    };

    // Filter products to only show those that have orders
    const productsWithOrders = products.filter(product => {
      return orders.some(order => getQuantity(order.id, product.id) > 0);
    });

    // Calculate totals for each product (only for products with orders)
    const productTotals = productsWithOrders.reduce((acc, product) => {
      acc[product.id] = orders.reduce((sum, order) => {
        return sum + getQuantity(order.id, product.id);
      }, 0);
      return acc;
    }, {} as Record<string, number>);

    // Get the box multiplier for a product (how many units per box)
    const getBoxMultiplier = (product: Product): number => {
      if (product.pricing_unit === 'kg' && product.weight_per_box) {
        return product.weight_per_box;
      } else if (product.pricing_unit === 'piece' && product.pieces_per_box > 1) {
        return product.pieces_per_box;
      }
      return 1; // box pricing or no multiplier
    };

    // Get the base unit price for a product based on order payment type
    const getBaseUnitPrice = (order: OrderWithDetails, product: Product): number => {
      if (order.payment_type === 'with_invoice') {
        return product.price_invoice || 0;
      }
      const subtype = order.customer?.default_price_subtype;
      if (subtype === 'super_gros') return product.price_super_gros || 0;
      if (subtype === 'gros') return product.price_gros || 0;
      if (subtype === 'retail') return product.price_retail || 0;
      return product.price_no_invoice || product.price_gros || 0;
    };

    // Calculate total amount per order from items (excluding unavailable products)
    const getOrderTotalAmount = (order: OrderWithDetails): number => {
      const items = orderItems.get(order.id);
      if (!items) return order.total_amount && order.total_amount > 0 ? order.total_amount : 0;
      
      return items.reduce((sum, item) => {
        // Skip unavailable products
        if (shortageProductIds.has(item.product_id)) return sum;
        
        // Try total_price first
        if (item.total_price && item.total_price > 0) return sum + item.total_price;
        // Then try unit_price * quantity (unit_price already includes box multiplier)
        if (item.unit_price && item.unit_price > 0) return sum + (item.unit_price * (item.quantity - (item.gift_quantity || 0)));
        // Fallback: use product prices with box multiplier
        if (item.product) {
          const basePrice = getBaseUnitPrice(order, item.product);
          const multiplier = getBoxMultiplier(item.product);
          return sum + (basePrice * multiplier * item.quantity);
        }
        return sum;
      }, 0);
    };

    // Get unit price for a specific order and product (price per box)
    const getItemUnitPrice = (order: OrderWithDetails, productId: string): number => {
      // First try from order_items
      const items = orderItems.get(order.id);
      if (items) {
        const item = items.find(i => i.product_id === productId);
        if (item?.unit_price && item.unit_price > 0) return item.unit_price;
      }
      // Fallback: calculate box price from product pricing
      const product = products.find(p => p.id === productId);
      if (!product) return 0;
      
      const basePrice = getBaseUnitPrice(order, product);
      const multiplier = getBoxMultiplier(product);
      return basePrice * multiplier;
    };

    // Grand total of all orders
    const grandTotal = orders.reduce((sum, order) => sum + getOrderTotalAmount(order), 0);

    // Generate short order ID (first 8 characters)
    const getShortOrderId = (orderId: string): string => {
      return orderId.substring(0, 8).toUpperCase();
    };

    // Get box content label for product header (e.g. "5kg" or "10pcs")
    const getProductBoxLabel = (product: Product): string => {
      const unit = product.pricing_unit;
      if (unit === 'kg' && product.weight_per_box) {
        return `${product.weight_per_box}${tp('print.unit.kg')}`;
      } else if (unit === 'piece' && product.pieces_per_box > 1) {
        return `${product.pieces_per_box}${tp('print.unit.pc')}`;
      }
      return '';
    };


    const getOrderSymbols = (order: OrderWithDetails): string => {
      const symbols: string[] = [];
      // Payment type
      if (order.payment_type === 'with_invoice') {
        symbols.push(tp('print.symbol.invoice1'));
      } else if (order.payment_type === 'without_invoice') {
        symbols.push(tp('print.symbol.invoice2'));
      }
      // Invoice payment method
      if (order.payment_type === 'with_invoice' && order.invoice_payment_method) {
        symbols.push(tp(`print.symbol.${order.invoice_payment_method}`));
      }
      // Pricing subtype from customer
      if (order.payment_type === 'without_invoice' && order.customer?.default_price_subtype) {
        symbols.push(tp(`print.symbol.${order.customer.default_price_subtype}`));
      }
      return symbols.filter(Boolean).join(' ');
    };

    const content = (
      <div 
        ref={ref} 
        className="print-container" 
        dir={printDir} 
        style={{ 
          display: isVisible ? 'block' : 'none',
          position: 'relative'
        }}
      >
        {/* Watermark - absolutely positioned in center of container */}
        <div style={{
          position: usePortal ? 'fixed' : 'absolute',
          top: '45%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 0,
          opacity: 0.2,
          pointerEvents: 'none'
        }}>
          <img src={logoImage} alt="" style={{ width: '280px', height: 'auto' }} />
        </div>

        {/* Header with Logo */}
        <div className="print-header-with-logo" style={{ position: 'relative', zIndex: 1 }}>
          <div className="print-logo">
            <img src={logoImage} alt="Laser Food" />
          </div>
          <div className="print-title-section">
            <h1>{displayTitle}</h1>
            {filterCriteria.length > 0 && (
              <p style={{ fontSize: '11pt', fontWeight: 600, marginTop: '5px' }}>
                {filterCriteria.join('  |  ')}
              </p>
            )}
          </div>
          <div className="print-logo">
            <img src={logoImage} alt="Laser Food" />
          </div>
        </div>

        {/* Main Table - Word-like style */}
        <table className="word-table" style={{ position: 'relative', zIndex: 1 }}>
          <thead>
            <tr>
              {isColVisible('number') && <th style={{ width: '30px' }}>{tp('print.header.number')}</th>}
              {isColVisible('order_id') && <th style={{ width: '55px' }}>{tp('print.header.order_id')}</th>}
              {isColVisible('qr') && <th style={{ width: '45px' }}>{tp('print.header.qr')}</th>}
              {isColVisible('customer') && <th>{tp('print.header.customer')}</th>}
              {isColVisible('store_name') && <th>{tp('print.header.store_name')}</th>}
              {isColVisible('phone') && <th style={{ width: '90px' }}>{tp('print.header.phone')}</th>}
              {isColVisible('address') && <th>{tp('print.header.address')}</th>}
              {isColVisible('delivery_worker') && <th style={{ width: '80px' }}>{tp('print.header.delivery_worker')}</th>}
              {isColVisible('payment_info') && <th style={{ width: '45px' }}>{tp('print.header.payment_info')}</th>}
              {isColVisible('products') && productsWithOrders.map((product) => {
                const boxLabel = getProductBoxLabel(product);
                return (
                  <th key={product.id} style={{ width: '55px', fontSize: '8pt', lineHeight: '1.2' }}>
                    <div>{product.name}</div>
                    {boxLabel && <div style={{ fontSize: '6pt', fontWeight: 'normal', opacity: 0.7 }}>{boxLabel}</div>}
                  </th>
                );
              })}
              {isColVisible('total_amount') && <th style={{ width: '70px' }}>{tp('print.header.total_amount')}</th>}
            </tr>
          </thead>
          <tbody>
            {orders.map((order, index) => (
              <tr key={order.id}>
                {isColVisible('number') && <td className="center">{index + 1}</td>}
                {isColVisible('order_id') && (
                  <td className="center small-text" style={{ fontSize: '7pt', fontFamily: 'monospace' }}>
                    {getShortOrderId(order.id)}
                  </td>
                )}
                {isColVisible('qr') && (
                  <td className="center" style={{ padding: '2px' }}>
                    <QRCodeSVG 
                      value={order.id} 
                      size={28}
                      level="L"
                      style={{ display: 'block', margin: '0 auto' }}
                    />
                  </td>
                )}
                {isColVisible('customer') && (
                  <td>
                    <div>{order.customer?.name || ''}</div>
                    {order.customer_id && customerDebts[order.customer_id] > 0 && (
                      <div style={{ fontSize: '6pt', opacity: 0.5, color: '#c00', borderTop: '1px dotted #ddd', marginTop: '1px', paddingTop: '1px' }}>
                        {tp('print.header.debt') || 'D'}: {customerDebts[order.customer_id].toLocaleString()}
                      </div>
                    )}
                  </td>
                )}
                {isColVisible('store_name') && <td className="small-text">{order.customer?.store_name || ''}</td>}
                {isColVisible('phone') && <td className="ltr-text">{order.customer?.phone || ''}</td>}
                {isColVisible('address') && <td className="small-text">{order.customer?.address || ''}</td>}
                {isColVisible('delivery_worker') && <td className="small-text">{order.assigned_worker?.full_name || '-'}</td>}
                {isColVisible('payment_info') && <td className="center small-text" style={{ fontSize: '8pt' }}>{getOrderSymbols(order)}</td>}
                {isColVisible('products') && productsWithOrders.map((product) => {
                  const qty = getQuantity(order.id, product.id);
                  const unitPrice = getItemUnitPrice(order, product.id);
                  return (
                    <td key={product.id} className="center" style={{ padding: '2px 1px' }}>
                      {qty > 0 && (
                        <>
                          <div style={{ fontWeight: 'bold', fontSize: '9pt' }}>{qty}</div>
                          {shortageProductIds.has(product.id) ? (
                            <div style={{ fontSize: '6pt', color: '#c00', fontWeight: 'bold', borderTop: '1px dotted #ccc', marginTop: '1px', paddingTop: '1px' }}>
                              {tp('stock.product_unavailable')}
                            </div>
                          ) : (
                            <>
                              {unitPrice > 0 && (
                                <div style={{ fontSize: '6pt', opacity: 0.6, borderTop: '1px dotted #ccc', marginTop: '1px', paddingTop: '1px' }}>
                                  {unitPrice.toLocaleString()}
                                </div>
                              )}
                              {(() => {
                                const basePrice = getBaseUnitPrice(order, product);
                                const multiplier = getBoxMultiplier(product);
                                if (multiplier > 1 && basePrice > 0) {
                                  return (
                                    <div style={{ fontSize: '5.5pt', opacity: 0.45, borderTop: '1px dotted #ddd', marginTop: '1px', paddingTop: '1px' }}>
                                      {basePrice.toLocaleString()}
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </>
                          )}
                        </>
                      )}
                    </td>
                  );
                })}
                {isColVisible('total_amount') && (
                  <td className="center bold" style={{ padding: '2px 1px' }}>
                    {getOrderTotalAmount(order) > 0 && (
                      <>
                        <div>{getOrderTotalAmount(order).toLocaleString()}</div>
                        {order.payment_type === 'with_invoice' && order.invoice_payment_method === 'cash' && (() => {
                          const items = orderItems.get(order.id);
                          if (!items) return null;
                          const subtotal = items.reduce((sum, item) => {
                            if (shortageProductIds.has(item.product_id)) return sum;
                            if (item.total_price && item.total_price > 0) return sum + item.total_price;
                            if (item.unit_price && item.unit_price > 0) return sum + (item.unit_price * (item.quantity - (item.gift_quantity || 0)));
                            if (item.product) {
                              const bp = getBaseUnitPrice(order, item.product);
                              const m = getBoxMultiplier(item.product);
                              return sum + (bp * m * item.quantity);
                            }
                            return sum;
                          }, 0);
                          const total = getOrderTotalAmount(order);
                          const stampAmount = total - subtotal;
                          if (stampAmount <= 0) return null;
                          const stampPct = subtotal > 0 ? Math.round((stampAmount / subtotal) * 100 * 10) / 10 : 0;
                          return (
                            <div style={{ fontSize: '5.5pt', opacity: 0.5, fontWeight: 'normal', borderTop: '1px dotted #ccc', marginTop: '1px', paddingTop: '1px' }}>
                              {tp('print.header.stamp') || 'T'} {stampPct}% = {stampAmount.toLocaleString()}
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}

            {/* Extra rows (e.g. surplus) */}
            {extraRows.map((row, idx) => {
              const hasAny = productsWithOrders.some(p => (row.productQuantities[p.id] || 0) > 0);
              if (!hasAny) return null;
              return (
                <tr key={`extra-${idx}`} style={{ backgroundColor: row.style === 'highlight' ? '#fff3cd' : undefined, fontWeight: 'bold' }}>
                  <td colSpan={visibleStaticCols} className="center" style={{ fontSize: '9pt' }}>{row.label}</td>
                  {isColVisible('products') && productsWithOrders.map((product) => {
                    const qty = row.productQuantities[product.id] || 0;
                    return (
                      <td key={product.id} className="center" style={{ fontWeight: 'bold', color: qty > 0 ? '#b45309' : undefined }}>
                        {qty > 0 ? qty : ''}
                      </td>
                    );
                  })}
                  {isColVisible('total_amount') && (
                    <td className="center bold">
                      {row.totalAmount && row.totalAmount > 0 ? row.totalAmount.toLocaleString() : ''}
                    </td>
                  )}
                </tr>
              );
            })}

            {/* Totals row */}
            <tr className="totals-row">
              <td colSpan={visibleStaticCols} className="totals-label">{tp('print.header.total')}</td>
              {isColVisible('products') && productsWithOrders.map((product) => (
                <td key={product.id} className="center bold">
                  {productTotals[product.id] > 0 ? productTotals[product.id] : ''}
                </td>
              ))}
              {isColVisible('total_amount') && (
                <td className="center bold">
                  {grandTotal > 0 ? grandTotal.toLocaleString() : ''}
                </td>
              )}
            </tr>
          </tbody>
        </table>

        {/* Footer */}
        <div className="print-footer" style={{ marginTop: '10px' }}>
          <span>{tp('print.header.print_date')}: {format(new Date(), 'dd/MM/yyyy HH:mm')}</span>
          <span>{tp('print.header.orders_count')}: {orders.length}</span>
          <span>Laser Food</span>
        </div>
      </div>
    );

    if (!usePortal) return content;
    if (!container) return null;
    return createPortal(content, container);
  }
);

OrdersPrintView.displayName = 'OrdersPrintView';

export default OrdersPrintView;
