import React, { useState, useMemo } from 'react';
import { User, Loader2, Search, Shield, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions, useToggleWorkerPermission } from '@/hooks/usePermissions';
import { useLanguage } from '@/contexts/LanguageContext';
import { useQuery } from '@tanstack/react-query';
import { PERMISSION_CATEGORIES, RESOURCE_NAMES, PermissionCategory } from '@/types/permissions';

interface WorkerBasic {
  id: string;
  full_name: string;
  username: string;
  role: string;
  is_active: boolean;
}

const WorkerPermissionsSection: React.FC<{ initialWorkerId?: string | null }> = ({ initialWorkerId }) => {
  const { t } = useLanguage();
  const { data: permissions } = usePermissions();
  const togglePermission = useToggleWorkerPermission();
  const [search, setSearch] = useState('');
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(initialWorkerId || null);

  // Get all workers
  const { data: workers, isLoading: workersLoading } = useQuery({
    queryKey: ['workers-basic'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workers')
        .select('id, full_name, username, role, is_active')
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;
      return data as WorkerBasic[];
    },
  });

  // Get all worker_permissions records with granted field
  const { data: allWorkerPerms, isLoading: permsLoading } = useQuery({
    queryKey: ['all-worker-individual-permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worker_permissions')
        .select('worker_id, permission_id, granted');
      if (error) throw error;
      return data as { worker_id: string; permission_id: string; granted: boolean }[];
    },
  });

  // Get role-based permissions for the selected worker
  const { data: rolePermissions } = useQuery({
    queryKey: ['worker-role-permissions', selectedWorkerId],
    queryFn: async () => {
      if (!selectedWorkerId) return [];
      const { data, error } = await supabase.rpc('get_worker_permissions', {
        p_worker_id: selectedWorkerId,
      });
      if (error) throw error;
      return data as { permission_code: string; permission_name: string; category: string; resource: string }[];
    },
    enabled: !!selectedWorkerId,
  });

  const filteredWorkers = workers?.filter(w =>
    w.full_name.includes(search) || w.username.includes(search)
  ) || [];

  const selectedWorker = workers?.find(w => w.id === selectedWorkerId);

  // Check if a permission has an individual override
  const getIndividualOverride = (permissionId: string): boolean | null => {
    if (!selectedWorkerId) return null;
    const record = allWorkerPerms?.find(wp => wp.worker_id === selectedWorkerId && wp.permission_id === permissionId);
    return record ? record.granted : null;
  };

  // Check if permission is granted by role
  const isRoleGranted = (permCode: string): boolean => {
    return rolePermissions?.some(rp => rp.permission_code === permCode) ?? false;
  };

  // Get effective state: individual override takes priority, then role-based
  const getEffectiveState = (permId: string, permCode: string): boolean => {
    const individual = getIndividualOverride(permId);
    if (individual !== null) return individual;
    return isRoleGranted(permCode);
  };

  const handleToggle = async (permissionId: string, permCode: string) => {
    if (!selectedWorkerId) return;
    const effective = getEffectiveState(permissionId, permCode);
    await togglePermission.mutateAsync({
      workerId: selectedWorkerId,
      permissionId,
      grant: !effective,
    });
  };

  // Group permissions by category and resource
  const groupedPermissions = useMemo(() => {
    if (!permissions) return {};
    const grouped: Record<string, Record<string, typeof permissions>> = {};
    permissions.forEach(p => {
      const cat = p.category;
      const res = p.resource || 'other';
      if (!grouped[cat]) grouped[cat] = {};
      if (!grouped[cat][res]) grouped[cat][res] = [];
      grouped[cat][res].push(p);
    });
    return grouped;
  }, [permissions]);

  if (workersLoading || permsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // Worker selection view
  if (!selectedWorkerId) {
    return (
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث عن عامل..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {filteredWorkers.map(worker => {
            const workerPermsCount = allWorkerPerms?.filter(wp => wp.worker_id === worker.id && wp.granted).length || 0;
            return (
              <Card
                key={worker.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setSelectedWorkerId(worker.id)}
              >
                <CardContent className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{worker.full_name}</p>
                      <p className="text-xs text-muted-foreground" dir="ltr">@{worker.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {workerPermsCount > 0 && (
                      <Badge variant="secondary" className="text-xs">{workerPermsCount}</Badge>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground rtl:rotate-180" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {filteredWorkers.length === 0 && (
            <div className="col-span-full p-6 text-center text-sm text-muted-foreground">
              لا يوجد عمال
            </div>
          )}
        </div>
      </div>
    );
  }

  // Permission details view for selected worker
  return (
    <div className="space-y-4">
      {/* Back button + worker info */}
      <Card
        className="cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => setSelectedWorkerId(null)}
      >
        <CardContent className="flex items-center gap-2.5 p-3">
          <ChevronRight className="w-4 h-4 text-muted-foreground rtl:rotate-0 rotate-180" />
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <User className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">{selectedWorker?.full_name}</p>
            <p className="text-xs text-muted-foreground" dir="ltr">@{selectedWorker?.username}</p>
          </div>
        </CardContent>
      </Card>

      <ScrollArea className="h-[calc(100vh-20rem)]">
        <div className="space-y-4 pb-4">
          {Object.entries(groupedPermissions).map(([category, resources]) => (
            <Card key={category}>
              <CardContent className="p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">
                    {PERMISSION_CATEGORIES[category as PermissionCategory] || category}
                  </span>
                </div>
                {Object.entries(resources).map(([resource, perms]) => (
                  <div key={resource} className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      {RESOURCE_NAMES[resource] || resource}
                    </p>
                    {perms.map(perm => {
                      const individual = getIndividualOverride(perm.id);
                      const roleGranted = isRoleGranted(perm.code);
                      const effective = getEffectiveState(perm.id, perm.code);

                      return (
                        <div key={perm.id} className="flex items-center justify-between gap-2 py-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs truncate">{perm.name_ar}</span>
                            {roleGranted && individual === null && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">من الدور</Badge>
                            )}
                            {individual !== null && (
                              <Badge variant={individual ? 'default' : 'destructive'} className="text-[10px] px-1.5 py-0 shrink-0">
                                {individual ? 'مفعّل فردياً' : 'معطّل فردياً'}
                              </Badge>
                            )}
                          </div>
                          <Switch
                            checked={effective}
                            onCheckedChange={() => handleToggle(perm.id, perm.code)}
                            disabled={togglePermission.isPending}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default WorkerPermissionsSection;
