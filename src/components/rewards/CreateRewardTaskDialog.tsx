import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Info, Database } from 'lucide-react';
import { useCreateRewardTask } from '@/hooks/useRewards';
import { useAuth } from '@/contexts/AuthContext';
import { TASK_DATA_SOURCES, TASK_CATEGORIES, TRIGGER_CATEGORIES } from '@/data/rewardTriggers';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CreateRewardTaskDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  const { user, activeBranch } = useAuth();
  const createTask = useCreateRewardTask();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('sales');
  const [dataSource, setDataSource] = useState('');
  const [rewardPoints, setRewardPoints] = useState('10');
  const [penaltyPoints, setPenaltyPoints] = useState('0');
  const [frequency, setFrequency] = useState('daily');
  const [isCumulative, setIsCumulative] = useState(false);
  const [minCount, setMinCount] = useState('1');
  const [minAmount, setMinAmount] = useState('');

  const filteredSources = useMemo(() => {
    return Object.entries(TASK_DATA_SOURCES).filter(([, v]) => v.category === category);
  }, [category]);

  const selectedSource = dataSource ? TASK_DATA_SOURCES[dataSource] : null;

  const handleSubmit = () => {
    if (!name.trim() || !dataSource) return;
    const conditionLogic: Record<string, any> = {};
    if (minCount) conditionLogic.min_count = Number(minCount);
    if (minAmount) conditionLogic.min_amount = Number(minAmount);

    createTask.mutate({
      name,
      category,
      data_source: dataSource,
      condition_logic: conditionLogic,
      reward_points: Number(rewardPoints),
      penalty_points: Number(penaltyPoints),
      frequency,
      is_cumulative: isCumulative,
      is_active: true,
      branch_id: activeBranch?.id || null,
      created_by: user?.id || null,
    }, {
      onSuccess: () => {
        onOpenChange(false);
        setName(''); setRewardPoints('10'); setPenaltyPoints('0'); setDataSource(''); setMinCount('1'); setMinAmount('');
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh]" dir="rtl">
        <DialogHeader>
          <DialogTitle>إنشاء مهمة جديدة</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-2">
          <div className="space-y-4 pb-2">
            <div className="space-y-2">
              <Label>اسم المهمة</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: تحقيق هدف المبيعات اليومي" />
            </div>

            <div className="space-y-2">
              <Label>الفئة</Label>
              <Select value={category} onValueChange={(v) => { setCategory(v); setDataSource(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_CATEGORIES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Database className="w-3.5 h-3.5" />
                مصدر البيانات (Trigger)
              </Label>
              <Select value={dataSource} onValueChange={setDataSource}>
                <SelectTrigger><SelectValue placeholder="اختر الحدث المرتبط..." /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {filteredSources.length === 0 && (
                    <div className="p-2 text-xs text-muted-foreground text-center">لا توجد أحداث لهذه الفئة</div>
                  )}
                  {filteredSources.map(([key, src]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex flex-col items-start">
                        <span>{src.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSource && (
                <div className="bg-muted/50 rounded-lg p-2.5 space-y-1">
                  <p className="text-xs text-muted-foreground flex items-start gap-1">
                    <Info className="w-3 h-3 mt-0.5 shrink-0" />
                    {selectedSource.description}
                  </p>
                  <div className="flex gap-1.5">
                    <Badge variant="outline" className="text-[9px]">جدول: {selectedSource.dbTable}</Badge>
                    <Badge variant="secondary" className="text-[9px]">تلقائي ✓</Badge>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>شروط التحقق</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">الحد الأدنى (عدد)</Label>
                  <Input type="number" value={minCount} onChange={e => setMinCount(e.target.value)} placeholder="مثال: 5" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">الحد الأدنى (مبلغ د.ج)</Label>
                  <Input type="number" value={minAmount} onChange={e => setMinAmount(e.target.value)} placeholder="اختياري" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>التكرار</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">يومي</SelectItem>
                  <SelectItem value="weekly">أسبوعي</SelectItem>
                  <SelectItem value="monthly">شهري</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>نقاط المكافأة</Label>
                <Input type="number" value={rewardPoints} onChange={e => setRewardPoints(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>نقاط الخصم</Label>
                <Input type="number" value={penaltyPoints} onChange={e => setPenaltyPoints(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>تراكم النقاط</Label>
              <Switch checked={isCumulative} onCheckedChange={setIsCumulative} />
            </div>

            <Button onClick={handleSubmit} disabled={createTask.isPending || !name.trim() || !dataSource} className="w-full">
              إنشاء المهمة
            </Button>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default CreateRewardTaskDialog;
