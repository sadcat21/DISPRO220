import React, { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, Loader2, ShoppingBag, TrendingDown, TrendingUp, Gift } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import DirectSaleDialog from '@/components/warehouse/DirectSaleDialog';
import { useIsElementHidden } from '@/hooks/useUIOverrides';

const MyStock: React.FC = () => {
  const { t } = useLanguage();
  const { workerId } = useAuth();
  const [showSaleDialog, setShowSaleDialog] = useState(false);
  const isDirectSaleHidden = useIsElementHidden('button', 'stock_direct_sale');

  const { data: stockItems, isLoading } = useQuery({
    queryKey: ['my-worker-stock', workerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worker_stock')
        .select('*, product:products(*)')
        .eq('worker_id', workerId!)
        .gt('quantity', 0);

      if (error) throw error;
      return data;
    },
    enabled: !!workerId,
  });

  // Fetch the last completed accounting session date for this worker
  const { data: lastAccountingSession } = useQuery({
    queryKey: ['my-last-accounting', workerId],
    queryFn: async () => {
      const { data } = await supabase
        .from('accounting_sessions')
        .select('completed_at')
        .eq('worker_id', workerId!)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .single();
      return data?.completed_at || null;
    },
    enabled: !!workerId,
  });

  const lastAccountingDate = lastAccountingSession || null;

  // Fetch loaded quantities from loading_session_items since last accounting
  const { data: loadedData } = useQuery({
    queryKey: ['my-stock-loaded', workerId, lastAccountingDate],
    queryFn: async () => {
      // Get loading sessions for this worker since last accounting
      let sessionsQuery = supabase
        .from('loading_sessions')
        .select('id')
        .eq('worker_id', workerId!);
      
      if (lastAccountingDate) {
        sessionsQuery = sessionsQuery.gte('created_at', lastAccountingDate);
      }

      const { data: sessions } = await sessionsQuery;
      if (!sessions || sessions.length === 0) return [];

      const sessionIds = sessions.map(s => s.id);
      const { data: items } = await supabase
        .from('loading_session_items')
        .select('product_id, quantity, gift_quantity')
        .in('session_id', sessionIds);

      return items || [];
    },
    enabled: !!workerId,
  });

  // Fetch sold quantities from delivered orders since last accounting
  const { data: soldData } = useQuery({
    queryKey: ['my-stock-sold', workerId, lastAccountingDate],
    queryFn: async () => {
      let ordersQuery = supabase
        .from('orders')
        .select('id')
        .eq('assigned_worker_id', workerId!)
        .eq('status', 'delivered');

      if (lastAccountingDate) {
        ordersQuery = ordersQuery.gte('created_at', lastAccountingDate);
      }

      const { data: orders } = await ordersQuery;
      if (!orders || orders.length === 0) return [];

      const orderIds = orders.map(o => o.id);
      const { data: items } = await supabase
        .from('order_items')
        .select('product_id, quantity, gift_quantity, gift_offer_id')
        .in('order_id', orderIds);

      if (!items || items.length === 0) return [];

      // Get unique offer IDs to fetch gift_quantity_unit
      const offerIds = [...new Set(items.map(i => i.gift_offer_id).filter(Boolean))] as string[];
      let offerUnits: Record<string, string> = {};
      if (offerIds.length > 0) {
        const { data: tiers } = await supabase
          .from('product_offer_tiers')
          .select('offer_id, gift_quantity_unit')
          .in('offer_id', offerIds);
        for (const t of (tiers || [])) {
          offerUnits[t.offer_id] = t.gift_quantity_unit || 'piece';
        }
      }

      return items.map(i => ({
        ...i,
        gift_unit: i.gift_offer_id ? (offerUnits[i.gift_offer_id] || 'piece') : 'piece',
      }));
    },
    enabled: !!workerId,
  });

  // Calculate loaded per product from loading sessions
  const movementStats = useMemo(() => {
    const stats: Record<string, { loaded: number; sold: number }> = {};
    for (const item of (loadedData || [])) {
      if (!stats[item.product_id]) stats[item.product_id] = { loaded: 0, sold: 0 };
      stats[item.product_id].loaded += item.quantity + (item.gift_quantity || 0);
    }
    for (const item of (soldData || [])) {
      if (!stats[item.product_id]) stats[item.product_id] = { loaded: 0, sold: 0 };
      stats[item.product_id].sold += item.quantity;
    }
    return stats;
  }, [loadedData, soldData]);

  // Calculate gifts per product from both loading sessions and delivered orders
  const giftStats = useMemo(() => {
    const stats: Record<string, { totalGifts: number; unit: string }> = {};
    
    // Gifts from loading sessions (loaded as gifts for distribution)
    for (const item of (loadedData || [])) {
      if ((item.gift_quantity || 0) > 0) {
        const pid = item.product_id;
        const unit = (item as any).gift_unit || 'piece';
        if (!stats[pid]) stats[pid] = { totalGifts: 0, unit };
        stats[pid].totalGifts += item.gift_quantity;
        // Use the unit from loading session
        stats[pid].unit = unit;
      }
    }
    
    // Also add gifts from delivered orders (given to customers)
    for (const item of (soldData || [])) {
      if ((item.gift_quantity || 0) > 0) {
        const pid = item.product_id;
        const unit = (item as any).gift_unit || 'piece';
        if (!stats[pid]) stats[pid] = { totalGifts: 0, unit };
        stats[pid].totalGifts += item.gift_quantity;
      }
    }
    return stats;
  }, [loadedData, soldData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const hasStock = stockItems && stockItems.length > 0;

  // Sort: items with stock first, then zero-quantity items
  const sortedItems = [...(stockItems || [])].sort((a, b) => {
    if (a.quantity === 0 && b.quantity > 0) return 1;
    if (a.quantity > 0 && b.quantity === 0) return -1;
    return ((a as any).product?.name || '').localeCompare((b as any).product?.name || '');
  });

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          {t('stock.my_stock')}
        </h2>
        {hasStock && !isDirectSaleHidden && (
          <Button size="sm" onClick={() => setShowSaleDialog(true)}>
            <ShoppingBag className="w-4 h-4 ml-1" />
            {t('stock.direct_sale')}
          </Button>
        )}
      </div>

      {!hasStock ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>{t('stock.no_stock')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {sortedItems.map(item => {
            const isZero = item.quantity === 0;
            const stats = movementStats[item.product_id];
            const loaded = stats?.loaded || 0;
            const sold = stats?.sold || 0;
            const gifts = giftStats[item.product_id];
            const giftQty = gifts?.totalGifts || 0;
            const giftUnit = gifts?.unit === 'piece' ? 'قطعة' : gifts?.unit === 'box' ? 'صندوق' : gifts?.unit === 'kg' ? 'كغ' : 'قطعة';
            return (
              <Card key={item.id} className={isZero ? 'opacity-50' : ''}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`font-medium ${isZero ? 'text-muted-foreground' : ''}`}>
                      {(item as any).product?.name}
                    </span>
                    <span className={`font-bold text-lg ${isZero ? 'text-muted-foreground' : 'text-primary'}`}>
                      {item.quantity}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground border-t pt-1 mt-1">
                    <span className="flex items-center gap-0.5">
                      <TrendingUp className="w-3 h-3 text-blue-500" />
                      شحن: {loaded}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <TrendingDown className="w-3 h-3 text-green-500" />
                      مباع: {sold}
                    </span>
                    {giftQty > 0 && (
                      <span className="flex items-center gap-0.5">
                        <Gift className="w-3 h-3 text-orange-500" />
                        هدايا: {giftQty} {giftUnit}
                      </span>
                    )}
                    <span className="font-semibold">باقي: {item.quantity}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DirectSaleDialog
        open={showSaleDialog}
        onOpenChange={setShowSaleDialog}
        stockItems={(stockItems || []).map(s => ({
          id: s.id,
          product_id: s.product_id,
          quantity: s.quantity,
          product: (s as any).product,
        }))}
      />
    </div>
  );
};

export default MyStock;
