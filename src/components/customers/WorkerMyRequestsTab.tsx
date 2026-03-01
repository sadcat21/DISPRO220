import React, { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Clock, Check, X, Store, Phone, MapPin, Trash2 } from 'lucide-react';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { differenceInHours } from 'date-fns';

interface WorkerRequest {
  id: string;
  operation_type: string;
  customer_id: string | null;
  payload: any;
  status: string;
  created_at: string;
  reviewed_at: string | null;
}

const WorkerMyRequestsTab: React.FC = () => {
  const { workerId } = useAuth();

  // Realtime: invalidate react-query cache on any change
  useRealtimeSubscription(
    'worker-my-requests-realtime',
    [{ table: 'customer_approval_requests', filter: workerId ? `requested_by=eq.${workerId}` : undefined }],
    [['worker-my-requests', workerId || '']],
    !!workerId,
  );

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['worker-my-requests', workerId || ''],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_approval_requests' as any)
        .select('*')
        .eq('requested_by', workerId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as unknown as WorkerRequest[]) || [];
    },
    enabled: !!workerId,
    refetchInterval: 10000, // Polling fallback every 10s
  });

  // Filter out approved/rejected requests older than 24 hours
  const visibleRequests = requests.filter(r => {
    if (r.status === 'pending') return true;
    if (r.reviewed_at) {
      return differenceInHours(new Date(), new Date(r.reviewed_at)) < 24;
    }
    return true;
  });

  const pendingCount = visibleRequests.filter(r => r.status === 'pending').length;
  const approvedCount = visibleRequests.filter(r => r.status === 'approved').length;
  const rejectedCount = visibleRequests.filter(r => r.status === 'rejected').length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-2">
      {/* Counters */}
      <div className="flex gap-2 flex-wrap">
        <Badge variant="outline" className="text-xs gap-1 px-2 py-1">
          <Clock className="w-3 h-3 text-amber-500" />
          قيد المراجعة: <span className="font-bold text-amber-600">{pendingCount}</span>
        </Badge>
        <Badge variant="outline" className="text-xs gap-1 px-2 py-1">
          <Check className="w-3 h-3 text-green-600" />
          تمت الموافقة: <span className="font-bold text-green-600">{approvedCount}</span>
        </Badge>
        <Badge variant="outline" className="text-xs gap-1 px-2 py-1">
          <X className="w-3 h-3 text-destructive" />
          مرفوض: <span className="font-bold text-destructive">{rejectedCount}</span>
        </Badge>
      </div>

      {visibleRequests.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-secondary/20 rounded-lg border-2 border-dashed">
          <Clock className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">لم تقدم أي طلبات تعديل بعد</p>
        </div>
      ) : (
        visibleRequests.map((req) => (
          <Card key={req.id} className="overflow-hidden">
            <div className={`h-1 w-full ${
              req.status === 'pending' ? 'bg-amber-500' :
              req.status === 'approved' ? 'bg-green-500' : 'bg-destructive'
            }`} />
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={
                    req.operation_type === 'update' ? 'outline' :
                    req.operation_type === 'insert' ? 'secondary' : 'destructive'
                  } className={`text-[10px] gap-0.5 ${req.operation_type === 'delete' ? 'bg-destructive/10' : ''}`}>
                    {req.operation_type === 'delete' && <Trash2 className="w-2.5 h-2.5" />}
                    {req.operation_type === 'update' ? 'طلب تعديل' :
                     req.operation_type === 'insert' ? 'طلب إضافة' : 'طلب حذف'}
                  </Badge>
                  <Badge className={`text-[10px] ${
                    req.status === 'pending' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
                    req.status === 'approved' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                    'bg-destructive/10 text-destructive'
                  }`}>
                    {req.status === 'pending' ? 'قيد المراجعة' :
                     req.status === 'approved' ? 'تمت الموافقة' : 'مرفوض'}
                  </Badge>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(req.created_at).toLocaleString('ar-DZ')}
                </span>
              </div>

              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-primary" />
                {req.payload?.store_name || req.payload?.name || req.payload?.customerName || '—'}
              </h4>

              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                {req.payload?.phone && (
                  <span className="flex items-center gap-0.5">
                    <Phone className="w-3 h-3" />
                    <span dir="ltr">{req.payload.phone}</span>
                  </span>
                )}
                {req.payload?.wilaya && (
                  <span className="flex items-center gap-0.5">
                    <MapPin className="w-3 h-3" />
                    {req.payload.wilaya}
                  </span>
                )}
              </div>

              {req.status === 'approved' && req.reviewed_at && (
                <p className="text-[10px] text-green-600">✓ تمت الموافقة بتاريخ {new Date(req.reviewed_at).toLocaleString('ar-DZ')}</p>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
};

export default WorkerMyRequestsTab;
