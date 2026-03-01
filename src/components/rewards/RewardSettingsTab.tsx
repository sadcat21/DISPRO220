import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';
import { useRewardSettings, useUpdateRewardSettings, REWARD_SETTINGS_KEYS_EXPORT } from '@/hooks/useRewards';

const RewardSettingsTab: React.FC = () => {
  const { data: settings, isLoading } = useRewardSettings();
  const updateSettings = useUpdateRewardSettings();

  const [budget, setBudget] = useState('0');
  const [penaltiesEnabled, setPenaltiesEnabled] = useState(true);
  const [absoluteCap, setAbsoluteCap] = useState('0');

  useEffect(() => {
    if (settings) {
      setBudget(String(settings.monthlyBudget));
      setPenaltiesEnabled(settings.penaltiesEnabled);
      setAbsoluteCap(String(settings.absoluteCap));
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate([
      { key: REWARD_SETTINGS_KEYS_EXPORT.MONTHLY_BUDGET, value: budget },
      { key: REWARD_SETTINGS_KEYS_EXPORT.PENALTIES_ENABLED, value: String(penaltiesEnabled) },
      { key: REWARD_SETTINGS_KEYS_EXPORT.ABSOLUTE_CAP, value: absoluteCap },
    ]);
  };

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">الإعدادات العامة للمكافآت</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>الميزانية الشهرية للمكافآت (DA)</Label>
            <Input type="number" value={budget} onChange={e => setBudget(e.target.value)} placeholder="0" />
          </div>

          <div className="space-y-2">
            <Label>الحد الأقصى المطلق للمكافأة (DA) - 0 يعني بدون حد</Label>
            <Input type="number" value={absoluteCap} onChange={e => setAbsoluteCap(e.target.value)} placeholder="0" />
          </div>

          <div className="flex items-center justify-between">
            <Label>تفعيل نظام العقوبات</Label>
            <Switch checked={penaltiesEnabled} onCheckedChange={setPenaltiesEnabled} />
          </div>

          <Button onClick={handleSave} disabled={updateSettings.isPending} className="w-full">
            <Save className="w-4 h-4 ml-2" />
            حفظ الإعدادات
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">كيفية حساب المكافأة</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. يتم جمع نقاط كل الموظفين في نهاية الشهر</p>
          <p>2. قيمة النقطة = الميزانية ÷ مجموع نقاط كل الموظفين</p>
          <p>3. مكافأة الموظف = نقاطه × قيمة النقطة</p>
          <p>4. تطبيق الحد الأقصى (نسبة من الراتب أو الحد المطلق)</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default RewardSettingsTab;
