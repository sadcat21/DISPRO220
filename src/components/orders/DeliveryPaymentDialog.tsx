import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Banknote, CreditCard, AlertTriangle, CheckCircle, Loader2, DollarSign, Undo2, Wallet } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatNumber } from '@/utils/formatters';

interface DeliveryPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderTotal: number;
  customerName: string;
  prepaidAmount?: number;
  frozenPaymentType?: string;
  frozenInvoiceMethod?: string | null;
  onConfirm: (data: {
    paidAmount: number;
    remainingAmount: number;
    paymentMethod: string;
    notes?: string;
    isFullPayment: boolean;
    isNoPayment?: boolean;
    confirmedPaymentType?: string;
    confirmedInvoiceMethod?: string | null;
    overpaymentAction?: 'refund' | 'credit';
    overpaymentAmount?: number;
  }) => Promise<void>;
}

const DeliveryPaymentDialog: React.FC<DeliveryPaymentDialogProps> = ({
  open,
  onOpenChange,
  orderTotal,
  customerName,
  prepaidAmount = 0,
  frozenPaymentType,
  frozenInvoiceMethod,
  onConfirm,
}) => {
  const { t, language, dir } = useLanguage();
  const [paymentMode, setPaymentMode] = useState<'full' | 'partial' | 'no_payment'>('full');
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [overpaymentAction, setOverpaymentAction] = useState<'refund' | 'credit' | null>(null);

  const paidNum = Number(paidAmount) || 0;
  const isOverpayment = paymentMode === 'partial' && paidNum > orderTotal;
  const overpaymentAmount = isOverpayment ? paidNum - orderTotal : 0;

  const remainingAmount = useMemo(() => {
    if (paymentMode === 'full') return 0;
    if (paymentMode === 'no_payment') return orderTotal;
    if (isOverpayment) return 0;
    return Math.max(0, orderTotal - paidNum);
  }, [paymentMode, paidNum, orderTotal, isOverpayment]);

  const canSubmit = useMemo(() => {
    if (isSubmitting) return false;
    if (paymentMode === 'partial') {
      if (!paidAmount || paidNum <= 0) return false;
      if (isOverpayment && !overpaymentAction) return false;
    }
    return true;
  }, [isSubmitting, paymentMode, paidAmount, paidNum, isOverpayment, overpaymentAction]);

  const handleConfirm = async () => {
    const paid = paymentMode === 'full' ? orderTotal : paymentMode === 'no_payment' ? 0 : paidNum;
    if (paymentMode === 'partial' && paid <= 0) return;
    if (isOverpayment && !overpaymentAction) return;
    
    setIsSubmitting(true);
    try {
      await onConfirm({
        paidAmount: isOverpayment ? orderTotal : paid,
        remainingAmount: isOverpayment ? 0 : orderTotal - paid,
        paymentMethod,
        notes: notes || undefined,
        isFullPayment: paymentMode === 'full' || isOverpayment,
        isNoPayment: paymentMode === 'no_payment',
        confirmedPaymentType: frozenPaymentType,
        confirmedInvoiceMethod: frozenInvoiceMethod,
        overpaymentAction: isOverpayment ? overpaymentAction! : undefined,
        overpaymentAmount: isOverpayment ? overpaymentAmount : undefined,
      });
      setPaymentMode('full');
      setPaidAmount('');
      setPaymentMethod('cash');
      setNotes('');
      setOverpaymentAction(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setPaymentMode('full');
      setPaidAmount('');
      setPaymentMethod('cash');
      setNotes('');
      setOverpaymentAction(null);
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm" dir={dir}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="w-5 h-5" />
            {t('debts.payment_confirmation')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Customer & Total */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <p className="text-sm text-muted-foreground">{customerName}</p>
            {prepaidAmount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">المبلغ المتبقي بعد خصم الدفع المسبق:</span>
              </div>
            )}
            <p className="text-2xl font-bold">
              {formatNumber(orderTotal, language)} {t('common.currency')}
            </p>
            {prepaidAmount > 0 && (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs">
                <CheckCircle className="w-3 h-3 me-1" />
                تم دفع {formatNumber(prepaidAmount, language)} {t('common.currency')} مسبقاً
              </Badge>
            )}
            {frozenPaymentType && (
              <div className="flex gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">
                  {frozenPaymentType === 'with_invoice' ? t('orders.with_invoice') : t('orders.without_invoice')}
                </Badge>
                {frozenPaymentType === 'with_invoice' && frozenInvoiceMethod && (
                  <Badge variant="outline" className="text-xs">
                    {frozenInvoiceMethod === 'cash' ? 'كاش' : 
                     frozenInvoiceMethod === 'check' ? 'Chèque' :
                     frozenInvoiceMethod === 'receipt' ? 'Versement' :
                     frozenInvoiceMethod === 'transfer' ? 'Virement' : frozenInvoiceMethod}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Payment mode selection */}
          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant={paymentMode === 'full' ? 'default' : 'outline'}
              className="h-12 text-xs"
              onClick={() => { setPaymentMode('full'); setOverpaymentAction(null); }}
            >
              <CheckCircle className="w-4 h-4 me-1" />
              {t('debts.full_payment')}
            </Button>
            <Button
              type="button"
              variant={paymentMode === 'partial' ? 'default' : 'outline'}
              className="h-12 text-xs"
              onClick={() => { setPaymentMode('partial'); setOverpaymentAction(null); }}
            >
              <CreditCard className="w-4 h-4 me-1" />
              {t('debts.partial_payment')}
            </Button>
            <Button
              type="button"
              variant={paymentMode === 'no_payment' ? 'destructive' : 'outline'}
              className="h-12 text-xs"
              onClick={() => { setPaymentMode('no_payment'); setOverpaymentAction(null); }}
            >
              <AlertTriangle className="w-4 h-4 me-1" />
              بدون دفع
            </Button>
          </div>

          {/* Partial payment input */}
          {paymentMode === 'partial' && (
            <div className="space-y-3">
              <div>
                <Label>{t('debts.paid_amount')}</Label>
                <Input
                  type="number"
                  value={paidAmount}
                  onChange={(e) => { setPaidAmount(e.target.value); setOverpaymentAction(null); }}
                  placeholder="0"
                  min="0"
                  className="text-lg font-bold h-12"
                />
              </div>

              {/* Overpayment: show options */}
              {isOverpayment && (
                <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-emerald-600" />
                    <div>
                      <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">فائض مالي</p>
                      <p className="text-lg font-bold text-emerald-600">
                        {formatNumber(overpaymentAmount, language)} {t('common.currency')}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={overpaymentAction === 'refund' ? 'default' : 'outline'}
                      className="text-xs h-10"
                      onClick={() => setOverpaymentAction('refund')}
                    >
                      <Undo2 className="w-3.5 h-3.5 me-1" />
                      إرجاع الفرق
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={overpaymentAction === 'credit' ? 'default' : 'outline'}
                      className="text-xs h-10"
                      onClick={() => setOverpaymentAction('credit')}
                    >
                      <Wallet className="w-3.5 h-3.5 me-1" />
                      وضع في رصيد العميل
                    </Button>
                  </div>
                  {!overpaymentAction && (
                    <p className="text-xs text-muted-foreground text-center">يرجى اختيار ما سيتم فعله بالفائض</p>
                  )}
                </div>
              )}

              {/* Underpayment: remaining as debt */}
              {remainingAmount > 0 && !isOverpayment && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-destructive">
                      {t('debts.remaining_as_debt')}
                    </p>
                    <p className="text-lg font-bold text-destructive">
                      {formatNumber(remainingAmount, language)} {t('common.currency')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No payment warning */}
          {paymentMode === 'no_payment' && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
              <div>
                <p className="text-sm font-medium text-destructive">سيتم تسجيل كامل المبلغ كدين</p>
                <p className="text-lg font-bold text-destructive">
                  {orderTotal.toLocaleString()} {t('common.currency')}
                </p>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <Label>{t('common.notes')} ({t('common.optional')})</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Confirm button */}
          <Button
            className="w-full h-12 text-base"
            onClick={handleConfirm}
            disabled={!canSubmit}
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <CheckCircle className="w-5 h-5 me-2" />
                {paymentMode === 'full'
                  ? t('debts.confirm_full_payment')
                  : paymentMode === 'no_payment'
                  ? 'تأكيد بدون دفع (تسجيل دين)'
                  : isOverpayment
                  ? `تأكيد الدفع (فائض ${formatNumber(overpaymentAmount, language)})`
                  : t('debts.confirm_and_record_debt')}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DeliveryPaymentDialog;
