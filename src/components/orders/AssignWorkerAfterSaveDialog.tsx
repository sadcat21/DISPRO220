import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Truck, Loader2, SkipForward } from 'lucide-react';
import { useAssignOrder } from '@/hooks/useOrders';
import { toast } from 'sonner';
import DeliveryWorkerSelect from './DeliveryWorkerSelect';

interface AssignWorkerAfterSaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  customerBranchId: string | null;
}

const AssignWorkerAfterSaveDialog: React.FC<AssignWorkerAfterSaveDialogProps> = ({
  open,
  onOpenChange,
  orderId,
  customerBranchId,
}) => {
  const [selectedWorker, setSelectedWorker] = useState('');
  const assignOrder = useAssignOrder();

  const handleAssign = async () => {
    if (!selectedWorker || selectedWorker === 'none') {
      toast.error('يرجى اختيار عامل التوصيل');
      return;
    }

    try {
      await assignOrder.mutateAsync({ orderId, workerId: selectedWorker });
      toast.success('تم تعيين عامل التوصيل بنجاح');
      setSelectedWorker('');
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'حدث خطأ');
    }
  };

  const handleSkip = () => {
    setSelectedWorker('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            تعيين عامل التوصيل
          </DialogTitle>
        </DialogHeader>

        <div className="py-2">
          <DeliveryWorkerSelect
            customerBranchId={customerBranchId}
            value={selectedWorker}
            onChange={setSelectedWorker}
          />
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={handleSkip}
            className="flex-1"
          >
            <SkipForward className="w-4 h-4 ms-1" />
            تخطي
          </Button>
          <Button
            onClick={handleAssign}
            disabled={assignOrder.isPending || !selectedWorker || selectedWorker === 'none'}
            className="flex-1"
          >
            {assignOrder.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin ms-1" />
            ) : (
              <Truck className="w-4 h-4 ms-1" />
            )}
            تعيين
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AssignWorkerAfterSaveDialog;
