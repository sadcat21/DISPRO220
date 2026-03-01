import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Trophy, Medal, TrendingUp, Users } from 'lucide-react';
import { useAllWorkersPoints, useRewardSettings } from '@/hooks/useRewards';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const getLevel = (points: number) => {
  if (points >= 600) return { label: 'بطل مبيعات', color: 'text-yellow-600', bg: 'bg-yellow-50', icon: '🏆' };
  if (points >= 300) return { label: 'محترف', color: 'text-purple-600', bg: 'bg-purple-50', icon: '⭐' };
  if (points >= 100) return { label: 'نشيط', color: 'text-blue-600', bg: 'bg-blue-50', icon: '🔥' };
  return { label: 'مبتدئ', color: 'text-muted-foreground', bg: 'bg-muted/30', icon: '🌱' };
};

const RewardDashboardTab: React.FC = () => {
  const { activeBranch } = useAuth();
  const { data: workersPoints, isLoading: pointsLoading } = useAllWorkersPoints();
  const { data: settings } = useRewardSettings();

  const { data: workers } = useQuery({
    queryKey: ['workers-for-rewards', activeBranch?.id],
    queryFn: async () => {
      let query = supabase.from('workers').select('id, full_name, salary, bonus_cap_percentage, role').eq('is_active', true);
      if (activeBranch?.id) query = query.eq('branch_id', activeBranch.id);
      const { data } = await query;
      return data || [];
    },
  });

  if (pointsLoading) return <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>;

  // Calculate rankings
  const rankings = (workers || [])
    .map(w => ({
      ...w,
      points: workersPoints?.[w.id] || { rewards: 0, penalties: 0, total: 0 },
    }))
    .filter(w => w.role === 'worker' || w.points.total > 0)
    .sort((a, b) => b.points.total - a.points.total);

  const totalAllPoints = rankings.reduce((sum, w) => sum + Math.max(0, w.points.total), 0);
  const pointValue = totalAllPoints > 0 && settings?.monthlyBudget ? settings.monthlyBudget / totalAllPoints : 0;

  return (
    <div className="space-y-4 mt-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <Users className="w-6 h-6 mx-auto mb-1 text-primary" />
            <p className="text-lg font-bold">{rankings.length}</p>
            <p className="text-[10px] text-muted-foreground">موظف نشط</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <TrendingUp className="w-6 h-6 mx-auto mb-1 text-green-600" />
            <p className="text-lg font-bold">{totalAllPoints}</p>
            <p className="text-[10px] text-muted-foreground">إجمالي النقاط</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Trophy className="w-6 h-6 mx-auto mb-1 text-yellow-600" />
            <p className="text-lg font-bold">{settings?.monthlyBudget?.toLocaleString() || 0} DA</p>
            <p className="text-[10px] text-muted-foreground">الميزانية الشهرية</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Medal className="w-6 h-6 mx-auto mb-1 text-emerald-600" />
            <p className="text-lg font-bold">{pointValue.toFixed(1)} DA</p>
            <p className="text-[10px] text-muted-foreground">قيمة النقطة</p>
          </CardContent>
        </Card>
      </div>

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
              const rawBonus = Math.max(0, w.points.total) * pointValue;
              const cappedBonus = settings?.absoluteCap && settings.absoluteCap > 0
                ? Math.min(rawBonus, settings.absoluteCap, maxBonus)
                : Math.min(rawBonus, maxBonus);
              const maxPoints = 600;
              const progressPct = Math.min(100, (w.points.total / maxPoints) * 100);

              return (
                <div key={w.id} className={`p-3 rounded-lg border ${i === 0 ? 'border-yellow-300 bg-yellow-50/50' : ''}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-muted-foreground w-6">#{i + 1}</span>
                      <div>
                        <p className="font-medium text-sm">{w.full_name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span>{level.icon}</span>
                          <span className={`text-[10px] font-medium ${level.color}`}>{level.label}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-sm">{w.points.total}</p>
                      <p className="text-[10px] text-green-600">{cappedBonus.toFixed(0)} DA</p>
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
    </div>
  );
};

export default RewardDashboardTab;
