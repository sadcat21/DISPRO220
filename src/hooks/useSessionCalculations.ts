import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface SessionCalcParams {
  workerId: string;
  branchId?: string;
  periodStart: string;
  periodEnd: string;
}

export interface PaymentMethodBreakdown {
  check: number;
  transfer: number; // virement
  receipt: number;  // versement / تسبيق
  espaceCash: number;
}

export interface DebtCollectionBreakdown {
  total: number;
  cash: number;
  check: number;
  transfer: number;
  receipt: number;
}

export interface PromoCustomerDetail {
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  quantitySold: number;
  giftPieces: number;
  date: string;
}

export interface PromoTrackingItem {
  productName: string;
  productId: string;
  quantitySold: number;
  giftQuantity: number;
  piecesPerBox: number;
  offerName: string;
  customerDetails: PromoCustomerDetail[];
}

export interface SessionCalculations {
  totalSales: number;
  totalPaid: number;
  newDebts: number;
  invoice1: PaymentMethodBreakdown & { total: number };
  invoice2: { total: number; cash: number };
  debtCollections: DebtCollectionBreakdown;
  physicalCash: number;
  expenses: number;
  cashExpenses: number;
  salesDebtCollectionsCash: number;
  salesDebtCollectionsNonCash: number;
  // NEW: gift offer monetary value
  giftOfferValue: number;
  // NEW: promo tracking
  promoTracking: PromoTrackingItem[];
}

export const useSessionCalculations = (params: SessionCalcParams | null, options?: { refetchInterval?: number | false }) => {
  return useQuery({
    queryKey: ['session-calculations', params],
    refetchInterval: options?.refetchInterval ?? false,
    queryFn: async (): Promise<SessionCalculations> => {
      if (!params) return getEmptyCalculations();

      const { workerId, periodStart, periodEnd } = params;
      const toTimestampTz = (v: string, isEnd: boolean) => {
        if (v.includes('+') || v.includes('Z')) return v;
        if (v.includes('T')) return v + ':00+01:00';
        return isEnd ? v + 'T23:59:59+01:00' : v + 'T00:00:00+01:00';
      };
      const periodStartTz = toTimestampTz(periodStart, false);
      const periodEndTz = toTimestampTz(periodEnd, true);

      // 1. Fetch delivered orders with items
      const { data: orders } = await supabase
        .from('orders')
        .select('id, total_amount, payment_status, payment_type, invoice_payment_method, partial_amount, customer_id, customer:customers(name, phone, address), updated_at, order_items(quantity, unit_price, total_price, gift_quantity, gift_offer_id, product_id, product:products(name, price_gros, price_super_gros, price_retail, price_invoice, pricing_unit, weight_per_box, pieces_per_box))')
        .eq('assigned_worker_id', workerId)
        .eq('status', 'delivered')
        .gte('updated_at', periodStartTz)
        .lte('updated_at', periodEndTz);

      // 2. Fetch debt payments
      const { data: debtPayments } = await supabase
        .from('debt_payments')
        .select('amount, payment_method')
        .eq('worker_id', workerId)
        .gte('collected_at', periodStartTz)
        .lte('collected_at', periodEndTz);

      // 3. Fetch expenses
      const { data: expenseData } = await supabase
        .from('expenses')
        .select('amount, payment_method, category:expense_categories(name)')
        .eq('worker_id', workerId)
        .in('status', ['approved', 'pending'])
        .gte('expense_date', periodStart)
        .lte('expense_date', periodEnd);

      // 4. Fetch promos from promos table (fallback/complement to order_items gift data)
      const { data: promosData } = await supabase
        .from('promos')
        .select('product_id, vente_quantity, gratuite_quantity, promo_date, customer_id, customer:customers(name, phone, address), product:products(name, price_gros, price_super_gros, price_retail, price_invoice, pricing_unit, weight_per_box, pieces_per_box)')
        .eq('worker_id', workerId)
        .gte('promo_date', periodStartTz)
        .lte('promo_date', periodEndTz);

      // 4b. Fetch active offers to determine gift_quantity_unit per product
      const promoProductIds = [...new Set((promosData || []).map(p => p.product_id))];
      let offerUnitMap: Record<string, string> = {}; // productId -> gift_quantity_unit
      if (promoProductIds.length > 0) {
        const { data: productOffers } = await supabase
          .from('product_offers')
          .select('id, product_id, gift_quantity_unit')
          .in('product_id', promoProductIds)
          .eq('is_active', true);
        (productOffers || []).forEach(o => {
          // Use last active offer's unit for each product
          offerUnitMap[o.product_id] = o.gift_quantity_unit || 'piece';
        });
      }

      // 5. Fetch offer names for gift items
      const giftOfferIds = new Set<string>();
      (orders || []).forEach(o => {
        (o.order_items || []).forEach((item: any) => {
          if (item.gift_offer_id && item.gift_quantity > 0) {
            giftOfferIds.add(item.gift_offer_id);
          }
        });
      });

      let offerNamesMap: Record<string, string> = {};
      if (giftOfferIds.size > 0) {
        const { data: offers } = await supabase
          .from('product_offers')
          .select('id, name')
          .in('id', Array.from(giftOfferIds));
        (offers || []).forEach(o => { offerNamesMap[o.id] = o.name; });
      }

      // Helpers
      const calcBoxPrice = (p: any): number => {
        const rawPrice = Number(p?.price_gros || p?.price_super_gros || p?.price_retail || p?.price_invoice || 0);
        if (!rawPrice) return 0;
        const pricingUnit = p?.pricing_unit || 'box';
        if (pricingUnit === 'kg') return rawPrice * Number(p?.weight_per_box || 0);
        if (pricingUnit === 'unit') return rawPrice * Number(p?.pieces_per_box || 1);
        return rawPrice;
      };

      const calcOrderTotal = (order: any): number => {
        const storedTotal = Number(order.total_amount || 0);
        if (storedTotal > 0) return storedTotal;
        const items = order.order_items || [];
        return items.reduce((sum: number, item: any) => {
          const itemTotal = Number(item.total_price || 0);
          if (itemTotal > 0) return sum + itemTotal;
          const boxPrice = calcBoxPrice(item.product);
          return sum + (Number(item.quantity || 0) * boxPrice);
        }, 0);
      };

      // === Calculate ===
      let totalSales = 0;
      let totalPaid = 0;
      let newDebts = 0;
      let giftOfferValue = 0;

      const invoice1: PaymentMethodBreakdown & { total: number } = {
        total: 0, check: 0, transfer: 0, receipt: 0, espaceCash: 0,
      };
      const invoice2 = { total: 0, cash: 0 };

      // Promo tracking aggregation: key = productId_offerId
      const promoMap: Record<string, PromoTrackingItem> = {};

      for (const order of (orders || [])) {
        const totalAmount = calcOrderTotal(order);
        totalSales += totalAmount;

        let paidAmount = 0;
        const paymentStatus = order.payment_status || 'pending';
        if (paymentStatus === 'cash' || paymentStatus === 'check') {
          paidAmount = totalAmount;
        } else if (paymentStatus === 'partial') {
          paidAmount = Number(order.partial_amount || 0);
        }

        const debtAmount = totalAmount - paidAmount;
        totalPaid += paidAmount;
        newDebts += debtAmount;

        // Calculate gift value and promo tracking from items
        for (const item of (order.order_items || [])) {
          const giftQty = Number(item.gift_quantity || 0);
          if (giftQty > 0) {
            const boxPrice = calcBoxPrice(item.product);
            const piecesPerBox = Number((item as any).product?.pieces_per_box || 1);
            // gift_quantity is stored as pieces, calculate piece price
            const piecePrice = piecesPerBox > 0 ? boxPrice / piecesPerBox : boxPrice;
            giftOfferValue += giftQty * piecePrice;

            const offerId = item.gift_offer_id || 'unknown';
            const key = `${item.product_id}_${offerId}`;
            if (!promoMap[key]) {
              promoMap[key] = {
                productName: (item as any).product?.name || '',
                productId: item.product_id,
                quantitySold: 0,
                giftQuantity: 0,
                piecesPerBox: piecesPerBox,
                offerName: offerNamesMap[offerId] || '',
                customerDetails: [],
              };
            }
            promoMap[key].quantitySold += Number(item.quantity || 0);
            promoMap[key].giftQuantity += giftQty;
            // Add customer detail
            const customerName = (order as any).customer?.name || '';
            promoMap[key].customerDetails.push({
              customerId: (order as any).customer_id || '',
              customerName,
              customerPhone: (order as any).customer?.phone || '',
              customerAddress: (order as any).customer?.address || '',
              quantitySold: Number(item.quantity || 0),
              giftPieces: giftQty,
              date: (order as any).updated_at || '',
            });
          }
        }

        if (paidAmount <= 0) continue;

        const paymentType = order.payment_type || 'without_invoice';
        const invoiceMethod = order.invoice_payment_method;

        if (paymentType === 'with_invoice') {
          invoice1.total += paidAmount;
          if (paymentStatus === 'check' || invoiceMethod === 'check') {
            invoice1.check += paidAmount;
          } else if (invoiceMethod === 'transfer') {
            invoice1.transfer += paidAmount;
          } else if (invoiceMethod === 'receipt') {
            invoice1.receipt += paidAmount;
          } else if (invoiceMethod === 'cash') {
            invoice1.espaceCash += paidAmount;
          } else {
            invoice1.espaceCash += paidAmount;
          }
        } else {
          invoice2.total += paidAmount;
          invoice2.cash += paidAmount;
        }
      }

      // Supplement promo tracking from promos table (catches promos not in order_items)
      // First, collect total gift quantities already tracked per product from order_items
      const orderItemsGiftByProduct: Record<string, number> = {};
      Object.values(promoMap).forEach(p => {
        orderItemsGiftByProduct[p.productId] = (orderItemsGiftByProduct[p.productId] || 0) + p.giftQuantity;
      });

      // Aggregate all promos by product_id first, normalizing to pieces
      const promosByProduct: Record<string, { totalGiftPieces: number; totalVente: number; product: any; customers: PromoCustomerDetail[] }> = {};
      for (const promo of (promosData || [])) {
        const giftQty = Number(promo.gratuite_quantity || 0);
        if (giftQty <= 0) continue;
        if (!promosByProduct[promo.product_id]) {
          promosByProduct[promo.product_id] = { totalGiftPieces: 0, totalVente: 0, product: promo.product, customers: [] };
        }
        // Convert to pieces based on the offer's gift_quantity_unit
        const giftUnit = offerUnitMap[promo.product_id] || 'piece';
        const piecesPerBox = Number((promo.product as any)?.pieces_per_box || 1);
        const giftInPieces = giftUnit === 'box' ? giftQty * piecesPerBox : giftQty;
        promosByProduct[promo.product_id].totalGiftPieces += giftInPieces;
        promosByProduct[promo.product_id].totalVente += Number(promo.vente_quantity || 0);
        promosByProduct[promo.product_id].customers.push({
          customerId: (promo as any).customer_id || '',
          customerName: (promo as any).customer?.name || '',
          customerPhone: (promo as any).customer?.phone || '',
          customerAddress: (promo as any).customer?.address || '',
          quantitySold: Number(promo.vente_quantity || 0),
          giftPieces: giftInPieces,
          date: (promo as any).promo_date || '',
        });
      }

      // Now add any promos that aren't fully covered by order_items
      for (const [productId, promoAgg] of Object.entries(promosByProduct)) {
        const alreadyTrackedGifts = orderItemsGiftByProduct[productId] || 0;
        const extraGifts = promoAgg.totalGiftPieces - alreadyTrackedGifts;
        if (extraGifts <= 0) continue; // Already fully tracked via order_items

        const key = `${productId}_promo`;
        const product = promoAgg.product as any;
        promoMap[key] = {
          productName: product?.name || '',
          productId: productId,
          quantitySold: promoAgg.totalVente,
          giftQuantity: extraGifts,
          piecesPerBox: Number(product?.pieces_per_box || 1),
          offerName: 'عرض ترويجي',
          customerDetails: promoAgg.customers,
        };
        // Add gift value for extra gifts (now normalized to pieces)
        if (product) {
          const boxPrice = calcBoxPrice(product);
          const piecesPerBox = Number(product?.pieces_per_box || 1);
          const piecePrice = piecesPerBox > 0 ? boxPrice / piecesPerBox : boxPrice;
          giftOfferValue += extraGifts * piecePrice;
        }
      }

      // Debt collections
      const debtCollections: DebtCollectionBreakdown = {
        total: 0, cash: 0, check: 0, transfer: 0, receipt: 0,
      };
      for (const dp of (debtPayments || [])) {
        const amount = Number(dp.amount || 0);
        debtCollections.total += amount;
        const method = dp.payment_method || 'cash';
        if (method === 'cash') debtCollections.cash += amount;
        else if (method === 'check') debtCollections.check += amount;
        else if (method === 'transfer') debtCollections.transfer += amount;
        else if (method === 'receipt') debtCollections.receipt += amount;
        else debtCollections.cash += amount;
      }

      // Expenses
      const expenses = expenseData?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0;
      const cashExpenses = expenseData?.reduce((sum, e) => {
        const paymentMethod = (e as any).payment_method || 'cash';
        if (paymentMethod === 'cash') return sum + Number(e.amount || 0);
        return sum;
      }, 0) || 0;

      const physicalCash = invoice2.cash + invoice1.espaceCash + debtCollections.cash - cashExpenses;

      return {
        totalSales,
        totalPaid,
        newDebts,
        invoice1,
        invoice2,
        debtCollections,
        physicalCash,
        expenses,
        cashExpenses,
        salesDebtCollectionsCash: debtCollections.cash,
        salesDebtCollectionsNonCash: debtCollections.total - debtCollections.cash,
        giftOfferValue,
        promoTracking: Object.values(promoMap).sort((a, b) => b.giftQuantity - a.giftQuantity),
      };
    },
    enabled: !!params,
  });
};

function getEmptyCalculations(): SessionCalculations {
  return {
    totalSales: 0,
    totalPaid: 0,
    newDebts: 0,
    invoice1: { total: 0, check: 0, transfer: 0, receipt: 0, espaceCash: 0 },
    invoice2: { total: 0, cash: 0 },
    debtCollections: { total: 0, cash: 0, check: 0, transfer: 0, receipt: 0 },
    physicalCash: 0,
    expenses: 0,
    cashExpenses: 0,
    salesDebtCollectionsCash: 0,
    salesDebtCollectionsNonCash: 0,
    giftOfferValue: 0,
    promoTracking: [],
  };
}
