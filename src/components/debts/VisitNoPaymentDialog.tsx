import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Eye, AlertTriangle, MapPin, Phone } from 'lucide-react';
import QuickDayPicker, { DAY_NAMES } from './QuickDayPicker';
import ScheduleOverrideAlert from './ScheduleOverrideAlert';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useUpdateDebtPayment } from '@/hooks/useCustomerDebts';
import { useLocationCheck } from '@/hooks/useLocationCheck';
import { toast } from 'sonner';

interface VisitNoPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debtId: string;
  customerName: string;
  collectionType?: string | null;
  collectionDays?: string[] | null;
  customerLatitude?: number | null;
  customerLongitude?: number | null;
}

const VisitNoPaymentDialog: React.FC<VisitNoPaymentDialogProps> = ({
  open, onOpenChange, debtId, customerName,
  collectionType, collectionDays,
  customerLatitude, customerLongitude,
}) => {
  const { t, dir } = useLanguage();
  const { workerId } = useAuth();
  const updatePayment = useUpdateDebtPayment();
  const { checkLocation, isChecking } = useLocationCheck({ customerLatitude, customerLongitude });
  const [nextDueDate, setNextDueDate] = useState('');
  const [nextDueTime, setNextDueTime] = useState('');
  const [visitType, setVisitType] = useState<'in_person' | 'phone'>('in_person');
  const [notes, setNotes] = useState('');
  const [showScheduleWarning, setShowScheduleWarning] = useState(false);
  const [scheduleOverrideConfirmed, setScheduleOverrideConfirmed] = useState(false);

  const hasSchedule = collectionType === 'daily' || collectionType === 'weekly';

  useEffect(() => {
    if (open) {
      setShowScheduleWarning(false);
      setScheduleOverrideConfirmed(false);
      setNextDueDate('');
      setNextDueTime('');
      setVisitType('in_person');
      setNotes('');
    }
  }, [open]);

  useEffect(() => {
    if (nextDueDate && hasSchedule && !scheduleOverrideConfirmed) {
      setShowScheduleWarning(true);
    } else {
      setShowScheduleWarning(false);
    }
  }, [nextDueDate, hasSchedule, scheduleOverrideConfirmed]);

  const scheduleLabel = collectionType === 'daily'
    ? t('debts.schedule_type_daily')
    : collectionType === 'weekly' && collectionDays?.length
      ? `${t('debts.schedule_type_weekly')} (${collectionDays.map(d => DAY_NAMES[d]?.ar || d).join('، ')})`
      : '';

  const handleConfirmOverride = () => {
    setScheduleOverrideConfirmed(true);
    setShowScheduleWarning(false);
  };

  const handleCancelOverride = () => {
    setNextDueDate('');
    setNextDueTime('');
    setShowScheduleWarning(false);
  };

  const handleSubmit = async () => {
    if (!nextDueDate) {
      toast.error('يجب تحديد موعد التحصيل القادم');
      return;
    }
    if (!workerId) return;

    const allowed = await checkLocation();
    if (!allowed) return;

    const dueDateValue = nextDueTime 
      ? `${nextDueDate}T${nextDueTime}` 
      : nextDueDate;

    try {
      const visitLabel = visitType === 'phone' ? '📞 اتصال هاتفي' : '🏪 زيارة ميدانية';
      await updatePayment.mutateAsync({
        debtId,
        amount: 0,
        workerId,
        paymentMethod: 'visit',
        notes: `[${visitLabel}] ${notes || 'بدون تحصيل'}`,
        nextDueDate: dueDateValue,
      });
      toast.success(t('debts.visit_recorded'));
      setNextDueDate('');
      setNextDueTime('');
      setNotes('');
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-sm p-4 gap-3" dir={dir}>
        <DialogHeader className="pb-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Eye className="w-4 h-4 shrink-0" />
            <span className="truncate">{t('debts.visit_no_payment')} - {customerName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2.5">
          {hasSchedule && (
            <div className="bg-primary/10 border border-primary/30 rounded-md px-2 py-1.5 flex items-center gap-1.5 text-[11px]">
              <AlertTriangle className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="leading-tight">{t('debts.schedule_override_title')}: <strong>{scheduleLabel}</strong></span>
            </div>
          )}

          {/* Visit type selector */}
          <div className="space-y-1">
            <Label className="text-xs">{t('debts.visit_type')}</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVisitType('in_person')}
                className={`flex items-center justify-center gap-1.5 h-9 rounded-md border text-xs font-medium transition-colors ${
                  visitType === 'in_person'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted border-input'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />{t('debts.visit_in_person')}
              </button>
              <button
                type="button"
                onClick={() => setVisitType('phone')}
                className={`flex items-center justify-center gap-1.5 h-9 rounded-md border text-xs font-medium transition-colors ${
                  visitType === 'phone'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted border-input'
                }`}
              >
                <Phone className="w-3.5 h-3.5" />{t('debts.visit_phone')}
              </button>
            </div>
          </div>

          {/* Quick day picker */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-destructive">{t('debts.quick_day_pick')} *</Label>
            <QuickDayPicker onSelectDate={setNextDueDate} selectedDate={nextDueDate} />
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t('debts.next_due_date')} *</Label>
              <Input
                type="date"
                value={nextDueDate}
                onChange={e => setNextDueDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="h-9 text-sm"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('debts.next_due_time')}</Label>
              <Input
                type="time"
                value={nextDueTime}
                onChange={e => setNextDueTime(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <ScheduleOverrideAlert
            open={showScheduleWarning}
            onConfirm={handleConfirmOverride}
            onCancel={handleCancelOverride}
            scheduleLabel={scheduleLabel}
          />

          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={1}
            placeholder={t('common.notes') + '...'}
            className="text-sm min-h-[36px] resize-none"
          />

          <Button
            className="w-full h-9"
            onClick={handleSubmit}
            disabled={updatePayment.isPending || isChecking || !nextDueDate || showScheduleWarning}
          >
            {(updatePayment.isPending || isChecking) && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
            {t('debts.record_visit')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VisitNoPaymentDialog;
