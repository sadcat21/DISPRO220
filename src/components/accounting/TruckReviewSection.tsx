import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, CheckCircle, Truck, PackageCheck, Loader2 } from 'lucide-react';

interface TruckReviewSectionProps {
  workerId: string;
}

const TruckReviewSection: React.FC<TruckReviewSectionProps> = ({ workerId }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['truck-review-section', workerId],
    queryFn: async () => {
      // Get the latest loading session for this worker
      const { data: latestSession } = await supabase
        .from('loading_sessions')
        .select('id, status, created_at, notes')
        .eq('worker_id', workerId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!latestSession || latestSession.length === 0) {
        return { reviewed: false, session: null, items: [], discrepancies: [] };
      }

      const session = latestSession[0];
      const isReview = session.status === 'review';

      if (!isReview) {
        return { reviewed: false, session, items: [], discrepancies: [] };
      }

      // Fetch review items
      const { data: items } = await supabase
        .from('loading_session_items')
        .select('*, product:products(name)')
        .eq('session_id', session.id);

      // Fetch discrepancies from this session
      const { data: discrepancies } = await supabase
        .from('stock_discrepancies')
        .select('*, product:products(name)')
        .eq('source_session_id', session.id)
        .eq('status', 'pending');

      return {
        reviewed: true,
        session,
        items: items || [],
        discrepancies: discrepancies || [],
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

  // Not reviewed
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

  // Reviewed - show details
  const deficits = data.discrepancies.filter((d: any) => d.discrepancy_type === 'deficit');
  const surpluses = data.discrepancies.filter((d: any) => d.discrepancy_type === 'surplus');
  const matchedCount = data.items.filter((i: any) => {
    const notes = i.notes || '';
    return notes === 'مطابق';
  }).length;

  return (
    <div className="space-y-2">
      {/* Status header */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-300 dark:border-green-800">
        <div className="w-8 h-8 rounded-lg bg-green-600/20 flex items-center justify-center shrink-0">
          <CheckCircle className="w-4 h-4 text-green-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-green-700 dark:text-green-400">تمت مراجعة الشاحنة ✓</p>
          <p className="text-[11px] text-muted-foreground">
            المنتجات المراجعة: {data.items.length}
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {matchedCount > 0 && (
            <Badge className="bg-green-600 text-white text-[10px]">{matchedCount} مطابق</Badge>
          )}
          {deficits.length > 0 && (
            <Badge variant="destructive" className="text-[10px]">{deficits.length} عجز</Badge>
          )}
          {surpluses.length > 0 && (
            <Badge className="bg-orange-500 text-white text-[10px]">{surpluses.length} فائض</Badge>
          )}
        </div>
      </div>

      {/* Discrepancies details */}
      {data.discrepancies.length > 0 && (
        <div className="space-y-1.5">
          {deficits.map((d: any) => (
            <div key={d.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/20">
              <span className="text-xs font-medium">{(d.product as any)?.name || ''}</span>
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="text-[10px]">عجز</Badge>
                <span className="text-xs font-bold text-destructive">-{Number(d.quantity).toFixed(2)}</span>
              </div>
            </div>
          ))}
          {surpluses.map((d: any) => (
            <div key={d.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-orange-50/50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800">
              <span className="text-xs font-medium">{(d.product as any)?.name || ''}</span>
              <div className="flex items-center gap-2">
                <Badge className="bg-orange-500 text-white text-[10px]">فائض</Badge>
                <span className="text-xs font-bold text-orange-600">+{Number(d.quantity).toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TruckReviewSection;
