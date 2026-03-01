import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, AlertTriangle } from 'lucide-react';
import { useRewardPenalties, useCreateRewardPenalty } from '@/hooks/useRewards';
import { useAuth } from '@/contexts/AuthContext';

const triggerLabels: Record<string, string> = {
  manual: 'يدوي',
  cancel_visit: 'إلغاء زيارة',
  gps_deviation: 'مغادرة المسار GPS',
  late_arrival: 'تأخير أكثر من 30 دقيقة',
  confirmed_complaint: 'شكوى مؤكدة',
  missing_delivery: 'عدم تسليم طلبية',
  stock_shortage: 'نقص في المخزون',
  unauthorized_discount: 'خصم غير مصرح',
  debt_overdue: 'تأخر تحصيل دين',
  document_missing: 'عدم جمع مستند',
  wrong_invoice: 'خطأ في الفاتورة',
  customer_loss: 'فقدان عميل',
  truck_damage: 'ضرر في الشاحنة',
  absence: 'غياب بدون إذن',
  early_leave: 'مغادرة مبكرة',
  phone_unreachable: 'عدم الرد على الهاتف',
  unsafe_driving: 'قيادة غير آمنة',
  cash_discrepancy: 'فرق في النقد',
  product_return: 'إرجاع منتج بسبب الموظف',
  policy_violation: 'مخالفة سياسة الشركة',
};

const RewardPenaltiesTab: React.FC = () => {
  const { data: penalties, isLoading } = useRewardPenalties();
  const createPenalty = useCreateRewardPenalty();
  const { user, activeBranch } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [points, setPoints] = useState('5');
  const [trigger, setTrigger] = useState('manual');
  const [isAutomatic, setIsAutomatic] = useState(false);

  const handleCreate = () => {
    if (!name.trim()) return;
    createPenalty.mutate({
      name,
      penalty_points: Number(points),
      trigger_event: trigger,
      is_automatic: isAutomatic,
      is_active: true,
      branch_id: activeBranch?.id || null,
      created_by: user?.id || null,
    }, {
      onSuccess: () => {
        setShowCreate(false);
        setName('');
        setPoints('5');
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
        penalties.map(p => (
          <Card key={p.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{p.name}</p>
                  <div className="flex gap-2 mt-1.5">
                    <Badge variant="destructive" className="text-[10px]">-{p.penalty_points} نقطة</Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {triggerLabels[p.trigger_event || 'manual'] || p.trigger_event}
                    </Badge>
                    {p.is_automatic && <Badge variant="secondary" className="text-[10px]">تلقائي</Badge>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>إنشاء مخالفة</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>اسم المخالفة</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: تأخير عن الموعد" />
            </div>
            <div className="space-y-2">
              <Label>نقاط الخصم</Label>
              <Input type="number" value={points} onChange={e => setPoints(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>حدث التفعيل</Label>
              <Select value={trigger} onValueChange={setTrigger}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {Object.entries(triggerLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>تفعيل تلقائي</Label>
              <Switch checked={isAutomatic} onCheckedChange={setIsAutomatic} />
            </div>
            <Button onClick={handleCreate} disabled={createPenalty.isPending || !name.trim()} className="w-full">
              إنشاء
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RewardPenaltiesTab;
