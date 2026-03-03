import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CalendarDays, Clock, ChevronRight, ChevronLeft, LogIn, LogOut, Timer, MapPin } from 'lucide-react';
import { format, startOfMonth, endOfMonth, addMonths, eachWeekOfInterval, endOfWeek, startOfWeek, isWithinInterval, isSameDay } from 'date-fns';
import { ar } from 'date-fns/locale';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workerId?: string;
  workerName?: string;
}

const DAYS_AR = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];

const WorkerAttendanceLogDialog: React.FC<Props> = ({ open, onOpenChange, workerId, workerName }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

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

  // Group logs into weeks (Saturday to Thursday)
  const weeks = useMemo(() => {
    // Get weeks starting from Saturday (weekStartsOn: 6)
    const weekStarts = eachWeekOfInterval(
      { start: monthStart, end: monthEnd },
      { weekStartsOn: 6 }
    );

    return weekStarts.map(weekStart => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 6 });
      // Only show Saturday to Thursday (6 days)
      const days: Date[] = [];
      for (let i = 0; i < 6; i++) {
        const day = new Date(weekStart);
        day.setDate(day.getDate() + i);
        days.push(day);
      }

      const dayLogs = days.map(day => {
        const dayRecords = logs.filter(l => {
          const logDate = new Date(l.recorded_at);
          return isSameDay(logDate, day);
        });
        const clockIn = dayRecords.find((l: any) => l.action_type === 'clock_in');
        const clockOut = [...dayRecords].reverse().find((l: any) => l.action_type === 'clock_out');
        
        let durationMinutes = 0;
        if (clockIn && clockOut) {
          durationMinutes = Math.round((new Date(clockOut.recorded_at).getTime() - new Date(clockIn.recorded_at).getTime()) / 60000);
        }

        return {
          date: day,
          clockIn,
          clockOut,
          durationMinutes,
          isInMonth: day.getMonth() === currentMonth.getMonth(),
        };
      });

      return { weekStart, weekEnd, days: dayLogs };
    });
  }, [logs, monthStart, monthEnd, currentMonth]);

  // Monthly totals
  const monthlyStats = useMemo(() => {
    let totalMinutes = 0;
    let daysWorked = 0;
    weeks.forEach(week => {
      week.days.forEach(day => {
        if (day.isInMonth && day.durationMinutes > 0) {
          totalMinutes += day.durationMinutes;
          daysWorked++;
        }
      });
    });
    return { totalMinutes, daysWorked, hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
  }, [weeks]);

  const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' });

  const getDayName = (date: Date) => {
    const dayIndex = date.getDay();
    // Map JS day (0=Sun) to our array
    const map: Record<number, number> = { 6: 0, 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6 };
    return DAYS_AR[map[dayIndex] ?? 0];
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
        <div className="flex gap-2">
          <Badge variant="secondary" className="text-xs">
            <Timer className="w-3 h-3 ml-1" />
            {monthlyStats.hours} سا {monthlyStats.minutes} د
          </Badge>
          <Badge variant="outline" className="text-xs">
            {monthlyStats.daysWorked} يوم عمل
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
                const wh = Math.floor(weekTotalMin / 60);
                const wm = weekTotalMin % 60;

                return (
                  <div key={wi} className="space-y-1.5">
                    {/* Week Header */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-muted-foreground">
                        الأسبوع {wi + 1}
                      </span>
                      {weekTotalMin > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {wh} سا {wm} د
                        </Badge>
                      )}
                    </div>

                    {/* Days */}
                    {week.days.map((day, di) => {
                      if (!day.isInMonth) return null;
                      // Hide future days
                      const today = new Date();
                      today.setHours(23, 59, 59, 999);
                      if (day.date > today) return null;
                      const hasData = !!day.clockIn;
                      const durH = Math.floor(day.durationMinutes / 60);
                      const durM = day.durationMinutes % 60;

                      return (
                        <div
                          key={di}
                          className={`flex items-center gap-2 p-2 rounded-lg border text-xs ${
                            hasData ? 'bg-card border-border' : 'bg-muted/30 border-transparent'
                          }`}
                        >
                          {/* Day name & date */}
                          <div className="w-16 shrink-0">
                            <p className="font-bold text-foreground">{getDayName(day.date)}</p>
                            <p className="text-[10px] text-muted-foreground">{format(day.date, 'd')}</p>
                          </div>

                          {hasData ? (
                            <>
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
                                <div className="flex items-center gap-1 text-muted-foreground mr-auto">
                                  <Timer className="w-3 h-3" />
                                  <span>{durH}:{String(durM).padStart(2, '0')}</span>
                                </div>
                              )}
                            </>
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
