import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Permission, CustomRole, RoleWithPermissions } from '@/types/permissions';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export const usePermissions = () => {
  return useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permissions')
        .select('*')
        .order('category', { ascending: true })
        .order('resource', { ascending: true });

      if (error) throw error;
      return data as Permission[];
    },
  });
};

export const useCustomRoles = () => {
  return useQuery({
    queryKey: ['custom-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_roles')
        .select('*')
        .order('is_system', { ascending: false })
        .order('name_ar', { ascending: true });

      if (error) throw error;
      return data as CustomRole[];
    },
  });
};

export const useRolePermissions = (roleId: string | null) => {
  return useQuery({
    queryKey: ['role-permissions', roleId],
    queryFn: async () => {
      if (!roleId) return [];
      
      const { data, error } = await supabase
        .from('role_permissions')
        .select('permission_id')
        .eq('role_id', roleId);

      if (error) throw error;
      return data.map(rp => rp.permission_id);
    },
    enabled: !!roleId,
  });
};

export const useRolesWithPermissions = () => {
  return useQuery({
    queryKey: ['roles-with-permissions'],
    queryFn: async () => {
      // Get all roles
      const { data: roles, error: rolesError } = await supabase
        .from('custom_roles')
        .select('*')
        .order('is_system', { ascending: false })
        .order('name_ar', { ascending: true });

      if (rolesError) throw rolesError;

      // Get all role permissions with permission details
      const { data: rolePermissions, error: rpError } = await supabase
        .from('role_permissions')
        .select('role_id, permission_id, permissions(*)');

      if (rpError) throw rpError;

      // Map permissions to roles
      const rolesWithPermissions: RoleWithPermissions[] = (roles as CustomRole[]).map(role => ({
        ...role,
        permissions: (rolePermissions as any[])
          .filter(rp => rp.role_id === role.id)
          .map(rp => rp.permissions as Permission),
      }));

      return rolesWithPermissions;
    },
  });
};

export const useWorkerPermissions = () => {
  const { workerId } = useAuth();

  return useQuery({
    queryKey: ['worker-permissions', workerId],
    queryFn: async () => {
      if (!workerId) return [];

      const { data, error } = await supabase.rpc('get_worker_permissions', {
        p_worker_id: workerId,
      });

      if (error) throw error;
      return data as { permission_code: string; permission_name: string; category: string; resource: string }[];
    },
    enabled: !!workerId,
  });
};

export const useHasPermission = (permissionCode: string) => {
  const { data: permissions } = useWorkerPermissions();
  const { role } = useAuth();

  // Admin and branch_admin have all permissions
  if (role === 'admin' || role === 'branch_admin') return true;

  return permissions?.some(p => p.permission_code === permissionCode) ?? false;
};

export const useCreateRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (role: { code: string; name_ar: string; description_ar?: string }) => {
      const { data, error } = await supabase
        .from('custom_roles')
        .insert(role)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-roles'] });
      queryClient.invalidateQueries({ queryKey: ['roles-with-permissions'] });
    },
  });
};

export const useUpdateRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...role }: { id: string; name_ar?: string; description_ar?: string }) => {
      const { data, error } = await supabase
        .from('custom_roles')
        .update(role)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-roles'] });
      queryClient.invalidateQueries({ queryKey: ['roles-with-permissions'] });
    },
  });
};

export const useDeleteRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase
        .from('custom_roles')
        .delete()
        .eq('id', roleId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-roles'] });
      queryClient.invalidateQueries({ queryKey: ['roles-with-permissions'] });
    },
  });
};

export const useUpdateRolePermissions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ roleId, permissionIds }: { roleId: string; permissionIds: string[] }) => {
      // Delete existing permissions
      const { error: deleteError } = await supabase
        .from('role_permissions')
        .delete()
        .eq('role_id', roleId);

      if (deleteError) throw deleteError;

      // Insert new permissions
      if (permissionIds.length > 0) {
        const { error: insertError } = await supabase
          .from('role_permissions')
          .insert(
            permissionIds.map(permissionId => ({
              role_id: roleId,
              permission_id: permissionId,
            }))
          );

        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-permissions'] });
      queryClient.invalidateQueries({ queryKey: ['roles-with-permissions'] });
    },
  });
};

// --- Individual Worker Permissions ---

export const useIndividualWorkerPermissions = (workerId: string | null) => {
  return useQuery({
    queryKey: ['worker-individual-permissions', workerId],
    queryFn: async () => {
      if (!workerId) return [];
      const { data, error } = await supabase
        .from('worker_permissions')
        .select('permission_id')
        .eq('worker_id', workerId);
      if (error) throw error;
      return data.map(wp => wp.permission_id);
    },
    enabled: !!workerId,
  });
};

export const useToggleWorkerPermission = () => {
  const queryClient = useQueryClient();
  const { workerId: grantedBy } = useAuth();

  return useMutation({
    mutationFn: async ({ workerId, permissionId, grant }: { workerId: string; permissionId: string; grant: boolean }) => {
      // Upsert: set granted=true or granted=false (individual override always exists)
      const { error } = await supabase
        .from('worker_permissions')
        .upsert(
          { worker_id: workerId, permission_id: permissionId, granted_by: grantedBy, granted: grant },
          { onConflict: 'worker_id,permission_id' }
        );
      if (error) throw error;
    },
    onSuccess: (_, { workerId }) => {
      queryClient.invalidateQueries({ queryKey: ['worker-individual-permissions', workerId] });
      queryClient.invalidateQueries({ queryKey: ['worker-permissions', workerId] });
      queryClient.invalidateQueries({ queryKey: ['all-worker-individual-permissions'] });
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });
};

export const useAllWorkersWithIndividualPermissions = (permissionCode: string) => {
  return useQuery({
    queryKey: ['workers-with-permission', permissionCode],
    queryFn: async () => {
      // Get the permission ID
      const { data: perm } = await supabase
        .from('permissions')
        .select('id')
        .eq('code', permissionCode)
        .maybeSingle();
      if (!perm) return [];

      // Get all workers who have this individual permission
      const { data, error } = await supabase
        .from('worker_permissions')
        .select('worker_id')
        .eq('permission_id', perm.id);
      if (error) throw error;
      return data.map(wp => wp.worker_id);
    },
  });
};
