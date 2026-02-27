import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Truck, Loader2, SkipForward, User, Search, CheckCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAssignOrder } from '@/hooks/useOrders';
import { supabase } from '@/integrations/supabase/client';
import { Worker } from '@/types/database';
import { toast } from 'sonner';

interface AssignWorkerAfterSaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  customerBranchId: string | null;
  defaultDeliveryWorkerId?: string | null;
}

const AssignWorkerAfterSaveDialog: React.FC<AssignWorkerAfterSaveDialogProps> = ({
  open,
  onOpenChange,
  orderId,
  customerBranchId,
  defaultDeliveryWorkerId,
}) => {
  const [selectedWorker, setSelectedWorker] = useState('');
  const [deliveryWorkers, setDeliveryWorkers] = useState<Worker[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const assignOrder = useAssignOrder();

  useEffect(() => {
    if (open && customerBranchId) {
      fetchDeliveryWorkers();
    }
  }, [open, customerBranchId]);

  // Pre-select default delivery worker when workers are loaded
  useEffect(() => {
    if (defaultDeliveryWorkerId && deliveryWorkers.length > 0) {
      const exists = deliveryWorkers.some(w => w.id === defaultDeliveryWorkerId);
      if (exists) {
        setSelectedWorker(defaultDeliveryWorkerId);
      }
    }
  }, [defaultDeliveryWorkerId, deliveryWorkers]);

  const fetchDeliveryWorkers = async () => {
    if (!customerBranchId) return;
    setIsLoading(true);
    try {
      const { data: workerRoles } = await supabase
        .from('worker_roles')
        .select(`worker_id, custom_roles!inner(code)`)
        .eq('branch_id', customerBranchId)
        .eq('custom_roles.code', 'delivery_rep');

      if (!workerRoles || workerRoles.length === 0) {
        setDeliveryWorkers([]);
        return;
      }

      const workerIds = workerRoles.map(wr => wr.worker_id);
      const { data: workers } = await supabase
        .from('workers')
        .select('*')
        .in('id', workerIds)
        .eq('is_active', true)
        .order('full_name');

      setDeliveryWorkers(workers || []);
    } catch (error) {
      console.error('Error fetching delivery workers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedWorker) {
      toast.error('يرجى اختيار عامل التوصيل');
      return;
    }
    try {
      await assignOrder.mutateAsync({ orderId, workerId: selectedWorker });
      toast.success('تم تعيين عامل التوصيل بنجاح');
      setSelectedWorker('');
      setSearch('');
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'حدث خطأ');
    }
  };

  const handleSkip = () => {
    setSelectedWorker('');
    setSearch('');
    onOpenChange(false);
  };

  const filtered = deliveryWorkers.filter(w =>
    w.full_name.toLowerCase().includes(search.toLowerCase()) ||
    w.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            تعيين عامل التوصيل
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : deliveryWorkers.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-6">
            لا يوجد عمال توصيل متاحين
          </div>
        ) : (
          <>
            {deliveryWorkers.length > 4 && (
              <div className="relative">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="بحث..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="ps-9"
                />
              </div>
            )}
            <div className="max-h-[50vh] overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {filtered.map(w => {
                  const isSelected = w.id === selectedWorker;
                  const isDefault = w.id === defaultDeliveryWorkerId;
                  return (
                    <button
                      key={w.id}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors relative
                        ${isSelected ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent border-border'}
                      `}
                      onClick={() => setSelectedWorker(w.id)}
                    >
                      {isDefault && !isSelected && (
                        <span className="absolute top-1 end-1 w-2 h-2 rounded-full bg-primary" />
                      )}
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isSelected ? 'bg-primary-foreground/20' : 'bg-primary/10'}`}>
                        <User className={`w-5 h-5 ${isSelected ? 'text-primary-foreground' : 'text-primary'}`} />
                      </div>
                      <div className="font-semibold text-xs leading-tight truncate w-full">{w.full_name}</div>
                      {isDefault && (
                        <span className={`text-[10px] ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                          افتراضي
                        </span>
                      )}
                      {isSelected && <CheckCircle className="w-4 h-4" />}
                    </button>
                  );
                })}
              </div>
              {filtered.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-4">
                  لا توجد نتائج
                </div>
              )}
            </div>
          </>
        )}

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleSkip} className="flex-1">
            <SkipForward className="w-4 h-4 ms-1" />
            تخطي
          </Button>
          <Button
            onClick={handleAssign}
            disabled={assignOrder.isPending || !selectedWorker}
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
