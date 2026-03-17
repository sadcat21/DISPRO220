import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ActivityLog, ActivityLogWithWorker } from '@/types/activityLog';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeSubscription } from './useRealtimeSubscription';
import { isAdminRole } from '@/lib/utils';

interface LogActivityParams {
  actionType: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, any>;
}

export const useLogActivity = () => {
  const { workerId, activeBranch } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ actionType, entityType, entityId, details }: LogActivityParams) => {
      if (!workerId) return null;

      const { data, error } = await supabase
        .from('activity_logs')
        .insert({
          worker_id: workerId,
          action_type: actionType,
          entity_type: entityType,
          entity_id: entityId || null,
          details: details || null,
          branch_id: activeBranch?.id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-logs'] });
    },
  });
};

interface ActivityLogsFilters {
  workerId?: string;
  actionType?: string;
  entityType?: string;
  startDate?: string;
  endDate?: string;
}

export const useActivityLogs = (filters?: ActivityLogsFilters) => {
  const { role, activeBranch } = useAuth();

  useRealtimeSubscription(
    'activity-logs-realtime',
    [{ table: 'activity_logs' }],
    [['activity-logs'], ['my-activity-logs']],
  );

  return useQuery({
    queryKey: ['activity-logs', filters, activeBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('activity_logs')
        .select(`
          *,
          worker:workers!activity_logs_worker_id_fkey(id, full_name, username)
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      // Apply filters
      if (filters?.workerId) {
        query = query.eq('worker_id', filters.workerId);
      }
      if (filters?.actionType) {
        query = query.eq('action_type', filters.actionType);
      }
      if (filters?.entityType) {
        query = query.eq('entity_type', filters.entityType);
      }
      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate + 'T23:59:59');
      }

      // Filter by branch for admin
      if (isAdminRole(role) && activeBranch) {
        query = query.eq('branch_id', activeBranch.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ActivityLogWithWorker[];
    },
  });
};

export const useMyActivityLogs = () => {
  const { workerId } = useAuth();

  return useQuery({
    queryKey: ['my-activity-logs', workerId],
    queryFn: async () => {
      if (!workerId) return [];

      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('worker_id', workerId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as ActivityLog[];
    },
    enabled: !!workerId,
  });
};
