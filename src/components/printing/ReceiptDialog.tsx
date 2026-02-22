import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useBluetoothPrinter } from '@/hooks/useBluetoothPrinter';
import { useCreateReceipt, useUpdateReceiptPrintCount } from '@/hooks/useReceipts';
import { formatReceiptForPreview, ReceiptData } from '@/services/receiptFormatter';
import { ReceiptItem, ReceiptType } from '@/types/receipt';
import { Printer, Eye, Bluetooth, Loader2, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface ReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receiptData: {
    receiptType: ReceiptType;
    orderId?: string | null;
    debtId?: string | null;
    customerId: string;
    customerName: string;
    customerPhone?: string | null;
    workerId: string;
    workerName: string;
    workerPhone?: string | null;
    branchId?: string | null;
    items: ReceiptItem[];
    totalAmount: number;
    discountAmount?: number;
    paidAmount: number;
    remainingAmount: number;
    paymentMethod?: string | null;
    notes?: string | null;
    // Payment/pricing info
    orderPaymentType?: string;
    orderPriceSubtype?: string;
    orderInvoicePaymentMethod?: string;
    // Debt-specific
    debtTotalAmount?: number;
    debtPaidBefore?: number;
    collectorName?: string;
    nextCollectionDate?: string | null;
    nextCollectionTime?: string | null;
  };
}

const ReceiptDialog: React.FC<ReceiptDialogProps> = ({ open, onOpenChange, receiptData }) => {
  const { dir } = useLanguage();
  const { status, deviceName, isConnected, isPrinting, scanAndConnect, printReceipt } = useBluetoothPrinter();
  const createReceipt = useCreateReceipt();
  const updatePrintCount = useUpdateReceiptPrintCount();
  const [savedReceiptId, setSavedReceiptId] = useState<string | null>(null);
  const [receiptNumber, setReceiptNumber] = useState<number>(0);
  const [showPreview, setShowPreview] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const receiptDataForFormatter: ReceiptData = {
    receiptNumber: receiptNumber,
    receiptType: receiptData.receiptType,
    customerName: receiptData.customerName,
    customerPhone: receiptData.customerPhone,
    workerName: receiptData.workerName,
    workerPhone: receiptData.workerPhone,
    items: receiptData.items,
    totalAmount: receiptData.totalAmount,
    discountAmount: receiptData.discountAmount || 0,
    paidAmount: receiptData.paidAmount,
    remainingAmount: receiptData.remainingAmount,
    paymentMethod: receiptData.paymentMethod,
    notes: receiptData.notes,
    date: new Date(),
    printCount: 0,
    // Payment/pricing info
    orderPaymentType: receiptData.orderPaymentType,
    orderPriceSubtype: receiptData.orderPriceSubtype,
    orderInvoicePaymentMethod: receiptData.orderInvoicePaymentMethod,
    // Debt-specific
    debtTotalAmount: receiptData.debtTotalAmount,
    debtPaidBefore: receiptData.debtPaidBefore,
    collectorName: receiptData.collectorName,
    nextCollectionDate: receiptData.nextCollectionDate,
    nextCollectionTime: receiptData.nextCollectionTime,
  };

  const previewHtml = formatReceiptForPreview(receiptDataForFormatter);

  // Save receipt to DB
  const handleSaveAndPrint = async () => {
    setIsSaving(true);
    try {
      let receiptId = savedReceiptId;
      if (!receiptId) {
        const saved = await createReceipt.mutateAsync({
          receipt_type: receiptData.receiptType,
          order_id: receiptData.orderId || null,
          debt_id: receiptData.debtId || null,
          customer_id: receiptData.customerId,
          worker_id: receiptData.workerId,
          branch_id: receiptData.branchId || null,
          customer_name: receiptData.customerName,
          customer_phone: receiptData.customerPhone || null,
          worker_name: receiptData.workerName,
          worker_phone: receiptData.workerPhone || null,
          items: receiptData.items,
          total_amount: receiptData.totalAmount,
          discount_amount: receiptData.discountAmount || 0,
          paid_amount: receiptData.paidAmount,
          remaining_amount: receiptData.remainingAmount,
          payment_method: receiptData.paymentMethod || null,
          notes: receiptData.notes || null,
        });
        receiptId = saved.id;
        setReceiptNumber(saved.receipt_number);
        setSavedReceiptId(saved.id);
        receiptDataForFormatter.receiptNumber = saved.receipt_number;
      }

      // Print
      const printed = await printReceipt(receiptDataForFormatter);
      if (printed && receiptId) {
        await updatePrintCount.mutateAsync(receiptId);
      }
    } catch (error: any) {
      console.error('Save/Print error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const statusConfig = {
    disconnected: { label: 'غير متصل', color: 'bg-muted text-muted-foreground', icon: Bluetooth },
    connecting: { label: 'جاري الاتصال...', color: 'bg-yellow-100 text-yellow-800', icon: Loader2 },
    connected: { label: deviceName || 'متصل', color: 'bg-green-100 text-green-800', icon: Check },
    printing: { label: 'جاري الطباعة...', color: 'bg-blue-100 text-blue-800', icon: Loader2 },
    error: { label: 'خطأ', color: 'bg-destructive/10 text-destructive', icon: AlertCircle },
  };

  const st = statusConfig[status];
  const StIcon = st.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] p-0 gap-0" dir={dir}>
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Printer className="w-5 h-5" />
            وصل {receiptData.receiptType === 'direct_sale' ? 'بيع مباشر' : receiptData.receiptType === 'delivery' ? 'توصيل' : 'تسديد دين'}
          </DialogTitle>
        </DialogHeader>

        {/* Printer Status */}
        <div className="px-4 pt-3 flex items-center justify-between gap-2">
          <Badge variant="outline" className={`gap-1.5 ${st.color}`}>
            <StIcon className={`w-3 h-3 ${status === 'connecting' || status === 'printing' ? 'animate-spin' : ''}`} />
            {st.label}
          </Badge>
          {!isConnected && (
            <p className="text-xs text-muted-foreground">اربط الطابعة من القائمة ⋮</p>
          )}
        </div>

        {/* Preview */}
        <ScrollArea className="max-h-[calc(90vh-12rem)] px-4">
          <div className="py-3">
            {showPreview && (
              <div 
                className="bg-white text-black rounded border p-3 text-xs"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            )}
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="p-4 pt-2 border-t flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setShowPreview(!showPreview)}
          >
            <Eye className="w-4 h-4 ml-1" />
            {showPreview ? 'إخفاء' : 'معاينة'}
          </Button>
          <Button
            className="flex-1"
            onClick={handleSaveAndPrint}
            disabled={!isConnected || isPrinting || isSaving}
          >
            {(isPrinting || isSaving) ? (
              <Loader2 className="w-4 h-4 animate-spin ml-1" />
            ) : (
              <Printer className="w-4 h-4 ml-1" />
            )}
            طباعة
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReceiptDialog;
