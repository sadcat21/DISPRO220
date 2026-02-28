import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileCheck2, Truck, Clock, ShieldCheck, ShieldAlert, AlertCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface DocumentCollectionsSummaryProps {
  workerId: string;
  periodStart: string;
  periodEnd: string;
}

interface CollectedDoc {
  orderId: string;
  customerName: string;
  documentType: string;
  orderTotal: number;
  source: 'delivery' | 'pending_collection';
  documentStatus: string | null;
  verification: {
    checkNumber?: string;
    checkDate?: string;
    checkBank?: string;
    receiptNumber?: string;
    transferReference?: string;
    verified?: boolean;
    verifiedFields?: number;
    totalFields?: number;
  };
}

const fmt = (n: number) => n.toLocaleString();
const extractDate = (v: string): string => v.replace('T', ' ').substring(0, 10);

const docTypeLabel = (t: string) => {
  const map: Record<string, string> = { check: 'شيك', receipt: 'وصل فيرمو', transfer: 'وصل فيرسمو', versement: 'وصل فيرسمو', virement: 'تحويل بنكي' };
  return map[t] || t;
};

const docTypeColor = (t: string) => {
  switch (t) {
    case 'check': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    case 'receipt': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
    default: return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
  }
};

const docStatusLabel = (s: string | null) => {
  const map: Record<string, string> = { none: 'غير مطلوب', pending: 'معلق', collected: 'تم الاستلام', verified: 'تم التحقق' };
  return map[s || 'none'] || s || 'غير محدد';
};

const parseVerification = (v: any, docType: string) => {
  if (!v || typeof v !== 'object') return { verifiedFields: 0, totalFields: 0 };
  
  let totalFields = 0;
  let verifiedFields = 0;

  const checkField = (val: any) => {
    totalFields++;
    if (val && val !== '' && val !== null && val !== undefined) verifiedFields++;
  };

  if (docType === 'check') {
    checkField(v.check_number || v.checkNumber);
    checkField(v.check_date || v.checkDate);
    checkField(v.check_bank || v.checkBank);
    checkField(v.check_amount || v.checkAmount || v.amount);
  } else if (docType === 'receipt' || docType === 'versement') {
    checkField(v.receipt_number || v.receiptNumber);
    checkField(v.receipt_amount || v.amount);
  } else if (docType === 'transfer' || docType === 'virement') {
    checkField(v.transfer_reference || v.transferReference);
    checkField(v.transfer_amount || v.amount);
  }

  return {
    checkNumber: v.check_number || v.checkNumber,
    checkDate: v.check_date || v.checkDate,
    checkBank: v.check_bank || v.checkBank,
    receiptNumber: v.receipt_number || v.receiptNumber,
    transferReference: v.transfer_reference || v.transferReference,
    verified: totalFields > 0 && verifiedFields === totalFields,
    verifiedFields,
    totalFields,
  };
};

const DocumentCollectionsSummary: React.FC<DocumentCollectionsSummaryProps> = ({ workerId, periodStart, periodEnd }) => {
  const { data: docs, isLoading } = useQuery({
    queryKey: ['session-document-collections', workerId, periodStart, periodEnd],
    queryFn: async () => {
      const startDate = extractDate(periodStart);
      const endDate = extractDate(periodEnd);
      const startTz = startDate + 'T00:00:00+01:00';
      const endTz = endDate + 'T23:59:59+01:00';

      const result: CollectedDoc[] = [];

      // 1) Pending documents that were actually collected (source of truth)
      const { data: pendingCollections } = await supabase
        .from('document_collections')
        .select(`id, action, status, collection_date, order_id, order:orders!document_collections_order_id_fkey(id, total_amount, invoice_payment_method, document_status, document_verification, customer:customers!orders_customer_id_fkey(name))`)
        .eq('worker_id', workerId)
        .eq('action', 'collected')
        .neq('status', 'rejected')
        .gte('collection_date', startDate)
        .lte('collection_date', endDate);

      for (const c of (pendingCollections || [])) {
        const order = c.order as any;
        if (!order) continue;
        const docType = order.invoice_payment_method || 'check';
        result.push({
          orderId: order.id,
          customerName: order.customer?.name || 'غير معروف',
          documentType: docType,
          orderTotal: Number(order.total_amount || 0),
          source: 'pending_collection',
          documentStatus: order.document_status,
          verification: parseVerification(order.document_verification, docType),
        });
      }

      const { data: deliveryOrders } = await supabase
        .from('orders')
        .select(`id, total_amount, invoice_payment_method, document_status, document_verification, updated_at, customer:customers!orders_customer_id_fkey(name)`)
        .eq('assigned_worker_id', workerId)
        .eq('status', 'delivered')
        .in('invoice_payment_method', ['check', 'receipt', 'transfer', 'versement', 'virement'])
        .in('document_status', ['received', 'verified'])
        .gte('updated_at', startTz)
        .lte('updated_at', endTz);

      for (const o of (deliveryOrders || [])) {
        
        const docType = o.invoice_payment_method || 'check';
        result.push({
          orderId: o.id,
          customerName: (o.customer as any)?.name || 'غير معروف',
          documentType: docType,
          orderTotal: Number(o.total_amount || 0),
          source: 'delivery',
          documentStatus: o.document_status,
          verification: parseVerification(o.document_verification, docType),
        });
      }

      return result;
    },
  });

  if (isLoading) return <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  if (!docs || docs.length === 0) return <p className="text-xs text-muted-foreground text-center py-3">لا توجد مستندات محصلة في هذه الفترة</p>;

  const deliveryDocs = docs.filter(d => d.source === 'delivery');
  const pendingDocs = docs.filter(d => d.source === 'pending_collection');
  const totalAmount = docs.reduce((s, d) => s + d.orderTotal, 0);

  const renderDocCard = (doc: CollectedDoc) => {
    const v = doc.verification;
    const pct = v.totalFields > 0 ? Math.round((v.verifiedFields! / v.totalFields) * 100) : 0;

    return (
      <div key={doc.orderId} className="border rounded-lg p-3 space-y-2">
        {/* Header: customer + amount */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileCheck2 className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">{doc.customerName}</p>
              <p className="text-[10px] text-muted-foreground">#{doc.orderId.slice(0, 8)}</p>
            </div>
          </div>
          <div className="text-end">
            <span className="font-bold text-sm">{fmt(doc.orderTotal)} DA</span>
            <div className="mt-0.5">
              <Badge className={`${docTypeColor(doc.documentType)} text-[9px] px-1.5 py-0`}>
                {docTypeLabel(doc.documentType)}
              </Badge>
            </div>
          </div>
        </div>

        {/* Verification details */}
        {doc.documentType === 'check' && (
          <div className="grid grid-cols-3 gap-1.5 text-[10px]">
            <div className="bg-muted/50 rounded p-1.5 text-center">
              <p className="text-muted-foreground mb-0.5">رقم الشيك</p>
              <p className="font-bold">{v.checkNumber || '—'}</p>
            </div>
            <div className="bg-muted/50 rounded p-1.5 text-center">
              <p className="text-muted-foreground mb-0.5">تاريخ الشيك</p>
              <p className="font-bold">{v.checkDate || '—'}</p>
            </div>
            <div className="bg-muted/50 rounded p-1.5 text-center">
              <p className="text-muted-foreground mb-0.5">البنك</p>
              <p className="font-bold">{v.checkBank || '—'}</p>
            </div>
          </div>
        )}

        {(doc.documentType === 'receipt' || doc.documentType === 'versement') && v.receiptNumber && (
          <div className="bg-muted/50 rounded p-1.5 text-[10px] text-center">
            <p className="text-muted-foreground mb-0.5">رقم الوصل</p>
            <p className="font-bold">{v.receiptNumber}</p>
          </div>
        )}

        {(doc.documentType === 'transfer' || doc.documentType === 'virement') && v.transferReference && (
          <div className="bg-muted/50 rounded p-1.5 text-[10px] text-center">
            <p className="text-muted-foreground mb-0.5">مرجع التحويل</p>
            <p className="font-bold">{v.transferReference}</p>
          </div>
        )}

        {/* Verification progress */}
        <div className="flex items-center gap-2">
          {v.verified ? (
            <ShieldCheck className="w-3.5 h-3.5 text-green-600 shrink-0" />
          ) : v.verifiedFields! > 0 ? (
            <ShieldAlert className="w-3.5 h-3.5 text-orange-500 shrink-0" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
          )}
          <Progress value={pct} className="h-1.5 flex-1" />
          <span className={`text-[10px] font-bold ${v.verified ? 'text-green-600' : pct > 0 ? 'text-orange-500' : 'text-destructive'}`}>
            {pct}%
          </span>
        </div>
      </div>
    );
  };

  const renderDocList = (items: CollectedDoc[]) => items.map(renderDocCard);

  return (
    <div className="space-y-3">
      {deliveryDocs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-green-700 dark:text-green-400">
            <Truck className="w-3.5 h-3.5" />
            <span>مستندات مستلمة أثناء التوصيل ({deliveryDocs.length})</span>
          </div>
          <div className="border-2 border-green-200 dark:border-green-900/40 rounded-xl p-2.5 space-y-2 bg-green-50/30 dark:bg-green-900/10">
            {renderDocList(deliveryDocs)}
          </div>
        </div>
      )}

      {pendingDocs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-orange-700 dark:text-orange-400">
            <Clock className="w-3.5 h-3.5" />
            <span>مستندات معلقة تم تحصيلها ({pendingDocs.length})</span>
          </div>
          <div className="border-2 border-orange-200 dark:border-orange-900/40 rounded-xl p-2.5 space-y-2 bg-orange-50/30 dark:bg-orange-900/10">
            {renderDocList(pendingDocs)}
          </div>
        </div>
      )}

      <div className="bg-primary/5 border border-primary/20 rounded-lg p-2.5 flex justify-between items-center">
        <span className="text-sm font-bold">إجمالي المستندات: {docs.length}</span>
        <span className="font-bold text-primary">{fmt(totalAmount)} DA</span>
      </div>
    </div>
  );
};

export default DocumentCollectionsSummary;
