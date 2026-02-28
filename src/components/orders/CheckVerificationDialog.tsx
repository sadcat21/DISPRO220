import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { AlertTriangle, CheckCircle, FileCheck, Loader2, XCircle, Calendar, FileText, Stamp, PenLine } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatNumber } from '@/utils/formatters';
import { useCompanyInfo } from '@/hooks/useCompanyInfo';

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
  is_blank_check: boolean;
}

interface CheckVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderTotal: number;
  customerName: string;
  initialCheckReceived?: boolean;
  initialVerification?: Partial<CheckVerification> | null;
  documentType?: 'check' | 'receipt' | 'transfer';
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
  is_blank_check: false,
};

const CheckVerificationDialog: React.FC<CheckVerificationDialogProps> = ({
  open, onOpenChange, orderTotal, customerName, initialCheckReceived = false, initialVerification = null, documentType = 'check', onConfirm,
}) => {
  const { dir, language } = useLanguage();
  const { companyInfo } = useCompanyInfo();
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

  type CheckKey = keyof Omit<CheckVerification, 'has_due_date' | 'due_date' | 'is_blank_check'>;

  const checkGroups: { title: string; icon: React.ElementType; items: { key: CheckKey; label: string }[] }[] = documentType === 'check' ? [
    {
      title: 'بيانات الشيك',
      icon: FileCheck,
      items: [
        { key: 'check_intact', label: 'الشيك سليم (غير ممزق، بدون خربشات)' },
        { key: 'signature_present', label: 'إمضاء العميل موجود على الشيك' },
        { key: 'customer_stamp', label: 'ختم العميل موجود على الشيك' },
        { key: 'amount_matches', label: `المبلغ مطابق للفاتورة (${formatNumber(orderTotal, language)} DA)` },
        { key: 'company_name_on_check', label: `اسم الشركة المستلمة مكتوب على الشيك: ${companyInfo.company_name || 'غير محدد'}` },
      ],
    },
    {
      title: 'معلومات العميل والفاتورة',
      icon: FileText,
      items: [
        { key: 'name_matches', label: 'اسم العميل على الشيك مطابق لاسم الفاتورة' },
        { key: 'invoice_stamped', label: 'الفاتورة مختومة بختم العميل' },
      ],
    },
  ] : documentType === 'receipt' ? [
    {
      title: 'بيانات وصل الدفع (Versement)',
      icon: FileCheck,
      items: [
        { key: 'check_intact', label: 'وصل الدفع سليم وواضح' },
        { key: 'amount_matches', label: `المبلغ مطابق للفاتورة (${formatNumber(orderTotal, language)} DA)` },
        { key: 'customer_stamp', label: 'ختم البنك موجود على الوصل' },
        { key: 'company_name_on_check', label: `الحساب المستلم هو: ${companyInfo.company_bank || 'غير محدد'} - RIB: ${companyInfo.company_rib || 'غير محدد'}` },
      ],
    },
    {
      title: 'معلومات العميل والفاتورة',
      icon: FileText,
      items: [
        { key: 'name_matches', label: 'اسم المرسل (الدافع) مطابق لاسم العميل' },
        { key: 'signature_present', label: `اسم المستفيد: ${companyInfo.company_name || 'غير محدد'}` },
        { key: 'invoice_stamped', label: 'الفاتورة مختومة بختم العميل' },
      ],
    },
  ] : [
    {
      title: 'بيانات التحويل (Virement)',
      icon: FileCheck,
      items: [
        { key: 'check_intact', label: 'إثبات التحويل سليم وواضح' },
        { key: 'amount_matches', label: `المبلغ مطابق للفاتورة (${formatNumber(orderTotal, language)} DA)` },
        { key: 'signature_present', label: 'رقم مرجع التحويل موجود' },
        { key: 'company_name_on_check', label: `الحساب المستلم هو: ${companyInfo.company_bank || 'غير محدد'} - RIB: ${companyInfo.company_rib || 'غير محدد'}` },
      ],
    },
    {
      title: 'معلومات العميل والفاتورة',
      icon: FileText,
      items: [
        { key: 'name_matches', label: 'اسم المرسل مطابق لاسم العميل' },
        { key: 'customer_stamp', label: `اسم المستفيد: ${companyInfo.company_name || 'غير محدد'}` },
        { key: 'invoice_stamped', label: 'الفاتورة مختومة بختم العميل' },
      ],
    },
  ];

  const allCheckItems = checkGroups.flatMap(g => g.items);
  const completedChecks = allCheckItems.filter(c => verification[c.key]).length;
  const totalChecks = allCheckItems.length;
  const allChecked = completedChecks === totalChecks && (!verification.has_due_date || verification.due_date);

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

  const handleBlankCheckToggle = (checked: boolean) => {
    if (checked) {
      // Blank check = intact + no other fields filled
      setVerification(prev => ({
        ...defaultVerification,
        is_blank_check: true,
        check_intact: true,
      }));
    } else {
      setVerification(prev => ({
        ...prev,
        is_blank_check: false,
      }));
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
              {/* Order info */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-right">
                <p className="text-sm text-muted-foreground">{customerName}</p>
                <p className="text-2xl font-bold">{formatNumber(orderTotal, language)} DA</p>
                <Badge variant="outline" className="text-xs">
                  {documentType === 'check' ? 'Chèque' : documentType === 'receipt' ? 'Versement' : 'Virement'} - Facture 1
                </Badge>
              </div>

              {/* Main choices */}
              <div className="grid grid-cols-1 gap-3">
                <Button
                  className="h-16 text-base bg-green-600 hover:bg-green-700"
                  onClick={() => setMode('verify')}
                  disabled={isSubmitting}
                >
                  <CheckCircle className="w-5 h-5 ms-2" />
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
                    <XCircle className="w-5 h-5 ms-2" />
                  )}
                  بدون استلام (تسجيل دين)
                </Button>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300 text-right">
                <AlertTriangle className="w-4 h-4 inline ms-1" />
                عند اختيار "بدون استلام"، سيتم تسجيل كامل المبلغ كدين على العميل وإضافته لقائمة المستندات المعلقة.
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-right">
              {/* Header */}
              <div className="flex items-center justify-between">
                <Badge variant={allChecked ? 'default' : 'secondary'} className="text-xs">
                  {completedChecks}/{totalChecks}
                </Badge>
                <h3 className="text-sm font-bold">
                  {documentType === 'check' ? 'التحقق من مطابقة الشيك' : documentType === 'receipt' ? 'التحقق من مطابقة الوصل' : 'التحقق من مطابقة التحويل'}
                </h3>
              </div>

              {/* Blank check toggle - only for checks */}
              {documentType === 'check' && (
              <div className="bg-muted/50 rounded-lg p-3 flex items-center justify-between gap-3 border border-dashed border-muted-foreground/30">
                <Switch
                  checked={verification.is_blank_check}
                  onCheckedChange={handleBlankCheckToggle}
                />
                <div className="flex-1 text-right">
                  <p className="text-sm font-medium">شيك فارغ وسليم</p>
                  <p className="text-xs text-muted-foreground">العميل سلّم شيك فارغ تماماً بدون أي كتابة وسليم من أي خربشة أو تمزيق</p>
                </div>
                <PenLine className="w-5 h-5 text-muted-foreground shrink-0" />
              </div>
              )}

              {!(documentType === 'check' && verification.is_blank_check) && (
                <div className="space-y-4">
                  {checkGroups.map(group => {
                    const GroupIcon = group.icon;
                    return (
                      <div key={group.title} className="space-y-2">
                        <div className="flex items-center gap-2 text-right">
                          <GroupIcon className="w-4 h-4 text-primary shrink-0" />
                          <h4 className="text-xs font-bold text-muted-foreground">{group.title}</h4>
                        </div>
                        <div className="space-y-1 bg-muted/30 rounded-lg p-2">
                          {group.items.map(item => (
                            <div key={item.key} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                              <Checkbox
                                id={item.key}
                                checked={verification[item.key]}
                                onCheckedChange={(checked) =>
                                  setVerification(prev => ({ ...prev, [item.key]: !!checked }))
                                }
                              />
                              <Label htmlFor={item.key} className="text-sm cursor-pointer leading-relaxed flex-1 text-right">
                                {item.label}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Due date section */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary shrink-0" />
                  <h4 className="text-xs font-bold text-muted-foreground">تاريخ الاستحقاق</h4>
                </div>
                <div className="bg-muted/30 rounded-lg p-2">
                  <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                    <Checkbox
                      id="has_due_date"
                      checked={verification.has_due_date}
                      onCheckedChange={(checked) =>
                        setVerification(prev => ({ ...prev, has_due_date: !!checked, due_date: checked ? prev.due_date : '' }))
                      }
                    />
                    <Label htmlFor="has_due_date" className="text-sm cursor-pointer leading-relaxed flex-1 text-right">
                      تاريخ الاستحقاق مسجل على الشيك
                    </Label>
                  </div>
                  {verification.has_due_date && (
                    <div className="px-2 pb-2">
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

              {!allChecked && !(documentType === 'check' && verification.is_blank_check) && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-300 text-right">
                  <AlertTriangle className="w-3 h-3 inline ms-1" />
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
              onClick={() => handleConfirmCheck((documentType === 'check' && verification.is_blank_check) ? false : !allChecked)}
              disabled={isSubmitting || (verification.has_due_date && !verification.due_date)}
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 ms-2" />
                  {(documentType === 'check' && verification.is_blank_check)
                    ? 'تأكيد استلام شيك فارغ ✓'
                    : allChecked
                      ? (documentType === 'check' ? 'تأكيد استلام الشيك ✓' : documentType === 'receipt' ? 'تأكيد استلام الوصل ✓' : 'تأكيد استلام التحويل ✓')
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