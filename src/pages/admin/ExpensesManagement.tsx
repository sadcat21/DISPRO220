import React, { useState } from 'react';
import { useExpenses } from '@/hooks/useExpenses';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSelectedWorker } from '@/contexts/SelectedWorkerContext';
import { ExpenseWithDetails } from '@/types/expense';
import ReviewExpenseDialog from '@/components/expenses/ReviewExpenseDialog';
import ManageCategoriesDialog from '@/components/expenses/ManageCategoriesDialog';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Receipt, Image, Filter, Tag } from 'lucide-react';
import ReceiptViewerDialog from '@/components/expenses/ReceiptViewerDialog';
import { getCategoryName } from '@/utils/categoryName';
import { formatDate, formatNumber } from '@/utils/formatters';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const STATUS_MAP_KEYS: Record<string, { labelKey: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { labelKey: 'expenses.pending', variant: 'secondary' },
  approved: { labelKey: 'expenses.approved', variant: 'default' },
  rejected: { labelKey: 'expenses.rejected', variant: 'destructive' },
};

const ExpensesManagement: React.FC = () => {
  const { workerId: contextWorkerId, workerName: contextWorkerName } = useSelectedWorker();
  const { data: expenses, isLoading } = useExpenses(contextWorkerId);
  const { language, t, dir } = useLanguage();
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [selectedExpense, setSelectedExpense] = useState<ExpenseWithDetails | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [receiptViewerUrls, setReceiptViewerUrls] = useState<string[]>([]);
  const [showReceiptViewer, setShowReceiptViewer] = useState(false);

  const filtered = expenses?.filter(e =>
    statusFilter === 'all' ? true : e.status === statusFilter
  );

  const totalAmount = filtered?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;

  return (
    <div className="p-4 space-y-4" dir={dir}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{t('expenses.title')}</h1>
          {contextWorkerName && <p className="text-sm text-muted-foreground">{contextWorkerName}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowCategories(true)}>
            <Tag className="w-4 h-4 me-1" />
            {t('expenses.categories')}
          </Button>
          <Badge variant="outline" className="text-base px-3 py-1">
            {formatNumber(totalAmount, language)} {t('common.currency')}
          </Badge>
        </div>
      </div>

      <div className="flex gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <Filter className="w-4 h-4 me-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('expenses.all')}</SelectItem>
            <SelectItem value="pending">{t('expenses.pending')}</SelectItem>
            <SelectItem value="approved">{t('expenses.approved')}</SelectItem>
            <SelectItem value="rejected">{t('expenses.rejected')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filtered?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Receipt className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>{t('expenses.no_expenses')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered?.map(expense => {
            const status = STATUS_MAP_KEYS[expense.status] || STATUS_MAP_KEYS.pending;
            const receiptUrls = expense.receipt_urls?.length ? expense.receipt_urls : (expense.receipt_url ? [expense.receipt_url] : []);
            
            return (
              <Card
                key={expense.id}
                className={`p-4 space-y-2 ${expense.status === 'pending' ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''}`}
                onClick={() => {
                  if (expense.status === 'pending') {
                    setSelectedExpense(expense);
                    setShowReview(true);
                  }
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">{formatNumber(Number(expense.amount), language)} {t('common.currency')}</span>
                      <Badge variant={status.variant}>{t(status.labelKey)}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {getCategoryName(expense.category as any, language)}
                    </p>
                    <p className="text-xs text-muted-foreground">👤 {expense.worker?.full_name}</p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(expense.expense_date, 'dd MMM yyyy', language)}
                  </div>
                </div>
                {expense.description && (
                  <p className="text-sm text-foreground/80">{expense.description}</p>
                )}
                {receiptUrls.length > 0 && (
                  <button
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setReceiptViewerUrls(receiptUrls);
                      setShowReceiptViewer(true);
                    }}
                  >
                    <Image className="w-3 h-3" />
                    {receiptUrls.length > 1 ? `${t('expenses.has_receipts')} (${receiptUrls.length})` : t('expenses.has_receipt')}
                  </button>
                )}
                {expense.status === 'rejected' && expense.rejection_reason && (
                  <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                    {t('expenses.rejection_reason')}: {expense.rejection_reason}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <ReviewExpenseDialog
        expense={selectedExpense}
        open={showReview}
        onOpenChange={setShowReview}
      />

      <ManageCategoriesDialog
        open={showCategories}
        onOpenChange={setShowCategories}
      />

      <ReceiptViewerDialog
        open={showReceiptViewer}
        onOpenChange={setShowReceiptViewer}
        receiptUrls={receiptViewerUrls}
      />
    </div>
  );
};

export default ExpensesManagement;
