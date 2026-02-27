import React, { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useReceipts, useUpdateReceiptPrintCount } from '@/hooks/useReceipts';
import { useBluetoothPrinter } from '@/hooks/useBluetoothPrinter';
import { formatReceiptForPreview, ReceiptData } from '@/services/receiptFormatter';
import { ReceiptWithDetails, ReceiptItem } from '@/types/receipt';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Eye, Calendar, User, Receipt,
  Printer, Loader2, FileText, Truck, CreditCard, RefreshCw,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const DailyReceipts: React.FC = () => {
  const { role, workerId, activeBranch } = useAuth();
  const { dir, t } = useLanguage();
  const isAdmin = role === 'admin' || role === 'branch_admin' || role === 'supervisor';
  const { isConnected, printReceipt } = useBluetoothPrinter();
  const updatePrintCount = useUpdateReceiptPrintCount();

  const today = new Date().toISOString().split('T')[0];
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [filterWorkerId, setFilterWorkerId] = useState('all');
  const [filterType, setFilterType] = useState('all');
  // Note: If no receipts show, the date filter may need timezone offset
  const [searchQuery, setSearchQuery] = useState('');
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptWithDetails | null>(null);

  // Workers list for filter
  const { data: workers } = useQuery({
    queryKey: ['workers-list'],
    queryFn: async () => {
      const query = supabase.from('workers').select('id, full_name').eq('is_active', true);
      const { data } = await query;
      return data || [];
    },
    enabled: isAdmin,
  });

  // Customers list for filter
  const [filterCustomer, setFilterCustomer] = useState('all');
  const { data: customers } = useQuery({
    queryKey: ['customers-list-receipts'],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('id, name').eq('status', 'active').order('name').limit(500);
      return data || [];
    },
  });

  const { data: receipts, isLoading: receiptsLoading } = useReceipts({
    date: dateFrom,
    dateTo: dateTo !== dateFrom ? dateTo : undefined,
    workerId: isAdmin ? (filterWorkerId !== 'all' ? filterWorkerId : undefined) : workerId || undefined,
    receiptType: filterType !== 'all' ? filterType : undefined,
  });

  // Also fetch delivered orders that may not have receipts
  const { data: deliveredOrders, isLoading: ordersLoading } = useQuery({
    queryKey: ['daily-delivered-orders', dateFrom, dateTo, filterWorkerId, filterType],
    queryFn: async () => {
      // Skip if filtering by non-delivery type
      if (filterType && filterType !== 'all' && filterType !== 'delivery') return [];
      
      let query = supabase
        .from('orders')
        .select(`
          id, customer_id, created_by, assigned_worker_id, status, payment_type,
          payment_status, total_amount, created_at, updated_at, notes,
          partial_amount, prepaid_amount,
          customer:customers(id, name, phone, wilaya),
          assigned_worker:workers!orders_assigned_worker_id_fkey(id, full_name)
        `)
        .eq('status', 'delivered')
        .order('created_at', { ascending: false });

      // Date filter using Algeria timezone
      query = query.gte('created_at', `${dateFrom}T00:00:00+01:00`);
      const endDate = dateTo !== dateFrom ? dateTo : dateFrom;
      query = query.lte('created_at', `${endDate}T23:59:59+01:00`);

      const effectiveWorkerId = isAdmin ? (filterWorkerId !== 'all' ? filterWorkerId : undefined) : workerId || undefined;
      if (effectiveWorkerId) {
        query = query.eq('assigned_worker_id', effectiveWorkerId);
      }

      const { data, error } = await query.limit(500);
      if (error) throw error;
      return data || [];
    },
  });

  const isLoading = receiptsLoading || ordersLoading;

  // Merge: convert delivered orders without receipts into receipt-like objects
  const mergedReceipts = useMemo(() => {
    const receiptOrderIds = new Set((receipts || []).map(r => r.order_id).filter(Boolean));
    
    // Orders that already have receipts are excluded
    const ordersWithoutReceipts = (deliveredOrders || [])
      .filter(o => !receiptOrderIds.has(o.id))
      .map(o => ({
        id: `order-${o.id}`,
        receipt_number: 0,
        receipt_type: 'delivery' as const,
        order_id: o.id,
        debt_id: null,
        customer_id: o.customer_id,
        customer_name: (o as any).customer?.name || 'غير معروف',
        customer_phone: (o as any).customer?.phone || null,
        worker_id: o.assigned_worker_id || o.created_by,
        worker_name: (o as any).assigned_worker?.full_name || '',
        worker_phone: null,
        items: [] as ReceiptItem[],
        total_amount: Number(o.total_amount) || 0,
        discount_amount: 0,
        paid_amount: o.payment_status === 'cash' ? (Number(o.total_amount) || 0) : (Number(o.partial_amount) || Number(o.prepaid_amount) || 0),
        remaining_amount: o.payment_status === 'credit' ? (Number(o.total_amount) || 0) : 
          o.payment_status === 'partial' ? ((Number(o.total_amount) || 0) - (Number(o.partial_amount) || 0)) : 0,
        payment_method: o.payment_status || null,
        print_count: 0,
        last_printed_at: null,
        is_modified: false,
        original_data: null,
        notes: o.notes,
        created_at: o.created_at,
        updated_at: o.updated_at,
        branch_id: null,
        _isOrderOnly: true, // flag to distinguish
      } as ReceiptWithDetails & { _isOrderOnly?: boolean }));

    // Combine and sort by date
    const all = [...(receipts || []), ...ordersWithoutReceipts];
    all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return all;
  }, [receipts, deliveredOrders]);

  const filteredReceipts = useMemo(() => {
    let result = mergedReceipts;
    
    // Filter by customer
    if (filterCustomer && filterCustomer !== 'all') {
      result = result.filter(r => r.customer_id === filterCustomer);
    }
    
    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r =>
        r.customer_name.toLowerCase().includes(q) ||
        String(r.receipt_number).includes(q) ||
        r.worker_name?.toLowerCase().includes(q) ||
        r.order_id?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [mergedReceipts, searchQuery, filterCustomer]);

  const typeLabels: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    direct_sale: { label: 'بيع مباشر', icon: Receipt, color: 'bg-green-100 text-green-800' },
    delivery: { label: 'توصيل', icon: Truck, color: 'bg-blue-100 text-blue-800' },
    debt_payment: { label: 'تسديد دين', icon: CreditCard, color: 'bg-amber-100 text-amber-800' },
  };

  const handleReprint = async (receipt: ReceiptWithDetails) => {
    const data: ReceiptData = {
      receiptNumber: receipt.receipt_number,
      receiptType: receipt.receipt_type as any,
      customerName: receipt.customer_name,
      customerPhone: receipt.customer_phone,
      workerName: receipt.worker_name,
      workerPhone: receipt.worker_phone,
      items: (receipt.items || []) as ReceiptItem[],
      totalAmount: receipt.total_amount,
      discountAmount: receipt.discount_amount,
      paidAmount: receipt.paid_amount,
      remainingAmount: receipt.remaining_amount,
      paymentMethod: receipt.payment_method,
      notes: receipt.notes,
      date: new Date(receipt.created_at),
      printCount: receipt.print_count,
    };
    const printed = await printReceipt(data);
    if (printed) {
      await updatePrintCount.mutateAsync(receipt.id);
    }
  };

  const totalAmount = filteredReceipts.reduce((s, r) => s + Number(r.total_amount), 0);
  const totalPaid = filteredReceipts.reduce((s, r) => s + Number(r.paid_amount), 0);

  return (
    <div className="space-y-3 p-3" dir={dir}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <FileText className="w-5 h-5" />
          الفواتير اليومية
        </h1>
        {isConnected && (
          <Badge variant="outline" className="bg-green-100 text-green-800 gap-1 text-xs">
            <Printer className="w-3 h-3" /> متصل
          </Badge>
        )}
      </div>

      {/* Filters */}
      <div className="space-y-2">
        {/* Date range */}
        <div className="flex gap-2 items-center">
          <div className="flex items-center gap-1 flex-1">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <span className="text-xs text-muted-foreground">→</span>
          <Input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="h-8 text-xs flex-1"
          />
        </div>

        <div className="flex gap-2">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأنواع</SelectItem>
              <SelectItem value="direct_sale">بيع مباشر</SelectItem>
              <SelectItem value="delivery">توصيل</SelectItem>
              <SelectItem value="debt_payment">تسديد دين</SelectItem>
            </SelectContent>
          </Select>

          {isAdmin && (
            <Select value={filterWorkerId} onValueChange={setFilterWorkerId}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="كل العمال" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل العمال</SelectItem>
                {workers?.filter(w => w.id).map(w => (
                  <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex gap-2">
          <Select value={filterCustomer} onValueChange={setFilterCustomer}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue placeholder="كل العملاء" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل العملاء</SelectItem>
              {customers?.filter(c => c.id).map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="بحث: اسم عميل، عامل، رقم وصل، رقم طلبية..."
            className="h-8 text-xs pr-8"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-2 text-center">
          <p className="text-[10px] text-muted-foreground">العدد</p>
          <p className="text-base font-bold">{filteredReceipts.length}</p>
        </Card>
        <Card className="p-2 text-center">
          <p className="text-[10px] text-muted-foreground">الإجمالي</p>
          <p className="text-base font-bold">{totalAmount.toLocaleString()}</p>
        </Card>
        <Card className="p-2 text-center">
          <p className="text-[10px] text-muted-foreground">المحصل</p>
          <p className="text-base font-bold text-green-600">{totalPaid.toLocaleString()}</p>
        </Card>
      </div>

      {/* Receipts List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : filteredReceipts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">لا توجد فواتير</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredReceipts.map(receipt => {
            const typeInfo = typeLabels[receipt.receipt_type] || typeLabels.delivery;
            const TIcon = typeInfo.icon;
            return (
              <Card key={receipt.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">
                        {receipt.receipt_number ? `#${receipt.receipt_number}` : (receipt as any)._isOrderOnly ? 'طلبية' : '#0'}
                      </span>
                      <Badge variant="outline" className={`text-[10px] ${typeInfo.color}`}>
                        <TIcon className="w-3 h-3 ml-0.5" />
                        {typeInfo.label}
                      </Badge>
                      {receipt.is_modified && (
                        <Badge variant="outline" className="text-[10px] bg-orange-100 text-orange-800">معدل</Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium truncate">{receipt.customer_name}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{Number(receipt.total_amount).toLocaleString()} DA</span>
                      {Number(receipt.remaining_amount) > 0 && (
                        <span className="text-destructive">متبقي: {Number(receipt.remaining_amount).toLocaleString()}</span>
                      )}
                      {receipt.worker_name && (
                        <span className="flex items-center gap-0.5">
                          <User className="w-3 h-3" />{receipt.worker_name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{new Date(receipt.created_at).toLocaleDateString('ar-DZ')} {new Date(receipt.created_at).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })}</span>
                      {receipt.print_count > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Printer className="w-2.5 h-2.5" />
                          طُبع {receipt.print_count}×
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => setPreviewReceipt(receipt)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => handleReprint(receipt)}
                      disabled={!isConnected}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Preview Dialog */}
      {previewReceipt && (
        <Dialog open={!!previewReceipt} onOpenChange={() => setPreviewReceipt(null)}>
          <DialogContent className="max-w-[95vw] sm:max-w-sm max-h-[85vh] p-0 gap-0" dir={dir}>
            <DialogHeader className="p-3 border-b">
              <DialogTitle className="text-sm">وصل #{previewReceipt.receipt_number}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh] p-3">
              <div
                className="bg-white text-black rounded border p-3 text-xs"
                dangerouslySetInnerHTML={{
                  __html: formatReceiptForPreview({
                    receiptNumber: previewReceipt.receipt_number,
                    receiptType: previewReceipt.receipt_type as any,
                    customerName: previewReceipt.customer_name,
                    customerPhone: previewReceipt.customer_phone,
                    workerName: previewReceipt.worker_name,
                    workerPhone: previewReceipt.worker_phone,
                    items: (previewReceipt.items || []) as ReceiptItem[],
                    totalAmount: previewReceipt.total_amount,
                    discountAmount: previewReceipt.discount_amount,
                    paidAmount: previewReceipt.paid_amount,
                    remainingAmount: previewReceipt.remaining_amount,
                    paymentMethod: previewReceipt.payment_method,
                    notes: previewReceipt.notes,
                    date: new Date(previewReceipt.created_at),
                    printCount: previewReceipt.print_count,
                  })
                }}
              />
            </ScrollArea>
            <div className="p-3 border-t flex gap-2">
              <Button
                className="flex-1"
                size="sm"
                onClick={() => {
                  handleReprint(previewReceipt);
                  setPreviewReceipt(null);
                }}
                disabled={!isConnected}
              >
                <Printer className="w-4 h-4 ml-1" />
                إعادة طباعة
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default DailyReceipts;
