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

    const sendWithSim = async (sim: number): Promise<boolean> => {
      const messageId = Date.now() + sim;
      let resolved = false;
      let timeoutId: number | null = null;
      let listenerHandle: { remove: () => Promise<void> } | null = null;
      let resolveStatus: ((sent: boolean) => void) | null = null;

      const statusPromise = new Promise<boolean>((resolve) => {
        resolveStatus = resolve;
      });

      const finalize = (sent: boolean) => {
        if (resolved) return;
        resolved = true;
        if (timeoutId) window.clearTimeout(timeoutId);

        const cleanupAndResolve = async () => {
          if (listenerHandle) {
            try {
              await listenerHandle.remove();
            } catch (removeError) {
              console.warn('[SMS] Failed to remove listener:', removeError);
            }
            listenerHandle = null;
          }
          resolveStatus?.(sent);
        };

        void cleanupAndResolve();
      };

      try {
        listenerHandle = await SmsSender.addListener('smsSenderStatusUpdated', (result: any) => {
          console.log('[SMS] Status update:', JSON.stringify(result));
          if (Number(result?.id) !== messageId || resolved) return;

          const status = String(result?.status || '').toUpperCase();
          if (status === 'SENT' || status === 'DELIVERED') {
            finalize(true);
          } else if (status === 'FAILED') {
            console.warn('[SMS] Send failed, res_status:', result?.res_status, 'sim:', sim);
            finalize(false);
          }
        });

        timeoutId = window.setTimeout(() => {
          console.warn(`[SMS] No status for sim ${sim} after 8s, trying next SIM`);
          finalize(false);
        }, 8000);
      } catch (listenerError) {
        console.warn('[SMS] Could not attach status listener, using optimistic mode:', listenerError);
      }

      try {
        console.log('[SMS] Sending to:', cleanPhone, 'id:', messageId, 'sim:', sim);
        const sendResult = await SmsSender.send({
          id: messageId,
          sim,
          phone: cleanPhone,
          text: message.trim(),
        });

        const immediateStatus = String(sendResult?.status || '').toUpperCase();
        console.log('[SMS] send() resolved:', immediateStatus, 'sim:', sim);

        if (!listenerHandle) {
          return immediateStatus !== 'FAILED';
        }

        if (immediateStatus === 'FAILED') {
          finalize(false);
        } else if (immediateStatus === 'SENT' || immediateStatus === 'DELIVERED') {
          finalize(true);
        }

        return await statusPromise;
      } catch (sendError) {
        console.warn('[SMS] send() threw error on sim', sim, sendError);
        if (listenerHandle) {
          finalize(false);
          return await statusPromise;
        }
        return false;
      }
    };

    const simCandidates = [0, 1, 2, 3];

    for (const sim of simCandidates) {
      const sent = await sendWithSim(sim);
      if (sent) {
        console.log('[SMS] Successfully sent to:', cleanPhone, 'via sim:', sim);
        return true;
      }
    }

    console.warn('[SMS] Failed to send on all SIM slots');
    return false;
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

  let message = `تم التوصيل بنجاح\n`;
  if (companyName) message += `${companyName}\n`;
  message += `العميل: ${customerName}\n`;
  message += `الطلب: ${orderId.slice(0, 8)}\n`;
  message += `الإجمالي: ${totalAmount.toLocaleString()} دج\n`;

  if (paidAmount > 0 && paidAmount < totalAmount) {
    message += `المدفوع: ${paidAmount.toLocaleString()} دج\n`;
    message += `المتبقي: ${remainingAmount.toLocaleString()} دج\n`;
  } else if (paidAmount >= totalAmount) {
    message += `الحالة: مدفوع بالكامل\n`;
  } else {
    message += `الحالة: دين ${totalAmount.toLocaleString()} دج\n`;
  }

  message += `شكراً لتعاملكم معنا`;

  return message;
};
