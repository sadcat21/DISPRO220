import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, Target, TrendingUp, Clock, Banknote, Zap, Pencil, Trash2, Users } from 'lucide-react';
import { useRewardTasks, useUpdateRewardTask, RewardTask } from '@/hooks/useRewards';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import CreateRewardTaskDialog from './CreateRewardTaskDialog';
import { TASK_DATA_SOURCES, TASK_CATEGORIES } from '@/data/rewardTriggers';

const ROLE_LABELS: Record<string, string> = {
  worker: 'عامل توصيل/مبيعات',
  admin: 'مدير فرع',
  supervisor: 'مشرف',
  branch_admin: 'مسؤول مخزن',
};

const ROLE_COLORS: Record<string, string> = {
  worker: 'bg-blue-100 text-blue-800',
  admin: 'bg-purple-100 text-purple-800',
  supervisor: 'bg-amber-100 text-amber-800',
  branch_admin: 'bg-emerald-100 text-emerald-800',
};

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
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editTask, setEditTask] = useState<RewardTask | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editReward, setEditReward] = useState('');
  const [editPenalty, setEditPenalty] = useState('');
  const [filterRole, setFilterRole] = useState('all');

  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    if (filterRole === 'all') return tasks;
    return tasks.filter(t => {
      const roles = (t as any).applicable_roles as string[] | null;
      if (!roles) return filterRole === 'all_roles';
      return roles.includes(filterRole);
    });
  }, [tasks, filterRole]);

  const openEdit = (task: RewardTask) => {
    setEditTask(task);
    setEditName(task.name);
    setEditReward(String(task.reward_points));
    setEditPenalty(String(task.penalty_points));
  };

  const handleEdit = () => {
    if (!editTask) return;
    updateTask.mutate({
      id: editTask.id,
      name: editName,
      reward_points: Number(editReward),
      penalty_points: Number(editPenalty),
    }, { onSuccess: () => setEditTask(null) });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('reward_tasks').delete().eq('id', deleteId);
    if (error) { toast.error('حدث خطأ أثناء الحذف'); return; }
    queryClient.invalidateQueries({ queryKey: ['reward-tasks'] });
    toast.success('تم حذف المهمة');
    setDeleteId(null);
  };

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="space-y-4 mt-4">
      <Button onClick={() => setShowCreate(true)} className="w-full">
        <Plus className="w-4 h-4 ml-2" />
        إنشاء مهمة جديدة
      </Button>

      {/* Role Filter */}
      <div className="flex gap-1.5 flex-wrap">
        <Badge variant={filterRole === 'all' ? 'default' : 'outline'} className="cursor-pointer text-[10px]" onClick={() => setFilterRole('all')}>
          <Users className="w-3 h-3 ml-1" />الكل ({tasks?.length || 0})
        </Badge>
        {Object.entries(ROLE_LABELS).map(([k, v]) => {
          const count = tasks?.filter(t => {
            const roles = (t as any).applicable_roles as string[] | null;
            return roles?.includes(k);
          }).length || 0;
          return (
            <Badge key={k} variant={filterRole === k ? 'default' : 'outline'} className="cursor-pointer text-[10px]" onClick={() => setFilterRole(k)}>
              {v} ({count})
            </Badge>
          );
        })}
      </div>

      {filteredTasks.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>لا توجد مهام {filterRole !== 'all' ? `لـ ${ROLE_LABELS[filterRole] || ''}` : 'بعد'}</p>
        </div>
      ) : (
        filteredTasks.map(task => {
          const src = TASK_DATA_SOURCES[task.data_source];
          const roles = (task as any).applicable_roles as string[] | null;
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
                      {roles ? roles.map(r => (
                        <Badge key={r} className={`text-[9px] ${ROLE_COLORS[r] || ''}`}>{ROLE_LABELS[r] || r}</Badge>
                      )) : (
                        <Badge className="text-[9px] bg-gray-100 text-gray-700">جميع الأدوار</Badge>
                      )}
                    </div>
                    {src && <p className="text-[10px] text-muted-foreground mt-1">{src.description}</p>}
                    <div className="flex gap-3 mt-2 text-xs">
                      <span className="text-green-600">+{task.reward_points} نقطة</span>
                      {task.penalty_points > 0 && <span className="text-red-600">-{task.penalty_points} نقطة</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Switch
                      checked={task.is_active}
                      onCheckedChange={(checked) => updateTask.mutate({ id: task.id, is_active: checked })}
                    />
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(task)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(task.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}

      <CreateRewardTaskDialog open={showCreate} onOpenChange={setShowCreate} />

      {/* Edit Dialog */}
      <Dialog open={!!editTask} onOpenChange={() => setEditTask(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>تعديل المهمة</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>اسم المهمة</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>نقاط المكافأة</Label>
                <Input type="number" value={editReward} onChange={e => setEditReward(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>نقاط الخصم</Label>
                <Input type="number" value={editPenalty} onChange={e => setEditPenalty(e.target.value)} />
              </div>
            </div>
            <Button onClick={handleEdit} disabled={updateTask.isPending} className="w-full">حفظ التعديلات</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المهمة</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذه المهمة؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">حذف</AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RewardTasksTab;