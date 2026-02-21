import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, Loader2, ShoppingBag } from 'lucide-react';
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
            return (
              <Card key={item.id} className={isZero ? 'opacity-50' : ''}>
                <CardContent className="p-3 flex items-center justify-between">
                  <span className={`font-medium ${isZero ? 'text-muted-foreground' : ''}`}>
                    {(item as any).product?.name}
                  </span>
                  <span className={`font-bold text-lg ${isZero ? 'text-muted-foreground' : 'text-primary'}`}>
                    {item.quantity}
                  </span>
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
