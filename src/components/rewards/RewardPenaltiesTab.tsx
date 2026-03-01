import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, AlertTriangle, Info, Database, Zap, Pencil, Trash2, Users } from 'lucide-react';
import { useRewardPenalties, useCreateRewardPenalty, RewardPenalty } from '@/hooks/useRewards';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { PENALTY_TRIGGERS, TRIGGER_CATEGORIES } from '@/data/rewardTriggers';

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

const RewardPenaltiesTab: React.FC = () => {
  const { data: penalties, isLoading } = useRewardPenalties();
  const createPenalty = useCreateRewardPenalty();
  const queryClient = useQueryClient();
  const { user, activeBranch } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [points, setPoints] = useState('5');
  const [trigger, setTrigger] = useState('');
  const [isAutomatic, setIsAutomatic] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [editPenalty, setEditPenalty] = useState<RewardPenalty | null>(null);
  const [editName, setEditName] = useState('');
  const [editPoints, setEditPoints] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const selectedTrigger = trigger ? PENALTY_TRIGGERS[trigger] : null;
  const isAutoPossible = selectedTrigger && selectedTrigger.dbTable !== '-';

  const filteredTriggers = useMemo(() => {
    return Object.entries(PENALTY_TRIGGERS).filter(([, v]) =>
      filterCategory === 'all' || v.category === filterCategory
    );
  }, [filterCategory]);

  const filteredPenalties = useMemo(() => {
    if (!penalties) return [];
    if (filterRole === 'all') return penalties;
    return penalties.filter(p => {
      const roles = (p as any).applicable_roles as string[] | null;
      if (!roles) return filterRole === 'all_roles';
      return roles.includes(filterRole);
    });
  }, [penalties, filterRole]);

  const handleCreate = () => {
    if (!name.trim() || !trigger) return;
    createPenalty.mutate({
      name,
      penalty_points: Number(points),
      trigger_event: trigger,
      is_automatic: isAutoPossible ? isAutomatic : false,
      is_active: true,
      branch_id: activeBranch?.id || null,
      created_by: user?.id || null,
    }, {
      onSuccess: () => {
        setShowCreate(false);
        setName(''); setPoints('5'); setTrigger(''); setIsAutomatic(false);
      },
    });
  };

  const openEdit = (p: RewardPenalty) => {
    setEditPenalty(p);
    setEditName(p.name);
    setEditPoints(String(p.penalty_points));
  };

  const handleEdit = async () => {
    if (!editPenalty) return;
    const { error } = await supabase.from('reward_penalties').update({ name: editName, penalty_points: Number(editPoints) } as any).eq('id', editPenalty.id);
    if (error) { toast.error('حدث خطأ'); return; }
    queryClient.invalidateQueries({ queryKey: ['reward-penalties'] });
    toast.success('تم تحديث المخالفة');
    setEditPenalty(null);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('reward_penalties').delete().eq('id', deleteId);
    if (error) { toast.error('حدث خطأ أثناء الحذف'); return; }
    queryClient.invalidateQueries({ queryKey: ['reward-penalties'] });
    toast.success('تم حذف المخالفة');
    setDeleteId(null);
  };

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="space-y-4 mt-4">
      <Button onClick={() => setShowCreate(true)} className="w-full" variant="destructive">
        <Plus className="w-4 h-4 ml-2" />
        إنشاء مخالفة جديدة
      </Button>

      {/* Role Filter */}
      <div className="flex gap-1.5 flex-wrap">
        <Badge variant={filterRole === 'all' ? 'default' : 'outline'} className="cursor-pointer text-[10px]" onClick={() => setFilterRole('all')}>
          <Users className="w-3 h-3 ml-1" />الكل ({penalties?.length || 0})
        </Badge>
        {Object.entries(ROLE_LABELS).map(([k, v]) => {
          const count = penalties?.filter(p => {
            const roles = (p as any).applicable_roles as string[] | null;
            return roles?.includes(k);
          }).length || 0;
          return (
            <Badge key={k} variant={filterRole === k ? 'default' : 'outline'} className="cursor-pointer text-[10px]" onClick={() => setFilterRole(k)}>
              {v} ({count})
            </Badge>
          );
        })}
      </div>

      {filteredPenalties.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>لا توجد مخالفات {filterRole !== 'all' ? `لـ ${ROLE_LABELS[filterRole] || ''}` : 'بعد'}</p>
        </div>
      ) : (
        filteredPenalties.map(p => {
          const tDef = PENALTY_TRIGGERS[p.trigger_event || 'manual'];
          const roles = (p as any).applicable_roles as string[] | null;
          return (
            <Card key={p.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{p.name}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <Badge variant="destructive" className="text-[10px]">-{p.penalty_points} نقطة</Badge>
                      <Badge variant="outline" className="text-[10px]">{tDef?.label || p.trigger_event}</Badge>
                      {p.is_automatic && (
                        <Badge variant="secondary" className="text-[10px] gap-0.5">
                          <Zap className="w-2.5 h-2.5" />تلقائي
                        </Badge>
                      )}
                      {roles ? roles.map(r => (
                        <Badge key={r} className={`text-[9px] ${ROLE_COLORS[r] || ''}`}>{ROLE_LABELS[r] || r}</Badge>
                      )) : (
                        <Badge className="text-[9px] bg-gray-100 text-gray-700">جميع الأدوار</Badge>
                      )}
                    </div>
                    {tDef && tDef.dbTable !== '-' && (
                      <p className="text-[10px] text-muted-foreground mt-1">{tDef.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(p.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md max-h-[90vh]" dir="rtl">
          <DialogHeader><DialogTitle>إنشاء مخالفة</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-2">
            <div className="space-y-4 pb-2">
              <div className="space-y-2">
                <Label>اسم المخالفة</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: تأخير عن الموعد" />
              </div>
              <div className="space-y-2">
                <Label>نقاط الخصم</Label>
                <Input type="number" value={points} onChange={e => setPoints(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><Database className="w-3.5 h-3.5" />حدث التفعيل (Trigger)</Label>
                <div className="flex gap-1.5 flex-wrap mb-2">
                  <Badge variant={filterCategory === 'all' ? 'default' : 'outline'} className="cursor-pointer text-[10px]" onClick={() => setFilterCategory('all')}>الكل</Badge>
                  {Object.entries(TRIGGER_CATEGORIES).map(([k, v]) => (
                    <Badge key={k} variant={filterCategory === k ? 'default' : 'outline'} className="cursor-pointer text-[10px]" onClick={() => setFilterCategory(k)}>{v}</Badge>
                  ))}
                </div>
                <Select value={trigger} onValueChange={setTrigger}>
                  <SelectTrigger><SelectValue placeholder="اختر حدث التفعيل..." /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {filteredTriggers.map(([key, t]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-1.5">
                          {t.dbTable !== '-' && <Zap className="w-3 h-3 text-amber-500" />}
                          <span>{t.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTrigger && (
                  <div className="bg-muted/50 rounded-lg p-2.5 space-y-1.5">
                    <p className="text-xs text-muted-foreground flex items-start gap-1">
                      <Info className="w-3 h-3 mt-0.5 shrink-0" />{selectedTrigger.description}
                    </p>
                    <div className="flex gap-1.5 flex-wrap">
                      {selectedTrigger.dbTable !== '-' ? (
                        <>
                          <Badge variant="outline" className="text-[9px]">جدول: {selectedTrigger.dbTable}</Badge>
                          <Badge variant="outline" className="text-[9px]">شرط: {selectedTrigger.dbCondition}</Badge>
                          <Badge className="text-[9px] bg-green-600">يدعم التفعيل التلقائي ✓</Badge>
                        </>
                      ) : (
                        <Badge variant="secondary" className="text-[9px]">يدوي فقط</Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>تفعيل تلقائي</Label>
                  {!isAutoPossible && trigger && <p className="text-[10px] text-muted-foreground">غير متاح - حدث يدوي</p>}
                </div>
                <Switch checked={isAutomatic} onCheckedChange={setIsAutomatic} disabled={!isAutoPossible} />
              </div>
              <Button onClick={handleCreate} disabled={createPenalty.isPending || !name.trim() || !trigger} className="w-full">إنشاء</Button>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editPenalty} onOpenChange={() => setEditPenalty(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader><DialogTitle>تعديل المخالفة</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>اسم المخالفة</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>نقاط الخصم</Label>
              <Input type="number" value={editPoints} onChange={e => setEditPoints(e.target.value)} />
            </div>
            <Button onClick={handleEdit} className="w-full">حفظ التعديلات</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المخالفة</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذه المخالفة؟</AlertDialogDescription>
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

export default RewardPenaltiesTab;