import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ar, fr, enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

export type DateFilterType = 'today' | 'yesterday' | 'current_week' | 'current' | 'last' | 'custom' | 'all';

interface DateRangeFilterProps {
  selectedPeriod: DateFilterType;
  setSelectedPeriod: (value: DateFilterType) => void;
  customDateFrom?: Date;
  setCustomDateFrom?: (date: Date | undefined) => void;
  customDateTo?: Date;
  setCustomDateTo?: (date: Date | undefined) => void;
}

// Helper to get Saturday-based week start
const getCurrentWeekStart = (date: Date): Date => {
  const day = date.getDay();
  // In Algeria, week starts on Saturday (day 6)
  // If today is Saturday (6), start is today
  // If today is Sunday (0), start is yesterday
  // If today is Monday (1), start is 2 days ago
  // etc.
  const daysFromSaturday = day === 6 ? 0 : day + 1;
  const saturday = new Date(date);
  saturday.setDate(date.getDate() - daysFromSaturday);
  return startOfDay(saturday);
};

export const getDateRangeFromFilter = (
  selectedPeriod: DateFilterType,
  customDateFrom?: Date,
  customDateTo?: Date
): { start: Date; end: Date } => {
  const now = new Date();
  
  switch (selectedPeriod) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'yesterday':
      const yesterday = subDays(now, 1);
      return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
    case 'current_week':
      return { start: getCurrentWeekStart(now), end: endOfDay(now) };
    case 'current':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'last':
      const lastMonth = subMonths(now, 1);
      return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
    case 'custom':
      return {
        start: customDateFrom ? startOfDay(customDateFrom) : new Date(0),
        end: customDateTo ? endOfDay(customDateTo) : endOfDay(now),
      };
    case 'all':
    default:
      return { start: new Date(0), end: endOfDay(now) };
  }
};

const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  selectedPeriod,
  setSelectedPeriod,
  customDateFrom,
  setCustomDateFrom,
  customDateTo,
  setCustomDateTo,
}) => {
  const { t, language } = useLanguage();
  
  const getLocale = () => {
    switch (language) {
      case 'ar': return ar;
      case 'fr': return fr;
      default: return enUS;
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Select value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as DateFilterType)}>
        <SelectTrigger className="w-full">
          <CalendarIcon className="w-4 h-4 ml-2" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-popover z-50">
          <SelectItem value="today">{t('date.today')}</SelectItem>
          <SelectItem value="yesterday">{t('date.yesterday')}</SelectItem>
          <SelectItem value="current_week">{t('date.this_week')}</SelectItem>
          <SelectItem value="current">{t('date.this_month')}</SelectItem>
          <SelectItem value="last">{t('date.last_month')}</SelectItem>
          <SelectItem value="custom">{t('date.custom')}</SelectItem>
          <SelectItem value="all">{t('date.all')}</SelectItem>
        </SelectContent>
      </Select>

      {selectedPeriod === 'custom' && setCustomDateFrom && setCustomDateTo && (
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "flex-1 justify-start text-right font-normal",
                  !customDateFrom && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="ml-2 h-4 w-4" />
                {customDateFrom ? format(customDateFrom, 'dd/MM/yyyy', { locale: getLocale() }) : t('date.from')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-popover" align="start">
              <Calendar
                mode="single"
                selected={customDateFrom}
                onSelect={setCustomDateFrom}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "flex-1 justify-start text-right font-normal",
                  !customDateTo && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="ml-2 h-4 w-4" />
                {customDateTo ? format(customDateTo, 'dd/MM/yyyy', { locale: getLocale() }) : t('date.to')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-popover" align="start">
              <Calendar
                mode="single"
                selected={customDateTo}
                onSelect={setCustomDateTo}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
};

export default DateRangeFilter;
