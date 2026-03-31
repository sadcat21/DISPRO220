import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'doing' | 'done';
export type TaskType = 'task' | 'request';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  type: TaskType;
  due_date: string | null;
  assigned_to: string | null;
  branch_id: string | null;
  created_by: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  assigned_worker?: { id: string; full_name: string } | null;
  created_by_worker?: { id: string; full_name: string } | null;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  due_date?: string | null;
  assigned_to?: string | null;
  branch_id?: string | null;
  type?: TaskType;
}

const fetchTasksWithWorkers = async (activeBranchId: string | undefined, taskType: TaskType, userId: string | undefined, userRole: string | null) => {
  let query = supabase
    .from('tasks')
    .select('*')
    .eq('type', taskType)
    .order('created_at', { ascending: false });

  if (activeBranchId) {
    query = query.or(`branch_id.eq.${activeBranchId},branch_id.is.null`);
  }

  // Admins/branch_admins see all tasks; others see only their own or general
  if (userId && userRole !== 'admin' && userRole !== 'branch_admin') {
    query = query.or(`assigned_to.eq.${userId},created_by.eq.${userId},assigned_to.is.null`);
  }

  const { data, error } = await query;
  if (error) throw error;

  if (data && data.length > 0) {
    const workerIds = new Set<string>();
    data.forEach((t: any) => {
      if (t.assigned_to) workerIds.add(t.assigned_to);
      if (t.created_by) workerIds.add(t.created_by);
    });

    const { data: workers } = await supabase
      .from('workers')
      .select('id, full_name')
      .in('id', Array.from(workerIds));

    const workerMap = new Map(workers?.map(w => [w.id, w]) || []);

    return data.map((t: any) => ({
      ...t,
      assigned_worker: t.assigned_to ? workerMap.get(t.assigned_to) || null : null,
      created_by_worker: workerMap.get(t.created_by) || null,
    })) as Task[];
  }

  return data as Task[];
};

export const useTasks = (taskType: TaskType = 'task') => {
  const { user, activeBranch, role } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', taskType, user?.id, activeBranch?.id, role],
    queryFn: () => fetchTasksWithWorkers(activeBranch?.id, taskType, user?.id, role),
    enabled: !!user?.id,
  });

  // Realtime subscription for tasks
  useEffect(() => {
    const baseChannelName = `tasks-realtime-${taskType}`;
    const existing = (supabase as any).getChannels?.()?.find((ch: any) => ch.topic === `realtime:${baseChannelName}`);
    if (existing) {
      supabase.removeChannel(existing);
    }

    const channel = supabase
      .channel(`${baseChannelName}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient, taskType]);

  const incompleteTasks = tasks.filter(t => t.status !== 'done');

  const createTask = useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      const { error } = await supabase.from('tasks').insert({
        title: input.title,
        description: input.description || null,
        priority: input.priority || 'medium',
        due_date: input.due_date || null,
        assigned_to: input.assigned_to || null,
        branch_id: input.branch_id || activeBranch?.id || null,
        created_by: user!.id,
        type: input.type || taskType,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(taskType === 'task' ? t('tasks.created') : t('requests.created'));
    },
    onError: () => toast.error(taskType === 'task' ? t('tasks.create_error') : t('requests.create_error')),
  });

  const updateTaskStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const updates: any = { status };
      if (status === 'done') updates.completed_at = new Date().toISOString();
      else updates.completed_at = null;

      const { error } = await supabase.from('tasks').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(taskType === 'task' ? t('tasks.deleted') : t('requests.deleted'));
    },
  });

  return { tasks, incompleteTasks, isLoading, createTask, updateTaskStatus, deleteTask };
};
