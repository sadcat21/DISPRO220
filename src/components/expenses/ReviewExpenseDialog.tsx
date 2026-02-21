import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useUpdateExpenseStatus } from '@/hooks/useExpenses';
import { useLanguage } from '@/contexts/LanguageContext';
import { getCategoryName } from '@/utils/categoryName';
import { formatNumber } from '@/utils/formatters';
import { ExpenseWithDetails } from '@/types/expense';
import { CheckCircle, XCircle, Loader2, Image } from 'lucide-react';

interface ReviewExpenseDialogProps {
  expense: ExpenseWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ReviewExpenseDialog: React.FC<ReviewExpenseDialogProps> = ({ expense, open, onOpenChange }) => {
  const updateStatus = useUpdateExpenseStatus();
  const { language, t, dir } = useLanguage();
  const [rejectionReason, setRejectionReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  const handleApprove = async () => {
    if (!expense) return;
    await updateStatus.mutateAsync({ id: expense.id, status: 'approved' });
    onOpenChange(false);
  };

  const handleReject = async () => {
    if (!expense) return;
    await updateStatus.mutateAsync({
      id: expense.id,
      status: 'rejected',
      rejection_reason: rejectionReason,
    });
    setRejectionReason('');
    setShowReject(false);
    onOpenChange(false);
  };

  if (!expense) return null;

  const receiptUrls = expense.receipt_urls?.length ? expense.receipt_urls : (expense.receipt_url ? [expense.receipt_url] : []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir={dir}>
        <DialogHeader>
          <DialogTitle>{t('expenses.review')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="bg-muted p-3 rounded-lg space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">{t('expenses.amount')}</span>
              <span className="font-bold">{formatNumber(Number(expense.amount), language)} {t('common.currency')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">{t('expenses.category')}</span>
              <span>{getCategoryName(expense.category as any, language)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">👤</span>
              <span>{expense.worker?.full_name}</span>
            </div>
            {expense.description && (
              <div>
                <span className="text-sm text-muted-foreground">{t('expenses.description')}:</span>
                <p className="text-sm mt-1">{expense.description}</p>
              </div>
            )}
            {receiptUrls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {receiptUrls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <Image className="w-3 h-3" />
                    {receiptUrls.length > 1 ? `${t('expenses.receipt_image')} ${i + 1}` : t('expenses.view_receipt')}
                  </a>
                ))}
              </div>
            )}
          </div>

          {showReject ? (
            <div className="space-y-2">
              <Label>{t('expenses.rejection_reason')}</Label>
              <Textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder={t('expenses.enter_rejection_reason')}
                rows={2}
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={updateStatus.isPending}
                  className="flex-1"
                >
                  {updateStatus.isPending && <Loader2 className="w-4 h-4 animate-spin me-1" />}
                  {t('expenses.confirm_reject')}
                </Button>
                <Button variant="outline" onClick={() => setShowReject(false)} className="flex-1">
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button onClick={handleApprove} disabled={updateStatus.isPending} className="flex-1">
                {updateStatus.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin me-1" />
                ) : (
                  <CheckCircle className="w-4 h-4 me-1" />
                )}
                {t('expenses.approve')}
              </Button>
              <Button variant="destructive" onClick={() => setShowReject(true)} className="flex-1">
                <XCircle className="w-4 h-4 me-1" />
                {t('expenses.reject')}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReviewExpenseDialog;
