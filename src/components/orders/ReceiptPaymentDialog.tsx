import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, Banknote, CheckCircle, FileText, Loader2, XCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatNumber } from '@/utils/formatters';

interface ReceiptPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderTotal: number;
  customerName: string;
  paymentMethod: 'receipt' | 'transfer'; // Versement or Virement
  onConfirm: (data: {
    receiptReceived: boolean;
    paidByCash: boolean;
    receiptAmount: number;
    cashAmount: number;
    remainingDebt: number;
  }) => Promise<void>;
}

const ReceiptPaymentDialog: React.FC<ReceiptPaymentDialogProps> = ({
  open, onOpenChange, orderTotal, customerName, paymentMethod, onConfirm,
}) => {
  const { dir, language } = useLanguage();
  const [mode, setMode] = useState<'choose' | 'receipt' | 'cash'>('choose');
  const [receiptAmount, setReceiptAmount] = useState('');
  const [cashAmount, setCashAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const methodLabel = paymentMethod === 'receipt' ? 'Versement' : 'Virement';
  const docLabel = paymentMethod === 'receipt' ? 'وصل Versement' : 'وصل Virement';

  const enteredAmount = mode === 'receipt' ? Number(receiptAmount) || 0 : Number(cashAmount) || 0;
  const remainingDebt = Math.max(0, orderTotal - enteredAmount);
  const hasDebt = remainingDebt > 0 && enteredAmount > 0;
  const isOverpayment = enteredAmount > orderTotal;

  const handleReset = () => {
    setMode('choose');
    setReceiptAmount('');
    setCashAmount('');
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) handleReset();
    onOpenChange(isOpen);
  };

  const handleConfirm = async () => {
    if (enteredAmount <= 0) return;
    setIsSubmitting(true);
    try {
      const effectiveAmount = Math.min(enteredAmount, orderTotal);
      await onConfirm({
        receiptReceived: mode === 'receipt',
        paidByCash: mode === 'cash',
        receiptAmount: mode === 'receipt' ? effectiveAmount : 0,
        cashAmount: mode === 'cash' ? effectiveAmount : 0,
        remainingDebt: Math.max(0, orderTotal - effectiveAmount),
      });
      handleReset();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNoReceipt = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm({
        receiptReceived: false,
        paidByCash: false,
        receiptAmount: 0,
        cashAmount: 0,
        remainingDebt: orderTotal,
      });
      handleReset();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] p-0 gap-0 overflow-hidden" dir={dir}>
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="w-5 h-5 text-primary" />
            تأكيد الدفع - {methodLabel}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-8rem)] px-4 py-3">
          {mode === 'choose' ? (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="text-sm text-muted-foreground">{customerName}</p>
                <p className="text-2xl font-bold">{formatNumber(orderTotal, language)} DA</p>
                <Badge variant="outline" className="text-xs">{methodLabel} - Facture 1</Badge>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <Button
                  className="h-14 text-base bg-green-600 hover:bg-green-700"
                  onClick={() => setMode('receipt')}
                  disabled={isSubmitting}
                >
                  <FileText className="w-5 h-5 me-2" />
                  استلام {docLabel}
                </Button>
                <Button
                  variant="outline"
                  className="h-14 text-base"
                  onClick={() => setMode('cash')}
                  disabled={isSubmitting}
                >
                  <Banknote className="w-5 h-5 me-2" />
                  دفع كاش
                </Button>
                <Button
                  variant="destructive"
                  className="h-14 text-base"
                  onClick={handleNoReceipt}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <XCircle className="w-5 h-5 me-2" />
                  )}
                  بدون استلام (تسجيل دين)
                </Button>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 inline me-1" />
                عند اختيار "بدون استلام"، سيتم تسجيل كامل المبلغ كدين وإضافته لقائمة المستندات المعلقة.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="text-sm text-muted-foreground">{customerName}</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">إجمالي الطلبية:</span>
                  <span className="text-lg font-bold">{formatNumber(orderTotal, language)} DA</span>
                </div>
              </div>

              <div>
                <Label className="text-sm font-semibold">
                  {mode === 'receipt' ? `مبلغ ${docLabel}` : 'مبلغ الكاش المستلم'}
                </Label>
                <Input
                  type="number"
                  value={mode === 'receipt' ? receiptAmount : cashAmount}
                  onChange={(e) => mode === 'receipt' ? setReceiptAmount(e.target.value) : setCashAmount(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="text-lg font-bold h-12 mt-1"
                />
              </div>

              {isOverpayment && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4 inline me-1" />
                  المبلغ المدخل أكبر من قيمة الطلبية. سيتم احتساب {formatNumber(orderTotal, language)} DA فقط.
                </div>
              )}

              {hasDebt && !isOverpayment && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-destructive">المبلغ المتبقي سيُسجل كدين</p>
                    <p className="text-lg font-bold text-destructive">
                      {formatNumber(remainingDebt, language)} DA
                    </p>
                  </div>
                </div>
              )}

              {enteredAmount > 0 && enteredAmount >= orderTotal && !isOverpayment && (
                <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm text-green-700 dark:text-green-400">
                  <CheckCircle className="w-4 h-4 inline me-1" />
                  المبلغ يغطي كامل قيمة الطلبية ✓
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {mode !== 'choose' && (
          <div className="p-4 border-t space-y-2">
            <Button
              className="w-full h-12"
              onClick={handleConfirm}
              disabled={isSubmitting || enteredAmount <= 0}
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 me-2" />
                  تأكيد {mode === 'receipt' ? `استلام ${docLabel}` : 'الدفع كاش'}
                </>
              )}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setMode('choose')} disabled={isSubmitting}>
              رجوع
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ReceiptPaymentDialog;
