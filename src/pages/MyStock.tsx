import React, { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, Loader2, ShoppingBag, TrendingDown, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import DirectSaleDialog from '@/components/warehouse/DirectSaleDialog';

const MyStock: React.FC = () => {
  const { t } = useLanguage();
  const { workerId } = useAuth();
  const [showSaleDialog, setShowSaleDialog] = useState(false);

  const { data: stockItems, isLoading } = useQuery({
    queryKey: ['my-worker-stock', workerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worker_stock')
        .select('*, product:products(*)')
        .eq('worker_id', workerId!);

      if (error) throw error;
      return data;
    },
    enabled: !!workerId,
  });

  // Fetch stock movements to calculate loaded and sold quantities
  const { data: movements } = useQuery({
    queryKey: ['my-stock-movements', workerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('product_id, quantity, movement_type')
        .eq('worker_id', workerId!)
        .in('movement_type', ['load', 'delivery']);

      if (error) throw error;
      return data || [];
    },
    enabled: !!workerId,
  });

  // Calculate loaded and sold per product
  const movementStats = useMemo(() => {
    const stats: Record<string, { loaded: number; sold: number }> = {};
    for (const m of (movements || [])) {
      if (!stats[m.product_id]) stats[m.product_id] = { loaded: 0, sold: 0 };
      if (m.movement_type === 'load') stats[m.product_id].loaded += m.quantity;
      else if (m.movement_type === 'delivery') stats[m.product_id].sold += m.quantity;
    }
    return stats;
  }, [movements]);

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
        {hasStock && (
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
