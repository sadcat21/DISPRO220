import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Save, Settings2, Percent, Trophy, Shield, Wallet } from 'lucide-react';
import { useRewardConfig, useUpsertRewardConfig } from '@/hooks/useRewardConfig';
import { useRewardSettings, useUpdateRewardSettings, REWARD_SETTINGS_KEYS_EXPORT } from '@/hooks/useRewards';

const RewardSettingsTab: React.FC = () => {
  const { data: config, isLoading: configLoading } = useRewardConfig();
  const { data: legacySettings, isLoading: legacyLoading } = useRewardSettings();
  const upsertConfig = useUpsertRewardConfig();
  const updateLegacy = useUpdateRewardSettings();

  const [pointValue, setPointValue] = useState('10');
  const [budget, setBudget] = useState('0');
  const [autoPct, setAutoPct] = useState('70');
  const [compPct, setCompPct] = useState('20');
  const [reservePct, setReservePct] = useState('10');
  const [minThreshold, setMinThreshold] = useState('40');
  const [top1, setTop1] = useState('50');
  const [top2, setTop2] = useState('30');
  const [top3, setTop3] = useState('20');
  const [absoluteCap, setAbsoluteCap] = useState('0');
  const [penaltiesEnabled, setPenaltiesEnabled] = useState(true);

  useEffect(() => {
    if (config) {
      setPointValue(String(config.point_value));
      setBudget(String(config.monthly_budget));
      setAutoPct(String(config.auto_percentage));
      setCompPct(String(config.competition_percentage));
      setReservePct(String(config.reserve_percentage));
      setMinThreshold(String(config.minimum_threshold));
      setTop1(String(config.top1_bonus_pct));
      setTop2(String(config.top2_bonus_pct));
      setTop3(String(config.top3_bonus_pct));
    } else if (legacySettings) {
      setBudget(String(legacySettings.monthlyBudget));
      setAbsoluteCap(String(legacySettings.absoluteCap));
      setPenaltiesEnabled(legacySettings.penaltiesEnabled);
    }
  }, [config, legacySettings]);

  const handleSave = () => {
    upsertConfig.mutate({
      point_value: Number(pointValue),
      monthly_budget: Number(budget),
      auto_percentage: Number(autoPct),
      competition_percentage: Number(compPct),
      reserve_percentage: Number(reservePct),
      minimum_threshold: Number(minThreshold),
      top1_bonus_pct: Number(top1),
      top2_bonus_pct: Number(top2),
      top3_bonus_pct: Number(top3),
    });
    // Also sync legacy settings
    updateLegacy.mutate([
      { key: REWARD_SETTINGS_KEYS_EXPORT.MONTHLY_BUDGET, value: budget },
      { key: REWARD_SETTINGS_KEYS_EXPORT.PENALTIES_ENABLED, value: String(penaltiesEnabled) },
      { key: REWARD_SETTINGS_KEYS_EXPORT.ABSOLUTE_CAP, value: absoluteCap },
    ]);
  };

  if (configLoading || legacyLoading) return <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>;

  const totalPct = Number(autoPct) + Number(compPct) + Number(reservePct);

  return (
    <div className="space-y-4 mt-4">
      {/* Core Engine Settings */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            محرك المكافآت الذكي
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">قيمة النقطة (DA)</Label>
              <Input type="number" value={pointValue} onChange={e => setPointValue(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الميزانية الشهرية (DA)</Label>
              <Input type="number" value={budget} onChange={e => setBudget(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Budget Distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Percent className="w-4 h-4" />
            توزيع الميزانية
            {totalPct !== 100 && <span className="text-xs text-destructive">(المجموع: {totalPct}%)</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">مكافآت تلقائية بالنقاط (%)</Label>
            <Input type="number" value={autoPct} onChange={e => setAutoPct(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">مكافآت تنافسية - أفضل 3 (%)</Label>
            <Input type="number" value={compPct} onChange={e => setCompPct(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">احتياطي ثابت للصندوق (%)</Label>
            <Input type="number" value={reservePct} onChange={e => setReservePct(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Competition Prizes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-600" />
            توزيع المكافآت التنافسية
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">🥇 الأول (%)</Label>
              <Input type="number" value={top1} onChange={e => setTop1(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">🥈 الثاني (%)</Label>
              <Input type="number" value={top2} onChange={e => setTop2(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">🥉 الثالث (%)</Label>
              <Input type="number" value={top3} onChange={e => setTop3(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Protection */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4 text-red-500" />
            آليات الحماية
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">الحد الأدنى للأداء العام (%) - تحت هذا يتم تقليص الميزانية</Label>
            <Input type="number" value={minThreshold} onChange={e => setMinThreshold(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الحد الأقصى المطلق للمكافأة (DA) - 0 = بلا حد</Label>
            <Input type="number" value={absoluteCap} onChange={e => setAbsoluteCap(e.target.value)} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">تفعيل نظام العقوبات</Label>
            <Switch checked={penaltiesEnabled} onCheckedChange={setPenaltiesEnabled} />
          </div>
        </CardContent>
      </Card>

      {/* How it works */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="w-4 h-4" />
            كيف يعمل المحرك الهجين
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1.5">
          <p>1. النقاط تُحتسب تلقائياً من الأحداث (زيارات، مبيعات، تحصيل...)</p>
          <p>2. المكافأة = النقاط × قيمة النقطة الثابتة ({pointValue} DA)</p>
          <p>3. إذا تجاوز المجموع الميزانية → يُطبق معامل تصحيح تلقائي</p>
          <p>4. إذا كان أقل → الفائض يذهب لصندوق الاحتياطي</p>
          <p>5. أفضل 3 موظفين يحصلون على مكافآت إضافية من حصة المنافسة</p>
          <p>6. إذا كان الأداء العام ضعيفاً (أقل من {minThreshold}%) → تُقلّص الميزانية</p>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={upsertConfig.isPending} className="w-full">
        <Save className="w-4 h-4 ml-2" />
        حفظ جميع الإعدادات
      </Button>
    </div>
  );
};

export default RewardSettingsTab;
