import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { ShoppingCart, Truck, MapPin, UserPlus, Edit2, Banknote, Eye, Package, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { getOperationLabel, type OperationType } from '@/hooks/useVisitTracking';

interface WorkerAchievementsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerId?: string;
  workerName?: string;
}

const OPERATION_ICONS: Record<string, React.ReactNode> = {
  order: <ShoppingCart className="w-4 h-4 text-blue-600" />,
  direct_sale: <Package className="w-4 h-4 text-emerald-600" />,
  delivery: <Truck className="w-4 h-4 text-green-600" />,
  add_customer: <UserPlus className="w-4 h-4 text-purple-600" />,
  update_customer: <Edit2 className="w-4 h-4 text-amber-600" />,
  delete_customer: <Edit2 className="w-4 h-4 text-red-600" />,
  debt_collection: <Banknote className="w-4 h-4 text-orange-600" />,
  visit: <Eye className="w-4 h-4 text-cyan-600" />,
  delivery_visit: <MapPin className="w-4 h-4 text-teal-600" />,
};

const OPERATION_COLORS: Record<string, string> = {
  order: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200',
  direct_sale: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200',
  delivery: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200',
  add_customer: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200',
  update_customer: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200',
  delete_customer: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200',
  debt_collection: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200',
  visit: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border-cyan-200',
  delivery_visit: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-200',
};

const WorkerAchievementsDialog: React.FC<WorkerAchievementsDialogProps> = ({
  open, onOpenChange, workerId, workerName
}) => {
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data, isLoading } = useQuery({
    queryKey: ['worker-achievements', workerId, today],
    queryFn: async () => {
      if (!workerId) return { visits: [], orderCount: 0, deliveryCount: 0 };

      // Fetch today's visits
      const { data: visits } = await supabase
        .from('visit_tracking')
        .select('*')
        .eq('worker_id', workerId)
        .gte('created_at', today + 'T00:00:00')
        .lte('created_at', today + 'T23:59:59')
        .order('created_at', { ascending: false });

      // Get customer names
      const customerIds = [...new Set((visits || []).filter(v => v.customer_id).map(v => v.customer_id!))];
      let customerMap = new Map<string, string>();
      if (customerIds.length > 0) {
        const { data: customers } = await supabase
          .from('customers')
          .select('id, name, store_name')
          .in('id', customerIds);
        for (const c of (customers || [])) {
          customerMap.set(c.id, c.store_name || c.name);
        }
      }

      const enrichedVisits = (visits || []).map(v => ({
        ...v,
        customer_name: v.customer_id ? customerMap.get(v.customer_id) || '' : '',
      }));

      // Count by type
      const counts: Record<string, number> = {};
      for (const v of enrichedVisits) {
        counts[v.operation_type] = (counts[v.operation_type] || 0) + 1;
      }

      return { visits: enrichedVisits, counts };
    },
    enabled: open && !!workerId,
  });

  const counts = data?.counts || {};
  const visits = data?.visits || [];
  const totalOps = visits.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            منجزات اليوم - {workerName}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : totalOps === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <MapPin className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p>لا توجد عمليات مسجلة اليوم</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary badges */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(counts).map(([type, count]) => (
                <Badge key={type} variant="outline" className={`gap-1.5 px-2.5 py-1 ${OPERATION_COLORS[type] || ''}`}>
                  {OPERATION_ICONS[type]}
                  <span>{getOperationLabel(type as OperationType)}</span>
                  <span className="font-bold">{count}</span>
                </Badge>
              ))}
              <Badge variant="secondary" className="gap-1 px-2.5 py-1 font-bold">
                الإجمالي: {totalOps}
              </Badge>
            </div>

            {/* Timeline */}
            <ScrollArea className="max-h-[50vh]">
              <div className="space-y-2">
                {visits.map((v: any) => (
                  <div key={v.id} className={`flex items-start gap-3 p-2.5 rounded-lg border ${OPERATION_COLORS[v.operation_type] || 'border-border'}`}>
                    <div className="mt-0.5">
                      {OPERATION_ICONS[v.operation_type] || <MapPin className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{getOperationLabel(v.operation_type as OperationType)}</span>
                        <span className="text-[10px] text-muted-foreground" dir="ltr">
                          {format(new Date(v.created_at), 'HH:mm')}
                        </span>
                      </div>
                      {v.customer_name && (
                        <p className="text-xs text-muted-foreground truncate">{v.customer_name}</p>
                      )}
                      {v.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{v.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default WorkerAchievementsDialog;
