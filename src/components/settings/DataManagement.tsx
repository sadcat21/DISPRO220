import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Trash2, Loader2, AlertTriangle, Database } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';

interface DataCategory {
  id: string;
  label: string;
  tables: string[];
  description: string;
  order: number; // deletion order (higher = delete first due to FK constraints)
}

const DATA_CATEGORIES: DataCategory[] = [
  { id: 'promos', label: 'العمليات (البروموهات)', tables: ['promos'], description: 'جميع عمليات البيع والتوزيع', order: 10 },
  { id: 'orders', label: 'الطلبات والتوصيلات', tables: ['product_shortage_tracking', 'order_items', 'orders'], description: 'جميع الطلبات وعناصرها وتتبع النقص المرتبط', order: 9 },
  { id: 'debts', label: 'الديون والتحصيلات', tables: ['debt_payments', 'debt_collections', 'customer_debts'], description: 'ديون العملاء وسجلات التحصيل', order: 8 },
  { id: 'expenses', label: 'المصاريف', tables: ['expenses'], description: 'جميع المصاريف المسجلة', order: 7 },
  { id: 'accounting', label: 'جلسات المحاسبة', tables: ['accounting_session_items', 'accounting_sessions'], description: 'جلسات المحاسبة وتفاصيلها', order: 6 },
  { id: 'treasury', label: 'خزينة المدير', tables: ['handover_items', 'manager_handovers', 'manager_treasury'], description: 'المستلمات والتسليمات وأرصدة الخزينة', order: 5.5 },
  { id: 'liability', label: 'ذمة العامل', tables: ['worker_liability_adjustments'], description: 'التعديلات اليدوية على ذمم العمال', order: 5.4 },
  { id: 'coin_exchange', label: 'تحويلات العملات النقدية', tables: ['coin_exchange_returns', 'coin_exchange_tasks'], description: 'مهام تحويل العملات المعدنية وإرجاعاتها', order: 5.3 },
  { id: 'offers', label: 'العروض', tables: ['product_offer_tiers', 'product_offers'], description: 'عروض المنتجات', order: 5 },
  { id: 'invoices', label: 'طلبات الفواتير', tables: ['manual_invoice_requests'], description: 'طلبات الفواتير اليدوية والمرسلة عبر واتساب', order: 4.5 },
  { id: 'logs', label: 'سجل الأحداث', tables: ['activity_logs'], description: 'سجلات النشاط والأحداث', order: 4 },
  { id: 'stock', label: 'حركات المخزون', tables: ['stock_movements', 'worker_stock', 'warehouse_stock'], description: 'جميع حركات وأرصدة المخزون', order: 3 },
  { id: 'customers', label: 'العملاء', tables: ['customer_special_prices', 'customer_accounts', 'customers'], description: 'جميع بيانات العملاء وأسعارهم الخاصة', order: 2 },
  { id: 'products', label: 'المنتجات', tables: ['quantity_price_tiers', 'product_pricing_groups', 'products'], description: 'جميع المنتجات وأسعارها', order: 1 },
  { id: 'workers', label: 'العمال', tables: ['navbar_preferences', 'worker_roles'], description: 'بيانات العمال (ما عدا الحساب الحالي)', order: 0 },
];

const DataManagement: React.FC = () => {
  const { t } = useLanguage();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionProgress, setDeletionProgress] = useState('');

  const toggleCategory = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === DATA_CATEGORIES.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(DATA_CATEGORIES.map(c => c.id)));
    }
  };

  const nullifyFkReferences = async (selectedIds: Set<string>) => {
    // Before deleting orders, nullify order_id in customer_debts and delete stock_movements referencing orders
    if (selectedIds.has('orders')) {
      setDeletionProgress('جاري تنظيف المراجع المرتبطة بالطلبات...');
      
      // Nullify order_id in customer_debts (if debts category not selected - if selected they'll be deleted anyway)
      if (!selectedIds.has('debts')) {
        await supabase
          .from('customer_debts')
          .update({ order_id: null } as any)
          .neq('id', '00000000-0000-0000-0000-000000000000');
      }

      // Delete stock_movements that reference orders (if stock not selected)
      if (!selectedIds.has('stock')) {
        await supabase
          .from('stock_movements' as any)
          .delete()
          .not('order_id', 'is', null);
      }
    }
  };

  const deleteFromTable = async (table: string): Promise<{ success: boolean; error?: string }> => {
    if (table === 'worker_roles') return { success: true };

    const { error, count } = await supabase
      .from(table as any)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
      console.error(`Error deleting from ${table}:`, error);
      return { success: false, error: error.message };
    }

    // Verify deletion actually worked
    const { count: remaining } = await supabase
      .from(table as any)
      .select('id', { count: 'exact', head: true });

    if (remaining && remaining > 0) {
      console.warn(`${table}: ${remaining} rows remain after delete (RLS may be blocking)`);
      return { success: false, error: `لم يتم الحذف بالكامل - بقي ${remaining} سجل (قد تكون صلاحيات RLS تمنع الحذف)` };
    }

    return { success: true };
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;

    setIsDeleting(true);
    setShowConfirm(false);

    try {
      const categoriesToDelete = DATA_CATEGORIES
        .filter(c => selected.has(c.id))
        .sort((a, b) => b.order - a.order);

      // First, handle FK references
      await nullifyFkReferences(selected);

      let hasErrors = false;
      const errors: string[] = [];

      for (const category of categoriesToDelete) {
        setDeletionProgress(`جاري حذف: ${category.label}...`);
        
        for (const table of category.tables) {
          const result = await deleteFromTable(table);
          if (!result.success) {
            hasErrors = true;
            errors.push(`${category.label} (${table}): ${result.error}`);
          }
        }
      }

      if (!hasErrors) {
        toast.success(`تم حذف البيانات المحددة بنجاح (${selected.size} فئة)`);
      } else {
        errors.forEach(e => toast.error(e));
        toast.warning('لم يتم حذف بعض البيانات - راجع الأخطاء أعلاه');
      }
      setSelected(new Set());
    } catch (error: any) {
      console.error('Error during bulk deletion:', error);
      toast.error('حدث خطأ أثناء حذف البيانات: ' + (error.message || ''));
    } finally {
      setIsDeleting(false);
      setDeletionProgress('');
    }
  };

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-destructive">
          <Database className="w-5 h-5" />
          إدارة البيانات
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-destructive font-medium">
              تحذير: حذف البيانات لا يمكن التراجع عنه! تأكد من أخذ نسخة احتياطية قبل الحذف.
            </p>
          </div>
        </div>

        {/* Select All */}
        <div className="flex items-center justify-between pb-2 border-b">
          <Button
            variant="outline"
            size="sm"
            onClick={selectAll}
            className="text-xs"
          >
            {selected.size === DATA_CATEGORIES.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
          </Button>
          <span className="text-xs text-muted-foreground">
            {selected.size} / {DATA_CATEGORIES.length} محدد
          </span>
        </div>

        {/* Categories */}
        <div className="space-y-2">
          {DATA_CATEGORIES.map((category) => (
            <div
              key={category.id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selected.has(category.id) 
                  ? 'border-destructive/50 bg-destructive/5' 
                  : 'border-border hover:bg-muted/50'
              }`}
              onClick={() => toggleCategory(category.id)}
            >
              <Checkbox
                checked={selected.has(category.id)}
                onCheckedChange={() => toggleCategory(category.id)}
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{category.label}</p>
                <p className="text-xs text-muted-foreground">{category.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Delete Button */}
        <Button
          variant="destructive"
          className="w-full"
          size="lg"
          disabled={selected.size === 0 || isDeleting}
          onClick={() => setShowConfirm(true)}
        >
          {isDeleting ? (
            <>
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              {deletionProgress || 'جاري الحذف...'}
            </>
          ) : (
            <>
              <Trash2 className="w-4 h-4 ml-2" />
              حذف البيانات المحددة ({selected.size})
            </>
          )}
        </Button>

        {/* Confirmation Dialog */}
        <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                تأكيد حذف البيانات
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p className="font-bold text-destructive">
                  أنت على وشك حذف البيانات التالية نهائياً:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {DATA_CATEGORIES.filter(c => selected.has(c.id)).map(c => (
                    <li key={c.id}>{c.label}</li>
                  ))}
                </ul>
                <p className="font-bold mt-3">
                  هذا الإجراء لا يمكن التراجع عنه! هل أنت متأكد؟
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleDelete}
              >
                <Trash2 className="w-4 h-4 ml-2" />
                نعم، احذف نهائياً
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
};

export default DataManagement;
