import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ClipboardList, ArrowLeft, Calculator, Loader2, AlertTriangle, Info } from 'lucide-react';
import WorkerHandoverSummary from './WorkerHandoverSummary';
import { useSessionCalculations } from '@/hooks/useSessionCalculations';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface WorkerHandoverPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetWorkerId?: string;
  targetWorkerName?: string;
  onProceedToSession?: () => void;
}

const WorkerHandoverPreviewDialog: React.FC<WorkerHandoverPreviewDialogProps> = ({
  open, onOpenChange, targetWorkerId, targetWorkerName, onProceedToSession,
}) => {
  const { workerId, activeBranch } = useAuth();
  const effectiveWorkerId = targetWorkerId || workerId;

  // Fetch the last completed accounting session to use as cutoff
  const { data: lastSessionEnd } = useQuery({
    queryKey: ['last-completed-session-end', effectiveWorkerId],
    queryFn: async () => {
      const { data } = await supabase
        .from('accounting_sessions')
        .select('period_end')
        .eq('worker_id', effectiveWorkerId!)
        .eq('status', 'completed')
        .order('period_end', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.period_end || null;
    },
    enabled: open && !!effectiveWorkerId,
  });

  // Freeze period range while dialog is open to avoid infinite re-fetch loop
  const { periodStart, periodEnd } = useMemo(() => {
    const now = new Date();
    const periodEndValue = now.toISOString();
    const localDateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const periodStartValue = lastSessionEnd || `${localDateKey}T00:00:00+01:00`;

    return {
      periodStart: periodStartValue,
      periodEnd: periodEndValue,
    };
  }, [open, effectiveWorkerId, lastSessionEnd]);

  const { data: calc, isLoading } = useSessionCalculations(
    open && effectiveWorkerId ? { workerId: effectiveWorkerId, branchId: activeBranch?.id || undefined, periodStart, periodEnd } : null
  );

  // Fetch the last REVIEW session and check for sessions after it
  const { data: reviewInfo, isLoading: isCheckingReview } = useQuery({
    queryKey: ['last-review-session-info', effectiveWorkerId],
    queryFn: async () => {
      const { data: lastReview } = await supabase
        .from('loading_sessions')
        .select('id, status, created_at')
        .eq('worker_id', effectiveWorkerId!)
        .eq('status', 'review')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!lastReview) {
        return { hasReview: false, sessionsAfterReview: 0, lastReviewDate: null };
      }

      const { count } = await supabase
        .from('loading_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('worker_id', effectiveWorkerId!)
        .neq('status', 'review')
        .gt('created_at', lastReview.created_at);

      return {
        hasReview: true,
        sessionsAfterReview: count || 0,
        lastReviewDate: lastReview.created_at,
      };
    },
    enabled: open && !!effectiveWorkerId,
  });

  const canProceed = reviewInfo?.hasReview === true;
  const hasSessionsAfterReview = (reviewInfo?.sessionsAfterReview || 0) > 0;

  if (!effectiveWorkerId) return null;

  const title = targetWorkerName ? `ملخص التسليم - ${targetWorkerName}` : 'ملخص التسليم اليومي';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-md p-0 gap-0 max-h-[85vh] overflow-hidden" dir="rtl">
        <DialogHeader className="p-4 pb-3 border-b bg-muted/30">
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <ClipboardList className="w-4 h-4 text-primary" />
            </div>
            <span className="truncate">{title}</span>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(85vh-10rem)] px-4 py-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : calc ? (
            <div className="space-y-3">
              {/* Warning: sessions after last review */}
              {hasSessionsAfterReview && (
                <Alert className="rounded-xl border-orange-300 bg-orange-50 dark:bg-orange-900/10">
                  <Info className="h-4 w-4 text-orange-600" />
                  <AlertDescription className="text-sm font-medium text-orange-800 dark:text-orange-400">
                    ⚠️ توجد {reviewInfo!.sessionsAfterReview} جلسة شحن/تفريغ بعد آخر جلسة مراجعة — المحاسبة ستكون بناءً على آخر جلسة مراجعة فقط ولن تُحتسب الجلسات اللاحقة
                  </AlertDescription>
                </Alert>
              )}
              <WorkerHandoverSummary
                workerId={effectiveWorkerId}
                periodStart={periodStart}
                periodEnd={periodEnd}
                calc={calc}
                coinAmount={0}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              لا توجد بيانات لهذا العامل اليوم
            </div>
          )}
        </ScrollArea>

        {!isCheckingReview && !canProceed && (
          <div className="px-4">
            <Alert variant="destructive" className="rounded-xl">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm font-medium">
                لا يمكن الانتقال لجلسة المحاسبة — لا توجد أي جلسة مراجعة للشاحنة
              </AlertDescription>
            </Alert>
          </div>
        )}

        <div className="p-4 border-t flex gap-2">
          <Button
            variant="outline"
            className="flex-1 rounded-xl h-11"
            onClick={() => onOpenChange(false)}
          >
            <ArrowLeft className="w-4 h-4 me-1.5" />
            العودة
          </Button>
          {onProceedToSession && (
            <Button
              className="flex-1 rounded-xl h-11 text-base font-bold"
              disabled={!canProceed || isCheckingReview}
              onClick={() => {
                onOpenChange(false);
                onProceedToSession();
              }}
            >
              {isCheckingReview ? <Loader2 className="w-4 h-4 animate-spin me-1.5" /> : <Calculator className="w-4 h-4 me-1.5" />}
              الانتقال للجلسة
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WorkerHandoverPreviewDialog;
