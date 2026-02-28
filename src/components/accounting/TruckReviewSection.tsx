import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Loader2, Package, User } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TruckReviewSectionProps {
  workerId: string;
}

type LatestSession = {
  id: string;
  status: string;
  created_at: string;
  notes: string | null;
  manager: { full_name: string } | null;
};

type ReviewItem = {
  id: string;
  product_id: string;
  previous_quantity: number;
  quantity: number;
  product: { name: string } | null;
};

type ReviewDiscrepancy = {
  id: string;
  product_id: string;
  discrepancy_type: 'deficit' | 'surplus';
  quantity: number;
  product: { name: string } | null;
};

const TruckReviewSection: React.FC<TruckReviewSectionProps> = ({ workerId }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['truck-review-section', workerId],
    queryFn: async () => {
      const { data: latestSessionData } = await supabase
        .from('loading_sessions')
        .select('id, status, created_at, notes, manager:workers!loading_sessions_manager_id_fkey(full_name)')
        .eq('worker_id', workerId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!latestSessionData || latestSessionData.length === 0) {
        return {
          hasSession: false,
          reviewed: false,
          session: null as LatestSession | null,
          items: [] as ReviewItem[],
          discrepancies: [] as ReviewDiscrepancy[],
        };
      }

      const session = latestSessionData[0] as unknown as LatestSession;

      if (session.status !== 'review') {
        return {
          hasSession: true,
          reviewed: false,
          session,
          items: [] as ReviewItem[],
          discrepancies: [] as ReviewDiscrepancy[],
        };
      }

      const [itemsResult, discrepanciesResult] = await Promise.all([
        supabase
          .from('loading_session_items')
          .select('id, product_id, previous_quantity, quantity, product:products(name)')
          .eq('session_id', session.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('stock_discrepancies')
          .select('id, product_id, discrepancy_type, quantity, product:products(name)')
          .eq('source_session_id', session.id)
          .order('created_at', { ascending: true }),
      ]);

      const reviewItems = (itemsResult.data || []) as unknown as ReviewItem[];
      const dbDiscrepancies = (discrepanciesResult.data || []) as unknown as ReviewDiscrepancy[];

      // Fallback from session items (in case discrepancy rows are missing)
      const fallbackDiscrepancies: ReviewDiscrepancy[] = reviewItems
        .map((item) => {
          const diff = Number(item.quantity || 0) - Number(item.previous_quantity || 0);
          if (Math.abs(diff) < 0.001) return null;
          return {
            id: `fallback-${item.id}`,
            product_id: item.product_id,
            discrepancy_type: diff > 0 ? 'surplus' : 'deficit',
            quantity: Math.abs(diff),
            product: item.product,
          };
        })
        .filter(Boolean) as ReviewDiscrepancy[];

      const existingProductIds = new Set(dbDiscrepancies.map((d) => d.product_id));
      const mergedDiscrepancies = [
        ...dbDiscrepancies,
        ...fallbackDiscrepancies.filter((d) => !existingProductIds.has(d.product_id)),
      ];

      return {
        hasSession: true,
        reviewed: true,
        session,
        items: reviewItems,
        discrepancies: mergedDiscrepancies,
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

  if (!data.hasSession) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/60 border border-border">
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <AlertTriangle className="w-4 h-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-bold">لا توجد جلسات شاحنة</p>
          <p className="text-[11px] text-muted-foreground">لم يتم تسجيل أي جلسة شحن/تفريغ/مراجعة لهذا العامل بعد</p>
        </div>
      </div>
    );
  }

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

  const reviewSession = data.session;
  const discrepancyProductIds = new Set(data.discrepancies.map((d) => d.product_id));
  const matchedItems = data.items.filter((item) => !discrepancyProductIds.has(item.product_id));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="text-muted-foreground">الحالة:</div>
        <div>
          <Badge className="text-xs bg-primary text-primary-foreground">مراجعة</Badge>
        </div>

        <div className="text-muted-foreground">التاريخ:</div>
        <div className="text-sm">{new Date(reviewSession!.created_at).toLocaleString('ar-DZ')}</div>

        <div className="text-muted-foreground">المصدر:</div>
        <div className="text-sm flex items-center gap-1">
          <User className="w-3.5 h-3.5 text-muted-foreground" />
          {reviewSession?.manager?.full_name || 'مدير النظام'}
        </div>

        {reviewSession?.notes && (
          <>
            <div className="text-muted-foreground">ملاحظات:</div>
            <div className="text-sm">{reviewSession.notes}</div>
          </>
        )}
      </div>

      <div className="border-t pt-3 space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-1">
          <Package className="w-4 h-4" />
          المنتجات المراجعة ({data.items.length})
        </h4>

        {data.items.length === 0 && data.discrepancies.length === 0 ? (
          <div className="text-center py-3">
            <CheckCircle className="w-6 h-6 text-primary mx-auto mb-1" />
            <p className="text-sm font-medium">لا توجد منتجات مسجلة في الجلسة</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[38vh]">
            <div className="space-y-2">
              {data.discrepancies.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-destructive flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    الفوارق ({data.discrepancies.length})
                  </p>

                  {data.discrepancies.map((disc) => (
                    <div
                      key={disc.id}
                      className={`rounded-lg px-3 py-2.5 ${
                        disc.discrepancy_type === 'deficit'
                          ? 'bg-destructive/10 border border-destructive/30'
                          : 'bg-orange-50 dark:bg-orange-900/10 border border-orange-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold">{disc.product?.name || '—'}</span>
                        <Badge
                          className={`text-[10px] ${
                            disc.discrepancy_type === 'deficit'
                              ? 'bg-destructive text-destructive-foreground'
                              : 'bg-orange-500 text-white'
                          }`}
                        >
                          {disc.discrepancy_type === 'deficit' ? 'عجز' : 'فائض'}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        الفارق: <span className="font-bold">{Number(disc.quantity).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {matchedItems.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  <p className="text-xs font-semibold text-primary flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    مطابق ({matchedItems.length})
                  </p>

                  {matchedItems.map((item) => (
                    <div key={item.id} className="bg-muted/40 border border-border rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{item.product?.name || '—'}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{Number(item.previous_quantity || 0)}</span>
                          <Badge className="bg-primary/80 text-primary-foreground text-[10px]">مطابق</Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
};

export default TruckReviewSection;
