import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AlertTriangle, CheckCircle, FileCheck, Loader2, XCircle, PenLine, Banknote } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatNumber } from '@/utils/formatters';
import { useCompanyInfo } from '@/hooks/useCompanyInfo';
import { useVerificationChecklist } from '@/hooks/useVerificationChecklist';

interface CheckVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderTotal: number;
  customerName: string;
  initialCheckReceived?: boolean;
  initialVerification?: Partial<Record<string, any>> | null;
  documentType?: 'check' | 'receipt' | 'transfer';
  onConfirm: (data: {
    checkReceived: boolean;
    verification: Record<string, any> | null;
    skippedVerification: boolean;
    checkAmount?: number;
    remainingAction?: 'debt' | 'another_check';
    remainingAmount?: number;
  }) => Promise<void>;
}

const CheckVerificationDialog: React.FC<CheckVerificationDialogProps> = ({
  open, onOpenChange, orderTotal, customerName, initialCheckReceived = false, initialVerification = null, documentType = 'check', onConfirm,
}) => {
  const { language } = useLanguage();
  const { companyInfo } = useCompanyInfo();
  const { items: checklistItems, isLoading: itemsLoading } = useVerificationChecklist(documentType);
  const [mode, setMode] = useState<'choose' | 'verify' | 'amount_mismatch'>('choose');
  const [verification, setVerification] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBlankCheck, setIsBlankCheck] = useState(false);
  const [checkAmount, setCheckAmount] = useState('');
  const [remainingAction, setRemainingAction] = useState<'debt' | 'another_check'>('debt');

  const activeItems = checklistItems.filter(i => i.is_active);
  const numericCheckAmount = Number(checkAmount) || 0;
  const amountDiff = orderTotal - numericCheckAmount;
  const isAmountMismatch = numericCheckAmount > 0 && numericCheckAmount < orderTotal;
  const isAmountExact = numericCheckAmount > 0 && numericCheckAmount >= orderTotal;

  const handleReset = () => {
    setMode('choose');
    setVerification({});
    setIsBlankCheck(false);
    setCheckAmount('');
    setRemainingAction('debt');
  };

  useEffect(() => {
    if (!open) return;
    setMode(initialCheckReceived ? 'verify' : 'choose');
    setIsBlankCheck(false);
    setCheckAmount('');
    setRemainingAction('debt');
    if (initialVerification) {
      setVerification({ ...initialVerification });
    } else {
      setVerification({});
    }
  }, [open, initialCheckReceived, initialVerification]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) handleReset();
    onOpenChange(isOpen);
  };

  // Group items by group_title
  const groups = activeItems.reduce((acc, item) => {
    if (!acc[item.group_title]) acc[item.group_title] = [];
    acc[item.group_title].push(item);
    return acc;
  }, {} as Record<string, typeof activeItems>);

  // Count completed checks (only checkbox items)
  const checkboxItems = activeItems.filter(i => i.field_type === 'checkbox');
  const completedChecks = checkboxItems.filter(i => verification[i.id]).length;
  const totalChecks = checkboxItems.length;
  
  // Check if all required fields are filled
  const dateItems = activeItems.filter(i => i.field_type === 'date');
  const filledDates = dateItems.every(i => !verification[`${i.id}_checked`] || verification[i.id]);
  const allChecked = completedChecks === totalChecks && filledDates;

  const handleConfirmCheck = async (skipped: boolean) => {
    // If amount is entered and mismatched, go to mismatch screen
    if (isAmountMismatch && mode === 'verify') {
      setMode('amount_mismatch');
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm({
        checkReceived: true,
        verification: skipped ? null : { ...verification, is_blank_check: isBlankCheck, check_amount: numericCheckAmount || orderTotal },
        skippedVerification: skipped,
        checkAmount: numericCheckAmount || orderTotal,
        remainingAction: undefined,
        remainingAmount: 0,
      });
      handleReset();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMismatchConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm({
        checkReceived: true,
        verification: { ...verification, is_blank_check: isBlankCheck, check_amount: numericCheckAmount },
        skippedVerification: false,
        checkAmount: numericCheckAmount,
        remainingAction,
        remainingAmount: amountDiff,
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
        checkAmount: 0,
        remainingAction: 'debt',
        remainingAmount: orderTotal,
      });
      handleReset();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBlankCheckToggle = (checked: boolean) => {
    setIsBlankCheck(checked);
    if (checked) {
      setVerification({});
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] p-0 gap-0 overflow-hidden" dir="rtl">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileCheck className="w-5 h-5 text-primary" />
            {documentType === 'check' ? 'تأكيد استلام Chèque' : documentType === 'receipt' ? 'تأكيد استلام Versement' : 'تأكيد استلام Virement'}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-8rem)] px-4 py-3">
          {mode === 'choose' ? (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-right">
                <p className="text-sm text-muted-foreground">{customerName}</p>
                <p className="text-2xl font-bold">{formatNumber(orderTotal, language)} DA</p>
                <Badge variant="outline" className="text-xs">
                  {documentType === 'check' ? 'Chèque' : documentType === 'receipt' ? 'Versement' : 'Virement'}
                </Badge>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <Button
                  className="h-16 text-base bg-green-600 hover:bg-green-700"
                  onClick={() => setMode('verify')}
                  disabled={isSubmitting}
                >
                  <CheckCircle className="w-5 h-5 ms-2" />
                  استلام الوثيقة
                </Button>
                <Button
                  variant="destructive"
                  className="h-16 text-base"
                  onClick={handleNoCheck}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <XCircle className="w-5 h-5 ms-2" />}
                  بدون استلام (تسجيل دين)
                </Button>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300 text-right">
                <AlertTriangle className="w-4 h-4 inline ms-1" />
                عند اختيار "بدون استلام"، سيتم تسجيل كامل المبلغ كدين على العميل.
              </div>
            </div>
          ) : mode === 'amount_mismatch' ? (
            /* Amount mismatch screen */
            <div className="space-y-4 text-right">
              <div className="bg-amber-50 dark:bg-amber-950/20 border-2 border-amber-300 dark:border-amber-700 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <h3 className="font-bold text-amber-800 dark:text-amber-300">فارق في قيمة الشيك</h3>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">قيمة المشتريات:</span>
                    <span className="font-bold">{formatNumber(orderTotal, language)} DA</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">قيمة الشيك:</span>
                    <span className="font-bold">{formatNumber(numericCheckAmount, language)} DA</span>
                  </div>
                  <div className="border-t pt-1 mt-1 flex justify-between font-bold text-destructive">
                    <span>المبلغ المتبقي:</span>
                    <span>{formatNumber(amountDiff, language)} DA</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-bold">كيف تريد التعامل مع المبلغ المتبقي؟</h3>
                <RadioGroup value={remainingAction} onValueChange={(v) => setRemainingAction(v as 'debt' | 'another_check')} className="space-y-2">
                  <div className="flex items-start gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5 cursor-pointer" onClick={() => setRemainingAction('debt')}>
                    <RadioGroupItem value="debt" id="action-debt" className="mt-0.5" />
                    <div className="flex-1">
                      <Label htmlFor="action-debt" className="font-bold cursor-pointer text-sm">تسجيل كدين على العميل</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        سيتم تسجيل {formatNumber(amountDiff, language)} DA كدين معلق على العميل
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5 cursor-pointer" onClick={() => setRemainingAction('another_check')}>
                    <RadioGroupItem value="another_check" id="action-check" className="mt-0.5" />
                    <div className="flex-1">
                      <Label htmlFor="action-check" className="font-bold cursor-pointer text-sm">إسناد لشيك آخر</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        سيتم تسجيل المبلغ المتبقي كمستند معلق (شيك ثاني) على العميل
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-right">
              <div className="flex items-center justify-between">
                <Badge variant={allChecked ? 'default' : 'secondary'} className="text-xs">
                  {completedChecks}/{totalChecks}
                </Badge>
                <h3 className="text-sm font-bold">
                  {documentType === 'check' ? 'التحقق من مطابقة الشيك' : documentType === 'receipt' ? 'التحقق من مطابقة الوصل' : 'التحقق من مطابقة التحويل'}
                </h3>
              </div>

              {/* Check amount input */}
              {documentType === 'check' && !isBlankCheck && (
                <div className="bg-muted/50 rounded-lg p-3 space-y-2 border border-primary/20">
                  <div className="flex items-center gap-2">
                    <Banknote className="w-4 h-4 text-primary" />
                    <Label className="text-sm font-bold">مبلغ الشيك</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={checkAmount}
                      onChange={(e) => setCheckAmount(e.target.value)}
                      placeholder={String(orderTotal)}
                      className="h-10 text-base font-bold flex-1"
                      dir="ltr"
                      min={0}
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      / {formatNumber(orderTotal, language)} DA
                    </span>
                  </div>
                  {isAmountMismatch && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      مبلغ الشيك أقل من قيمة المشتريات بـ {formatNumber(amountDiff, language)} DA
                    </p>
                  )}
                  {isAmountExact && (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      المبلغ مطابق ✓
                    </p>
                  )}
                </div>
              )}

              {/* Blank check toggle - only for checks */}
              {documentType === 'check' && (
                <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between gap-3 border border-dashed border-muted-foreground/30">
                  <Switch checked={isBlankCheck} onCheckedChange={handleBlankCheckToggle} />
                  <div className="flex-1 text-right">
                    <p className="text-sm font-medium">شيك فارغ وسليم</p>
                    <p className="text-xs text-muted-foreground">العميل سلّم شيك فارغ تماماً</p>
                  </div>
                  <PenLine className="w-5 h-5 text-muted-foreground shrink-0" />
                </div>
              )}

              {!(documentType === 'check' && isBlankCheck) && !itemsLoading && (
                <div className="space-y-4">
                  {Object.entries(groups).map(([groupTitle, groupItems]) => (
                    <div key={groupTitle} className="space-y-2">
                      <h4 className="text-xs font-bold text-muted-foreground">{groupTitle}</h4>
                      <div className="space-y-1 bg-muted/30 rounded-lg p-2">
                        {groupItems.map(item => (
                          <div key={item.id} className="space-y-1">
                            {item.field_type === 'checkbox' && (
                              <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                                <Checkbox
                                  id={item.id}
                                  checked={!!verification[item.id]}
                                  onCheckedChange={(checked) =>
                                    setVerification(prev => ({ ...prev, [item.id]: !!checked }))
                                  }
                                />
                                <Label htmlFor={item.id} className="text-sm cursor-pointer leading-relaxed flex-1 text-right">
                                  {item.label}
                                </Label>
                              </div>
                            )}

                            {item.field_type === 'number' && (() => {
                              const isAmountField = item.label.includes('مبلغ') || item.label.includes('المبلغ');
                              return (
                                <div className="space-y-1 p-2">
                                  <Label className="text-sm">{item.label}</Label>
                                  <div className="flex items-center gap-2">
                                    <Input
                                      type="number"
                                      placeholder={isAmountField ? 'أدخل المبلغ' : item.label}
                                      value={verification[item.id] || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setVerification(prev => ({
                                          ...prev,
                                          [item.id]: val,
                                          [`${item.id}_checked`]: val.length > 0,
                                        }));
                                      }}
                                      className="h-8 text-sm flex-1"
                                      dir="ltr"
                                    />
                                    {isAmountField && (
                                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                                        / {formatNumber(orderTotal, language)} DA
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}

                            {item.field_type === 'text' && (
                              <div className="space-y-1 p-2">
                                <Label className="text-sm">{item.label}</Label>
                                <Input
                                  type="text"
                                  placeholder={item.label}
                                  value={verification[item.id] || ''}
                                  onChange={(e) =>
                                    setVerification(prev => ({ ...prev, [item.id]: e.target.value }))
                                  }
                                  className="h-8 text-sm"
                                  dir="ltr"
                                />
                              </div>
                            )}

                            {item.field_type === 'date' && (
                              <div className="space-y-1 p-2">
                                <div className="flex items-start gap-3">
                                  <Checkbox
                                    id={`${item.id}_checked`}
                                    checked={!!verification[`${item.id}_checked`]}
                                    onCheckedChange={(checked) =>
                                      setVerification(prev => ({
                                        ...prev,
                                        [`${item.id}_checked`]: !!checked,
                                        ...(checked ? {} : { [item.id]: '' }),
                                      }))
                                    }
                                  />
                                  <Label htmlFor={`${item.id}_checked`} className="text-sm cursor-pointer flex-1 text-right">
                                    {item.label}
                                  </Label>
                                </div>
                                {verification[`${item.id}_checked`] && (
                                  <Input
                                    type="date"
                                    value={verification[item.id] || ''}
                                    onChange={(e) =>
                                      setVerification(prev => ({ ...prev, [item.id]: e.target.value }))
                                    }
                                    className="h-9 mt-1"
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {itemsLoading && (
                <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin" /></div>
              )}

              {!allChecked && !(documentType === 'check' && isBlankCheck) && !itemsLoading && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300 text-right">
                  <AlertTriangle className="w-3 h-3 inline ms-1" />
                  بعض عناصر التحقق غير مكتملة. يمكنك المتابعة بدون إكمالها.
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {mode === 'amount_mismatch' && (
          <div className="p-4 border-t space-y-2">
            <Button
              className="w-full h-12"
              onClick={handleMismatchConfirm}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 ms-2" />
                  تأكيد وتمرير
                </>
              )}
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setMode('verify')} disabled={isSubmitting}>
              رجوع
            </Button>
          </div>
        )}

        {mode === 'verify' && (
          <div className="p-4 border-t space-y-2">
            <Button
              className="w-full h-12"
              onClick={() => handleConfirmCheck(isBlankCheck ? false : !allChecked)}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 ms-2" />
                  {isAmountMismatch
                    ? 'متابعة — فارق في المبلغ'
                    : isBlankCheck
                      ? 'تأكيد استلام شيك فارغ ✓'
                      : allChecked
                        ? 'تأكيد الاستلام ✓'
                        : 'تأكيد (بدون إكمال التحقق)'}
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