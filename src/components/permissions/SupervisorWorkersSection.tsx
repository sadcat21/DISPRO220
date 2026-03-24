import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Users, HardHat, Save, Warehouse } from 'lucide-react';
import { toast } from 'sonner';

interface Worker {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

interface ManagerRoleInfo {
  worker_id: string;
  custom_role_code: string;
}

const SupervisorWorkersSection: React.FC = () => {
  const { activeBranch, workerId: currentWorkerId } = useAuth();
  const queryClient = useQueryClient();
  const [selectedSupervisor, setSelectedSupervisor] = useState<string | null>(null);
  const [assignedWorkers, setAssignedWorkers] = useState<Set<string>>(new Set());
  const [selectedManager, setSelectedManager] = useState<string | null>(null);
  const [assignedManagerWorkers, setAssignedManagerWorkers] = useState<Set<string>>(new Set());

  // Fetch all workers
  const { data: allWorkers = [], isLoading: workersLoading } = useQuery({
    queryKey: ['all-workers-for-supervisor', activeBranch?.id],
    queryFn: async () => {
      let query = supabase.from('workers').select('id, full_name, role, is_active').eq('is_active', true).order('full_name');
      if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);
      const { data } = await query;
      return (data || []) as Worker[];
    },
  });

  // Fetch warehouse managers via worker_roles + custom_roles
  const { data: warehouseManagers = [] } = useQuery({
    queryKey: ['warehouse-managers-list', activeBranch?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('worker_roles')
        .select('worker_id, custom_role_id, custom_roles!inner(code)')
        .eq('custom_roles.code', 'warehouse_manager');
      if (!data) return [];
      const managerIds = data.map((d: any) => d.worker_id);
      return allWorkers.filter(w => managerIds.includes(w.id));
    },
    enabled: allWorkers.length > 0,
  });

  // Separate supervisors and regular workers
  const supervisors = useMemo(() => allWorkers.filter(w => w.role === 'supervisor'), [allWorkers]);
  const regularWorkers = useMemo(() => allWorkers.filter(w => w.role === 'worker'), [allWorkers]);

  // Fetch current assignments for selected supervisor
  const { data: currentAssignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ['supervisor-assignments', selectedSupervisor],
    queryFn: async () => {
      const { data } = await supabase
        .from('supervisor_workers')
        .select('worker_id')
        .eq('supervisor_id', selectedSupervisor!);
      return (data || []).map(d => d.worker_id);
    },
    enabled: !!selectedSupervisor,
  });

  // Fetch current assignments for selected manager
  const { data: currentManagerAssignments = [], isLoading: managerAssignmentsLoading } = useQuery({
    queryKey: ['manager-assignments', selectedManager],
    queryFn: async () => {
      const { data } = await supabase
        .from('manager_workers')
        .select('worker_id')
        .eq('manager_id', selectedManager!);
      return (data || []).map((d: any) => d.worker_id);
    },
    enabled: !!selectedManager,
  });

  // Sync state when assignments load
  React.useEffect(() => {
    if (currentAssignments) {
      setAssignedWorkers(new Set(currentAssignments));
    }
  }, [currentAssignments]);

  React.useEffect(() => {
    if (currentManagerAssignments) {
      setAssignedManagerWorkers(new Set(currentManagerAssignments));
    }
  }, [currentManagerAssignments]);

  const saveSupervisorMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSupervisor) return;
      await supabase.from('supervisor_workers').delete().eq('supervisor_id', selectedSupervisor);
      if (assignedWorkers.size > 0) {
        const rows = Array.from(assignedWorkers).map(wId => ({
          supervisor_id: selectedSupervisor,
          worker_id: wId,
          created_by: currentWorkerId,
        }));
        const { error } = await supabase.from('supervisor_workers').insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supervisor-assignments'] });
      toast.success('تم حفظ تعيينات المشرف بنجاح');
    },
    onError: () => { toast.error('فشل حفظ التعيينات'); },
  });

  const saveManagerMutation = useMutation({
    mutationFn: async () => {
      if (!selectedManager) return;
      await supabase.from('manager_workers').delete().eq('manager_id', selectedManager);
      if (assignedManagerWorkers.size > 0) {
        const rows = Array.from(assignedManagerWorkers).map(wId => ({
          manager_id: selectedManager,
          worker_id: wId,
          created_by: currentWorkerId,
        }));
        const { error } = await supabase.from('manager_workers').insert(rows as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manager-assignments'] });
      toast.success('تم حفظ تعيينات مسؤول المخزن بنجاح');
    },
    onError: () => { toast.error('فشل حفظ التعيينات'); },
  });

  const toggleWorker = (workerId: string) => {
    setAssignedWorkers(prev => {
      const next = new Set(prev);
      next.has(workerId) ? next.delete(workerId) : next.add(workerId);
      return next;
    });
  };

  const toggleManagerWorker = (workerId: string) => {
    setAssignedManagerWorkers(prev => {
      const next = new Set(prev);
      next.has(workerId) ? next.delete(workerId) : next.add(workerId);
      return next;
    });
  };

  if (workersLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const hasSupervisors = supervisors.length > 0;
  const hasManagers = warehouseManagers.length > 0;

  if (!hasSupervisors && !hasManagers) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <HardHat className="w-10 h-10 mx-auto mb-2 opacity-40" />
        <p>لا يوجد مشرفون أو مسؤولو مخزن. أضف عاملاً بأحد هذين الدورين أولاً.</p>
      </div>
    );
  }

  const renderWorkerList = (
    workers: Worker[],
    selected: Set<string>,
    toggle: (id: string) => void,
    selectAll: () => void,
    deselectAll: () => void,
    isLoading: boolean,
    onSave: () => void,
    isSaving: boolean,
    selectedCount: number,
  ) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Badge variant="outline">{selectedCount} عامل محدد</Badge>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={selectAll}>تحديد الكل</Button>
          <Button size="sm" variant="outline" onClick={deselectAll}>إلغاء الكل</Button>
        </div>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-2 max-h-[50vh] overflow-y-auto">
          {workers.map(worker => (
            <label key={worker.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors">
              <Checkbox checked={selected.has(worker.id)} onCheckedChange={() => toggle(worker.id)} />
              <span className="text-sm font-medium">{worker.full_name}</span>
            </label>
          ))}
        </div>
      )}
      <Button onClick={onSave} disabled={isSaving} className="w-full">
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Save className="w-4 h-4 ml-2" />}
        حفظ التعيينات
      </Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <Tabs defaultValue={hasSupervisors ? 'supervisors' : 'managers'} dir="rtl">
        <TabsList className="w-full">
          {hasSupervisors && <TabsTrigger value="supervisors" className="flex-1 gap-1"><HardHat className="w-4 h-4" /> المشرفون</TabsTrigger>}
          {hasManagers && <TabsTrigger value="managers" className="flex-1 gap-1"><Warehouse className="w-4 h-4" /> مسؤولو المخزن</TabsTrigger>}
        </TabsList>

        {hasSupervisors && (
          <TabsContent value="supervisors" className="space-y-4">
            <p className="text-sm text-muted-foreground">حدد المشرف ثم اختر العمال الذين يمكنه متابعتهم في صفحة إجراءات العمال.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {supervisors.map(sup => (
                <button key={sup.id} onClick={() => setSelectedSupervisor(sup.id)}
                  className={`p-3 rounded-xl border-2 text-center transition-all ${selectedSupervisor === sup.id ? 'border-primary bg-primary/10 text-primary font-bold' : 'border-border bg-card hover:border-primary/40'}`}>
                  <HardHat className="w-5 h-5 mx-auto mb-1" />
                  <span className="text-xs font-medium">{sup.full_name}</span>
                </button>
              ))}
            </div>
            {selectedSupervisor && renderWorkerList(
              regularWorkers, assignedWorkers, toggleWorker,
              () => setAssignedWorkers(new Set(regularWorkers.map(w => w.id))),
              () => setAssignedWorkers(new Set()),
              assignmentsLoading, () => saveSupervisorMutation.mutate(),
              saveSupervisorMutation.isPending, assignedWorkers.size,
            )}
          </TabsContent>
        )}

        {hasManagers && (
          <TabsContent value="managers" className="space-y-4">
            <p className="text-sm text-muted-foreground">حدد مسؤول المخزن ثم اختر العمال الذين يمكنه متابعتهم في صفحة إجراءات العمال.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {warehouseManagers.map(mgr => (
                <button key={mgr.id} onClick={() => setSelectedManager(mgr.id)}
                  className={`p-3 rounded-xl border-2 text-center transition-all ${selectedManager === mgr.id ? 'border-primary bg-primary/10 text-primary font-bold' : 'border-border bg-card hover:border-primary/40'}`}>
                  <Warehouse className="w-5 h-5 mx-auto mb-1" />
                  <span className="text-xs font-medium">{mgr.full_name}</span>
                </button>
              ))}
            </div>
            {selectedManager && renderWorkerList(
              regularWorkers, assignedManagerWorkers, toggleManagerWorker,
              () => setAssignedManagerWorkers(new Set(regularWorkers.map(w => w.id))),
              () => setAssignedManagerWorkers(new Set()),
              managerAssignmentsLoading, () => saveManagerMutation.mutate(),
              saveManagerMutation.isPending, assignedManagerWorkers.size,
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default SupervisorWorkersSection;
