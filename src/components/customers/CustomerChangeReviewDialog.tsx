import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, X, Loader2, ArrowLeft, Eye, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Customer } from '@/types/database';

interface PendingRequest {
  id: string;
  operation_type: string;
  customer_id: string | null;
  payload: any;
  requested_by: string;
  requester_name?: string;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer;
  requests: PendingRequest[];
  onProcessed: () => void;
}

// All customer fields with labels
const ALL_FIELDS: { key: string; label: string }[] = [
  { key: 'name', label: 'الاسم' },
  { key: 'name_fr', label: 'الاسم (فرنسي)' },
  { key: 'store_name', label: 'اسم المحل' },
  { key: 'store_name_fr', label: 'اسم المحل (فرنسي)' },
  { key: 'internal_name', label: 'الاسم الداخلي' },
  { key: 'phone', label: 'الهاتف' },
  { key: 'customer_type', label: 'نوع العميل' },
  { key: 'address', label: 'العنوان' },
  { key: 'wilaya', label: 'الولاية' },
  { key: 'sector_id', label: 'القطاع' },
  { key: 'zone_id', label: 'المنطقة' },
  { key: 'location_type', label: 'نوع الموقع' },
  { key: 'latitude', label: 'خط العرض' },
  { key: 'longitude', label: 'خط الطول' },
  { key: 'default_payment_type', label: 'نوع الدفع' },
  { key: 'default_price_subtype', label: 'فئة السعر' },
  { key: 'is_trusted', label: 'موثوق' },
  { key: 'trust_notes', label: 'ملاحظات الثقة' },
  { key: 'is_registered', label: 'عميل مسجل' },
  { key: 'sales_rep_name', label: 'مندوب المبيعات' },
  { key: 'sales_rep_phone', label: 'هاتف المندوب' },
  { key: 'default_delivery_worker_id', label: 'عامل التوصيل' },
  { key: 'status', label: 'الحالة' },
];

const FIELD_LABEL_MAP: Record<string, string> = {};
ALL_FIELDS.forEach(f => { FIELD_LABEL_MAP[f.key] = f.label; });

const IGNORED_FIELDS = ['new_debt_amount', 'debtAmount', 'initial_debt', 'branch_id', 'created_by', 'created_at', 'updated_at', 'id', 'pending_changes', 'changed_fields'];

const GPS_FIELDS = ['latitude', 'longitude'];

const CustomerChangeReviewDialog: React.FC<Props> = ({ open, onOpenChange, customer, requests, onProcessed }) => {
  const { workerId } = useAuth();
  const queryClient = useQueryClient();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);

  const handleApprove = async (request: PendingRequest) => {
    setProcessingId(request.id);
    try {
      if (request.operation_type === 'update' && request.customer_id) {
        const { new_debt_amount, initial_debt, debtAmount, changed_fields, ...updateData } = request.payload;
        const { error: updateError } = await supabase
          .from('customers').update(updateData).eq('id', request.customer_id);
        if (updateError) throw updateError;
      } else if (request.operation_type === 'delete' && request.customer_id) {
        const { error } = await supabase
          .from('customers').delete().eq('id', request.customer_id);
        if (error) throw error;
      }

      await supabase
        .from('customer_approval_requests')
        .update({ status: 'approved', reviewed_by: workerId, reviewed_at: new Date().toISOString() })
        .eq('id', request.id);

      toast.success('تمت الموافقة على الطلب');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      onProcessed();
    } catch (err: any) {
      toast.error('فشل في الموافقة: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (request: PendingRequest) => {
    setProcessingId(request.id);
    try {
      await supabase
        .from('customer_approval_requests')
        .update({ status: 'rejected', reviewed_by: workerId, reviewed_at: new Date().toISOString() })
        .eq('id', request.id);

      toast.info('تم رفض الطلب');
      onProcessed();
    } catch (err: any) {
      toast.error('فشل في رفض الطلب');
    } finally {
      setProcessingId(null);
    }
  };

  const formatValue = (val: any) => {
    if (val === null || val === undefined || val === '') return <span className="text-muted-foreground italic text-[10px]">فارغ</span>;
    if (typeof val === 'boolean') return val ? 'نعم' : 'لا';
    return String(val);
  };

  // Extract changed_fields from payload if available (new format)
  const getChangedFieldsFromPayload = (payload: any): { field: string; old_value: any; new_value: any }[] | null => {
    if (payload?.changed_fields && Array.isArray(payload.changed_fields)) {
      return payload.changed_fields;
    }
    return null;
  };

  const getFieldsComparison = (payload: any) => {
    const changed: { key: string; label: string; oldVal: any; newVal: any }[] = [];
    const unchanged: { key: string; label: string; value: any }[] = [];

    // Use embedded changed_fields if available
    const embeddedChanges = getChangedFieldsFromPayload(payload);
    if (embeddedChanges) {
      for (const cf of embeddedChanges) {
        changed.push({
          key: cf.field,
          label: FIELD_LABEL_MAP[cf.field] || cf.field,
          oldVal: cf.old_value,
          newVal: cf.new_value,
        });
      }
      // Unchanged: fields in payload but not in changed_fields
      const changedKeys = new Set(embeddedChanges.map(c => c.field));
      for (const field of ALL_FIELDS) {
        if (field.key in payload && !changedKeys.has(field.key) && !IGNORED_FIELDS.includes(field.key)) {
          unchanged.push({ key: field.key, label: field.label, value: (customer as any)[field.key] });
        }
      }
      return { changed, unchanged };
    }

    // Fallback: compare with current customer data
    for (const field of ALL_FIELDS) {
      if (!(field.key in payload)) continue;
      const oldVal = (customer as any)[field.key];
      const newVal = payload[field.key];
      if (String(oldVal ?? '') !== String(newVal ?? '')) {
        changed.push({ key: field.key, label: field.label, oldVal, newVal });
      } else {
        unchanged.push({ key: field.key, label: field.label, value: oldVal });
      }
    }
    return { changed, unchanged };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-base">
            طلبات مراجعة: {customer.store_name || customer.name}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-4 p-1">
            {requests.map((request) => {
              const isProcessing = processingId === request.id;
              const isExpanded = expandedRequest === request.id;
              const { changed, unchanged } = request.operation_type === 'update' ? getFieldsComparison(request.payload) : { changed: [], unchanged: [] };
              const hasGpsChange = changed.some(f => GPS_FIELDS.includes(f.key));

              return (
                <div key={request.id} className="border rounded-lg overflow-hidden">
                  {/* Header bar */}
                  <div className="bg-muted/50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={request.operation_type === 'update' ? 'outline' : 'destructive'} className="text-xs">
                          {request.operation_type === 'update' ? 'تعديل' : 'حذف'}
                        </Badge>
                        {hasGpsChange && (
                          <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
                            <MapPin className="w-3 h-3 ml-0.5" />
                            GPS
                          </Badge>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(request.created_at).toLocaleString('ar-DZ')}
                      </span>
                    </div>
                    {request.requester_name && (
                      <p className="text-xs text-muted-foreground">بواسطة: <span className="font-medium text-foreground">{request.requester_name}</span></p>
                    )}

                    {/* Quick summary of changed fields */}
                    {request.operation_type === 'update' && changed.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {changed.map(f => (
                          <Badge
                            key={f.key}
                            variant="secondary"
                            className={`text-[10px] px-1.5 py-0 ${GPS_FIELDS.includes(f.key) ? 'border-amber-500/50 bg-amber-50 dark:bg-amber-950/30' : ''}`}
                          >
                            {f.label}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        className="flex-1 h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => handleApprove(request)}
                        disabled={isProcessing}
                      >
                        {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 ml-1" />}
                        موافقة مباشرة
                      </Button>
                      {request.operation_type === 'update' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setExpandedRequest(isExpanded ? null : request.id)}
                        >
                          <Eye className="w-3 h-3 ml-1" />
                          {isExpanded ? 'إخفاء' : 'معاينة'}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-destructive text-destructive hover:bg-destructive/10"
                        onClick={() => handleReject(request)}
                        disabled={isProcessing}
                      >
                        <X className="w-3 h-3 ml-1" />
                        رفض
                      </Button>
                    </div>
                  </div>

                  {/* Delete warning */}
                  {request.operation_type === 'delete' && (
                    <div className="p-3">
                      <p className="text-xs text-destructive font-medium">⚠️ طلب حذف هذا العميل نهائياً</p>
                    </div>
                  )}

                  {/* Expanded comparison - ALL fields */}
                  {request.operation_type === 'update' && isExpanded && (
                    <div className="p-3 space-y-3 border-t">
                      {/* Changed fields */}
                      {changed.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-bold text-foreground flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                            الحقول المعدّلة ({changed.length})
                          </p>
                          {changed.map((f) => (
                            <div key={f.key} className={`rounded-md p-2 text-xs space-y-1 ${GPS_FIELDS.includes(f.key) ? 'bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800' : 'bg-muted/40'}`}>
                              <p className="font-semibold text-foreground flex items-center gap-1">
                                {GPS_FIELDS.includes(f.key) && <MapPin className="w-3 h-3 text-amber-600" />}
                                {f.label}
                              </p>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-destructive/10 text-destructive rounded px-2 py-1 line-through text-[11px]">
                                  {formatValue(f.oldVal)}
                                </div>
                                <ArrowLeft className="w-3 h-3 text-muted-foreground shrink-0" />
                                <div className="flex-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded px-2 py-1 font-medium text-[11px]">
                                  {formatValue(f.newVal)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {changed.length === 0 && (
                        <p className="text-xs text-muted-foreground italic text-center py-2">لا توجد تغييرات مختلفة عن البيانات الحالية</p>
                      )}

                      {/* Unchanged fields */}
                      {unchanged.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-muted-foreground/30 inline-block" />
                            الحقول بدون تغيير ({unchanged.length})
                          </p>
                          <div className="grid grid-cols-2 gap-1">
                            {unchanged.map((f) => (
                              <div key={f.key} className="bg-muted/20 rounded px-2 py-1 text-[10px]">
                                <span className="text-muted-foreground">{f.label}: </span>
                                <span className="font-medium">{formatValue(f.value)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default CustomerChangeReviewDialog;
