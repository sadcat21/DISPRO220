import React, { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Trophy, Star, TrendingUp, TrendingDown, Award, Target, Flame, Crown, Shield, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkerPointsSummary, useAllWorkersPoints } from '@/hooks/useRewards';
import { useRewardConfig } from '@/hooks/useRewardConfig';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const LEVELS = [
  { min: 0, max: 99, label: 'مبتدئ', icon: '🌱', color: 'text-muted-foreground', bg: 'bg-muted/30' },
  { min: 100, max: 299, label: 'نشيط', icon: '🔥', color: 'text-blue-600', bg: 'bg-blue-50' },
  { min: 300, max: 599, label: 'محترف', icon: '⭐', color: 'text-purple-600', bg: 'bg-purple-50' },
  { min: 600, max: Infinity, label: 'بطل مبيعات', icon: '🏆', color: 'text-yellow-600', bg: 'bg-yellow-50' },
];

const getLevel = (points: number) => LEVELS.find(l => points >= l.min && points <= l.max) || LEVELS[0];
const getNextLevel = (points: number) => {
  const idx = LEVELS.findIndex(l => points >= l.min && points <= l.max);
  return idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;
};

const WorkerRewards: React.FC = () => {
  const { workerId } = useAuth();
  const { data: myPoints, isLoading } = useWorkerPointsSummary(workerId || undefined);
  const { data: allPoints } = useAllWorkersPoints();
  const { data: config } = useRewardConfig();
  const prevLevelRef = useRef<string | null>(null);

  const { data: workerInfo } = useQuery({
    queryKey: ['worker-info-rewards', workerId],
    queryFn: async () => {
      const { data } = await supabase.from('workers').select('full_name, salary, bonus_cap_percentage').eq('id', workerId!).single();
      return data;
    },
    enabled: !!workerId,
  });

  const { data: recentLog } = useQuery({
    queryKey: ['worker-points-log', workerId],
    queryFn: async () => {
      const { data } = await supabase
        .from('employee_points_log')
        .select('*, task:reward_tasks(name), penalty:reward_penalties(name)')
        .eq('worker_id', workerId!)
        .order('created_at', { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!workerId,
  });

  const total = myPoints?.total || 0;
  const level = getLevel(total);

  // Level-up notification
  useEffect(() => {
    if (!myPoints) return;
    const currentLabel = level.label;
    if (prevLevelRef.current && prevLevelRef.current !== currentLabel) {
      // Level changed!
      const prevIdx = LEVELS.findIndex(l => l.label === prevLevelRef.current);
      const currIdx = LEVELS.findIndex(l => l.label === currentLabel);
      if (currIdx > prevIdx) {
        toast.success(`🎉 مبروك! وصلت لمستوى "${currentLabel}" ${level.icon}`, {
          duration: 6000,
          description: `نقاطك الحالية: ${total}`,
        });
      }
    }
    prevLevelRef.current = currentLabel;
  }, [total, level.label, myPoints]);

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>;

  const rewards = myPoints?.rewards || 0;
  const penalties = myPoints?.penalties || 0;
  const nextLevel = getNextLevel(total);
  const pointValue = config?.point_value || 10;

  const sorted = Object.entries(allPoints || {})
    .map(([id, pts]) => ({ id, total: pts.total }))
    .sort((a, b) => b.total - a.total);
  const rank = sorted.findIndex(w => w.id === workerId) + 1;

  const totalAllPoints = sorted.reduce((s, w) => s + Math.max(0, w.total), 0);
  const budget = config?.monthly_budget || 0;
  const autoPct = config?.auto_percentage || 70;
  const autoBudget = budget * (autoPct / 100);
  const totalRawBonuses = totalAllPoints * pointValue;
  const correctionFactor = totalRawBonuses > autoBudget && totalRawBonuses > 0 ? autoBudget / totalRawBonuses : 1;

  const rawBonus = Math.max(0, total) * pointValue * correctionFactor;
  const salary = Number(workerInfo?.salary) || 0;
  const capPct = Number(workerInfo?.bonus_cap_percentage) || 20;
  const salaryCap = salary > 0 ? salary * (capPct / 100) : Infinity;

  let compBonus = 0;
  const compBudget = budget * ((config?.competition_percentage || 20) / 100);
  if (rank === 1) compBonus = compBudget * ((config?.top1_bonus_pct || 50) / 100);
  else if (rank === 2) compBonus = compBudget * ((config?.top2_bonus_pct || 30) / 100);
  else if (rank === 3) compBonus = compBudget * ((config?.top3_bonus_pct || 20) / 100);

  const expectedBonus = Math.min(rawBonus + compBonus, salaryCap);
  const levelProgress = nextLevel ? ((total - level.min) / (nextLevel.min - level.min)) * 100 : 100;

  return (
    <div className="p-4 space-y-4 pb-20" dir="rtl">
      {/* Header */}
      <div className={`rounded-2xl p-5 ${level.bg} border`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm text-muted-foreground">مرحباً</p>
            <h2 className="text-lg font-bold">{workerInfo?.full_name || 'الموظف'}</h2>
          </div>
          <div className="text-4xl">{level.icon}</div>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <Badge className={`${level.color} border-current`} variant="outline">{level.label}</Badge>
          {rank > 0 && <Badge variant="secondary">المرتبة #{rank}</Badge>}
          {rank <= 3 && rank > 0 && <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">🏅 متنافس</Badge>}
        </div>
        {nextLevel && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{level.label}</span>
              <span>{nextLevel.label} ({nextLevel.min} نقطة)</span>
            </div>
            <Progress value={Math.min(100, Math.max(0, levelProgress))} className="h-2" />
            <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              يتبقى {nextLevel.min - total} نقطة للمستوى التالي
            </p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3 text-center">
          <Star className="w-5 h-5 mx-auto mb-1 text-primary" />
          <p className="text-xl font-bold">{total}</p>
          <p className="text-[10px] text-muted-foreground">إجمالي النقاط</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <TrendingUp className="w-5 h-5 mx-auto mb-1 text-green-600" />
          <p className="text-xl font-bold text-green-600">+{rewards}</p>
          <p className="text-[10px] text-muted-foreground">مكافآت</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <TrendingDown className="w-5 h-5 mx-auto mb-1 text-red-500" />
          <p className="text-xl font-bold text-red-500">-{penalties}</p>
          <p className="text-[10px] text-muted-foreground">خصومات</p>
        </CardContent></Card>
      </div>

      {/* Expected Bonus */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-primary" />
              <span className="font-medium text-sm">المكافأة المتوقعة</span>
            </div>
            <span className="text-xl font-bold text-primary">{expectedBonus.toFixed(0)} DA</span>
          </div>
          <div className="mt-2 space-y-1 text-[10px] text-muted-foreground">
            <div className="flex justify-between">
              <span>قيمة النقطة: {pointValue} DA</span>
              {correctionFactor < 1 && (
                <span className="text-orange-600 flex items-center gap-0.5">
                  <Shield className="w-3 h-3" /> تصحيح: {(correctionFactor * 100).toFixed(0)}%
                </span>
              )}
            </div>
            {compBonus > 0 && (
              <div className="flex justify-between text-yellow-600">
                <span>🏅 مكافأة تنافسية</span>
                <span>+{compBonus.toFixed(0)} DA</span>
              </div>
            )}
            {salary > 0 && (
              <div className="flex justify-between">
                <span>الحد الأقصى ({capPct}% من الراتب)</span>
                <span>{salaryCap.toFixed(0)} DA</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Leaderboard */}
      {sorted.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Crown className="w-4 h-4 text-yellow-500" />
              أفضل 5 موظفين
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sorted.slice(0, 5).map((w, i) => (
              <div key={w.id} className={`flex items-center justify-between p-2 rounded-lg text-sm ${w.id === workerId ? 'bg-primary/10 font-bold' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="w-5 text-center">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}</span>
                  <span>{w.id === workerId ? 'أنت' : `موظف ${i+1}`}</span>
                </div>
                <span>{w.total} نقطة</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="w-4 h-4" />
            آخر النشاطات
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(!recentLog || recentLog.length === 0) ? (
            <p className="text-center text-sm text-muted-foreground py-4">لا توجد نشاطات بعد</p>
          ) : (
            <div className="space-y-2">
              {recentLog.map((log: any) => (
                <div key={log.id} className="flex items-center justify-between p-2 rounded-lg border text-sm">
                  <div>
                    <p className="font-medium text-xs">{log.task?.name || log.penalty?.name || log.notes || 'نقاط'}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(log.point_date).toLocaleDateString('ar-DZ')}</p>
                  </div>
                  <Badge variant={log.point_type === 'reward' ? 'default' : 'destructive'} className="text-xs">
                    {log.point_type === 'reward' ? '+' : '-'}{Math.abs(log.points)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Levels */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Flame className="w-4 h-4" />
            المستويات والشارات
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {LEVELS.map(l => (
              <div key={l.label} className={`p-3 rounded-lg border text-center ${total >= l.min ? l.bg : 'opacity-40'}`}>
                <span className="text-2xl">{l.icon}</span>
                <p className={`text-xs font-bold mt-1 ${total >= l.min ? l.color : ''}`}>{l.label}</p>
                <p className="text-[10px] text-muted-foreground">{l.min}+ نقطة</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WorkerRewards;
