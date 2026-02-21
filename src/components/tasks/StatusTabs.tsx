import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Task, TaskStatus, TaskType } from '@/hooks/useTasks';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import TaskCard from './TaskCard';

const statusColors: Record<TaskStatus, string> = {
  todo: 'data-[state=active]:bg-red-500 data-[state=active]:text-white',
  doing: 'data-[state=active]:bg-orange-500 data-[state=active]:text-white',
  done: 'data-[state=active]:bg-green-500 data-[state=active]:text-white',
};

const statusTabs: TaskStatus[] = ['todo', 'doing', 'done'];

interface StatusTabsProps {
  tasks: Task[];
  onStatusChange: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  t: (key: string) => string;
  title: string;
  translationPrefix?: string;
}

const StatusTabs: React.FC<StatusTabsProps> = ({ tasks, onStatusChange, onDelete, onAdd, t, title, translationPrefix = 'tasks' }) => {
  const [activeTab, setActiveTab] = useState<string>('todo');
  const filteredTasks = tasks.filter(task => task.status === activeTab);

  return (
    <>
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-bold text-sm">{title}</h3>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onAdd}>
          <Plus className="w-4 h-4 mr-1" />
          {t(`${translationPrefix}.add`)}
        </Button>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="w-full grid grid-cols-3 rounded-none border-b bg-muted/50">
          {statusTabs.map(s => (
            <TabsTrigger key={s} value={s} className={cn('text-xs', statusColors[s])}>
              {t(`${translationPrefix}.status_${s}`)}
              <span className="ml-1 opacity-70">
                ({tasks.filter(task => task.status === s).length})
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {statusTabs.map(s => (
          <TabsContent key={s} value={s} className="flex-1 overflow-auto p-3 space-y-2 m-0">
            {filteredTasks.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">{t(`${translationPrefix}.no_tasks`)}</p>
            ) : (
              filteredTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onStatusChange={onStatusChange}
                  onDelete={onDelete}
                  t={t}
                  translationPrefix={translationPrefix}
                />
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
};

export default StatusTabs;
