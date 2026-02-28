import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, CheckCircle, FileCheck, Loader2, XCircle, Calendar } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatNumber } from '@/utils/formatters';

interface CheckVerification {
  name_matches: boolean;
  check_intact: boolean;
  signature_present: boolean;
  customer_stamp: boolean;
  amount_matches: boolean;
  invoice_stamped: boolean;
  company_name_on_check: boolean;
  has_due_date: boolean;
  due_date: string;
}

interface CheckVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderTotal: number;
  customerName: string;
  initialCheckReceived?: boolean;
  initialVerification?: Partial<CheckVerification> | null;
  onConfirm: (data: {
    checkReceived: boolean;
    verification: CheckVerification | null;
    skippedVerification: boolean;
  }) => Promise<void>;
}

const defaultVerification: CheckVerification = {
  name_matches: false,
  check_intact: false,
  signature_present: false,
  customer_stamp: false,
  amount_matches: false,
  invoice_stamped: false,
  company_name_on_check: false,
  has_due_date: false,
  due_date: '',
};

const CheckVerificationDialog: React.FC<CheckVerificationDialogProps> = ({
  open, onOpenChange, orderTotal, customerName, initialCheckReceived = false, initialVerification = null, onConfirm,
}) => {
  const { dir, language } = useLanguage();
  const [mode, setMode] = useState<'choose' | 'verify'>('choose');
  const [verification, setVerification] = useState<CheckVerification>({ ...defaultVerification });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleReset = () => {
    setMode('choose');
    setVerification({ ...defaultVerification });
  };

  useEffect(() => {
    if (!open) return;

    setMode(initialCheckReceived ? 'verify' : 'choose');
    setVerification({
      ...defaultVerification,
      ...(initialVerification || {}),
    });
  }, [open, initialCheckReceived, initialVerification]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) handleReset();
    onOpenChange(isOpen);
  };

  const checklist = [
    { key: 'name_matches' as const, label: 'اسم العميل على الشيك مطابق لاسم الفاتورة' },
    { key: 'check_intact' as const, label: 'الشيك سليم (غير ممزق، بدون خربشات)' },
    { key: 'signature_present' as const, label: 'إمضاء العميل موجود على الشيك' },
    { key: 'customer_stamp' as const, label: 'ختم العميل موجود على الشيك' },
    { key: 'amount_matches' as const, label: `المبلغ في الشيك مطابق للفاتورة (${formatNumber(orderTotal, language)} DA)` },
    { key: 'invoice_stamped' as const, label: 'الفاتورة مختومة بختم العميل' },
    { key: 'company_name_on_check' as const, label: 'اسم الشركة مكتوب كمستلم على الشيك' },
  ];

  const completedChecks = checklist.filter(c => verification[c.key]).length;
  const allChecked = completedChecks === checklist.length && (!verification.has_due_date || verification.due_date);

  const handleConfirmCheck = async (skipped: boolean) => {
    setIsSubmitting(true);
    try {
      await onConfirm({
        checkReceived: true,
        verification: skipped ? null : verification,
        skippedVerification: skipped,
      });
      handleReset();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNoCheck = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm({
        checkReceived: false,
        verification: null,
        skippedVerification: false,
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
            <FileCheck className="w-5 h-5 text-primary" />
            تأكيد استلام Chèque
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-8rem)] px-4 py-3">
          {mode === 'choose' ? (
            <div className="space-y-4">
              {/* Order info */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="text-sm text-muted-foreground">{customerName}</p>
                <p className="text-2xl font-bold">{formatNumber(orderTotal, language)} DA</p>
                <Badge variant="outline" className="text-xs">Chèque - Facture 1</Badge>
              </div>

              {/* Main choices */}
              <div className="grid grid-cols-1 gap-3">
                <Button
                  className="h-16 text-base bg-green-600 hover:bg-green-700"
                  onClick={() => setMode('verify')}
                  disabled={isSubmitting}
                >
                  <CheckCircle className="w-5 h-5 me-2" />
                  استلام الشيك
                </Button>
                <Button
                  variant="destructive"
                  className="h-16 text-base"
                  onClick={handleNoCheck}
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
                عند اختيار "بدون استلام"، سيتم تسجيل كامل المبلغ كدين على العميل وإضافته لقائمة المستندات المعلقة.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Verification checklist */}
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">التحقق من مطابقة الشيك</h3>
                <Badge variant={allChecked ? 'default' : 'secondary'} className="text-xs">
                  {completedChecks}/{checklist.length}
                </Badge>
              </div>

              <div className="space-y-3">
                {checklist.map(item => (
                  <div key={item.key} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                    <Checkbox
                      id={item.key}
                      checked={verification[item.key]}
                      onCheckedChange={(checked) =>
                        setVerification(prev => ({ ...prev, [item.key]: !!checked }))
                      }
                    />
                    <Label htmlFor={item.key} className="text-sm cursor-pointer leading-relaxed">
                      {item.label}
                    </Label>
                  </div>
                ))}

                {/* Due date */}
                <div className="border-t pt-3 space-y-2">
                  <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                    <Checkbox
                      id="has_due_date"
                      checked={verification.has_due_date}
                      onCheckedChange={(checked) =>
                        setVerification(prev => ({ ...prev, has_due_date: !!checked, due_date: checked ? prev.due_date : '' }))
                      }
                    />
                    <Label htmlFor="has_due_date" className="text-sm cursor-pointer leading-relaxed">
                      تاريخ الاستحقاق مسجل على الشيك
                    </Label>
                  </div>
                  {verification.has_due_date && (
                    <div className="ms-8">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                        <Calendar className="w-3 h-3" />
                        تاريخ الاستحقاق
                      </Label>
                      <Input
                        type="date"
                        value={verification.due_date}
                        onChange={(e) => setVerification(prev => ({ ...prev, due_date: e.target.value }))}
                        className="h-9"
                      />
                    </div>
                  )}
                </div>
              </div>

              {!allChecked && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="w-3 h-3 inline me-1" />
                  بعض عناصر التحقق غير مكتملة. يمكنك المتابعة بدون إكمالها لكن سيتم تسجيل ذلك.
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {mode === 'verify' && (
          <div className="p-4 border-t space-y-2">
            <Button
              className="w-full h-12"
              onClick={() => handleConfirmCheck(!allChecked)}
              disabled={isSubmitting || (verification.has_due_date && !verification.due_date)}
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 me-2" />
                  {allChecked ? 'تأكيد استلام الشيك ✓' : 'تأكيد (بدون إكمال التحقق)'}
                </>
              )}
            </Button>
            {!initialCheckReceived && (
              <Button variant="outline" className="w-full" onClick={() => setMode('choose')} disabled={isSubmitting}>
                رجوع
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CheckVerificationDialog;
