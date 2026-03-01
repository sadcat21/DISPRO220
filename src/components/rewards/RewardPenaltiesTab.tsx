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
import { Plus, AlertTriangle, Info, Database, Zap } from 'lucide-react';
import { useRewardPenalties, useCreateRewardPenalty } from '@/hooks/useRewards';
import { useAuth } from '@/contexts/AuthContext';
import { PENALTY_TRIGGERS, TRIGGER_CATEGORIES } from '@/data/rewardTriggers';

const RewardPenaltiesTab: React.FC = () => {
  const { data: penalties, isLoading } = useRewardPenalties();
  const createPenalty = useCreateRewardPenalty();
  const { user, activeBranch } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [points, setPoints] = useState('5');
  const [trigger, setTrigger] = useState('');
  const [isAutomatic, setIsAutomatic] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');

  const selectedTrigger = trigger ? PENALTY_TRIGGERS[trigger] : null;
  const isAutoPossible = selectedTrigger && selectedTrigger.dbTable !== '-';

  const filteredTriggers = useMemo(() => {
    return Object.entries(PENALTY_TRIGGERS).filter(([, v]) =>
      filterCategory === 'all' || v.category === filterCategory
    );
  }, [filterCategory]);

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

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="space-y-4 mt-4">
      <Button onClick={() => setShowCreate(true)} className="w-full" variant="destructive">
        <Plus className="w-4 h-4 ml-2" />
        إنشاء مخالفة جديدة
      </Button>

      {(!penalties || penalties.length === 0) ? (
        <div className="text-center py-12 text-muted-foreground">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>لا توجد مخالفات بعد</p>
        </div>
      ) : (
        penalties.map(p => {
          const tDef = PENALTY_TRIGGERS[p.trigger_event || 'manual'];
          return (
            <Card key={p.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{p.name}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <Badge variant="destructive" className="text-[10px]">-{p.penalty_points} نقطة</Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {tDef?.label || p.trigger_event}
                      </Badge>
                      {p.is_automatic && (
                        <Badge variant="secondary" className="text-[10px] gap-0.5">
                          <Zap className="w-2.5 h-2.5" />تلقائي
                        </Badge>
                      )}
                    </div>
                    {tDef && tDef.dbTable !== '-' && (
                      <p className="text-[10px] text-muted-foreground mt-1">{tDef.description}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}

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
                <Label className="flex items-center gap-1">
                  <Database className="w-3.5 h-3.5" />
                  حدث التفعيل (Trigger)
                </Label>
                <div className="flex gap-1.5 flex-wrap mb-2">
                  <Badge
                    variant={filterCategory === 'all' ? 'default' : 'outline'}
                    className="cursor-pointer text-[10px]"
                    onClick={() => setFilterCategory('all')}
                  >الكل</Badge>
                  {Object.entries(TRIGGER_CATEGORIES).map(([k, v]) => (
                    <Badge
                      key={k}
                      variant={filterCategory === k ? 'default' : 'outline'}
                      className="cursor-pointer text-[10px]"
                      onClick={() => setFilterCategory(k)}
                    >{v}</Badge>
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
                      <Info className="w-3 h-3 mt-0.5 shrink-0" />
                      {selectedTrigger.description}
                    </p>
                    <div className="flex gap-1.5 flex-wrap">
                      {selectedTrigger.dbTable !== '-' ? (
                        <>
                          <Badge variant="outline" className="text-[9px]">جدول: {selectedTrigger.dbTable}</Badge>
                          <Badge variant="outline" className="text-[9px]">شرط: {selectedTrigger.dbCondition}</Badge>
                          <Badge className="text-[9px] bg-green-600">يدعم التفعيل التلقائي ✓</Badge>
                        </>
                      ) : (
                        <Badge variant="secondary" className="text-[9px]">يدوي فقط - لا يوجد حدث مرتبط</Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>تفعيل تلقائي</Label>
                  {!isAutoPossible && trigger && (
                    <p className="text-[10px] text-muted-foreground">غير متاح - هذا الحدث يدوي فقط</p>
                  )}
                </div>
                <Switch
                  checked={isAutomatic}
                  onCheckedChange={setIsAutomatic}
                  disabled={!isAutoPossible}
                />
              </div>

              <Button onClick={handleCreate} disabled={createPenalty.isPending || !name.trim() || !trigger} className="w-full">
                إنشاء
              </Button>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RewardPenaltiesTab;
