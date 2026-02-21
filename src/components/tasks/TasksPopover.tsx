import React, { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTasks } from '@/hooks/useTasks';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import StatusTabs from './StatusTabs';
import AddTaskDialog from './AddTaskDialog';

const TasksPopover: React.FC = () => {
  const { t } = useLanguage();
  const { tasks, incompleteTasks, updateTaskStatus, deleteTask } = useTasks('task');
  const [showAddDialog, setShowAddDialog] = useState(false);

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 transition-colors"
            title={t('tasks.title')}
          >
            <ClipboardList className="w-4 h-4 text-purple-500" />
            {incompleteTasks.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {incompleteTasks.length}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0 max-h-[70vh] flex flex-col">
          <StatusTabs
            tasks={tasks}
            onStatusChange={(id, status) => updateTaskStatus.mutate({ id, status })}
            onDelete={(id) => deleteTask.mutate(id)}
            onAdd={() => setShowAddDialog(true)}
            t={t}
            title={t('tasks.title')}
            translationPrefix="tasks"
          />
        </PopoverContent>
      </Popover>
      <AddTaskDialog open={showAddDialog} onOpenChange={setShowAddDialog} taskType="task" />
    </>
  );
};

export default TasksPopover;
