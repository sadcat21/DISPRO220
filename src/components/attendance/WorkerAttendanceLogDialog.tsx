import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { CalendarDays, ChevronRight, ChevronLeft, LogIn, LogOut, Timer, AlertTriangle } from 'lucide-react';
import { format, startOfMonth, endOfMonth, addMonths, eachWeekOfInterval, endOfWeek, isSameDay } from 'date-fns';
import { ar } from 'date-fns/locale';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerId?: string;
  workerName?: string;
}

const DAYS_AR = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

const WorkerAttendanceLogDialog: React.FC<Props> = ({ open, onOpenChange, workerId, workerName }) => {
  const { activeBranch } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  // Fetch work start time and grace period settings
  const { data: attendanceSettings } = useQuery({
    queryKey: ['attendance-time-settings', activeBranch?.id],
    queryFn: async () => {
      const keys = ['work_start_time', 'attendance_grace_period'];
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', keys)
        .eq('branch_id', activeBranch?.id || '');
      
      if (data && data.length > 0) {
        const map: Record<string, string> = {};
        data.forEach(d => { map[d.key] = d.value; });
        if (map['work_start_time']) return map;
      }

      const { data: global } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', keys)
        .is('branch_id', null);
      
      const map: Record<string, string> = {};
      global?.forEach(d => { map[d.key] = d.value; });
      return map;
    },
    enabled: open,
  });

  const workStartTime = attendanceSettings?.['work_start_time'] || '08:00';
  const gracePeriodMinutes = parseInt(attendanceSettings?.['attendance_grace_period'] || '0') || 0;

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['worker-attendance-log', workerId, format(monthStart, 'yyyy-MM')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('worker_id', workerId!)
        .gte('recorded_at', monthStart.toISOString())
        .lte('recorded_at', monthEnd.toISOString())
        .order('recorded_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!workerId,
  });

  // Parse work start time into hours and minutes
  const workStartParts = useMemo(() => {
    const [h, m] = (workStartTime || '08:00').split(':').map(Number);
    return { hours: h || 8, minutes: m || 0 };
  }, [workStartTime]);

  // Calculate lateness in minutes for a clock-in record (minus grace period)
  const getLatenessMinutes = (clockInDate: string) => {
    const d = new Date(clockInDate);
    const clockInMinutes = d.getHours() * 60 + d.getMinutes();
    const startMinutes = workStartParts.hours * 60 + workStartParts.minutes + gracePeriodMinutes;
    return Math.max(0, clockInMinutes - startMinutes);
  };

  // Group logs into weeks (Saturday to Thursday)
  const weeks = useMemo(() => {
    const weekStarts = eachWeekOfInterval(
      { start: monthStart, end: monthEnd },
      { weekStartsOn: 6 }
    );

    return weekStarts.map(weekStart => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 6 });
      const days: Date[] = [];
      for (let i = 0; i < 6; i++) {
        const day = new Date(weekStart);
        day.setDate(day.getDate() + i);
        days.push(day);
      }

      const dayLogs = days.map(day => {
        const dayRecords = logs.filter(l => isSameDay(new Date(l.recorded_at), day));
        const clockIn = dayRecords.find((l: any) => l.action_type === 'clock_in');
        const clockOut = [...dayRecords].reverse().find((l: any) => l.action_type === 'clock_out');
        
        let durationMinutes = 0;
        if (clockIn && clockOut) {
          durationMinutes = Math.round((new Date(clockOut.recorded_at).getTime() - new Date(clockIn.recorded_at).getTime()) / 60000);
        }

        const latenessMinutes = clockIn ? getLatenessMinutes(clockIn.recorded_at) : 0;

        return {
          date: day,
          clockIn,
          clockOut,
          durationMinutes,
          latenessMinutes,
          isInMonth: day.getMonth() === currentMonth.getMonth(),
        };
      });

      return { weekStart, weekEnd, days: dayLogs };
    });
  }, [logs, monthStart, monthEnd, currentMonth, workStartParts]);

  // Monthly totals
  const monthlyStats = useMemo(() => {
    let totalMinutes = 0;
    let daysWorked = 0;
    let totalLateness = 0;
    let lateDays = 0;
    weeks.forEach(week => {
      week.days.forEach(day => {
        if (day.isInMonth && day.clockIn) {
          daysWorked++;
          totalMinutes += day.durationMinutes;
          if (day.latenessMinutes > 0) {
            totalLateness += day.latenessMinutes;
            lateDays++;
          }
        }
      });
    });
    return {
      totalMinutes, daysWorked,
      hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60,
      totalLateness, lateDays,
      lateH: Math.floor(totalLateness / 60), lateM: totalLateness % 60,
    };
  }, [weeks]);

  const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' });

  const getDayName = (date: Date) => {
    const dayIndex = date.getDay();
    const map: Record<number, number> = { 6: 0, 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6 };
    return DAYS_AR[map[dayIndex] ?? 0];
  };

  const formatLateness = (mins: number) => {
    if (mins < 60) return `${mins} د`;
    return `${Math.floor(mins / 60)}سا ${mins % 60}د`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            سجل مداومة {workerName}
          </DialogTitle>
        </DialogHeader>

        {/* Month Navigation */}
        <div className="flex items-center justify-between px-1">
          <Button variant="ghost" size="icon" className="rounded-xl h-8 w-8" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <span className="font-bold text-sm">
            {format(currentMonth, 'MMMM yyyy', { locale: ar })}
          </span>
          <Button variant="ghost" size="icon" className="rounded-xl h-8 w-8" onClick={() => setCurrentMonth(m => addMonths(m, -1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>

        {/* Monthly Stats */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="text-xs">
            <Timer className="w-3 h-3 ml-1" />
            {monthlyStats.hours} سا {monthlyStats.minutes} د
          </Badge>
          <Badge variant="outline" className="text-xs">
            {monthlyStats.daysWorked} يوم عمل
          </Badge>
          {monthlyStats.totalLateness > 0 && (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="w-3 h-3 ml-1" />
              تأخير: {formatLateness(monthlyStats.totalLateness)} ({monthlyStats.lateDays} يوم)
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            بداية العمل: {workStartTime} {gracePeriodMinutes > 0 ? `(هامش ${gracePeriodMinutes} د)` : ''}
          </Badge>
        </div>

        <ScrollArea className="flex-1 -mx-2 px-2">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-4 pb-2">
              {weeks.map((week, wi) => {
                const weekTotalMin = week.days.reduce((s, d) => s + (d.isInMonth ? d.durationMinutes : 0), 0);
                const weekLateness = week.days.reduce((s, d) => s + (d.isInMonth ? d.latenessMinutes : 0), 0);
                const wh = Math.floor(weekTotalMin / 60);
                const wm = weekTotalMin % 60;

                return (
                  <div key={wi} className="space-y-1.5">
                    {/* Week Header */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-muted-foreground">
                        الأسبوع {wi + 1}
                      </span>
                      <div className="flex gap-1.5">
                        {weekLateness > 0 && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                            تأخير {formatLateness(weekLateness)}
                          </Badge>
                        )}
                        {weekTotalMin > 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {wh} سا {wm} د
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Days */}
                    {week.days.map((day, di) => {
                      if (!day.isInMonth) return null;
                      const today = new Date();
                      today.setHours(23, 59, 59, 999);
                      if (day.date > today) return null;
                      const hasData = !!day.clockIn;
                      const durH = Math.floor(day.durationMinutes / 60);
                      const durM = day.durationMinutes % 60;
                      const isLate = day.latenessMinutes > 0;

                      return (
                        <div
                          key={di}
                          className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${
                            hasData
                              ? isLate
                                ? 'bg-destructive/5 border-destructive/20'
                                : 'bg-card border-border'
                              : 'bg-muted/30 border-transparent'
                          }`}
                        >
                          {/* Day name & date */}
                          <div className="w-14 shrink-0">
                            <p className="font-bold text-foreground">{getDayName(day.date)}</p>
                            <p className="text-[10px] text-muted-foreground">{format(day.date, 'd')}</p>
                          </div>

                          {hasData ? (
                            <div className="flex flex-1 items-center gap-2 flex-wrap">
                              {/* Clock in */}
                              <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                <LogIn className="w-3 h-3" />
                                <span>{formatTime(day.clockIn!.recorded_at)}</span>
                              </div>

                              {/* Clock out */}
                              {day.clockOut ? (
                                <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                                  <LogOut className="w-3 h-3" />
                                  <span>{formatTime(day.clockOut.recorded_at)}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}

                              {/* Duration */}
                              {day.durationMinutes > 0 && (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Timer className="w-3 h-3" />
                                  <span>{durH}:{String(durM).padStart(2, '0')}</span>
                                </div>
                              )}

                              {/* Lateness */}
                              {isLate && (
                                <div className="flex items-center gap-1 text-destructive mr-auto">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>{formatLateness(day.latenessMinutes)}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">غائب</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default WorkerAttendanceLogDialog;
