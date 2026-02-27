import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Banknote, CreditCard, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatNumber } from '@/utils/formatters';

interface DeliveryPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderTotal: number;
  customerName: string;
  /** Prepaid amount already paid at order creation */
  prepaidAmount?: number;
  /** Frozen payment type passed at dialog open time */
  frozenPaymentType?: string;
  /** Frozen invoice method passed at dialog open time */
  frozenInvoiceMethod?: string | null;
  onConfirm: (data: {
    paidAmount: number;
    remainingAmount: number;
    paymentMethod: string;
    notes?: string;
    isFullPayment: boolean;
    isNoPayment?: boolean;
    /** Echo back frozen values so caller can use them directly */
    confirmedPaymentType?: string;
    confirmedInvoiceMethod?: string | null;
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

  const remainingAmount = useMemo(() => {
    if (paymentMode === 'full') return 0;
    if (paymentMode === 'no_payment') return orderTotal;
    const paid = Number(paidAmount) || 0;
    return Math.max(0, orderTotal - paid);
  }, [paymentMode, paidAmount, orderTotal]);

  const paidAmountExceedsTotal = paymentMode === 'partial' && (Number(paidAmount) || 0) > orderTotal;

  const handleConfirm = async () => {
    const paid = paymentMode === 'full' ? orderTotal : paymentMode === 'no_payment' ? 0 : (Number(paidAmount) || 0);
    if (paymentMode === 'partial' && paid <= 0) return;
    if (paymentMode === 'partial' && paid > orderTotal) {
      return; // blocked by UI anyway
    }
    setIsSubmitting(true);
    try {
      await onConfirm({
        paidAmount: paid,
        remainingAmount: orderTotal - paid,
        paymentMethod,
        notes: notes || undefined,
        isFullPayment: paymentMode === 'full',
        isNoPayment: paymentMode === 'no_payment',
        confirmedPaymentType: frozenPaymentType,
        confirmedInvoiceMethod: frozenInvoiceMethod,
      });
      // Reset
      setPaymentMode('full');
      setPaidAmount('');
      setPaymentMethod('cash');
      setNotes('');
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
            {/* Show frozen payment type for verification */}
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
              onClick={() => setPaymentMode('full')}
            >
              <CheckCircle className="w-4 h-4 me-1" />
              {t('debts.full_payment')}
            </Button>
            <Button
              type="button"
              variant={paymentMode === 'partial' ? 'default' : 'outline'}
              className="h-12 text-xs"
              onClick={() => setPaymentMode('partial')}
            >
              <CreditCard className="w-4 h-4 me-1" />
              {t('debts.partial_payment')}
            </Button>
            <Button
              type="button"
              variant={paymentMode === 'no_payment' ? 'destructive' : 'outline'}
              className="h-12 text-xs"
              onClick={() => setPaymentMode('no_payment')}
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
                  onChange={(e) => setPaidAmount(e.target.value)}
                  placeholder="0"
                  min="0"
                  max={orderTotal}
                  className={`text-lg font-bold h-12 ${paidAmountExceedsTotal ? 'border-destructive ring-destructive' : ''}`}
                />
                {paidAmountExceedsTotal && (
                  <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    المبلغ المدفوع أكبر من إجمالي الطلبية ({formatNumber(orderTotal, language)} {t('common.currency')})
                  </p>
                )}
              </div>

              {remainingAmount > 0 && !paidAmountExceedsTotal && (
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
            disabled={isSubmitting || (paymentMode === 'partial' && (!paidAmount || Number(paidAmount) <= 0)) || paidAmountExceedsTotal}

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
