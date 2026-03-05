import { Capacitor } from '@capacitor/core';

/**
 * إرسال رسالة SMS مباشرة من هاتف العامل بدون فتح تطبيق الرسائل
 * يعمل فقط على Android Native عبر capacitor-sms-sender
 * البلجن يستخدم SmsManager.sendTextMessage() الذي لا يحتاج لتعيين التطبيق كـ Default SMS App
 */

const isGranted = (status?: string) => status === 'granted';

const hasRequiredSmsPermissions = (permissions: any): boolean => {
  const sendGranted = isGranted(permissions?.send_sms);
  const phoneStateGranted = isGranted(permissions?.read_phone_state);
  return sendGranted && phoneStateGranted;
};

/**
 * إرسال SMS مباشرة من الهاتف (0 تدخل من العامل)
 */
export const sendSmsDirectly = async (phone: string, message: string): Promise<boolean> => {
  if (!phone || !message?.trim()) return false;

  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    console.warn('[SMS] Direct SMS is allowed only on Android native builds');
    return false;
  }

  if (!Capacitor.isPluginAvailable('SmsSender')) {
    console.error('[SMS] SmsSender plugin is not available in this Android build. Run: npx cap sync android, then rebuild APK.');
    return false;
  }

  const cleanPhone = phone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
  if (!cleanPhone) return false;

  try {
    const { SmsSender } = await import('capacitor-sms-sender');

    // التحقق من الصلاحيات
    const currentPerms = await SmsSender.checkPermissions();
    console.log('[SMS] Current permissions:', JSON.stringify(currentPerms));

    if (!hasRequiredSmsPermissions(currentPerms)) {
      const requestedPerms = await SmsSender.requestPermissions();
      console.log('[SMS] Requested permissions result:', JSON.stringify(requestedPerms));
      if (!hasRequiredSmsPermissions(requestedPerms)) {
        console.warn('[SMS] Permissions denied');
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
      console.log('[SMS] Status update:', JSON.stringify(result));
      if (Number(result?.id) !== messageId || resolved) return;

      const status = String(result?.status || '').toUpperCase();
      if (status === 'SENT' || status === 'DELIVERED') {
        void finalize(true);
      } else if (status === 'FAILED') {
        console.warn('[SMS] Send failed, res_status:', result?.res_status);
        void finalize(false);
      }
    });

    // Timeout بعد 15 ثانية
    timeoutId = window.setTimeout(() => {
      console.warn('[SMS] Timeout - no status received after 15s');
      void finalize(false);
    }, 15000);

    console.log('[SMS] Sending to:', cleanPhone, 'id:', messageId);

    // ملاحظة: sim: 0 هو القيمة الافتراضية في البلجن
    // إذا لم يعمل، يمكن تجربة sim: 1
    await SmsSender.send({
      id: messageId,
      sim: 0,
      phone: cleanPhone,
      text: message.trim(),
    });

    console.log('[SMS] send() resolved, waiting for status...');

    const sent = await statusPromise;
    if (!sent) {
      console.warn('[SMS] Not confirmed as SENT/DELIVERED');
      return false;
    }

    console.log('[SMS] Successfully sent to:', cleanPhone);
    return true;
  } catch (error) {
    const message = String((error as any)?.message || error || '').toLowerCase();
    if (message.includes('not implemented')) {
      console.error('[SMS] Native plugin not linked in APK. Ensure android is synced with Capacitor and rebuild.');
    }
    console.error('[SMS] Error:', error);
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
