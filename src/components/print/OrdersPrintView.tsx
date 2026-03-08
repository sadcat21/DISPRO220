import React, { forwardRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { OrderWithDetails, Product } from '@/types/database';
import { format } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';
import logoImage from '@/assets/logo.png';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { StampPriceTier } from '@/types/stamp';
import { calculateStampAmount } from '@/hooks/useStampTiers';

interface OrderItemWithProduct {
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price?: number | null;
  total_price?: number | null;
  gift_quantity?: number;
  product?: Product;
}

export interface PrintColumnConfig {
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
    const [customerDebts, setCustomerDebts] = useState<Record<string, { amount: number; docType?: string }>>({});
    const [shortageProductIds, setShortageProductIds] = useState<Set<string>>(new Set());
    const [stampTiers, setStampTiers] = useState<StampPriceTier[]>([]);
    const { tp, printDir, printLanguage } = useLanguage();
    const { activeBranch } = useAuth();
    
    const displayTitle = title || tp('print.order_list');

    // Column visibility helper
    const isColVisible = (id: string): boolean => {
      if (!columnConfig || columnConfig.length === 0) {
        return id !== 'order_id' && id !== 'qr' && id !== 'sector' && id !== 'zone';
      }
      const col = columnConfig.find(c => c.id === id);
      return col ? col.visible : false;
    };

    // Detect uniform columns (all rows share the same value) → collapse to header
    const uniformValues: Record<string, string> = {};
    const checkUniformCol = (colId: string, getter: (o: OrderWithDetails) => string) => {
      if (!isColVisible(colId)) return;
      const values = orders.map(getter).filter(Boolean);
      if (values.length > 0 && values.every(v => v === values[0])) {
        uniformValues[colId] = values[0];
      }
    };

    checkUniformCol('delivery_worker', o => o.assigned_worker?.full_name || '');
    checkUniformCol('sector', o => {
      const s = (o.customer as any)?.sector;
      return s ? (printLanguage !== 'ar' && s.name_fr ? s.name_fr : s.name) : '';
    });
    checkUniformCol('zone', o => {
      const z = (o.customer as any)?.zone;
      return z ? (printLanguage !== 'ar' && z.name_fr ? z.name_fr : z.name) : '';
    });

    // Effective visibility: hide uniform columns from table body
    const isColEffective = (id: string): boolean => {
      if (uniformValues[id]) return false;
      return isColVisible(id);
    };

    // Count visible static columns for colspan
    const staticColIds = ['number', 'order_id', 'qr', 'customer', 'store_name', 'phone', 'address', 'sector', 'zone', 'delivery_worker', 'payment_info'];
    const visibleStaticCols = staticColIds.filter(id => isColEffective(id)).length;

    // Helper: get French or Arabic name
    const getCustomerName = (customer: any): string => {
      if (!customer) return '';
      if (printLanguage !== 'ar' && customer.name_fr) return customer.name_fr;
      return customer.name || '';
    };
    const getStoreName = (customer: any): string => {
      if (!customer) return '';
      if (printLanguage !== 'ar' && customer.store_name_fr) return customer.store_name_fr;
      return customer.store_name || '';
    };

    useEffect(() => {
      if (!usePortal) return;
      const div = document.createElement('div');
      div.id = 'print-portal';
      document.body.appendChild(div);
      setContainer(div);
      return () => { document.body.removeChild(div); };
    }, [usePortal]);

    // Fetch active customer debts + pending documents
    useEffect(() => {
      const customerIds = [...new Set(orders.map(o => o.customer_id).filter(Boolean))];
      if (customerIds.length === 0) { setCustomerDebts({}); return; }
      
      const fetchDebtsAndDocs = async () => {
        // Fetch debts
        const { data: debtData } = await supabase
          .from('customer_debts')
          .select('customer_id, remaining_amount')
          .in('customer_id', customerIds)
          .eq('status', 'active');
        
        const debts: Record<string, { amount: number; docType?: string }> = {};
        (debtData || []).forEach(d => {
          if (!debts[d.customer_id]) debts[d.customer_id] = { amount: 0 };
          debts[d.customer_id].amount += (d.remaining_amount || 0);
        });

        // Fetch pending document collections (check/receipt) per order→customer
        const orderIds = orders.map(o => o.id);
        const { data: docData } = await supabase
          .from('document_collections')
          .select('order_id, action')
          .in('order_id', orderIds)
          .eq('status', 'pending');

        if (docData) {
          for (const doc of docData) {
            const order = orders.find(o => o.id === doc.order_id);
            if (order?.customer_id) {
              if (!debts[order.customer_id]) debts[order.customer_id] = { amount: 0 };
              // Keep track of doc type
              const actionLabel = doc.action === 'check' ? 'Chèque' : doc.action === 'receipt' ? 'Reçu' : doc.action;
              debts[order.customer_id].docType = actionLabel;
            }
          }
        }

        setCustomerDebts(debts);
      };
      fetchDebtsAndDocs();
    }, [orders.length, orders.map(o => o.customer_id).join(',')]);

    // Fetch shortage product IDs
    useEffect(() => {
      const branchId = activeBranch?.id;
      const fetchShortages = async () => {
        let query = supabase
          .from('product_shortage_tracking')
          .select('product_id')
          .eq('status', 'pending');
        if (branchId) query = query.eq('branch_id', branchId);
        const { data } = await query;
        if (data) setShortageProductIds(new Set(data.map(d => d.product_id)));
      };
      fetchShortages();
    }, [activeBranch?.id]);

    // Fetch stamp price tiers
    useEffect(() => {
      const fetchTiers = async () => {
        const { data } = await supabase
          .from('stamp_price_tiers')
          .select('*')
          .eq('is_active', true)
          .order('min_amount', { ascending: true });
        if (data) setStampTiers(data as StampPriceTier[]);
      };
      fetchTiers();
    }, []);

    const getFilterCriteria = () => {
      const criteria: string[] = [];
      if (dateRange) criteria.push(`${tp('print.header.period')}: ${dateRange}`);
      // Add uniform values to header
      Object.entries(uniformValues).forEach(([colId, value]) => {
        const labelMap: Record<string, string> = {
          delivery_worker: tp('print.header.delivery_worker'),
          sector: tp('print.header.sector') || 'Secteur',
          zone: tp('print.header.zone') || 'Zone',
        };
        criteria.push(`${labelMap[colId] || colId}: ${value}`);
      });
      return criteria;
    };

    const filterCriteria = getFilterCriteria();

    const getQuantity = (orderId: string, productId: string): number => {
      const items = orderItems.get(orderId);
      if (!items) return 0;
      const item = items.find(i => i.product_id === productId);
      return item?.quantity || 0;
    };

    const productsWithOrders = products.filter(product => {
      return orders.some(order => getQuantity(order.id, product.id) > 0);
    });

    const productTotals = productsWithOrders.reduce((acc, product) => {
      acc[product.id] = orders.reduce((sum, order) => sum + getQuantity(order.id, product.id), 0);
      return acc;
    }, {} as Record<string, number>);

    const getBoxMultiplier = (product: Product): number => {
      if (product.pricing_unit === 'kg' && product.weight_per_box) return product.weight_per_box;
      else if (product.pricing_unit === 'piece' && product.pieces_per_box > 1) return product.pieces_per_box;
      return 1;
    };

    const getBaseUnitPrice = (order: OrderWithDetails, product: Product): number => {
      if (order.payment_type === 'with_invoice') return product.price_invoice || 0;
      const subtype = order.customer?.default_price_subtype;
      if (subtype === 'super_gros') return product.price_super_gros || 0;
      if (subtype === 'gros') return product.price_gros || 0;
      if (subtype === 'retail') return product.price_retail || 0;
      return product.price_no_invoice || product.price_gros || 0;
    };

    const getOrderTotalAmount = (order: OrderWithDetails): number => {
      const items = orderItems.get(order.id);
      if (!items) return order.total_amount && order.total_amount > 0 ? order.total_amount : 0;
      return items.reduce((sum, item) => {
        if (shortageProductIds.has(item.product_id)) return sum;
        if (item.total_price && item.total_price > 0) return sum + item.total_price;
        if (item.unit_price && item.unit_price > 0) return sum + (item.unit_price * (item.quantity - (item.gift_quantity || 0)));
        if (item.product) {
          const basePrice = getBaseUnitPrice(order, item.product);
          const multiplier = getBoxMultiplier(item.product);
          return sum + (basePrice * multiplier * item.quantity);
        }
        return sum;
      }, 0);
    };

    const getItemUnitPrice = (order: OrderWithDetails, productId: string): number => {
      const items = orderItems.get(order.id);
      if (items) {
        const item = items.find(i => i.product_id === productId);
        if (item?.unit_price && item.unit_price > 0) return item.unit_price;
      }
      const product = products.find(p => p.id === productId);
      if (!product) return 0;
      const basePrice = getBaseUnitPrice(order, product);
      const multiplier = getBoxMultiplier(product);
      return basePrice * multiplier;
    };

    const grandTotal = orders.reduce((sum, order) => {
      const orderTotal = getOrderTotalAmount(order);
      const isCashInvoice = order.payment_type === 'with_invoice' && order.invoice_payment_method === 'cash';
      const stamp = isCashInvoice && stampTiers.length > 0 ? calculateStampAmount(orderTotal, stampTiers) : 0;
      return sum + orderTotal + stamp;
    }, 0);

    const getShortOrderId = (orderId: string): string => orderId.substring(0, 8).toUpperCase();

    const getProductBoxLabel = (product: Product): string => {
      const unit = product.pricing_unit;
      if (unit === 'kg' && product.weight_per_box) return `${product.weight_per_box}${tp('print.unit.kg')}`;
      else if (unit === 'piece' && product.pieces_per_box > 1) return `${product.pieces_per_box}${tp('print.unit.pc')}`;
      return '';
    };

    const getOrderSymbols = (order: OrderWithDetails): string => {
      const symbols: string[] = [];
      if (order.payment_type === 'with_invoice') symbols.push(tp('print.symbol.invoice1'));
      else if (order.payment_type === 'without_invoice') symbols.push(tp('print.symbol.invoice2'));
      if (order.payment_type === 'with_invoice' && order.invoice_payment_method) symbols.push(tp(`print.symbol.${order.invoice_payment_method}`));
      if (order.payment_type === 'without_invoice' && order.customer?.default_price_subtype) symbols.push(tp(`print.symbol.${order.customer.default_price_subtype}`));
      return symbols.filter(Boolean).join(' ');
    };

    const content = (
      <div 
        ref={ref} 
        className="print-container" 
        dir={printDir} 
        style={{ display: isVisible ? 'block' : 'none', position: 'relative' }}
      >
        {/* Watermark */}
        <div style={{
          position: usePortal ? 'fixed' : 'absolute',
          top: '45%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 0, opacity: 0.2, pointerEvents: 'none'
        }}>
          <img src={logoImage} alt="" style={{ width: '280px', height: 'auto' }} />
        </div>

        {/* Header */}
        <div className="print-header-with-logo" style={{ position: 'relative', zIndex: 1 }}>
          <div className="print-logo"><img src={logoImage} alt="Laser Food" /></div>
          <div className="print-title-section">
            <h1>{displayTitle}</h1>
            {filterCriteria.length > 0 && (
              <p style={{ fontSize: '11pt', fontWeight: 600, marginTop: '5px' }}>
                {filterCriteria.join('  |  ')}
              </p>
            )}
          </div>
          <div className="print-logo"><img src={logoImage} alt="Laser Food" /></div>
        </div>

        {/* Main Table */}
        <table className="word-table" style={{ position: 'relative', zIndex: 1 }}>
          <thead>
            <tr>
              {isColEffective('number') && <th style={{ width: '30px' }}>{tp('print.header.number')}</th>}
              {isColEffective('order_id') && <th style={{ width: '55px' }}>{tp('print.header.order_id')}</th>}
              {isColEffective('qr') && <th style={{ width: '45px' }}>{tp('print.header.qr')}</th>}
              {isColEffective('customer') && <th>{tp('print.header.customer')}</th>}
              {isColEffective('store_name') && <th>{tp('print.header.store_name')}</th>}
              {isColEffective('phone') && <th style={{ width: '90px' }}>{tp('print.header.phone')}</th>}
              {isColEffective('address') && <th>{tp('print.header.address')}</th>}
              {isColEffective('sector') && <th style={{ width: '70px' }}>{tp('print.header.sector') || 'Secteur'}</th>}
              {isColEffective('zone') && <th style={{ width: '60px' }}>{tp('print.header.zone') || 'Zone'}</th>}
              {isColEffective('delivery_worker') && <th style={{ width: '80px' }}>{tp('print.header.delivery_worker')}</th>}
              {isColEffective('payment_info') && <th style={{ width: '45px' }}>{tp('print.header.payment_info')}</th>}
              {isColVisible('products') && productsWithOrders.map((product) => {
                const boxLabel = getProductBoxLabel(product);
                return (
                  <th key={product.id} style={{ width: '55px', fontSize: '8pt', lineHeight: '1.2' }}>
                    <div>{product.name}</div>
                    {boxLabel && <div style={{ fontSize: '6pt', fontWeight: 'normal', opacity: 0.7 }}>{boxLabel}</div>}
                  </th>
                );
              })}
              {isColEffective('total_amount') && <th style={{ width: '70px' }}>{tp('print.header.total_amount')}</th>}
            </tr>
          </thead>
          <tbody>
            {orders.map((order, index) => {
              const debtInfo = order.customer_id ? customerDebts[order.customer_id] : null;
              const sectorData = (order.customer as any)?.sector;
              const zoneData = (order.customer as any)?.zone;

              return (
                <tr key={order.id}>
                  {isColEffective('number') && <td className="center">{index + 1}</td>}
                  {isColEffective('order_id') && (
                    <td className="center small-text" style={{ fontSize: '7pt', fontFamily: 'monospace' }}>
                      {getShortOrderId(order.id)}
                    </td>
                  )}
                  {isColEffective('qr') && (
                    <td className="center" style={{ padding: '2px' }}>
                      <QRCodeSVG value={order.id} size={28} level="L" style={{ display: 'block', margin: '0 auto' }} />
                    </td>
                  )}
                  {isColEffective('customer') && (
                    <td>
                      <div>{getCustomerName(order.customer)}</div>
                      {debtInfo && (debtInfo.amount > 0 || debtInfo.docType) && (
                        <div style={{ fontSize: '7pt', color: '#c00', borderTop: '1px solid #ddd', marginTop: '2px', paddingTop: '2px' }}>
                          {debtInfo.amount > 0 && (
                            <span style={{ fontWeight: 'bold' }}>
                              {tp('print.header.debt') || 'Dette'}: {debtInfo.amount.toLocaleString()}
                            </span>
                          )}
                          {debtInfo.docType && (
                            <span style={{ marginLeft: debtInfo.amount > 0 ? '4px' : '0' }}>
                              📄 {debtInfo.docType}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                  {isColEffective('store_name') && <td className="small-text">{getStoreName(order.customer)}</td>}
                  {isColEffective('phone') && <td className="ltr-text">{order.customer?.phone || ''}</td>}
                  {isColEffective('address') && <td className="small-text">{order.customer?.address || ''}</td>}
                  {isColEffective('sector') && (
                    <td className="small-text">
                      {sectorData ? (printLanguage !== 'ar' && sectorData.name_fr ? sectorData.name_fr : sectorData.name) : ''}
                    </td>
                  )}
                  {isColEffective('zone') && (
                    <td className="small-text">
                      {zoneData ? (printLanguage !== 'ar' && zoneData.name_fr ? zoneData.name_fr : zoneData.name) : ''}
                    </td>
                  )}
                  {isColEffective('delivery_worker') && <td className="small-text">{order.assigned_worker?.full_name || '-'}</td>}
                  {isColEffective('payment_info') && (() => {
                    const paymentText = getOrderSymbols(order);
                    const isCashInvoice = order.payment_type === 'with_invoice' && order.invoice_payment_method === 'cash';
                    const orderTotal = getOrderTotalAmount(order);
                    const stampAmt = isCashInvoice && stampTiers.length > 0 ? calculateStampAmount(orderTotal, stampTiers) : 0;
                    const stampPct = stampAmt > 0 && orderTotal > 0
                      ? Math.round((stampAmt / orderTotal) * 100 * 10) / 10
                      : 0;
                    return (
                      <td className="center small-text" style={{ fontSize: '8pt', padding: '2px 1px' }}>
                        <div>{paymentText}</div>
                        {stampAmt > 0 && (
                          <div style={{ fontSize: '6.5pt', fontWeight: 'normal', borderTop: '1px solid #ccc', marginTop: '1px', paddingTop: '1px', color: '#555' }}>
                            {tp('print.header.stamp') || 'T'} {stampPct}% = {stampAmt.toLocaleString()}
                          </div>
                        )}
                      </td>
                    );
                  })()}
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
                  {isColEffective('total_amount') && (
                    <td className="center bold" style={{ padding: '2px 1px' }}>
                      {getOrderTotalAmount(order) > 0 && (() => {
                        const orderTotal = getOrderTotalAmount(order);
                        const isCashInvoice = order.payment_type === 'with_invoice' && order.invoice_payment_method === 'cash';
                        const stampAmount = isCashInvoice && stampTiers.length > 0 ? calculateStampAmount(orderTotal, stampTiers) : 0;
                        const totalWithStamp = orderTotal + stampAmount;
                        return (
                          <div>{isCashInvoice && stampAmount > 0 ? totalWithStamp.toLocaleString() : orderTotal.toLocaleString()}</div>
                        );
                      })()}
                    </td>
                  )}
                </tr>
              );
            })}

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
                  {isColEffective('total_amount') && (
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
              {isColEffective('total_amount') && (
                <td className="center bold">
                  {grandTotal > 0 ? grandTotal.toLocaleString() : ''}
                </td>
              )}
            </tr>
          </tbody>
        </table>

        {/* Footer */}
        <div className="print-footer" style={{ marginTop: '4px' }}>
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
