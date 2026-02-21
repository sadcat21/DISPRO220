import React from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface ScheduleOverrideAlertProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  scheduleLabel: string;
}

const ScheduleOverrideAlert: React.FC<ScheduleOverrideAlertProps> = ({
  open, onConfirm, onCancel, scheduleLabel,
}) => {
  const { t, dir } = useLanguage();

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-[90vw] sm:max-w-sm p-4" dir={dir}>
        <AlertDialogHeader className="gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <AlertDialogTitle className="text-sm">
              {t('debts.schedule_override_title')}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-xs leading-relaxed">
            {t('debts.schedule_override_msg')}
            <br />
            <strong className="text-foreground">{scheduleLabel}</strong>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row gap-2 sm:gap-2">
          <Button size="sm" variant="default" className="flex-1 h-8 text-xs" onClick={onConfirm}>
            {t('debts.confirm_override')}
          </Button>
          <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={onCancel}>
            {t('debts.keep_schedule')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ScheduleOverrideAlert;
