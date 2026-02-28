import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ClipboardList } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSessionCalculations } from '@/hooks/useSessionCalculations';
import WorkerHandoverSummary from './WorkerHandoverSummary';

interface WorkerHandoverPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const WorkerHandoverPreviewDialog: React.FC<WorkerHandoverPreviewDialogProps> = ({ open, onOpenChange }) => {
  const { workerId, activeBranch } = useAuth();

  const today = new Date().toISOString().split('T')[0];
  const periodStart = today + 'T00:00:00+01:00';
  const periodEnd = today + 'T23:59:59+01:00';

  const { data: calc } = useSessionCalculations(
    open && workerId ? { workerId, branchId: activeBranch?.id || undefined, periodStart, periodEnd } : null
  );

  if (!workerId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-md p-4 gap-3 max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader className="pb-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="w-4 h-4 shrink-0" />
            ملخص التسليم اليومي
          </DialogTitle>
        </DialogHeader>

        {calc ? (
          <WorkerHandoverSummary
            workerId={workerId}
            periodStart={periodStart}
            periodEnd={periodEnd}
            calc={calc}
            coinAmount={0}
          />
        ) : (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            جاري التحميل...
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default WorkerHandoverPreviewDialog;
