import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Worker } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Truck, Loader2, User, XCircle } from 'lucide-react';
import WorkerPickerDialog from '@/components/stock/WorkerPickerDialog';

interface DeliveryWorkerSelectProps {
  customerBranchId: string | null;
  value: string;
  onChange: (value: string) => void;
}

const DeliveryWorkerSelect: React.FC<DeliveryWorkerSelectProps> = ({
  customerBranchId,
  value,
  onChange,
}) => {
  const [deliveryWorkers, setDeliveryWorkers] = useState<Worker[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (customerBranchId) {
      fetchDeliveryWorkers();
    } else {
      setDeliveryWorkers([]);
    }
  }, [customerBranchId]);

  const fetchDeliveryWorkers = async () => {
    if (!customerBranchId) return;
    
    setIsLoading(true);
    try {
      const { data: workerRoles } = await supabase
        .from('worker_roles')
        .select(`
          worker_id,
          custom_role_id,
          custom_roles!inner(code)
        `)
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

  if (!customerBranchId) {
    return null;
  }

  const selectedWorker = deliveryWorkers.find(w => w.id === value);

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <Truck className="w-4 h-4" />
        عامل التوصيل (اختياري)
      </Label>
      {isLoading ? (
        <div className="flex items-center justify-center py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1 justify-start h-10"
            onClick={() => setPickerOpen(true)}
          >
            {selectedWorker ? (
              <span className="flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                {selectedWorker.full_name}
              </span>
            ) : (
              <span className="text-muted-foreground">اختر عامل التوصيل</span>
            )}
          </Button>
          {value && value !== 'none' && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => onChange('none')}
            >
              <XCircle className="w-4 h-4 text-muted-foreground" />
            </Button>
          )}
        </div>
      )}
      <WorkerPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        workers={deliveryWorkers.map(w => ({ id: w.id, full_name: w.full_name, username: w.username }))}
        selectedWorkerId={value}
        onSelect={onChange}
      />
    </div>
  );
};

export default DeliveryWorkerSelect;
