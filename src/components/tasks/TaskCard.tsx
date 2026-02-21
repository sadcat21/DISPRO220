import React from 'react';
import { Trash2, Calendar } from 'lucide-react';
import { Task, TaskStatus } from '@/hooks/useTasks';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const priorityColors: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-blue-100 text-blue-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-destructive/20 text-destructive',
};

const TaskCard: React.FC<{
  task: Task;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
  t: (key: string) => string;
  translationPrefix?: string;
}> = ({ task, onStatusChange, onDelete, t, translationPrefix = 'tasks' }) => {
  const nextStatus: Record<TaskStatus, TaskStatus> = { todo: 'doing', doing: 'done', done: 'todo' };

  return (
    <div className="p-3 rounded-lg border bg-card space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm leading-tight">{task.title}</p>
          {task.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
          )}
        </div>
        <Badge className={cn('text-[10px] shrink-0', priorityColors[task.priority])}>
          {t(`tasks.priority_${task.priority}`)}
        </Badge>
      </div>

      {/* Show who assigned/created */}
      {task.type === 'task' && task.created_by_worker && task.created_by !== task.assigned_to && (
        <p className="text-xs text-primary font-medium">
          {t('tasks.assigned_by')}: {task.created_by_worker.full_name}
        </p>
      )}
      {task.type === 'request' && task.assigned_worker && (
        <p className="text-xs text-primary font-medium">
          {t('requests.requested_from')}: {task.assigned_worker.full_name}
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {task.due_date && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {task.due_date}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-xs"
            onClick={() => onStatusChange(task.id, nextStatus[task.status])}
          >
            {t(`${translationPrefix}.move_to_${nextStatus[task.status]}`)}
          </Button>
          {task.status === 'todo' && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs text-green-600 hover:text-green-700"
              onClick={() => onStatusChange(task.id, 'done')}
            >
              {t(`${translationPrefix}.move_to_done`)}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
            onClick={() => onDelete(task.id)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
