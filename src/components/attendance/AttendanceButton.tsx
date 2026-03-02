import React from 'react';
import { useAttendance } from '@/hooks/useAttendance';
import { LogIn, LogOut, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const AttendanceButton: React.FC = () => {
  const { isClockedIn, isChecking, toggleAttendance, lastAction } = useAttendance();

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <button
      onClick={toggleAttendance}
      disabled={isChecking}
      className={cn(
        'flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition-all active:scale-95',
        isClockedIn
          ? 'bg-destructive/20 text-destructive hover:bg-destructive/30'
          : 'bg-emerald-500/20 text-emerald-600 hover:bg-emerald-500/30'
      )}
      title={isClockedIn ? 'نهاية العمل' : 'بداية العمل'}
    >
      {isChecking ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isClockedIn ? (
        <LogOut className="w-4 h-4" />
      ) : (
        <LogIn className="w-4 h-4" />
      )}
      <span className="hidden min-[400px]:inline">
        {isClockedIn ? 'خروج' : 'دخول'}
      </span>
      {lastAction && (
        <span className="text-[10px] opacity-70">
          {formatTime(lastAction.recorded_at)}
        </span>
      )}
    </button>
  );
};

export default AttendanceButton;
