import React, { useState, useMemo } from 'react';
import { useAllAttendance } from '@/hooks/useAttendance';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CalendarDays, Clock, MapPin, ChevronRight, ChevronLeft, LogIn, LogOut } from 'lucide-react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

const Attendance: React.FC = () => {
  const { activeBranch } = useAuth();
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const { data: logs = [], isLoading } = useAllAttendance(selectedDate, activeBranch?.id);

  // Group by worker
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

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <h1 className="text-xl font-bold">سجل المداومة</h1>

      {/* Date picker */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => changeDate(1)}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        <div className="flex-1 text-center">
          <Input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="text-center"
          />
          <p className="text-xs text-muted-foreground mt-1">{displayDate}</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => changeDate(-1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{workerGroups.length}</p>
            <p className="text-xs text-muted-foreground">عدد العمال</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{logs.length}</p>
            <p className="text-xs text-muted-foreground">إجمالي السجلات</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
      ) : workerGroups.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p>لا توجد سجلات مداومة لهذا اليوم</p>
        </div>
      ) : (
        <div className="space-y-3">
          {workerGroups.map((group) => {
            const clockIn = group.logs.find((l: any) => l.action_type === 'clock_in');
            const clockOut = group.logs.filter((l: any) => l.action_type === 'clock_out').pop();

            return (
              <Card key={group.worker?.id || group.logs[0].worker_id}>
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-sm font-bold">
                    {group.worker?.full_name || 'عامل غير معروف'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-2">
                  {group.logs.map((log: any) => (
                    <div
                      key={log.id}
                      className={`flex items-center gap-3 p-2 rounded-lg text-sm ${
                        log.action_type === 'clock_in'
                          ? 'bg-emerald-500/10'
                          : 'bg-destructive/10'
                      }`}
                    >
                      {log.action_type === 'clock_in' ? (
                        <LogIn className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <LogOut className="w-4 h-4 text-destructive shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">
                          {log.action_type === 'clock_in' ? 'بداية العمل' : 'نهاية العمل'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                        <Clock className="w-3 h-3" />
                        {formatTime(log.recorded_at)}
                      </div>
                      {log.distance_meters != null && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                          <MapPin className="w-3 h-3" />
                          {Math.round(log.distance_meters)}م
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Duration if both clock in and out exist */}
                  {clockIn && clockOut && (
                    <div className="text-xs text-muted-foreground text-center pt-1 border-t">
                      مدة العمل: {(() => {
                        const diff = new Date(clockOut.recorded_at).getTime() - new Date(clockIn.recorded_at).getTime();
                        const hours = Math.floor(diff / 3600000);
                        const minutes = Math.floor((diff % 3600000) / 60000);
                        return `${hours} ساعة ${minutes} دقيقة`;
                      })()}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Attendance;
