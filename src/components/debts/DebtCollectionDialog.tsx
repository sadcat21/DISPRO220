import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Ban, Banknote, HandCoins } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCreateCollection, DueDebt } from '@/hooks/useDebtCollections';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface DebtCollectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debt: DueDebt;
}

const DebtCollectionDialog: React.FC<DebtCollectionDialogProps> = ({ open, onOpenChange, debt }) => {
  const { t, dir } = useLanguage();
  const { user } = useAuth();
  const createCollection = useCreateCollection();

  const [action, setAction] = useState<'no_payment' | 'partial_payment' | 'full_payment' | null>(null);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [nextDueDate, setNextDueDate] = useState('');
  const [notes, setNotes] = useState('');

  const remaining = Number(debt.remaining_amount);

  const handleSubmit = async () => {
    if (!action) return;

    if (action === 'partial_payment') {
      const numAmount = Number(amount);
      if (!numAmount || numAmount <= 0 || numAmount >= remaining) {
        toast.error('أدخل مبلغ صحيح أقل من المتبقي');
        return;
      }
      if (!nextDueDate) {
        toast.error('اختر تاريخ الاستحقاق التالي');
        return;
      }
    }

    if ((action === 'full_payment' || action === 'partial_payment') && !paymentMethod) {
      toast.error('اختر طريقة الدفع');
      return;
    }

    if (action === 'no_payment' && !nextDueDate) {
      toast.error('اختر تاريخ الاستحقاق التالي');
      return;
    }

    try {
      await createCollection.mutateAsync({
        debtId: debt.id,
        workerId: user!.id,
        action,
        amountCollected: action === 'full_payment' ? remaining : action === 'partial_payment' ? Number(amount) : 0,
        paymentMethod: action !== 'no_payment' ? paymentMethod : undefined,
        nextDueDate: nextDueDate || undefined,
        notes: notes || undefined,
      });

      toast.success('تم تسجيل الاستحقاق بنجاح، في انتظار الموافقة');
      resetForm();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const resetForm = () => {
    setAction(null);
    setAmount('');
    setPaymentMethod('cash');
    setNextDueDate('');
    setNotes('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" dir={dir}>
        <DialogHeader>
          <DialogTitle className="text-base">استحقاق دين - {debt.customer?.store_name || debt.customer?.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Debt Info */}
          <div className="bg-muted/50 rounded-lg p-3 text-center space-y-1">
            <p className="text-sm text-muted-foreground">المبلغ المتبقي</p>
            <p className="text-2xl font-bold text-destructive">{remaining.toLocaleString()} DA</p>
            <p className="text-xs text-muted-foreground">
              تاريخ الاستحقاق: {debt.due_date ? format(new Date(debt.due_date + 'T00:00:00'), 'dd/MM/yyyy') : '—'}
            </p>
          </div>

          {/* Action Buttons */}
          {!action && (
            <div className="space-y-2">
              <Button
                variant="default"
                className="w-full justify-start gap-2"
                onClick={() => setAction('full_payment')}
              >
                <Banknote className="w-4 h-4" />
                دفع كامل ({remaining.toLocaleString()} DA)
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => setAction('partial_payment')}
              >
                <HandCoins className="w-4 h-4" />
                استحقاق جزئي
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 text-muted-foreground"
                onClick={() => setAction('no_payment')}
              >
                <Ban className="w-4 h-4" />
                بدون دفع
              </Button>
            </div>
          )}

          {/* Action Form */}
          {action && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setAction(null)}>← رجوع</Button>
                <span className="text-sm font-medium">
                  {action === 'full_payment' && 'دفع كامل'}
                  {action === 'partial_payment' && 'استحقاق جزئي'}
                  {action === 'no_payment' && 'بدون دفع'}
                </span>
              </div>

              {action === 'partial_payment' && (
                <div className="space-y-2">
                  <Label>المبلغ المدفوع</Label>
                  <Input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0"
                    max={remaining - 1}
                  />
                </div>
              )}

              {(action === 'full_payment' || action === 'partial_payment') && (
                <div className="space-y-2">
                  <Label>طريقة الدفع</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">{t('debts.method_cash')}</SelectItem>
                      <SelectItem value="check">{t('debts.method_check')}</SelectItem>
                      <SelectItem value="transfer">{t('debts.method_transfer')}</SelectItem>
                      <SelectItem value="receipt">{t('debts.method_receipt')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(action === 'partial_payment' || action === 'no_payment') && (
                <div className="space-y-2">
                  <Label>تاريخ الاستحقاق التالي</Label>
                  <Input
                    type="date"
                    value={nextDueDate}
                    onChange={e => setNextDueDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>ملاحظات</Label>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="ملاحظات اختيارية..."
                />
              </div>

              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={createCollection.isPending}
              >
                {createCollection.isPending && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
                تأكيد وإرسال للموافقة
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DebtCollectionDialog;
