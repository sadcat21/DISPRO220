import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Eye, MapPin, Phone } from 'lucide-react';
import QuickDayPicker from '@/components/debts/QuickDayPicker';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateDocCollection } from '@/hooks/useDocumentCollections';
import { useLocationCheck } from '@/hooks/useLocationCheck';
import { toast } from 'sonner';

interface DocVisitNoCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  customerName: string;
  documentType: string;
  customerLatitude?: number | null;
  customerLongitude?: number | null;
}

const DocVisitNoCollectionDialog: React.FC<DocVisitNoCollectionDialogProps> = ({
  open, onOpenChange, orderId, customerName, documentType,
  customerLatitude, customerLongitude,
}) => {
  const { workerId } = useAuth();
  const createCollection = useCreateDocCollection();
  const { checkLocation, isChecking } = useLocationCheck({ customerLatitude, customerLongitude });
  const [nextDueDate, setNextDueDate] = useState('');
  const [nextDueTime, setNextDueTime] = useState('');
  const [visitType, setVisitType] = useState<'in_person' | 'phone'>('in_person');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) {
      setNextDueDate('');
      setNextDueTime('');
      setVisitType('in_person');
      setNotes('');
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!nextDueDate) {
      toast.error('يجب تحديد موعد التحصيل القادم');
      return;
    }
    if (!workerId) return;

    const allowed = await checkLocation();
    if (!allowed) return;

    const dueDateValue = nextDueTime ? `${nextDueDate}T${nextDueTime}` : nextDueDate;

    try {
      const visitLabel = visitType === 'phone' ? '📞 اتصال هاتفي' : '🏪 زيارة ميدانية';
      await createCollection.mutateAsync({
        orderId,
        workerId,
        action: 'no_collection',
        nextDueDate: dueDateValue,
        notes: `[${visitLabel}] ${notes || 'بدون تحصيل مستند'}`,
      });
      toast.success('تم تسجيل الزيارة بنجاح');
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-sm p-4 gap-3" dir="rtl">
        <DialogHeader className="pb-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Eye className="w-4 h-4 shrink-0" />
            <span className="truncate">زيارة بدون تحصيل - {customerName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2.5">
          {/* Visit type selector */}
          <div className="space-y-1">
            <Label className="text-xs">نوع الزيارة</Label>
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
                <MapPin className="w-3.5 h-3.5" />زيارة ميدانية
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
                <Phone className="w-3.5 h-3.5" />اتصال هاتفي
              </button>
            </div>
          </div>

          {/* Quick day picker */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-destructive">موعد التحصيل القادم *</Label>
            <QuickDayPicker onSelectDate={setNextDueDate} selectedDate={nextDueDate} />
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">التاريخ *</Label>
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
              <Label className="text-xs">الوقت</Label>
              <Input
                type="time"
                value={nextDueTime}
                onChange={e => setNextDueTime(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={1}
            placeholder="ملاحظات..."
            className="text-sm min-h-[36px] resize-none"
          />

          <Button
            className="w-full h-9"
            onClick={handleSubmit}
            disabled={createCollection.isPending || isChecking || !nextDueDate}
          >
            {(createCollection.isPending || isChecking) && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
            تسجيل الزيارة
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocVisitNoCollectionDialog;
