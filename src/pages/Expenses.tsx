import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useExpenses, useDeleteExpense } from '@/hooks/useExpenses';
import { ExpenseWithDetails } from '@/types/expense';
import AddExpenseDialog from '@/components/expenses/AddExpenseDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, Loader2, Receipt, Image, Filter } from 'lucide-react';
import { getCategoryName } from '@/utils/categoryName';
import { formatDate, formatNumber } from '@/utils/formatters';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useIsElementHidden } from '@/hooks/useUIOverrides';
import ReceiptViewerDialog from '@/components/expenses/ReceiptViewerDialog';
import { isAdminRole } from '@/lib/utils';

const Expenses: React.FC = () => {
  const { workerId, role } = useAuth();
  const { language, t, dir } = useLanguage();
  const isManager = isAdminRole(role);

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showAdd, setShowAdd] = useState(false);

  const { data: expenses, isLoading } = useExpenses(isManager ? null : workerId);
  const deleteExpense = useDeleteExpense();

  // UI override checks
  const isAddExpenseHidden = useIsElementHidden('button', 'add_expense');
  const isDeleteExpenseHidden = useIsElementHidden('action', 'delete_expense');

  const filtered = expenses?.filter(e =>
    statusFilter === 'all' ? true : e.status === statusFilter
  );

  return (
    <div className="p-4 space-y-4" dir={dir}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {isManager ? t('expenses.title') : t('expenses.my_expenses')}
        </h1>
        {!isAddExpenseHidden && (
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 me-1" />
            {t('expenses.add')}
          </Button>
        )}
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
          {filtered?.map(expense => (
            <ExpenseCard
              key={expense.id}
              expense={expense}
              isManager={isManager}
              isOwner={expense.worker_id === workerId}
              onDelete={() => deleteExpense.mutate(expense.id)}
              language={language}
              t={t}
              hideDelete={isDeleteExpenseHidden}
            />
          ))}
        </div>
      )}

      <AddExpenseDialog open={showAdd} onOpenChange={setShowAdd} />
    </div>
  );
};

const STATUS_MAP_KEYS: Record<string, { labelKey: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  pending: { labelKey: 'expenses.pending', variant: 'secondary' },
  approved: { labelKey: 'expenses.approved', variant: 'default' },
  rejected: { labelKey: 'expenses.rejected', variant: 'destructive' },
};

const ExpenseCard: React.FC<{
  expense: ExpenseWithDetails;
  isManager: boolean;
  isOwner: boolean;
  onDelete: () => void;
  language: string;
  t: (key: string) => string;
  hideDelete?: boolean;
}> = ({ expense, isManager, isOwner, onDelete, language, t, hideDelete }) => {
  const status = STATUS_MAP_KEYS[expense.status] || STATUS_MAP_KEYS.pending;
  const receiptUrls = expense.receipt_urls?.length ? expense.receipt_urls : (expense.receipt_url ? [expense.receipt_url] : []);
  const [showReceipt, setShowReceipt] = useState(false);

  return (
    <>
      <Card className="p-4 space-y-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-lg">{formatNumber(Number(expense.amount), language as any)} {t('common.currency')}</span>
              <Badge variant={status.variant}>{t(status.labelKey)}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {getCategoryName(expense.category as any, language as any) || t('expenses.uncategorized')}
            </p>
            {isManager && expense.worker && (
              <p className="text-xs text-muted-foreground">
                👤 {expense.worker.full_name}
              </p>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatDate(expense.expense_date, 'dd MMM yyyy', language as any)}
          </div>
        </div>

        {expense.description && (
          <p className="text-sm text-foreground/80">{expense.description}</p>
        )}

        {receiptUrls.length > 0 && (
          <button
            onClick={() => setShowReceipt(true)}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Image className="w-3 h-3" />
            {receiptUrls.length > 1 ? `${t('expenses.has_receipts')} (${receiptUrls.length})` : t('expenses.view_receipt')}
          </button>
        )}

        {expense.status === 'rejected' && expense.rejection_reason && (
          <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">
            {t('expenses.rejection_reason')}: {expense.rejection_reason}
          </p>
        )}

        {expense.reviewer && (
          <p className="text-xs text-muted-foreground">
            {t('expenses.reviewed_by')}: {expense.reviewer.full_name}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          {isOwner && expense.status === 'pending' && !hideDelete && (
            <Button variant="destructive" size="sm" onClick={onDelete}>
              <Trash2 className="w-3 h-3 me-1" />
              {t('common.delete')}
            </Button>
          )}
        </div>
      </Card>

      <ReceiptViewerDialog
        open={showReceipt}
        onOpenChange={setShowReceipt}
        receiptUrls={receiptUrls}
      />
    </>
  );
};

export default Expenses;
