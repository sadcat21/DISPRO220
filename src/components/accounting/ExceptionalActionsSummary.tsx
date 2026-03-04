import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, Edit, Printer, XCircle, Trash2, Gift, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

interface ExceptionalActionsSummaryProps {
  workerId: string;
  periodStart: string;
  periodEnd: string;
}

interface ExceptionalAction {
  id: string;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, any> | null;
  created_at: string;
}

const EXCEPTIONAL_ACTIONS = [
  'update',        // post-delivery modifications
  'delete',        // order deletions
  'status_change', // cancellations
  'payment_update', // payment changes
  'reprint',       // receipt reprints
];

const toTz = (v: string, isEnd: boolean) => {
  if (v.includes('+') || v.includes('Z')) return v;
  if (v.includes('T')) return v + ':00+01:00';
  return isEnd ? v + 'T23:59:59+01:00' : v + 'T00:00:00+01:00';
};

const getActionIcon = (action: ExceptionalAction) => {
  const details = action.details || {};
  const isPostDelivery = details?.نوع_التعديل === 'تعديل بعد التوصيل';
  
  if (action.action_type === 'delete') return <Trash2 className="w-3.5 h-3.5 text-destructive" />;
  if (action.action_type === 'status_change' && details?.الحالة_الجديدة === 'cancelled')
    return <XCircle className="w-3.5 h-3.5 text-destructive" />;
  if (action.action_type === 'reprint') return <Printer className="w-3.5 h-3.5 text-amber-600" />;
  if (isPostDelivery) return <Edit className="w-3.5 h-3.5 text-orange-600" />;
  if (action.action_type === 'update') return <Edit className="w-3.5 h-3.5 text-blue-600" />;
  return <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />;
};

const getActionLabel = (action: ExceptionalAction): string => {
  const details = action.details || {};
  
  if (action.action_type === 'delete' && action.entity_type === 'order')
    return 'حذف طلبية';
  if (action.action_type === 'delete' && action.entity_type === 'promo')
    return 'حذف عملية برومو';
  if (action.action_type === 'status_change' && details?.الحالة_الجديدة === 'cancelled')
    return 'إلغاء طلبية';
  if (action.action_type === 'reprint')
    return 'إعادة طباعة وصل';
  if (action.action_type === 'payment_update')
    return 'تعديل طريقة الدفع';
  if (details?.نوع_التعديل === 'تعديل بعد التوصيل')
    return 'تعديل بعد التوصيل';
  if (action.action_type === 'update' && action.entity_type === 'order')
    return 'تعديل طلبية';
  if (action.action_type === 'update' && action.entity_type === 'promo')
    return 'تعديل برومو';
  return `${action.action_type} - ${action.entity_type}`;
};

const getActionColor = (action: ExceptionalAction): string => {
  const details = action.details || {};
  if (action.action_type === 'delete' || (action.action_type === 'status_change' && details?.الحالة_الجديدة === 'cancelled'))
    return 'bg-destructive/10 border-destructive/30';
  if (details?.نوع_التعديل === 'تعديل بعد التوصيل')
    return 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800';
  return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
};

const formatChanges = (details: Record<string, any> | null): string[] => {
  if (!details) return [];
  const lines: string[] = [];
  
  if (details.العميل) lines.push(`العميل: ${details.العميل}`);
  
  // Post-delivery modifications - show item changes
  if (details.التغييرات && Array.isArray(details.التغييرات)) {
    for (const change of details.التغييرات) {
      if (change.عملية === 'تعديل كمية') {
        const giftInfo = change.هدية_سابقة !== undefined && change.هدية_جديدة !== undefined
          ? ` | هدية: ${change.هدية_سابقة} ← ${change.هدية_جديدة}`
          : '';
        lines.push(`${change.منتج}: ${change.كمية_سابقة} ← ${change.كمية_جديدة}${giftInfo}`);
      } else if (change.عملية === 'حذف') {
        lines.push(`${change.منتج}: حذف (${change.كمية_سابقة})`);
      } else if (change.عملية === 'إضافة جديد') {
        lines.push(`${change.منتج}: إضافة (${change.كمية})`);
      }
    }
  }

  if (details.طريقة_دفع_الفارق) {
    lines.push(`دفع الفارق: ${details.طريقة_دفع_الفارق}${details.المبلغ_المدفوع ? ` (${Number(details.المبلغ_المدفوع).toLocaleString()} DA)` : ''}`);
  }

  return lines;
};

const ExceptionalActionsSummary: React.FC<ExceptionalActionsSummaryProps> = ({
  workerId, periodStart, periodEnd,
}) => {
  const { data: actions, isLoading } = useQuery({
    queryKey: ['session-exceptional-actions', workerId, periodStart, periodEnd],
    queryFn: async (): Promise<ExceptionalAction[]> => {
      const startTz = toTz(periodStart, false);
      const endTz = toTz(periodEnd, true);

      const { data, error } = await supabase
        .from('activity_logs')
        .select('id, action_type, entity_type, entity_id, details, created_at')
        .eq('worker_id', workerId)
        .in('action_type', EXCEPTIONAL_ACTIONS)
        .gte('created_at', startTz)
        .lte('created_at', endTz)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filter to truly exceptional actions (exclude routine status changes like "assigned" -> "in_progress")
      return (data || []).filter((a: any) => {
        const details = a.details || {};
        // Keep cancellations
        if (a.action_type === 'status_change' && details?.الحالة_الجديدة === 'cancelled') return true;
        // Skip routine status transitions
        if (a.action_type === 'status_change' && ['in_progress', 'delivered', 'assigned'].includes(details?.الحالة_الجديدة)) return false;
        // Keep all deletes, updates, reprints, payment_updates
        if (['delete', 'update', 'reprint', 'payment_update'].includes(a.action_type)) return true;
        return false;
      }) as ExceptionalAction[];
    },
    enabled: !!workerId && !!periodStart && !!periodEnd,
  });

  // Count gift reversals from post-delivery changes
  const giftReversals = (actions || []).filter(a => {
    const details = a.details || {};
    if (details?.نوع_التعديل !== 'تعديل بعد التوصيل') return false;
    const changes = details?.التغييرات;
    if (!Array.isArray(changes)) return false;
    return changes.some((c: any) => 
      c.هدية_سابقة !== undefined && c.هدية_جديدة !== undefined && c.هدية_سابقة !== c.هدية_جديدة
    );
  });

  const isEmpty = !actions || actions.length === 0;

  return (
    <div className="border-2 border-amber-200 dark:border-amber-800 rounded-xl p-3.5 space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle className="w-4 h-4 text-amber-600" />
        <span className="font-semibold text-sm">إجراءات استثنائية</span>
        <Badge variant="outline" className="text-xs">{actions.length}</Badge>
        {giftReversals.length > 0 && (
          <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 text-[10px]">
            <RotateCcw className="w-3 h-3 ml-1" />
            {giftReversals.length} تراجع هدايا
          </Badge>
        )}
      </div>

      {isEmpty ? (
        <p className="text-xs text-muted-foreground">لا توجد إجراءات استثنائية خلال هذه الفترة ✓</p>
      ) : (
        <div className="space-y-1.5">
          {actions!.map(action => {
            const changeLines = formatChanges(action.details);
            return (
              <div
                key={action.id}
                className={`rounded-lg border p-2.5 space-y-1 ${getActionColor(action)}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {getActionIcon(action)}
                    <span className="text-xs font-semibold">{getActionLabel(action)}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(action.created_at), 'HH:mm', { locale: ar })}
                  </span>
                </div>
                {action.entity_id && (
                  <p className="text-[10px] text-muted-foreground font-mono">
                    #{action.entity_id.slice(0, 8)}
                  </p>
                )}
                {changeLines.length > 0 && (
                  <div className="space-y-0.5 pt-0.5">
                    {changeLines.map((line, idx) => (
                      <p key={idx} className="text-[11px] text-foreground/80 leading-tight">{line}</p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ExceptionalActionsSummary;
