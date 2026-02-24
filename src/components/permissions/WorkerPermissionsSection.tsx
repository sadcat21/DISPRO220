import React, { useState, useEffect } from 'react';
import { User, Loader2, Search, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions, useToggleWorkerPermission } from '@/hooks/usePermissions';
import { useLanguage } from '@/contexts/LanguageContext';
import { useQuery } from '@tanstack/react-query';

interface WorkerBasic {
  id: string;
  full_name: string;
  username: string;
  role: string;
  is_active: boolean;
}

const WorkerPermissionsSection: React.FC = () => {
  const { t } = useLanguage();
  const { data: permissions } = usePermissions();
  const togglePermission = useToggleWorkerPermission();
  const [search, setSearch] = useState('');

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

  // All permissions are available for individual assignment
  const individualPermissions = permissions || [];

  const filteredWorkers = workers?.filter(w =>
    w.full_name.includes(search) || w.username.includes(search)
  ) || [];

  const getPermissionState = (workerId: string, permissionId: string): boolean => {
    const record = allWorkerPerms?.find(wp => wp.worker_id === workerId && wp.permission_id === permissionId);
    return record?.granted ?? false;
  };

  const handleToggle = async (workerId: string, permissionId: string) => {
    const current = getPermissionState(workerId, permissionId);
    await togglePermission.mutateAsync({
      workerId,
      permissionId,
      grant: !current,
    });
  };

  if (workersLoading || permsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (individualPermissions.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <User className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">صلاحيات فردية للعمال</h2>
        <Badge variant="outline" className="text-xs">لكل عامل</Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="بحث عن عامل..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pr-9 h-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[400px]">
            <div className="divide-y">
              {filteredWorkers.map(worker => (
                <div key={worker.id} className="px-3 sm:px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{worker.full_name}</p>
                      <p className="text-xs text-muted-foreground" dir="ltr">@{worker.username}</p>
                    </div>
                  </div>
                  <div className="space-y-1.5 mr-10">
                    {individualPermissions.map(perm => (
                      <div key={perm.id} className="flex items-center justify-between gap-2">
                        <label className="text-xs text-muted-foreground">{perm.name_ar}</label>
                        <Switch
                          checked={getPermissionState(worker.id, perm.id)}
                          onCheckedChange={() => handleToggle(worker.id, perm.id)}
                          disabled={togglePermission.isPending}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {filteredWorkers.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  لا يوجد عمال
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default WorkerPermissionsSection;
