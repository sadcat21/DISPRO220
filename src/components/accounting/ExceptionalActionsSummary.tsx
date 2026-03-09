import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Edit,
  Eye,
  Loader2,
  Printer,
  RotateCcw,
  Trash2,
  User,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

interface ExceptionalActionsSummaryProps {
  workerId: string;
  periodStart: string;
  periodEnd: string;
}

interface ExceptionalAction {
  id: string;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface DetailRow {
  id: string;
  label: string;
  value?: string;
  before?: string;
  after?: string;
}

const EXCEPTIONAL_ACTIONS = ['update', 'delete', 'status_change', 'payment_update', 'reprint'];
const CANCELLED_KEYWORDS = ['cancelled', 'cancel', 'ملغي', 'ملغاة', 'إلغاء'];
const ROUTINE_STATUS_KEYWORDS = [
  'in_progress',
  'delivered',
  'assigned',
  'قيد التوصيل',
  'تم التوصيل',
  'تم التسليم',
];

const toTz = (v: string, isEnd: boolean) => {
  if (v.includes('+') || v.includes('Z')) return v;
  if (v.includes('T')) return `${v}:00+01:00`;
  return isEnd ? `${v}T23:59:59+01:00` : `${v}T00:00:00+01:00`;
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const toDisplayValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return value.toLocaleString('fr-DZ');
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  return String(value);
};

const getPaymentMethodLabel = (value: unknown): string => {
  const v = String(value || '').toLowerCase();
  if (v === 'full') return 'كامل';
  if (v === 'partial') return 'جزئي';
  if (v === 'debt') return 'دين';
  return toDisplayValue(value);
};

const normalizeStatusText = (value: unknown): string => String(value || '').trim().toLowerCase();

const isCancelledStatus = (value: unknown): boolean => {
  const status = normalizeStatusText(value);
  return CANCELLED_KEYWORDS.some((word) => status.includes(word));
};

const isRoutineStatus = (value: unknown): boolean => {
  const status = normalizeStatusText(value);
  return ROUTINE_STATUS_KEYWORDS.some((word) => status.includes(word));
};

const getActionIcon = (action: ExceptionalAction) => {
  const details = action.details || {};
  const isPostDelivery = details?.نوع_التعديل === 'تعديل بعد التوصيل';

  if (action.action_type === 'delete') return <Trash2 className="w-3.5 h-3.5 text-destructive" />;
  if (action.action_type === 'status_change' && isCancelledStatus(details?.الحالة_الجديدة)) {
    return <XCircle className="w-3.5 h-3.5 text-destructive" />;
  }
  if (action.action_type === 'reprint') return <Printer className="w-3.5 h-3.5 text-muted-foreground" />;
  if (isPostDelivery) return <Edit className="w-3.5 h-3.5 text-primary" />;
  if (action.action_type === 'update') return <Edit className="w-3.5 h-3.5 text-accent" />;
  return <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />;
};

const getActionLabel = (action: ExceptionalAction): string => {
  const details = action.details || {};

  if (action.action_type === 'delete' && action.entity_type === 'order') return 'حذف طلبية';
  if (action.action_type === 'delete' && action.entity_type === 'promo') return 'حذف عملية برومو';
  if (action.action_type === 'status_change' && isCancelledStatus(details?.الحالة_الجديدة)) {
    return 'إلغاء طلبية';
  }
  if (action.action_type === 'reprint') return 'إعادة طباعة وصل';
  if (action.action_type === 'payment_update') return 'تعديل طريقة الدفع';
  if (details?.نوع_التعديل === 'تعديل بعد التوصيل') return 'تعديل بعد التوصيل';
  if (action.action_type === 'update' && action.entity_type === 'order') return 'تعديل طلبية';
  if (action.action_type === 'update' && action.entity_type === 'promo') return 'تعديل برومو';
  return `${action.action_type} - ${action.entity_type}`;
};

const getActionColor = (action: ExceptionalAction): string => {
  const details = action.details || {};
  if (action.action_type === 'delete' || (action.action_type === 'status_change' && isCancelledStatus(details?.الحالة_الجديدة))) {
    return 'bg-destructive/10 border-destructive/30';
  }
  if (details?.نوع_التعديل === 'تعديل بعد التوصيل') {
    return 'bg-primary/10 border-primary/30';
  }
  return 'bg-muted/40 border-border';
};

const buildDetailRows = (detailsInput: Record<string, unknown> | null): DetailRow[] => {
  if (!detailsInput) return [];

  const details = asRecord(detailsInput);
  const rows: DetailRow[] = [];

  if (details.العميل) {
    rows.push({ id: 'customer', label: 'العميل', value: toDisplayValue(details.العميل) });
  }

  if (details.طريقة_دفع_الفارق) {
    const amount = details.المبلغ_المدفوع !== undefined
      ? ` (${toDisplayValue(details.المبلغ_المدفوع)} DA)`
      : '';
    rows.push({
      id: 'payment-diff',
      label: 'دفع الفارق',
      value: `${getPaymentMethodLabel(details.طريقة_دفع_الفارق)}${amount}`,
    });
  }

  if (details.الحالة_السابقة !== undefined || details.الحالة_الجديدة !== undefined) {
    rows.push({
      id: 'status-change',
      label: 'الحالة',
      before: toDisplayValue(details.الحالة_السابقة),
      after: toDisplayValue(details.الحالة_الجديدة),
    });
  }

  const changes = details.التغييرات;
  if (Array.isArray(changes)) {
    changes.forEach((change, index) => {
      const c = asRecord(change);
      const productName = toDisplayValue(c.منتج || `منتج ${index + 1}`);
      const operation = String(c.عملية || '').trim();

      const hasQuantityPair = c.كمية_سابقة !== undefined || c.كمية_جديدة !== undefined || c.من !== undefined || c.إلى !== undefined;
      if (hasQuantityPair) {
        const beforeQty = c.كمية_سابقة ?? c.من;
        const afterQty = c.كمية_جديدة ?? c.إلى;
        rows.push({
          id: `qty-${index}`,
          label: `${productName} • ${operation || 'تعديل كمية'}`,
          before: toDisplayValue(beforeQty),
          after: toDisplayValue(afterQty),
        });
      } else if (operation === 'إضافة جديد' && c.كمية !== undefined) {
        rows.push({
          id: `qty-add-${index}`,
          label: `${productName} • إضافة`,
          before: '0',
          after: toDisplayValue(c.كمية),
        });
      } else if (operation === 'حذف') {
        rows.push({
          id: `qty-delete-${index}`,
          label: `${productName} • حذف`,
          before: toDisplayValue(c.كمية_سابقة ?? c.من),
          after: '0',
        });
      }

      if (c.هدية_سابقة !== undefined || c.هدية_جديدة !== undefined) {
        rows.push({
          id: `gift-${index}`,
           label: `${productName} • عرض`,
          before: toDisplayValue(c.هدية_سابقة),
          after: toDisplayValue(c.هدية_جديدة),
        });
      } else if (c.هدية !== undefined) {
        rows.push({
          id: `gift-single-${index}`,
          label: `${productName} • عرض`,
          value: toDisplayValue(c.هدية),
        });
      }
    });
  }

  Object.keys(details)
    .filter((key) => key.endsWith('_سابقة'))
    .forEach((oldKey) => {
      const base = oldKey.replace(/_سابقة$/, '');
      const newKey = `${base}_جديدة`;
      if (!(newKey in details)) return;
      const alreadyAdded = rows.some((row) => row.id === `pair-${base}` || row.label.startsWith(base));
      if (alreadyAdded) return;

      rows.push({
        id: `pair-${base}`,
        label: base,
        before: toDisplayValue(details[oldKey]),
        after: toDisplayValue(details[newKey]),
      });
    });

  return rows;
};

const ExceptionalActionsSummary: React.FC<ExceptionalActionsSummaryProps> = ({
  workerId,
  periodStart,
  periodEnd,
}) => {
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});
  const [detailDialog, setDetailDialog] = useState<{ open: boolean; entityId: string | null; entityType: string }>({ open: false, entityId: null, entityType: '' });
  const [detailData, setDetailData] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchEntityDetails = async (entityId: string, entityType: string) => {
    setLoadingDetail(true);
    setDetailData(null);
    try {
      if (entityType === 'order') {
        const { data } = await supabase
          .from('orders')
          .select('*, customer:customers(name, store_name, phone), items:order_items(quantity, unit_price, total_price, gift_quantity, product:products(name))')
          .eq('id', entityId)
          .single();
        setDetailData(data);
      } else if (entityType === 'receipt') {
        const { data } = await supabase
          .from('receipts')
          .select('*')
          .eq('id', entityId)
          .single();
        setDetailData(data);
      }
    } catch { /* ignore */ }
    setLoadingDetail(false);
  };

  const handleShowDetails = (action: ExceptionalAction) => {
    if (!action.entity_id) return;
    setDetailDialog({ open: true, entityId: action.entity_id, entityType: action.entity_type });
    fetchEntityDetails(action.entity_id, action.entity_type);
  };

  useRealtimeSubscription(
    `session-exceptional-actions-${workerId || 'none'}`,
    [{ table: 'activity_logs', filter: workerId ? `worker_id=eq.${workerId}` : undefined }],
    [['session-exceptional-actions', workerId, periodStart, periodEnd]],
    !!workerId && !!periodStart && !!periodEnd,
  );

  const { data: actions } = useQuery({
    queryKey: ['session-exceptional-actions', workerId, periodStart, periodEnd],
    queryFn: async (): Promise<ExceptionalAction[]> => {
      const startTz = toTz(periodStart, false);
      const endTz = toTz(periodEnd, true);

      const { data, error } = await supabase
        .from('activity_logs')
        .select('id, action_type, entity_type, entity_id, details, created_at')
        .eq('worker_id', workerId)
        .in('action_type', EXCEPTIONAL_ACTIONS)
        .gte('created_at', startTz)
        .lte('created_at', endTz)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const filtered = (data || []).filter((a) => {
        const details = asRecord(a.details);
        if (a.action_type === 'status_change' && isCancelledStatus(details?.الحالة_الجديدة)) return true;
        if (a.action_type === 'status_change' && isRoutineStatus(details?.الحالة_الجديدة)) return false;
        if (['delete', 'update', 'reprint', 'payment_update'].includes(a.action_type)) return true;
        return false;
      }) as ExceptionalAction[];

      // Fetch customer names for order-related actions missing العميل
      const orderIds = filtered
        .filter(a => a.entity_type === 'order' && a.entity_id && !asRecord(a.details)?.العميل)
        .map(a => a.entity_id!)
        .filter((v, i, arr) => arr.indexOf(v) === i);

      if (orderIds.length > 0) {
        const { data: orders } = await supabase
          .from('orders')
          .select('id, customer:customers(name, store_name)')
          .in('id', orderIds);

        const orderCustomerMap = new Map<string, string>();
        (orders || []).forEach((o: any) => {
          const name = o.customer?.store_name || o.customer?.name;
          if (name) orderCustomerMap.set(o.id, name);
        });

        // Inject customer name into details
        filtered.forEach(a => {
          if (a.entity_id && orderCustomerMap.has(a.entity_id) && !asRecord(a.details)?.العميل) {
            a.details = { ...asRecord(a.details), العميل: orderCustomerMap.get(a.entity_id) };
          }
        });
      }

      return filtered;
    },
    enabled: !!workerId && !!periodStart && !!periodEnd,
  });

  const giftReversals = useMemo(
    () =>
      (actions || []).filter((action) => {
        const details = asRecord(action.details);
        if (details?.نوع_التعديل !== 'تعديل بعد التوصيل') return false;
        const changes = details?.التغييرات;
        if (!Array.isArray(changes)) return false;

        return changes.some((change) => {
          const c = asRecord(change);
          return c.هدية_سابقة !== undefined && c.هدية_جديدة !== undefined && c.هدية_سابقة !== c.هدية_جديدة;
        });
      }),
    [actions],
  );

  const isEmpty = !actions || actions.length === 0;

  return (
    <div className="space-y-2" dir="rtl">
      {giftReversals.length > 0 && (
        <Badge className="bg-primary/10 text-primary border border-primary/30 text-[10px]">
          <RotateCcw className="w-3 h-3 ml-1" />
          {giftReversals.length} تراجع هدايا
        </Badge>
      )}

      {isEmpty ? (
        <p className="text-xs text-muted-foreground">لا توجد إجراءات استثنائية خلال هذه الفترة ✓</p>
      ) : (
        <div className="space-y-1.5">
          {actions.map((action) => {
            const rows = buildDetailRows(action.details);
            const isOpen = !!openItems[action.id];

            return (
              <Collapsible
                key={action.id}
                open={isOpen}
                onOpenChange={(open) => setOpenItems((prev) => ({ ...prev, [action.id]: open }))}
              >
                <div className={`rounded-lg border ${getActionColor(action)}`}>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="w-full p-2.5 flex flex-col gap-1 text-right"
                      aria-label={`عرض تفاصيل ${getActionLabel(action)}`}
                    >
                      <div className="flex items-center justify-between gap-2 w-full">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {getActionIcon(action)}
                          <span className="text-xs font-semibold truncate">{getActionLabel(action)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(action.created_at), 'HH:mm', { locale: ar })}
                          </span>
                          {isOpen ? (
                            <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      {/* Customer name shown on collapsed header */}
                      {action.details && (action.details as Record<string, unknown>).العميل && (
                        <span className="text-[11px] text-muted-foreground truncate ps-5 flex items-center gap-1">
                          <User className="w-3 h-3 shrink-0" />
                          {toDisplayValue((action.details as Record<string, unknown>).العميل)}
                        </span>
                      )}
                    </button>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="px-2.5 pb-2.5 pt-1.5 border-t border-border/50 space-y-1.5">
                      {action.entity_id && (
                        <p className="text-[10px] text-muted-foreground font-mono">#{action.entity_id.slice(0, 8)}</p>
                      )}

                      {rows.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">لا توجد تفاصيل إضافية.</p>
                      ) : (
                        rows.map((row) => (
                          <div key={row.id} className="rounded-md bg-background/70 border border-border/60 px-2 py-1.5 space-y-1">
                            <p className="text-[11px] font-medium text-foreground/90">{row.label}</p>

                            {row.before !== undefined && row.after !== undefined ? (
                              <div className="flex items-center gap-1 text-[11px] font-semibold">
                                <span className="text-[hsl(var(--success))]">{row.before}</span>
                                <span className="text-muted-foreground">←</span>
                                <span className="text-destructive">{row.after}</span>
                              </div>
                            ) : (
                              <p className="text-[11px] text-foreground/80">{row.value}</p>
                            )}
                          </div>
                        ))
                      )}

                      {/* Details button */}
                      {action.entity_id && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full h-7 text-[11px] gap-1 mt-1"
                          onClick={() => handleShowDetails(action)}
                        >
                          <Eye className="w-3 h-3" />
                          عرض التفاصيل الكاملة
                        </Button>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      )}

      {/* Entity Details Dialog */}
      <Dialog open={detailDialog.open} onOpenChange={(o) => setDetailDialog(prev => ({ ...prev, open: o }))}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[80vh] flex flex-col p-0 gap-0" dir="rtl">
          <DialogHeader className="px-4 pt-4 pb-2 border-b shrink-0">
            <DialogTitle className="text-sm">
              تفاصيل {detailDialog.entityType === 'order' ? 'الطلبية' : 'الإجراء'}
              {detailDialog.entityId && (
                <span className="text-[10px] text-muted-foreground font-mono ms-2">#{detailDialog.entityId.slice(0, 8)}</span>
              )}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 px-4 py-3">
            {loadingDetail ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : !detailData ? (
              <p className="text-xs text-muted-foreground text-center py-8">لا توجد بيانات</p>
            ) : detailDialog.entityType === 'order' ? (
              <div className="space-y-3">
                {/* Customer info */}
                <div className="rounded-lg bg-muted/40 p-2.5 space-y-1">
                  <p className="text-[11px] font-semibold text-muted-foreground">العميل</p>
                  <p className="text-xs font-medium">{detailData.customer?.store_name || detailData.customer?.name || '—'}</p>
                  {detailData.customer?.phone && <p className="text-[11px] text-muted-foreground">{detailData.customer.phone}</p>}
                </div>

                {/* Order info */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-muted/40 p-2 space-y-0.5">
                    <p className="text-[10px] text-muted-foreground">الحالة</p>
                    <p className="text-xs font-semibold">{detailData.status || '—'}</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2 space-y-0.5">
                    <p className="text-[10px] text-muted-foreground">المبلغ</p>
                    <p className="text-xs font-semibold tabular-nums">{Number(detailData.total_amount || 0).toLocaleString()} د.ج</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2 space-y-0.5">
                    <p className="text-[10px] text-muted-foreground">طريقة الدفع</p>
                    <p className="text-xs font-semibold">{detailData.payment_type === 'full' ? 'كامل' : detailData.payment_type === 'partial' ? 'جزئي' : detailData.payment_type === 'debt' ? 'دين' : detailData.payment_type || '—'}</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2 space-y-0.5">
                    <p className="text-[10px] text-muted-foreground">التاريخ</p>
                    <p className="text-xs font-semibold">{detailData.created_at ? format(new Date(detailData.created_at), 'MM/dd HH:mm') : '—'}</p>
                  </div>
                  {detailData.paid_amount != null && (
                    <div className="rounded-lg bg-muted/40 p-2 space-y-0.5">
                      <p className="text-[10px] text-muted-foreground">المبلغ المدفوع</p>
                      <p className="text-xs font-semibold tabular-nums">{Number(detailData.paid_amount).toLocaleString()} د.ج</p>
                    </div>
                  )}
                  {detailData.notes && (
                    <div className="rounded-lg bg-muted/40 p-2 space-y-0.5 col-span-2">
                      <p className="text-[10px] text-muted-foreground">ملاحظات</p>
                      <p className="text-xs">{detailData.notes}</p>
                    </div>
                  )}
                </div>

                {/* Products */}
                {detailData.items && detailData.items.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-muted-foreground">المنتجات ({detailData.items.length})</p>
                    <div className="space-y-1">
                      {detailData.items.map((item: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between rounded-lg bg-muted/30 border border-border/40 px-2.5 py-1.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium truncate">{item.product?.name || '—'}</p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <span>الكمية: {item.quantity}</span>
                              {item.gift_quantity > 0 && <span className="text-primary">هدية: {item.gift_quantity}</span>}
                              {item.unit_price > 0 && <span>{Number(item.unit_price).toLocaleString()} د.ج/وحدة</span>}
                            </div>
                          </div>
                          <span className="text-[11px] font-bold tabular-nums shrink-0 ms-2">
                            {Number(item.total_price || 0).toLocaleString()} د.ج
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {Object.entries(detailData || {}).filter(([k]) => !['id', 'created_at', 'updated_at'].includes(k)).map(([key, val]) => (
                  <div key={key} className="rounded-lg bg-muted/40 p-2 space-y-0.5">
                    <p className="text-[10px] text-muted-foreground">{key}</p>
                    <p className="text-xs font-medium">{typeof val === 'object' ? JSON.stringify(val) : String(val ?? '—')}</p>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExceptionalActionsSummary;
