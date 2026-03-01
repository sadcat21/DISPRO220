import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Target, TrendingUp, Clock, Banknote, Zap } from 'lucide-react';
import { useRewardTasks, useUpdateRewardTask } from '@/hooks/useRewards';
import CreateRewardTaskDialog from './CreateRewardTaskDialog';
import { TASK_DATA_SOURCES, TASK_CATEGORIES } from '@/data/rewardTriggers';

const categoryIcons: Record<string, React.ReactNode> = {
  sales: <TrendingUp className="w-4 h-4" />,
  discipline: <Clock className="w-4 h-4" />,
  quality: <Target className="w-4 h-4" />,
  collection: <Banknote className="w-4 h-4" />,
};

const frequencyLabels: Record<string, string> = {
  daily: 'يومي',
  weekly: 'أسبوعي',
  monthly: 'شهري',
};

const RewardTasksTab: React.FC = () => {
  const { data: tasks, isLoading } = useRewardTasks();
  const updateTask = useUpdateRewardTask();
  const [showCreate, setShowCreate] = useState(false);

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="space-y-4 mt-4">
      <Button onClick={() => setShowCreate(true)} className="w-full">
        <Plus className="w-4 h-4 ml-2" />
        إنشاء مهمة جديدة
      </Button>

      {(!tasks || tasks.length === 0) ? (
        <div className="text-center py-12 text-muted-foreground">
          <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>لا توجد مهام بعد</p>
          <p className="text-xs mt-1">أنشئ أول مهمة لبدء نظام المكافآت</p>
        </div>
      ) : (
        tasks.map(task => {
          const src = TASK_DATA_SOURCES[task.data_source];
          return (
            <Card key={task.id} className={`${!task.is_active ? 'opacity-60' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {categoryIcons[task.category]}
                      <span className="font-medium text-sm">{task.name}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Badge variant="outline" className="text-[10px]">{TASK_CATEGORIES[task.category] || task.category}</Badge>
                      <Badge variant="secondary" className="text-[10px] gap-0.5">
                        <Zap className="w-2.5 h-2.5" />
                        {src?.label || task.data_source}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">{frequencyLabels[task.frequency] || task.frequency}</Badge>
                    </div>
                    {src && (
                      <p className="text-[10px] text-muted-foreground mt-1">{src.description}</p>
                    )}
                    <div className="flex gap-3 mt-2 text-xs">
                      <span className="text-green-600">+{task.reward_points} نقطة</span>
                      {task.penalty_points > 0 && (
                        <span className="text-red-600">-{task.penalty_points} نقطة</span>
                      )}
                    </div>
                  </div>
                  <Switch
                    checked={task.is_active}
                    onCheckedChange={(checked) => updateTask.mutate({ id: task.id, is_active: checked })}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })
      )}

      <CreateRewardTaskDialog open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
};

export default RewardTasksTab;
