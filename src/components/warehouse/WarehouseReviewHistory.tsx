import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, CheckCircle, AlertTriangle, Package, ClipboardCheck, TrendingUp, TrendingDown, History } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';

const fmtQty = (n: number) => {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

interface WarehouseReviewHistoryProps {
  branchId: string;
}

const WarehouseReviewHistory: React.FC<WarehouseReviewHistoryProps> = ({ branchId }) => {
  const [viewSessionId, setViewSessionId] = useState<string | null>(null);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['warehouse-review-history', branchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouse_review_sessions')
        .select('*, reviewer:workers!warehouse_review_sessions_reviewer_id_fkey(full_name)')
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!branchId,
  });

  const { data: sessionItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ['warehouse-review-items', viewSessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouse_review_items')
        .select('*, product:products(name)')
        .eq('session_id', viewSessionId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!viewSessionId,
  });

  // Stats
  const stats = useMemo(() => {
    let totalReviews = sessions.length;
    let totalDiscrepancies = sessions.reduce((s, sess) => s + (sess.total_discrepancies || 0), 0);
    let surplusCount = 0, deficitCount = 0;
    // We'd need items for accurate counts, but session-level is sufficient for overview
    return { totalReviews, totalDiscrepancies };
  }, [sessions]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const viewSession = sessions.find(s => s.id === viewSessionId);
  const productItems = sessionItems.filter(i => i.item_type === 'product');
  const damagedItems = sessionItems.filter(i => i.item_type === 'damaged');
  const palletItems = sessionItems.filter(i => i.item_type === 'pallet');
  const discrepancyItems = sessionItems.filter(i => i.status !== 'matched');
  const matchedItemsView = sessionItems.filter(i => i.status === 'matched');

  return (
    <div className="space-y-3">
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="border-border/60">
          <CardContent className="p-3 text-center">
            <ClipboardCheck className="w-5 h-5 text-primary mx-auto mb-1" />
            <div className="text-lg font-bold text-primary">{stats.totalReviews}</div>
            <div className="text-[10px] text-muted-foreground">عدد المراجعات</div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-3 text-center">
            <AlertTriangle className="w-5 h-5 text-amber-500 mx-auto mb-1" />
            <div className="text-lg font-bold text-amber-600">{stats.totalDiscrepancies}</div>
            <div className="text-[10px] text-muted-foreground">إجمالي الفوارق</div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-3 text-center">
            <CheckCircle className="w-5 h-5 text-primary mx-auto mb-1" />
            <div className="text-lg font-bold text-primary">
              {sessions.length > 0 ? format(new Date(sessions[0].created_at), 'dd/MM') : '—'}
            </div>
            <div className="text-[10px] text-muted-foreground">آخر مراجعة</div>
          </CardContent>
        </Card>
      </div>

      {/* Sessions list */}
      <h4 className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground">
        <History className="w-4 h-4" />
        سجل المراجعات
        <Badge variant="secondary" className="text-[10px]">{sessions.length}</Badge>
      </h4>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            لم تتم أي مراجعة بعد
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="max-h-[50vh]">
          <div className="space-y-2">
            {sessions.map(sess => (
              <Card
                key={sess.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors border-border/60"
                onClick={() => setViewSessionId(sess.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-primary text-primary-foreground text-[10px]">مراجعة</Badge>
                      {(sess.total_discrepancies || 0) > 0 ? (
                        <Badge variant="destructive" className="text-[10px]">{sess.total_discrepancies} فوارق</Badge>
                      ) : (
                        <Badge className="bg-primary/20 text-primary text-[10px]">مطابق</Badge>
                      )}
                      {sess.include_damaged && <Badge variant="outline" className="text-[9px]">تالف</Badge>}
                      {sess.include_pallets && <Badge variant="outline" className="text-[9px]">باليط</Badge>}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {format(new Date(sess.created_at), 'dd/MM/yyyy HH:mm')}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    المراجع: {(sess.reviewer as any)?.full_name || '—'} • {sess.total_products || 0} منتج
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Session details dialog */}
      <Dialog open={!!viewSessionId} onOpenChange={open => { if (!open) setViewSessionId(null); }}>
        <DialogContent className="max-w-md max-h-[85vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="w-4 h-4 text-primary" />
              تفاصيل المراجعة
            </DialogTitle>
          </DialogHeader>

          {itemsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-3">
                {/* Info */}
                {viewSession && (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-muted-foreground">التاريخ:</div>
                    <div>{format(new Date(viewSession.created_at), 'dd/MM/yyyy HH:mm')}</div>
                    <div className="text-muted-foreground">المراجع:</div>
                    <div>{(viewSession.reviewer as any)?.full_name || '—'}</div>
                  </div>
                )}

                {/* Discrepancies */}
                {discrepancyItems.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-destructive flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      الفوارق ({discrepancyItems.length})
                    </p>
                    {discrepancyItems.map(item => (
                      <div key={item.id} className={`rounded-lg px-3 py-2.5 ${
                        item.status === 'deficit' ? 'bg-destructive/10 border border-destructive/30' : 'bg-amber-50 dark:bg-amber-950/10 border border-amber-300'
                      }`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-semibold">
                            {item.item_type === 'pallet' ? '🪵 الباليطات' : (item.product as any)?.name || '—'}
                            {item.item_type === 'damaged' && <span className="text-[10px] text-muted-foreground ms-1">(تالف)</span>}
                          </span>
                          <Badge className={`text-[10px] ${item.status === 'deficit' ? 'bg-destructive text-destructive-foreground' : 'bg-amber-500 text-white'}`}>
                            {item.status === 'deficit' ? 'عجز' : 'فائض'}
                          </Badge>
                        </div>
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          <span>المتوقع: <b>{fmtQty(item.expected_quantity)}</b></span>
                          <span>الفعلي: <b>{fmtQty(item.actual_quantity)}</b></span>
                          <span className="font-bold" style={{ color: item.status === 'deficit' ? '#c00' : '#e65100' }}>
                            {item.status === 'deficit' ? '-' : '+'}{fmtQty(Math.abs(item.difference || 0))}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Matched */}
                {matchedItemsView.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-primary flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      مطابق ({matchedItemsView.length})
                    </p>
                    {matchedItemsView.map(item => (
                      <div key={item.id} className="bg-muted/40 border border-border rounded-lg px-3 py-2 flex items-center justify-between">
                        <span className="text-sm">
                          {item.item_type === 'pallet' ? '🪵 الباليطات' : (item.product as any)?.name || '—'}
                          {item.item_type === 'damaged' && <span className="text-[10px] text-muted-foreground ms-1">(تالف)</span>}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{fmtQty(item.expected_quantity)}</span>
                          <Badge className="bg-primary/80 text-primary-foreground text-[10px]">مطابق</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {sessionItems.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    لا توجد عناصر في هذه المراجعة
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WarehouseReviewHistory;
