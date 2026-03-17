import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTasks, TaskPriority, TaskType } from '@/hooks/useTasks';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { isAdminRole } from '@/lib/utils';

interface AddTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskType: TaskType;
}

// Role hierarchy levels (higher number = higher rank)
const ROLE_LEVELS: Record<string, number> = {
  admin: 4,
  branch_admin: 3,
  supervisor: 2,
  worker: 1,
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'مدير النظام',
  branch_admin: 'مدير فرع',
  supervisor: 'مشرف',
  worker: 'عامل',
};

const AddTaskDialog: React.FC<AddTaskDialogProps> = ({ open, onOpenChange, taskType }) => {
  const { t } = useLanguage();
  const { role, activeBranch, user } = useAuth();
  const { createTask } = useTasks(taskType);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [isSelfTask, setIsSelfTask] = useState(false);
  const [commandedBy, setCommandedBy] = useState<string>('');

  const prefix = taskType === 'task' ? 'tasks' : 'requests';
  const canAssignOthers = isAdminRole(role) || role === 'supervisor';
  const currentLevel = ROLE_LEVELS[role || 'worker'] || 1;

  // For tasks: fetch workers with lower or equal rank (downward)
  // For requests: fetch workers with higher rank (upward)
  const { data: workers = [] } = useQuery({
    queryKey: ['workers-for-tasks', activeBranch?.id, taskType],
    queryFn: async () => {
      const { data } = await supabase.from('workers').select('id, full_name, role').eq('is_active', true);
      if (!data) return [];
      // Show all workers except self
      return data.filter(w => w.id !== user?.id);
    },
    enabled: open,
  });

  // For self-tasks: fetch potential commanders (higher rank workers)
  const { data: commanders = [] } = useQuery({
    queryKey: ['commanders-for-self-task', activeBranch?.id],
    queryFn: async () => {
      let query = supabase.from('workers').select('id, full_name, role').eq('is_active', true);
      if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);
      const { data } = await query;
      if (!data) return [];
      return data.filter(w => (ROLE_LEVELS[w.role] || 1) >= currentLevel && w.id !== user?.id);
    },
    enabled: open && taskType === 'task',
  });

  const handleSubmit = () => {
    if (!title.trim()) return;
    
    let finalAssignedTo = assignedTo || null;
    let finalCreatedBy = user!.id;

    if (taskType === 'task' && isSelfTask) {
      // Self task: assigned_to is self, created_by stays as self but we note the commander
      finalAssignedTo = user!.id;
    } else if (taskType === 'request') {
      // Request: assigned_to is the higher-rank person
      finalAssignedTo = assignedTo || null;
    }

    createTask.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      due_date: dueDate || null,
      assigned_to: finalAssignedTo,
      type: taskType,
    }, {
      onSuccess: () => {
        resetForm();
        onOpenChange(false);
      },
    });
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPriority('medium');
    setDueDate('');
    setAssignedTo('');
    setIsSelfTask(false);
    setCommandedBy('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t(`${prefix}.add`)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{t('tasks.title_field')}</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={t(`${prefix}.title_placeholder`)} />
          </div>
          <div>
            <Label>{t('tasks.description_field')}</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t('tasks.description_placeholder')} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('tasks.priority')}</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t('tasks.priority_low')}</SelectItem>
                  <SelectItem value="medium">{t('tasks.priority_medium')}</SelectItem>
                  <SelectItem value="high">{t('tasks.priority_high')}</SelectItem>
                  <SelectItem value="urgent">{t('tasks.priority_urgent')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('tasks.due_date')}</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>

          {taskType === 'task' && (
            <>
              {/* Self task toggle */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="selfTask"
                  checked={isSelfTask}
                  onChange={(e) => {
                    setIsSelfTask(e.target.checked);
                    if (e.target.checked) setAssignedTo('');
                  }}
                  className="rounded"
                />
                <Label htmlFor="selfTask" className="cursor-pointer text-sm">{t('tasks.self_task')}</Label>
              </div>

              {isSelfTask ? (
                /* When self task, select who commanded it */
                <div>
                  <Label>{t('tasks.commanded_by')}</Label>
                  <Select value={commandedBy} onValueChange={setCommandedBy}>
                    <SelectTrigger><SelectValue placeholder={t('tasks.select_commander')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="self">{t('tasks.self_initiative')}</SelectItem>
                      {commanders.map(w => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.full_name} <span className="text-muted-foreground text-xs">({ROLE_LABELS[w.role] || w.role})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : canAssignOthers ? (
                /* When assigning to others (downward) */
                <div>
                  <Label>{t('tasks.assign_to')}</Label>
                  <Select value={assignedTo} onValueChange={setAssignedTo}>
                    <SelectTrigger><SelectValue placeholder={t('tasks.general_task')} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">{t('tasks.general_task')}</SelectItem>
                      {workers.map(w => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.full_name} <span className="text-muted-foreground text-xs">({ROLE_LABELS[w.role] || w.role})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </>
          )}

          {taskType === 'request' && (
            /* Request: select who to request from (upward) */
            <div>
              <Label>{t('requests.request_from')}</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger><SelectValue placeholder={t('requests.select_person')} /></SelectTrigger>
                <SelectContent>
                  {workers.map(w => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.full_name} <span className="text-muted-foreground text-xs">({ROLE_LABELS[w.role] || w.role})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button onClick={handleSubmit} disabled={!title.trim() || createTask.isPending} className="w-full">
            {createTask.isPending ? '...' : t(`${prefix}.add`)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddTaskDialog;
