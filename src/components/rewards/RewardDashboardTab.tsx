import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Trophy, Medal, TrendingUp, Users, Wallet, Shield, BarChart3, Calculator } from 'lucide-react';
import { useAllWorkersPoints } from '@/hooks/useRewards';
import { useRewardConfig, useReserveFund } from '@/hooks/useRewardConfig';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { toast } from 'sonner';
import RewardContestDialog from '@/components/rewards/RewardContestDialog';

const getLevel = (points: number) => {
  if (points >= 600) return { label: 'بطل مبيعات', color: 'text-yellow-600', bg: 'bg-yellow-50', icon: '🏆' };
  if (points >= 300) return { label: 'محترف', color: 'text-purple-600', bg: 'bg-purple-50', icon: '⭐' };
  if (points >= 100) return { label: 'نشيط', color: 'text-blue-600', bg: 'bg-blue-50', icon: '🔥' };
  return { label: 'مبتدئ', color: 'text-muted-foreground', bg: 'bg-muted/30', icon: '🌱' };
};

const RewardDashboardTab: React.FC = () => {
  const { activeBranch } = useAuth();
  const { data: workersPoints, isLoading: pointsLoading } = useAllWorkersPoints();
  const { data: config } = useRewardConfig();
  const { data: reserveFunds } = useReserveFund();
  const [contestOpen, setContestOpen] = React.useState(false);

  const { data: workers } = useQuery({
    queryKey: ['workers-for-rewards', activeBranch?.id],
    queryFn: async () => {
      let query = supabase.from('workers').select('id, full_name, salary, bonus_cap_percentage, role').eq('is_active', true);
      if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);
      const { data } = await query;
      return data || [];
    },
  });

  // Monthly performance chart data (last 6 months from monthly_bonus_summary)
  const { data: monthlyData } = useQuery({
    queryKey: ['monthly-performance-chart', activeBranch?.id],
    queryFn: async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const startMonth = sixMonthsAgo.toISOString().split('T')[0].slice(0, 8) + '01';

      let query = supabase.from('monthly_bonus_summary')
        .select('month, total_points, bonus_amount, reward_points, penalty_points')
        .gte('month', startMonth)
        .order('month', { ascending: true });

      if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);
      const { data } = await query;

      // Aggregate by month
      const monthMap: Record<string, { month: string; نقاط: number; مكافآت: number; خصومات: number; مبلغ: number }> = {};
      for (const row of data || []) {
        const m = row.month?.slice(0, 7) || '';
        if (!monthMap[m]) monthMap[m] = { month: m, نقاط: 0, مكافآت: 0, خصومات: 0, مبلغ: 0 };
        monthMap[m].نقاط += Number(row.total_points) || 0;
        monthMap[m].مكافآت += Number(row.reward_points) || 0;
        monthMap[m].خصومات += Number(row.penalty_points) || 0;
        monthMap[m].مبلغ += Number(row.bonus_amount) || 0;
      }
      return Object.values(monthMap);
    },
  });

  if (pointsLoading) return <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>;

  const pointValue = config?.point_value || 10;
  const budget = config?.monthly_budget || 0;
  const autoPct = config?.auto_percentage || 70;
  const compPct = config?.competition_percentage || 20;
  const reservePct = config?.reserve_percentage || 10;
  const minThreshold = config?.minimum_threshold || 40;

  const autoBudget = budget * (autoPct / 100);
  const compBudget = budget * (compPct / 100);

  const rankings = (workers || [])
    .map(w => ({ ...w, points: workersPoints?.[w.id] || { rewards: 0, penalties: 0, total: 0 } }))
    .filter(w => w.role === 'worker' || w.points.total > 0)
    .sort((a, b) => b.points.total - a.points.total);

  const totalAllPoints = rankings.reduce((sum, w) => sum + Math.max(0, w.points.total), 0);
  const totalRawBonuses = rankings.reduce((sum, w) => sum + Math.max(0, w.points.total) * pointValue, 0);
  const maxPossible = rankings.length * 600;
  const perfRatio = maxPossible > 0 ? (totalAllPoints / maxPossible) * 100 : 100;
  const budgetMultiplier = perfRatio < minThreshold ? (minThreshold / 100) : 1;
  const effectiveAutoBudget = autoBudget * budgetMultiplier;
  const correctionFactor = totalRawBonuses > effectiveAutoBudget && totalRawBonuses > 0 ? effectiveAutoBudget / totalRawBonuses : 1;
  const totalCorrectedBonuses = rankings.reduce((s, w) => s + Math.max(0, w.points.total) * pointValue * correctionFactor, 0);
  const surplus = Math.max(0, effectiveAutoBudget - totalCorrectedBonuses);
  const reserveFixed = budget * (reservePct / 100);
  const totalReserve = surplus + reserveFixed;
  const currentFund = reserveFunds?.[0];
  const fundBalance = currentFund ? Number(currentFund.carried_balance) + Number(currentFund.surplus_added) - Number(currentFund.used_amount) : 0;

  const handleCalculate = async () => {
    try {
      const { error } = await supabase.functions.invoke('calculate-rewards', {
        body: { action: 'calculate_monthly_bonus', branch_id: activeBranch?.id },
      });
      if (error) throw error;
      toast.success('تم احتساب المكافآت الشهرية بنجاح');
    } catch (e: any) {
      console.error(e);
      toast.error('حدث خطأ أثناء الاحتساب');
    }
  };

  return (
    <div className="space-y-4 mt-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-3 text-center">
          <Users className="w-5 h-5 mx-auto mb-1 text-primary" />
          <p className="text-lg font-bold">{rankings.length}</p>
          <p className="text-[10px] text-muted-foreground">موظف نشط</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <TrendingUp className="w-5 h-5 mx-auto mb-1 text-green-600" />
          <p className="text-lg font-bold">{totalAllPoints}</p>
          <p className="text-[10px] text-muted-foreground">إجمالي النقاط</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <Trophy className="w-5 h-5 mx-auto mb-1 text-yellow-600" />
          <p className="text-lg font-bold">{budget.toLocaleString()} DA</p>
          <p className="text-[10px] text-muted-foreground">الميزانية الشهرية</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <Medal className="w-5 h-5 mx-auto mb-1 text-emerald-600" />
          <p className="text-lg font-bold">{pointValue} DA</p>
          <p className="text-[10px] text-muted-foreground">قيمة النقطة</p>
        </CardContent></Card>
      </div>

      {/* Performance Chart */}
      {monthlyData && monthlyData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              تطور الأداء الشهري
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="مكافآت" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="خصومات" fill="hsl(0 84% 60%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Engine Status */}
      <Card className="border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            حالة المحرك الهجين
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">ميزانية المكافآت التلقائية ({autoPct}%)</span>
            <span className="font-medium">{autoBudget.toLocaleString()} DA</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">ميزانية المنافسة ({compPct}%)</span>
            <span className="font-medium">{compBudget.toLocaleString()} DA</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">الاحتياطي ({reservePct}%)</span>
            <span className="font-medium">{reserveFixed.toLocaleString()} DA</span>
          </div>
          {correctionFactor < 1 && (
            <div className="flex justify-between text-destructive">
              <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> معامل التصحيح</span>
              <span className="font-bold">{(correctionFactor * 100).toFixed(1)}%</span>
            </div>
          )}
          {budgetMultiplier < 1 && (
            <div className="flex justify-between text-orange-600">
              <span>الأداء العام ({perfRatio.toFixed(0)}% من الهدف)</span>
              <span className="font-bold">الميزانية مخفضة إلى {(budgetMultiplier * 100).toFixed(0)}%</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 mt-2">
            <span className="text-muted-foreground">الفائض المحسوب</span>
            <span className="font-medium text-green-600">+{totalReserve.toLocaleString()} DA</span>
          </div>
        </CardContent>
      </Card>

      {/* Reserve Fund */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-600" />
            صندوق الفائض المرحّل
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">الرصيد الحالي</span>
            <span className="font-bold text-emerald-600">{fundBalance.toLocaleString()} DA</span>
          </div>
          {currentFund && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">المرحّل من الشهر السابق</span>
                <span>{Number(currentFund.carried_balance).toLocaleString()} DA</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">فائض هذا الشهر</span>
                <span className="text-green-600">+{Number(currentFund.surplus_added).toLocaleString()} DA</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">المستخدم</span>
                <span className="text-red-500">-{Number(currentFund.used_amount).toLocaleString()} DA</span>
              </div>
            </>
          )}
          {fundBalance > 0 && (
            <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => setContestOpen(true)}>
              🏅 إنشاء مسابقة من الصندوق
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Contest Dialog */}
      <RewardContestDialog
        open={contestOpen}
        onOpenChange={setContestOpen}
        fundBalance={fundBalance}
        currentFundId={currentFund?.id}
        workers={workers || []}
      />

      {/* Top Workers */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-600" />
            ترتيب الموظفين
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {rankings.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-4">لا توجد بيانات بعد</p>
          ) : (
            rankings.slice(0, 10).map((w, i) => {
              const level = getLevel(w.points.total);
              const salary = Number(w.salary) || 0;
              const capPct = Number(w.bonus_cap_percentage) || 20;
              const maxBonus = salary > 0 ? salary * (capPct / 100) : Infinity;
              const rawBonus = Math.max(0, w.points.total) * pointValue * correctionFactor;
              let compBonus = 0;
              if (i === 0) compBonus = compBudget * ((config?.top1_bonus_pct || 50) / 100);
              else if (i === 1) compBonus = compBudget * ((config?.top2_bonus_pct || 30) / 100);
              else if (i === 2) compBonus = compBudget * ((config?.top3_bonus_pct || 20) / 100);
              const totalBonus = Math.min(rawBonus + compBonus, maxBonus);
              const progressPct = Math.min(100, (w.points.total / 600) * 100);

              return (
                <div key={w.id} className={`p-3 rounded-lg border ${i === 0 ? 'border-yellow-300 bg-yellow-50/50' : i < 3 ? 'border-primary/20' : ''}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-muted-foreground w-6">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </span>
                      <div>
                        <p className="font-medium text-sm">{w.full_name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span>{level.icon}</span>
                          <span className={`text-[10px] font-medium ${level.color}`}>{level.label}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-sm">{w.points.total} نقطة</p>
                      <p className="text-[10px] text-green-600">{totalBonus.toFixed(0)} DA</p>
                      {compBonus > 0 && <p className="text-[10px] text-yellow-600">+{compBonus.toFixed(0)} تنافسي</p>}
                    </div>
                  </div>
                  <Progress value={progressPct} className="h-1.5" />
                  <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                    <span>+{w.points.rewards} مكافأة</span>
                    <span>-{w.points.penalties} خصم</span>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Button onClick={handleCalculate} variant="outline" className="w-full">
        <BarChart3 className="w-4 h-4 ml-2" />
        احتساب المكافآت الشهرية
      </Button>
    </div>
  );
};

export default RewardDashboardTab;
