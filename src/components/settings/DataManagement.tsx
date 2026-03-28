import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Trash2, Loader2, AlertTriangle, Database, Lock, Link2, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';

interface DataCategory {
  id: string;
  label: string;
  tables: string[];
  description: string;
  order: number;
  group: 'sales' | 'finance' | 'stock' | 'system' | 'master';
}

// Related data dependencies map: category -> categories that should also be deleted
const RELATED_DATA: Record<string, { ids: string[]; reason: string }> = {
  orders: { ids: ['debts', 'credits', 'doc_collections', 'treasury', 'accounting', 'loading'], reason: 'الطلبات مرتبطة بالديون والأرصدة والخزينة والمحاسبة' },
  debts: { ids: ['treasury'], reason: 'الديون تؤثر على أرصدة الخزينة' },
  accounting: { ids: ['treasury', 'liability'], reason: 'جلسات المحاسبة مرتبطة بالخزينة وذمم العمال' },
  treasury: { ids: ['liability'], reason: 'الخزينة مرتبطة بذمم العمال' },
  loading: { ids: ['stock'], reason: 'جلسات الشحن تؤثر على المخزون' },
  customers: { ids: ['orders', 'debts', 'credits', 'doc_collections', 'approval_requests'], reason: 'العملاء مرتبطون بالطلبات والديون' },
  products: { ids: ['orders', 'stock', 'offers', 'loading', 'stock_receipts'], reason: 'المنتجات مرتبطة بالطلبات والمخزون' },
  promos: { ids: ['orders'], reason: 'البروموهات تحتوي على طلبات' },
};

const GROUP_LABELS: Record<string, { label: string; emoji: string }> = {
  sales: { label: 'المبيعات والتوصيل', emoji: '🛒' },
  finance: { label: 'المالية والمحاسبة', emoji: '💰' },
  stock: { label: 'المخزون والشحن', emoji: '📦' },
  system: { label: 'النظام والسجلات', emoji: '⚙️' },
  master: { label: 'البيانات الأساسية', emoji: '🔒' },
};

const DATA_CATEGORIES: DataCategory[] = [
  // Sales
  { id: 'promos', label: 'العمليات (البروموهات)', tables: ['promos'], description: 'جميع عمليات البيع والتوزيع', order: 12, group: 'sales' },
  { id: 'orders', label: 'الطلبات والتوصيلات', tables: ['product_shortage_tracking', 'order_items', 'orders'], description: 'جميع الطلبات وعناصرها', order: 11, group: 'sales' },
  { id: 'doc_collections', label: 'تحصيل الوثائق', tables: ['document_collections'], description: 'شيكات، تحويلات...', order: 10.5, group: 'sales' },
  { id: 'delivery_routes', label: 'مسارات التوصيل', tables: ['delivery_route_sectors', 'delivery_routes'], description: 'مسارات التوصيل وقطاعاتها', order: 4.2, group: 'sales' },
  // Finance
  { id: 'debts', label: 'الديون والتحصيلات', tables: ['debt_payments', 'debt_collections', 'customer_debts'], description: 'ديون العملاء وسجلات التحصيل', order: 10, group: 'finance' },
  { id: 'credits', label: 'أرصدة العملاء (المرتجعات)', tables: ['customer_credits'], description: 'أرصدة العملاء والمرتجعات', order: 9.5, group: 'finance' },
  { id: 'expenses', label: 'المصاريف', tables: ['expenses'], description: 'جميع المصاريف المسجلة', order: 9, group: 'finance' },
  { id: 'accounting', label: 'جلسات المحاسبة', tables: ['accounting_session_items', 'accounting_sessions'], description: 'جلسات المحاسبة وتفاصيلها', order: 8, group: 'finance' },
  { id: 'treasury', label: 'خزينة المدير', tables: ['handover_items', 'manager_handovers', 'manager_treasury'], description: 'المستلمات والتسليمات', order: 7, group: 'finance' },
  { id: 'liability', label: 'ذمة العامل', tables: ['worker_liability_adjustments'], description: 'التعديلات اليدوية على ذمم العمال', order: 6.5, group: 'finance' },
  { id: 'coin_exchange', label: 'تحويلات العملات النقدية', tables: ['coin_exchange_returns', 'coin_exchange_tasks'], description: 'مهام تحويل العملات المعدنية', order: 6, group: 'finance' },
  { id: 'invoices', label: 'طلبات الفواتير', tables: ['manual_invoice_requests'], description: 'طلبات الفواتير اليدوية', order: 5, group: 'finance' },
  // Stock
  { id: 'loading', label: 'جلسات الشحن والتفريغ', tables: ['loading_session_items', 'loading_sessions'], description: 'تحميل وتفريغ الشاحنات', order: 7.5, group: 'stock' },
  { id: 'stock_receipts', label: 'أوامر الاستلام', tables: ['stock_receipt_items', 'stock_receipts'], description: 'أوامر استلام المخزون', order: 3.5, group: 'stock' },
  { id: 'stock', label: 'حركات المخزون', tables: ['stock_discrepancies', 'stock_movements', 'worker_stock', 'warehouse_stock'], description: 'جميع حركات وأرصدة المخزون', order: 3, group: 'stock' },
  // System
  { id: 'offers', label: 'العروض', tables: ['product_offer_tiers', 'product_offers'], description: 'عروض المنتجات', order: 5.5, group: 'system' },
  { id: 'approval_requests', label: 'طلبات الموافقة', tables: ['customer_approval_requests'], description: 'طلبات إضافة/تعديل العملاء', order: 4.5, group: 'system' },
  { id: 'logs', label: 'سجل الأحداث', tables: ['activity_logs'], description: 'سجلات النشاط', order: 4, group: 'system' },
  // Master
  { id: 'customers', label: 'العملاء', tables: ['customer_special_prices', 'customer_accounts', 'customers'], description: 'جميع بيانات العملاء', order: 2, group: 'master' },
  { id: 'products', label: 'المنتجات', tables: ['quantity_price_tiers', 'product_pricing_groups', 'products'], description: 'جميع المنتجات وأسعارها', order: 1, group: 'master' },
  { id: 'workers', label: 'العمال', tables: ['navbar_preferences', 'worker_roles'], description: 'بيانات العمال (ما عدا الحالي)', order: 0, group: 'master' },
];

const PROTECTED_CATEGORIES = ['customers', 'products', 'workers', 'offers'];
const DELETION_PASSWORD = 'hs0909sm';

const DataManagement: React.FC = () => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [showRelated, setShowRelated] = useState(false);
  const [relatedSuggestions, setRelatedSuggestions] = useState<{ id: string; reason: string }[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionProgress, setDeletionProgress] = useState('');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const needsPassword = PROTECTED_CATEGORIES.some(id => selected.has(id));

  const toggleCategory = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === DATA_CATEGORIES.length) setSelected(new Set());
    else setSelected(new Set(DATA_CATEGORIES.map(c => c.id)));
  };

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const selectGroup = (group: string) => {
    const groupIds = DATA_CATEGORIES.filter(c => c.group === group).map(c => c.id);
    const allSelected = groupIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      groupIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  // Compute related suggestions for selected categories
  const computeRelated = (): { id: string; reason: string }[] => {
    const suggestions: Map<string, string> = new Map();
    selected.forEach(id => {
      const rel = RELATED_DATA[id];
      if (rel) {
        rel.ids.forEach(relId => {
          if (!selected.has(relId)) {
            suggestions.set(relId, rel.reason);
          }
        });
      }
    });
    return Array.from(suggestions.entries()).map(([id, reason]) => ({ id, reason }));
  };

  const handleDeleteClick = () => {
    if (selected.size === 0) return;
    const related = computeRelated();
    if (related.length > 0) {
      setRelatedSuggestions(related);
      setShowRelated(true);
    } else {
      setShowConfirm(true);
    }
  };

  const handleRelatedConfirm = (addRelated: Set<string>) => {
    setSelected(prev => {
      const next = new Set(prev);
      addRelated.forEach(id => next.add(id));
      return next;
    });
    setShowRelated(false);
    // Use setTimeout to let state update
    setTimeout(() => setShowConfirm(true), 100);
  };

  const handleRelatedSkip = () => {
    setShowRelated(false);
    setTimeout(() => setShowConfirm(true), 100);
  };

  const nullifyFkReferences = async (selectedIds: Set<string>) => {
    if (selectedIds.has('accounting')) {
      setDeletionProgress('جاري تنظيف المراجع المرتبطة بجلسات المحاسبة...');
      const { error: wdpErr } = await supabase.from('worker_debt_payments' as any).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (wdpErr) console.error('Error deleting worker_debt_payments:', wdpErr);
      const { error: wdErr } = await supabase.from('worker_debts' as any).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (wdErr) {
        console.error('Error deleting worker_debts:', wdErr);
        await supabase.from('worker_debts' as any).update({ session_id: null }).neq('id', '00000000-0000-0000-0000-000000000000');
      }
      if (!selectedIds.has('treasury')) {
        await supabase.from('manager_treasury').update({ session_id: null } as any).neq('id', '00000000-0000-0000-0000-000000000000');
      }
      await supabase.from('worker_liability_adjustments' as any).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    }
    if (selectedIds.has('orders')) {
      setDeletionProgress('جاري تنظيف المراجع المرتبطة بالطلبات...');
      if (!selectedIds.has('debts')) {
        await supabase.from('customer_debts').update({ order_id: null } as any).neq('id', '00000000-0000-0000-0000-000000000000');
      }
      if (!selectedIds.has('stock')) {
        await supabase.from('stock_movements' as any).delete().not('order_id', 'is', null);
      }
    }
  };

  const deleteFromTable = async (table: string): Promise<{ success: boolean; error?: string }> => {
    if (table === 'worker_roles') return { success: true };
    const { error } = await supabase.from(table as any).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      console.error(`Error deleting from ${table}:`, error);
      return { success: false, error: error.message };
    }
    const { count: remaining } = await supabase.from(table as any).select('id', { count: 'exact', head: true });
    if (remaining && remaining > 0) {
      return { success: false, error: `لم يتم الحذف بالكامل - بقي ${remaining} سجل` };
    }
    return { success: true };
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    if (needsPassword && password !== DELETION_PASSWORD) {
      setPasswordError('كلمة السر غير صحيحة');
      return;
    }
    setIsDeleting(true);
    setShowConfirm(false);
    setPassword('');
    setPasswordError('');
    try {
      const categoriesToDelete = DATA_CATEGORIES.filter(c => selected.has(c.id)).sort((a, b) => b.order - a.order);
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
      await queryClient.invalidateQueries();
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

  const grouped = useMemo(() => {
    const groups: Record<string, DataCategory[]> = {};
    DATA_CATEGORIES.forEach(c => {
      if (!groups[c.group]) groups[c.group] = [];
      groups[c.group].push(c);
    });
    return groups;
  }, []);

  const groupOrder = ['sales', 'finance', 'stock', 'system', 'master'];

  return (
    <Card className="border-destructive/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg text-destructive">
          <Database className="w-5 h-5" />
          إدارة البيانات
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-xs">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-destructive font-medium">
              تحذير: حذف البيانات لا يمكن التراجع عنه! تأكد من أخذ نسخة احتياطية.
            </p>
          </div>
        </div>

        {/* Select All + Counter */}
        <div className="flex items-center justify-between py-1.5">
          <Button variant="outline" size="sm" onClick={selectAll} className="text-xs h-7 px-2">
            {selected.size === DATA_CATEGORIES.length ? 'إلغاء الكل' : 'تحديد الكل'}
          </Button>
          <Badge variant={selected.size > 0 ? 'destructive' : 'secondary'} className="text-xs">
            {selected.size} / {DATA_CATEGORIES.length}
          </Badge>
        </div>

        {/* Grouped Categories */}
        <div className="space-y-2">
          {groupOrder.map(groupKey => {
            const items = grouped[groupKey];
            if (!items) return null;
            const meta = GROUP_LABELS[groupKey];
            const isCollapsed = collapsedGroups.has(groupKey);
            const groupSelectedCount = items.filter(c => selected.has(c.id)).length;

            return (
              <div key={groupKey} className="rounded-lg border border-border/60 overflow-hidden">
                {/* Group Header */}
                <div
                  className="flex items-center justify-between px-3 py-2 bg-muted/40 cursor-pointer hover:bg-muted/60 transition-colors"
                  onClick={() => toggleGroup(groupKey)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{meta.emoji}</span>
                    <span className="text-sm font-semibold">{meta.label}</span>
                    {groupSelectedCount > 0 && (
                      <Badge variant="destructive" className="text-[10px] h-4 px-1.5">{groupSelectedCount}</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={(e) => { e.stopPropagation(); selectGroup(groupKey); }}
                    >
                      {groupSelectedCount === items.length ? 'إلغاء' : 'تحديد'}
                    </Button>
                    {isCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>

                {/* Group Items */}
                {!isCollapsed && (
                  <div className="divide-y divide-border/40">
                    {items.map(category => (
                      <div
                        key={category.id}
                        className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors ${
                          selected.has(category.id) ? 'bg-destructive/5' : 'hover:bg-muted/30'
                        }`}
                        onClick={() => toggleCategory(category.id)}
                      >
                        <Checkbox checked={selected.has(category.id)} onCheckedChange={() => toggleCategory(category.id)} className="shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-tight">{category.label}</p>
                          <p className="text-[11px] text-muted-foreground leading-tight">{category.description}</p>
                        </div>
                        {PROTECTED_CATEGORIES.includes(category.id) && <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Delete Button */}
        <Button variant="destructive" className="w-full" size="lg" disabled={selected.size === 0 || isDeleting} onClick={handleDeleteClick}>
          {isDeleting ? (
            <><Loader2 className="w-4 h-4 ml-2 animate-spin" />{deletionProgress || 'جاري الحذف...'}</>
          ) : (
            <><Trash2 className="w-4 h-4 ml-2" />حذف البيانات المحددة ({selected.size})</>
          )}
        </Button>

        {/* Related Data Suggestion Dialog */}
        <RelatedDataDialog
          open={showRelated}
          onOpenChange={setShowRelated}
          suggestions={relatedSuggestions}
          onConfirm={handleRelatedConfirm}
          onSkip={handleRelatedSkip}
        />

        {/* Confirmation Dialog */}
        <AlertDialog open={showConfirm} onOpenChange={(open) => { setShowConfirm(open); if (!open) { setPassword(''); setPasswordError(''); } }}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                تأكيد حذف البيانات
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p className="font-bold text-destructive">أنت على وشك حذف البيانات التالية نهائياً:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {DATA_CATEGORIES.filter(c => selected.has(c.id)).map(c => (
                      <li key={c.id}>{c.label}</li>
                    ))}
                  </ul>
                  {needsPassword && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Lock className="w-4 h-4" />
                        <span>أدخل كلمة السر لتأكيد حذف العملاء/المنتجات:</span>
                      </div>
                      <Input type="password" placeholder="كلمة السر" value={password} onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }} className={passwordError ? 'border-destructive' : ''} />
                      {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
                    </div>
                  )}
                  <p className="font-bold mt-3">هذا الإجراء لا يمكن التراجع عنه! هل أنت متأكد؟</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <Button variant="destructive" onClick={handleDelete}>
                <Trash2 className="w-4 h-4 ml-2" />
                نعم، احذف نهائياً
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
};

// Sub-component: Related data suggestion dialog
const RelatedDataDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  suggestions: { id: string; reason: string }[];
  onConfirm: (selected: Set<string>) => void;
  onSkip: () => void;
}> = ({ open, onOpenChange, suggestions, onConfirm, onSkip }) => {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // Auto-select all on open
  React.useEffect(() => {
    if (open) setChecked(new Set(suggestions.map(s => s.id)));
  }, [open, suggestions]);

  const toggle = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getCategoryLabel = (id: string) => DATA_CATEGORIES.find(c => c.id === id)?.label || id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="w-5 h-5 text-amber-500" />
            بيانات مرتبطة يُنصح بحذفها
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground mb-3">
            البيانات التالية مرتبطة بما اخترته. حذفها معاً يضمن تناسق البيانات.
          </p>
          {suggestions.map(s => (
            <div
              key={s.id}
              className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                checked.has(s.id) ? 'border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20' : 'border-border hover:bg-muted/30'
              }`}
              onClick={() => toggle(s.id)}
            >
              <Checkbox checked={checked.has(s.id)} onCheckedChange={() => toggle(s.id)} className="mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{getCategoryLabel(s.id)}</p>
                <p className="text-[11px] text-muted-foreground">{s.reason}</p>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" size="sm" onClick={onSkip}>
            تخطي وحذف بدونها
          </Button>
          <Button variant="default" size="sm" onClick={() => onConfirm(checked)} disabled={checked.size === 0}>
            إضافة وحذف الكل ({checked.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DataManagement;
