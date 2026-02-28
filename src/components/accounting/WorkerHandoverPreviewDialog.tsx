import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ClipboardList, ArrowLeft, Calculator, Loader2 } from 'lucide-react';
import WorkerHandoverSummary from './WorkerHandoverSummary';
import { useSessionCalculations } from '@/hooks/useSessionCalculations';
import { useAuth } from '@/contexts/AuthContext';

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

  const today = new Date().toISOString().split('T')[0];
  const periodStart = today + 'T00:00:00+01:00';
  const periodEnd = today + 'T23:59:59+01:00';

  const { data: calc, isLoading } = useSessionCalculations(
    open && effectiveWorkerId ? { workerId: effectiveWorkerId, branchId: activeBranch?.id || undefined, periodStart, periodEnd } : null
  );

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
            <WorkerHandoverSummary
              workerId={effectiveWorkerId}
              periodStart={periodStart}
              periodEnd={periodEnd}
              calc={calc}
              coinAmount={0}
            />
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              لا توجد بيانات لهذا العامل اليوم
            </div>
          )}
        </ScrollArea>

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
              onClick={() => {
                onOpenChange(false);
                onProceedToSession();
              }}
            >
              <Calculator className="w-4 h-4 me-1.5" />
              الانتقال للجلسة
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WorkerHandoverPreviewDialog;
