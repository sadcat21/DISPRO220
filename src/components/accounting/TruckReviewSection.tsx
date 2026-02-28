import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, CheckCircle, Loader2, Package } from 'lucide-react';

interface TruckReviewSectionProps {
  workerId: string;
}

const TruckReviewSection: React.FC<TruckReviewSectionProps> = ({ workerId }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['truck-review-section', workerId],
    queryFn: async () => {
      // Get the latest loading session
      const { data: latestSession } = await supabase
        .from('loading_sessions')
        .select('id, status, created_at, notes')
        .eq('worker_id', workerId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!latestSession || latestSession.length === 0) {
        return { reviewed: false, items: [] };
      }

      const session = latestSession[0];
      if (session.status !== 'review') {
        return { reviewed: false, items: [] };
      }

      // Fetch all review items with product names
      const { data: items } = await supabase
        .from('loading_session_items')
        .select('*, product:products(name)')
        .eq('session_id', session.id);

      return {
        reviewed: true,
        items: (items || []).map((item: any) => {
          const actualQty = item.quantity;
          const systemQty = item.previous_quantity;
          const diff = actualQty - systemQty;
          const status = Math.abs(diff) < 0.001 ? 'match' : diff > 0 ? 'surplus' : 'deficit';
          return {
            id: item.id,
            product_name: item.product?.name || '',
            system_qty: systemQty,
            actual_qty: actualQty,
            difference: diff,
            status,
          };
        }),
      };
    },
    enabled: !!workerId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) return null;

  if (!data.reviewed) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl bg-destructive/10 border border-destructive/30">
        <div className="w-8 h-8 rounded-lg bg-destructive/20 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-4 h-4 text-destructive" />
        </div>
        <div>
          <p className="text-sm font-bold text-destructive">لم تتم مراجعة الشاحنة</p>
          <p className="text-[11px] text-muted-foreground">آخر جلسة ليست جلسة مراجعة - يجب إجراء مراجعة قبل المحاسبة</p>
        </div>
      </div>
    );
  }

  const discrepancies = data.items.filter(i => i.status !== 'match');
  const matchedItems = data.items.filter(i => i.status === 'match');
  const deficits = discrepancies.filter(i => i.status === 'deficit');
  const surpluses = discrepancies.filter(i => i.status === 'surplus');

  return (
    <div className="space-y-3">
      {/* Header with counts */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold">المنتجات المراجعة ({data.items.length})</span>
        </div>
        <div className="flex gap-1.5 ms-auto flex-wrap">
          {matchedItems.length > 0 && (
            <Badge className="bg-green-600 text-white text-[10px]">{matchedItems.length} مطابق</Badge>
          )}
          {deficits.length > 0 && (
            <Badge variant="destructive" className="text-[10px]">{deficits.length} عجز</Badge>
          )}
          {surpluses.length > 0 && (
            <Badge className="bg-orange-500 text-white text-[10px]">{surpluses.length} فائض</Badge>
          )}
        </div>
      </div>

      {/* Discrepancies */}
      {discrepancies.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            الفوارق ({discrepancies.length})
          </h4>
          {discrepancies.map(item => (
            <Card key={item.id} className={`border ${
              item.status === 'deficit'
                ? 'border-destructive/40 bg-destructive/5'
                : 'border-orange-300 bg-orange-50/50 dark:bg-orange-900/10'
            }`}>
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{item.product_name}</span>
                  <Badge
                    className={`text-[10px] ${
                      item.status === 'deficit'
                        ? 'bg-destructive text-white'
                        : 'bg-orange-500 text-white'
                    }`}
                  >
                    {item.status === 'deficit' ? 'عجز' : 'فائض'}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">رصيد النظام:</span>
                    <div className="font-medium">{item.system_qty}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">الكمية الفعلية:</span>
                    <div className="font-medium">{item.actual_qty}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">الفارق:</span>
                    <div className={`font-bold ${item.status === 'deficit' ? 'text-destructive' : 'text-orange-600'}`}>
                      {item.status === 'deficit' ? '-' : '+'}{Math.abs(item.difference).toFixed(2)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Matched items */}
      {matchedItems.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5 text-green-600" />
            مطابق ({matchedItems.length})
          </h4>
          {matchedItems.map(item => (
            <div key={item.id} className="flex items-center justify-between bg-green-50/50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
              <span className="text-xs font-medium">{item.product_name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{item.system_qty}</span>
                <Badge className="bg-green-600 text-white text-[10px]">مطابق</Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* All matched message */}
      {discrepancies.length === 0 && data.items.length > 0 && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800">
          <CheckCircle className="w-4 h-4 text-green-600" />
          <span className="text-xs font-medium text-green-700 dark:text-green-400">جميع المنتجات مطابقة ✓</span>
        </div>
      )}
    </div>
  );
};

export default TruckReviewSection;
