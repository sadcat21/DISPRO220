import { useState, useEffect, useCallback } from 'react';
import { bluetoothPrinter, PrinterStatusType } from '@/services/bluetoothPrinter';
import { ReceiptData } from '@/services/receiptFormatter';
import { formatReceiptAsBitmap } from '@/services/receiptBitmapPrinter';
import { toast } from 'sonner';

export const useBluetoothPrinter = () => {
  const [status, setStatus] = useState<PrinterStatusType>(bluetoothPrinter.status);
  const [deviceName, setDeviceName] = useState<string | null>(bluetoothPrinter.deviceName);

  useEffect(() => {
    bluetoothPrinter.onStatusChange((newStatus) => {
      setStatus(newStatus);
      setDeviceName(bluetoothPrinter.deviceName);
    });
  }, []);

  const scanAndConnect = useCallback(async () => {
    try {
      const device = await bluetoothPrinter.scan();
      if (!device) {
        toast.info('لم يتم اختيار طابعة');
        return false;
      }
      await bluetoothPrinter.connect(device);
      toast.success(`تم الاتصال بـ ${device.name || 'الطابعة'}`);
      return true;
    } catch (error: any) {
      toast.error(error.message || 'فشل الاتصال بالطابعة');
      return false;
    }
  }, []);

  const disconnect = useCallback(() => {
    bluetoothPrinter.disconnect();
    toast.info('تم قطع الاتصال بالطابعة');
  }, []);

  const printReceipt = useCallback(async (data: ReceiptData, previewHtml?: string): Promise<boolean> => {
    if (!bluetoothPrinter.isConnected) {
      const reconnected = await bluetoothPrinter.reconnect();
      if (!reconnected) {
        toast.error('الطابعة غير متصلة. يرجى إعادة الاتصال.');
        return false;
      }
    }

    try {
      // Use bitmap printing to support Arabic text
      const { formatReceiptForPreview } = await import('@/services/receiptFormatter');
      const html = previewHtml || formatReceiptForPreview(data);
      const printData = await formatReceiptAsBitmap(html);
      await bluetoothPrinter.print(printData);
      toast.success('تمت الطباعة بنجاح');
      return true;
    } catch (error: any) {
      toast.error('فشل في الطباعة: ' + (error.message || 'خطأ غير معروف'));
      return false;
    }
  }, []);

  return {
    status,
    deviceName,
    isConnected: status === 'connected',
    isPrinting: status === 'printing',
    scanAndConnect,
    disconnect,
    printReceipt,
  };
};
