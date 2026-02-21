import React from 'react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { addDays, nextDay, format } from 'date-fns';

interface QuickDayPickerProps {
  onSelectDate: (date: string) => void;
  selectedDate?: string;
  multiSelect?: boolean;
  selectedDays?: string[];
  onSelectDays?: (days: string[]) => void;
}

const DAY_NAMES: Record<string, { ar: string; fr: string; en: string; dayIndex: 0|1|2|3|4|5|6 }> = {
  sunday: { ar: 'الأحد', fr: 'Dim', en: 'Sun', dayIndex: 0 },
  monday: { ar: 'الإثنين', fr: 'Lun', en: 'Mon', dayIndex: 1 },
  tuesday: { ar: 'الثلاثاء', fr: 'Mar', en: 'Tue', dayIndex: 2 },
  wednesday: { ar: 'الأربعاء', fr: 'Mer', en: 'Wed', dayIndex: 3 },
  thursday: { ar: 'الخميس', fr: 'Jeu', en: 'Thu', dayIndex: 4 },
  friday: { ar: 'الجمعة', fr: 'Ven', en: 'Fri', dayIndex: 5 },
  saturday: { ar: 'السبت', fr: 'Sam', en: 'Sat', dayIndex: 6 },
};

const QuickDayPicker: React.FC<QuickDayPickerProps> = ({ 
  onSelectDate, selectedDate, multiSelect, selectedDays = [], onSelectDays 
}) => {
  const { t } = useLanguage();

  const today = new Date();
  const todayDayIndex = today.getDay();
  const todayKey = Object.entries(DAY_NAMES).find(([, v]) => v.dayIndex === todayDayIndex)?.[0] || '';
  const todayName = DAY_NAMES[todayKey]?.ar || '';

  const dayButtons = Object.entries(DAY_NAMES).map(([key, val]) => {
    let targetDate: Date;
    if (val.dayIndex === todayDayIndex) {
      targetDate = addDays(today, 7);
    } else {
      targetDate = nextDay(today, val.dayIndex);
    }
    const dateStr = format(targetDate, 'yyyy-MM-dd');
    const dayLabel = format(targetDate, 'dd/MM');
    return { key, label: val.ar, dayIndex: val.dayIndex, dateStr, dayLabel, names: val };
  });

  const sortedDays = [...dayButtons].sort((a, b) => {
    const aOffset = (a.dayIndex - todayDayIndex + 7) % 7 || 7;
    const bOffset = (b.dayIndex - todayDayIndex + 7) % 7 || 7;
    return aOffset - bOffset;
  });

  const tomorrow = addDays(today, 1);
  const tomorrowStr = format(tomorrow, 'yyyy-MM-dd');
  const todayStr = format(today, 'yyyy-MM-dd');

  const handleDayClick = (day: typeof dayButtons[0]) => {
    if (multiSelect && onSelectDays) {
      const isSelected = selectedDays.includes(day.key);
      if (isSelected) {
        onSelectDays(selectedDays.filter(d => d !== day.key));
      } else {
        onSelectDays([...selectedDays, day.key]);
      }
    } else {
      onSelectDate(day.dateStr);
    }
  };

  const isDaySelected = (day: typeof dayButtons[0]) => {
    if (multiSelect) {
      return selectedDays.includes(day.key);
    }
    return selectedDate === day.dateStr;
  };

  return (
    <div className="space-y-2">
      {/* Show current day */}
      <p className="text-xs text-muted-foreground text-center">
        {t('debts.today')}: <span className="font-semibold text-foreground">{todayName}</span>
        {' '}<span className="text-muted-foreground">({format(today, 'dd/MM/yyyy')})</span>
      </p>

      {!multiSelect && (
        <div className="flex gap-1.5 flex-wrap">
          <Button
            type="button"
            size="sm"
            variant={selectedDate === todayStr ? 'default' : 'outline'}
            className="text-xs px-2 py-1 h-auto"
            onClick={() => onSelectDate(todayStr)}
          >
            {t('debts.today')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={selectedDate === tomorrowStr ? 'default' : 'outline'}
            className="text-xs px-2 py-1 h-auto"
            onClick={() => onSelectDate(tomorrowStr)}
          >
            {t('debts.tomorrow')}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-4 gap-1.5">
        {sortedDays.map(day => (
          <Button
            key={day.key}
            type="button"
            size="sm"
            variant={isDaySelected(day) ? 'default' : 'outline'}
            className="text-xs px-1 py-1 h-auto flex flex-col gap-0"
            onClick={() => handleDayClick(day)}
          >
            <span>{day.names.ar}</span>
            {!multiSelect && (
              <span className="text-[10px] text-muted-foreground">{day.dayLabel}</span>
            )}
          </Button>
        ))}
      </div>
    </div>
  );
};

export { DAY_NAMES };
export default QuickDayPicker;
