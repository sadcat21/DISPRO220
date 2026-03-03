import React, { useState, useMemo } from 'react';
import { useAllAttendance } from '@/hooks/useAttendance';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Clock, MapPin, ChevronRight, ChevronLeft, LogIn, LogOut, Users, ListChecks, Timer, Settings2, UserCog } from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import AttendanceSettingsDialog from '@/components/attendance/AttendanceSettingsDialog';
import WorkerAttendanceLocationDialog from '@/components/attendance/WorkerAttendanceLocationDialog';

const Attendance: React.FC = () => {
  const { activeBranch } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [workerLocationOpen, setWorkerLocationOpen] = useState(false);
  const { data: logs = [], isLoading } = useAllAttendance(selectedDate, activeBranch?.id);

  const workerGroups = useMemo(() => {
    const groups: Record<string, { worker: any; logs: any[] }> = {};
    logs.forEach((log: any) => {
      const wid = log.worker_id;
      if (!groups[wid]) {
        groups[wid] = { worker: log.worker, logs: [] };
      }
      groups[wid].logs.push(log);
    });
    return Object.values(groups);
  }, [logs]);

  const changeDate = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(format(d, 'yyyy-MM-dd'));
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const displayDate = format(new Date(selectedDate), 'EEEE d MMMM yyyy', { locale: ar });

  const getDuration = (clockIn: any, clockOut: any) => {
    const diff = new Date(clockOut.recorded_at).getTime() - new Date(clockIn.recorded_at).getTime();
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    return { hours, minutes };
  };

  return (
    <div className="p-4 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
            <CalendarDays className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">سجل المداومة</h1>
            <p className="text-xs text-muted-foreground">متابعة حضور وانصراف العمال</p>
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => setWorkerLocationOpen(true)} title="تخصيص موقع مداومة لعامل">
            <UserCog className="w-5 h-5 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => setSettingsOpen(true)}>
            <Settings2 className="w-5 h-5 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {/* Date Navigation */}
      <Card className="border-0 shadow-md bg-gradient-to-br from-card to-muted/30">
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9 hover:bg-primary/10" onClick={() => changeDate(1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <div className="flex-1 text-center space-y-1">
              <Input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="text-center border-0 bg-transparent font-medium text-sm h-8"
              />
              <p className="text-xs text-muted-foreground font-medium">{displayDate}</p>
            </div>
            <Button variant="ghost" size="icon" className="rounded-xl h-9 w-9 hover:bg-primary/10" onClick={() => changeDate(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-0 shadow-md bg-gradient-to-br from-blue-500 to-blue-600 text-white overflow-hidden relative">
          <div className="absolute -top-4 -left-4 w-16 h-16 bg-white/10 rounded-full" />
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{workerGroups.length}</p>
              <p className="text-[11px] opacity-80">عدد العمال</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md bg-gradient-to-br from-violet-500 to-purple-600 text-white overflow-hidden relative">
          <div className="absolute -top-4 -left-4 w-16 h-16 bg-white/10 rounded-full" />
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <ListChecks className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{logs.length}</p>
              <p className="text-[11px] opacity-80">إجمالي السجلات</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center py-12 gap-3">
          <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">جاري التحميل...</p>
        </div>
      ) : workerGroups.length === 0 ? (
        <Card className="border-0 shadow-md">
          <CardContent className="flex flex-col items-center py-14 gap-3">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center">
              <CalendarDays className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground font-medium">لا توجد سجلات مداومة لهذا اليوم</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {workerGroups.map((group) => {
            const clockIn = group.logs.find((l: any) => l.action_type === 'clock_in');
            const clockOut = group.logs.filter((l: any) => l.action_type === 'clock_out').pop();
            const duration = clockIn && clockOut ? getDuration(clockIn, clockOut) : null;

            return (
              <div key={group.worker?.id || group.logs[0].worker_id} className="space-y-2">
                {/* Worker Header */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                      <span className="text-sm font-bold text-primary">
                        {(group.worker?.full_name || '?')[0]}
                      </span>
                    </div>
                    <div>
                      <p className="font-bold text-sm text-foreground">
                        {group.worker?.full_name || 'عامل غير معروف'}
                      </p>
                      {duration && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Timer className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[11px] text-muted-foreground">
                            {duration.hours} سا {duration.minutes} د
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-[10px] rounded-lg px-2 py-0.5">
                    {group.logs.length} سجل
                  </Badge>
                </div>

                {/* Clock-in / Clock-out cards side by side */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Clock In Card */}
                  <Card className={`border-0 shadow-sm overflow-hidden ${clockIn ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-muted/30'}`}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">بداية العمل</span>
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                          <LogIn className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                      </div>
                      {clockIn ? (
                        <>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span className="text-sm font-bold text-foreground">{formatTime(clockIn.recorded_at)}</span>
                          </div>
                          {clockIn.distance_meters != null && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-muted-foreground" />
                              <span className="text-[11px] text-muted-foreground">{Math.round(clockIn.distance_meters)} م</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">لم يسجل بعد</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Clock Out Card */}
                  <Card className={`border-0 shadow-sm overflow-hidden ${clockOut ? 'bg-red-50 dark:bg-red-500/10' : 'bg-muted/30'}`}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-red-700 dark:text-red-400">نهاية العمل</span>
                        <div className="w-7 h-7 rounded-lg bg-red-500/15 flex items-center justify-center">
                          <LogOut className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                        </div>
                      </div>
                      {clockOut ? (
                        <>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span className="text-sm font-bold text-foreground">{formatTime(clockOut.recorded_at)}</span>
                          </div>
                          {clockOut.distance_meters != null && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-muted-foreground" />
                              <span className="text-[11px] text-muted-foreground">{Math.round(clockOut.distance_meters)} م</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground">لم يسجل بعد</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AttendanceSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <WorkerAttendanceLocationDialog open={workerLocationOpen} onOpenChange={setWorkerLocationOpen} />
    </div>
  );
};

export default Attendance;
