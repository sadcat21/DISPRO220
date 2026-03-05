import { Capacitor } from '@capacitor/core';

/**
 * إرسال رسالة SMS مباشرة من هاتف العامل بدون فتح تطبيق الرسائل
 * يعمل فقط على Android Native عبر capacitor-sms-sender
 */

const isGranted = (status?: string) => status === 'granted';

const hasRequiredSmsPermissions = (permissions: any): boolean => {
  // مفاتيح الإذن الصحيحة للبلجن
  const sendGranted = isGranted(permissions?.send_sms) || isGranted(permissions?.sms);
  const phoneStateGranted = isGranted(permissions?.read_phone_state) || isGranted(permissions?.phone_state);
  return sendGranted && phoneStateGranted;
};

/**
 * إرسال SMS مباشرة من الهاتف (0 تدخل من العامل)
 */
export const sendSmsDirectly = async (phone: string, message: string): Promise<boolean> => {
  if (!phone || !message?.trim()) return false;

  // منع أي سلوك غير Native Android لضمان عدم فتح تطبيق الرسائل
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    console.warn('Direct SMS is allowed only on Android native builds');
    return false;
  }

  // تنظيف رقم الهاتف
  const cleanPhone = phone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
  if (!cleanPhone) return false;

  try {
    const { SmsSender } = await import('capacitor-sms-sender');

    // التحقق من الصلاحيات بالمفاتيح الصحيحة للبلجن
    const currentPerms = await SmsSender.checkPermissions();
    if (!hasRequiredSmsPermissions(currentPerms)) {
      const requestedPerms = await SmsSender.requestPermissions();
      if (!hasRequiredSmsPermissions(requestedPerms)) {
        console.warn('SMS permissions denied (SEND_SMS / READ_PHONE_STATE)');
        return false;
      }
    }

    const messageId = Date.now();
    let resolved = false;
    let timeoutId: number | null = null;
    let listenerHandle: { remove: () => Promise<void> } | null = null;
    let resolveStatus: ((sent: boolean) => void) | null = null;

    const statusPromise = new Promise<boolean>((resolve) => {
      resolveStatus = resolve;
    });

    const finalize = async (sent: boolean) => {
      if (resolved) return;
      resolved = true;

      if (timeoutId) window.clearTimeout(timeoutId);
      if (listenerHandle) {
        await listenerHandle.remove();
        listenerHandle = null;
      }

      resolveStatus?.(sent);
    };

    listenerHandle = await SmsSender.addListener('smsSenderStatusUpdated', (result: any) => {
      if (Number(result?.id) !== messageId || resolved) return;

      const status = String(result?.status || '').toUpperCase();
      if (status === 'SENT' || status === 'DELIVERED') {
        void finalize(true);
        return;
      }

      if (status === 'FAILED') {
        void finalize(false);
      }
    });

    timeoutId = window.setTimeout(() => {
      void finalize(false);
    }, 12000);

    await SmsSender.send({
      id: messageId,
      sim: 0,
      phone: cleanPhone,
      text: message.trim(),
    });

    const sent = await statusPromise;
    if (!sent) {
      console.warn('SMS was not confirmed as SENT/DELIVERED');
      return false;
    }

    console.log('SMS sent directly to:', cleanPhone);
    return true;
  } catch (error) {
    console.warn('Direct SMS failed:', error);
    return false;
  }
};

/**
 * إنشاء رسالة تأكيد التوصيل
 */
export const buildDeliveryConfirmationSms = (params: {
  customerName: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  orderId: string;
  companyName?: string;
}): string => {
  const { customerName, totalAmount, paidAmount, remainingAmount, orderId, companyName } = params;

  let message = `✅ تم التوصيل بنجاح\n`;
  if (companyName) message += `🏢 ${companyName}\n`;
  message += `👤 ${customerName}\n`;
  message += `📦 طلبية: #${orderId.slice(0, 8)}\n`;
  message += `💰 المبلغ: ${totalAmount.toLocaleString()} دج\n`;

  if (paidAmount > 0 && paidAmount < totalAmount) {
    message += `✅ المدفوع: ${paidAmount.toLocaleString()} دج\n`;
    message += `⏳ المتبقي: ${remainingAmount.toLocaleString()} دج\n`;
  } else if (paidAmount >= totalAmount) {
    message += `✅ تم الدفع كاملاً\n`;
  } else {
    message += `⏳ دين: ${totalAmount.toLocaleString()} دج\n`;
  }

  message += `\nشكراً لتعاملكم معنا 🙏`;

  return message;
};
