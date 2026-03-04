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
  customerStoreName: string;
  customerPhone: string;
  customerAddress: string;
  customerSectorName: string;
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
  invoice1: PaymentMethodBreakdown & { total: number; versementCash: number };
  invoice2: { total: number; cash: number };
  debtCollections: DebtCollectionBreakdown;
  physicalCash: number;
  expenses: number;
  cashExpenses: number;
  salesDebtCollectionsCash: number;
  salesDebtCollectionsNonCash: number;
  giftOfferValue: number;
  promoTracking: PromoTrackingItem[];
  customerSurplusCash: number;
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
      // Use exact period timestamps for debt payments (no full-day expansion)
      const periodStartTz = toTimestampTz(periodStart, false);
      const periodEndTz = toTimestampTz(periodEnd, true);

      // 1. Fetch delivered orders using stock_movements (reliable delivery timestamp)
      const { data: stockMovements } = await supabase
        .from('stock_movements')
        .select('order_id')
        .eq('worker_id', workerId)
        .eq('movement_type', 'delivery')
        .eq('status', 'approved')
        .gte('created_at', periodStartTz)
        .lte('created_at', periodEndTz);

      const deliveryOrderIds = Array.from(new Set((stockMovements || []).map((m: any) => m.order_id).filter(Boolean)));

      let orders: any[] = [];
      if (deliveryOrderIds.length > 0) {
        const { data: ordersData } = await supabase
          .from('orders')
          .select('id, total_amount, payment_status, payment_type, invoice_payment_method, partial_amount, customer_id, document_verification, customer:customers(name, store_name, phone, address, sector:sectors(name)), updated_at, notes, order_items(quantity, unit_price, total_price, gift_quantity, gift_offer_id, product_id, pieces_per_box, product:products(name, price_gros, price_super_gros, price_retail, price_invoice, pricing_unit, weight_per_box, pieces_per_box))')
          .in('id', deliveryOrderIds)
          .eq('assigned_worker_id', workerId)
          .eq('status', 'delivered');
        orders = ordersData || [];
      }

      // 2. Fetch debt payments (use exact period timestamps)
      const { data: debtPayments } = await supabase
        .from('debt_payments')
        .select('amount, payment_method')
        .eq('worker_id', workerId)
        .gte('collected_at', periodStartTz)
        .lte('collected_at', periodEndTz);

      // 2b. Fetch collected pending documents (use exact timestamps)
      const { data: collectedDocuments } = await supabase
        .from('document_collections')
        .select('status, action, collection_date, created_at, order:orders!document_collections_order_id_fkey(total_amount, invoice_payment_method)')
        .eq('worker_id', workerId)
        .eq('action', 'collected')
        .neq('status', 'rejected')
        .gte('created_at', periodStartTz)
        .lte('created_at', periodEndTz);

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
        .select('product_id, vente_quantity, gratuite_quantity, notes, promo_date, customer_id, customer:customers(name, store_name, phone, address, sector:sectors(name)), product:products(name, price_gros, price_super_gros, price_retail, price_invoice, pricing_unit, weight_per_box, pieces_per_box)')
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

      const normalizeOrderGiftToPieces = (order: any, item: any, piecesPerBox: number): number => {
        const rawGift = Number(item.gift_quantity || 0);
        if (rawGift <= 0) return 0;
        const isDirectSale = String(order?.notes || '').includes('بيع مباشر');
        if (isDirectSale || piecesPerBox <= 1) return rawGift;
        return rawGift * piecesPerBox;
      };

      const normalizePromoGiftToPieces = (promo: any, giftUnit: string, piecesPerBox: number): number => {
        const rawGift = Number(promo.gratuite_quantity || 0);
        if (rawGift <= 0) return 0;
        const isDirectSalePromo = String(promo?.notes || '').includes('بيع مباشر');
        if (isDirectSalePromo || piecesPerBox <= 1) return rawGift;
        return giftUnit === 'box' ? rawGift * piecesPerBox : rawGift;
      };

      // === Calculate ===
      let totalSales = 0;
      let totalPaid = 0;
      let newDebts = 0;
      let giftOfferValue = 0;

      const invoice1: PaymentMethodBreakdown & { total: number; versementCash: number } = {
        total: 0, check: 0, transfer: 0, receipt: 0, espaceCash: 0, versementCash: 0,
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
          const giftQtyRaw = Number(item.gift_quantity || 0);
          if (giftQtyRaw > 0) {
            const boxPrice = calcBoxPrice(item.product);
            const piecesPerBox = Number((item as any).pieces_per_box || (item as any).product?.pieces_per_box || 1);
            const giftPieces = normalizeOrderGiftToPieces(order, item, piecesPerBox);
            const giftBoxesForSoldCalc = piecesPerBox > 0 ? giftPieces / piecesPerBox : 0;
            const soldQuantity = Math.max(0, Number(item.quantity || 0) - giftBoxesForSoldCalc);

            const piecePrice = piecesPerBox > 0 ? boxPrice / piecesPerBox : boxPrice;
            giftOfferValue += giftPieces * piecePrice;

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
            promoMap[key].quantitySold += soldQuantity;
            promoMap[key].giftQuantity += giftPieces;
            // Add customer detail
            const customerName = (order as any).customer?.name || '';
            const customerStoreName = (order as any).customer?.store_name || '';
            const customerSectorName = (order as any).customer?.sector?.name || '';
            promoMap[key].customerDetails.push({
              customerId: (order as any).customer_id || '',
              customerName,
              customerStoreName,
              customerSectorName,
              customerPhone: (order as any).customer?.phone || '',
              customerAddress: (order as any).customer?.address || '',
              quantitySold: soldQuantity,
              giftPieces,
              date: (order as any).updated_at || '',
            });
          }
        }

        if (paidAmount <= 0) continue;

        const paymentType = order.payment_type || 'without_invoice';
        const invoiceMethod = order.invoice_payment_method;

        if (paymentType === 'with_invoice') {
          invoice1.total += paidAmount;
          // Check if versement/transfer was paid by cash
          const docVerification = (order as any).document_verification;
          const paidByCash = docVerification && typeof docVerification === 'object' && docVerification.paid_by_cash === true;
          
          if (paymentStatus === 'check' || invoiceMethod === 'check') {
            invoice1.check += paidAmount;
          } else if ((invoiceMethod === 'receipt' || invoiceMethod === 'transfer') && paidByCash) {
            // Versement/Virement paid by cash - track separately
            invoice1.versementCash += paidAmount;
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
        // Normalize promo gift quantity to pieces (direct sale rows are already in pieces)
        const giftUnit = offerUnitMap[promo.product_id] || 'piece';
        const piecesPerBox = Number((promo.product as any)?.pieces_per_box || 1);
        const giftInPieces = normalizePromoGiftToPieces(promo, giftUnit, piecesPerBox);
        promosByProduct[promo.product_id].totalGiftPieces += giftInPieces;
        promosByProduct[promo.product_id].totalVente += Number(promo.vente_quantity || 0);
        promosByProduct[promo.product_id].customers.push({
          customerId: (promo as any).customer_id || '',
          customerName: (promo as any).customer?.name || '',
          customerStoreName: (promo as any).customer?.store_name || '',
          customerSectorName: (promo as any).customer?.sector?.name || '',
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
        else if (method === 'transfer' || method === 'virement') debtCollections.transfer += amount;
        else if (method === 'receipt' || method === 'versement') debtCollections.receipt += amount;
        else debtCollections.cash += amount;
      }

      // Add collected pending documents to debt collections breakdown (document debt settled)
      for (const dc of (collectedDocuments || [])) {
        const order = (dc as any).order;
        if (!order) continue;
        const amount = Number(order.total_amount || 0);
        const method = String(order.invoice_payment_method || '').toLowerCase();

        debtCollections.total += amount;
        if (method === 'check') debtCollections.check += amount;
        else if (method === 'transfer' || method === 'virement') debtCollections.transfer += amount;
        else if (method === 'receipt' || method === 'versement') debtCollections.receipt += amount;
      }

      // Expenses
      const expenses = expenseData?.reduce((sum, e) => sum + Number(e.amount || 0), 0) || 0;
      const cashExpenses = expenseData?.reduce((sum, e) => {
        const paymentMethod = (e as any).payment_method || 'cash';
        if (paymentMethod === 'cash') return sum + Number(e.amount || 0);
        return sum;
      }, 0) || 0;

      // Customer surplus (overpayments recorded as cash)
      const { data: customerSurplusData } = await supabase
        .from('manager_treasury')
        .select('amount')
        .eq('source_type', 'customer_surplus')
        .eq('manager_id', workerId)
        .gte('created_at', periodStartTz)
        .lte('created_at', periodEndTz);

      const customerSurplusCash = (customerSurplusData || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);

      const physicalCash = invoice2.cash + invoice1.espaceCash + invoice1.versementCash + debtCollections.cash - cashExpenses + customerSurplusCash;

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
        customerSurplusCash,
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
    invoice1: { total: 0, check: 0, transfer: 0, receipt: 0, espaceCash: 0, versementCash: 0 },
    invoice2: { total: 0, cash: 0 },
    debtCollections: { total: 0, cash: 0, check: 0, transfer: 0, receipt: 0 },
    physicalCash: 0,
    expenses: 0,
    cashExpenses: 0,
    salesDebtCollectionsCash: 0,
    salesDebtCollectionsNonCash: 0,
    giftOfferValue: 0,
    promoTracking: [],
    customerSurplusCash: 0,
  };
}
