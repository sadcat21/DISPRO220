import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useCreateRewardTask } from '@/hooks/useRewards';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CreateRewardTaskDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  const { user, activeBranch } = useAuth();
  const createTask = useCreateRewardTask();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('sales');
  const [dataSource, setDataSource] = useState('sales');
  const [rewardPoints, setRewardPoints] = useState('10');
  const [penaltyPoints, setPenaltyPoints] = useState('0');
  const [frequency, setFrequency] = useState('daily');
  const [isCumulative, setIsCumulative] = useState(false);

  const handleSubmit = () => {
    if (!name.trim()) return;
    createTask.mutate({
      name,
      category,
      data_source: dataSource,
      condition_logic: {},
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
        setName('');
        setRewardPoints('10');
        setPenaltyPoints('0');
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>إنشاء مهمة جديدة</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>اسم المهمة</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: تحقيق هدف المبيعات اليومي" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>النوع</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales">أداء بيعي</SelectItem>
                  <SelectItem value="discipline">انضباط</SelectItem>
                  <SelectItem value="quality">جودة</SelectItem>
                  <SelectItem value="collection">تحصيل</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>مصدر البيانات</Label>
              <Select value={dataSource} onValueChange={setDataSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales">المبيعات</SelectItem>
                  <SelectItem value="visits">الزيارات</SelectItem>
                  <SelectItem value="collections">التحصيل</SelectItem>
                  <SelectItem value="new_customers">عملاء جدد</SelectItem>
                  <SelectItem value="gps">GPS</SelectItem>
                  <SelectItem value="attendance">الحضور</SelectItem>
                </SelectContent>
              </Select>
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

          <Button onClick={handleSubmit} disabled={createTask.isPending || !name.trim()} className="w-full">
            إنشاء المهمة
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateRewardTaskDialog;
