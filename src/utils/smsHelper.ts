/**
 * إرسال رسالة SMS مباشرة من هاتف العامل بدون فتح تطبيق الرسائل
 * يستخدم Capacitor SMS Sender plugin على الأندرويد
 * يرجع إلى فتح تطبيق الرسائل على الويب كـ fallback
 */

/**
 * إرسال SMS مباشرة من الهاتف
 */
export const sendSmsDirectly = async (phone: string, message: string): Promise<boolean> => {
  if (!phone) return false;

  // تنظيف رقم الهاتف
  const cleanPhone = phone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
  if (!cleanPhone) return false;

  try {
    // محاولة استخدام Capacitor SMS Sender (يعمل على الأندرويد فقط)
    const { SmsSender } = await import('capacitor-sms-sender');
    
    // التحقق من الصلاحيات أولاً
    const permResult = await SmsSender.checkPermissions() as any;
    if (permResult?.sms !== 'granted' && permResult?.send !== 'granted') {
      const reqResult = await SmsSender.requestPermissions() as any;
      if (reqResult?.sms !== 'granted' && reqResult?.send !== 'granted') {
        console.warn('SMS permission denied, falling back to SMS app');
        openSmsApp(cleanPhone, message);
        return false;
      }
    }

    // إرسال الرسالة مباشرة
    await SmsSender.send({
      id: Date.now(),
      sim: 0, // الشريحة الأولى
      phone: cleanPhone,
      text: message,
    });

    console.log('SMS sent directly to:', cleanPhone);
    return true;
  } catch (error) {
    console.warn('Direct SMS failed, falling back to SMS app:', error);
    // Fallback: فتح تطبيق الرسائل (للويب أو في حال فشل الإرسال المباشر)
    openSmsApp(cleanPhone, message);
    return false;
  }
};

/**
 * فتح تطبيق الرسائل النصية (SMS) مع رسالة جاهزة - كخطة بديلة
 */
export const openSmsApp = (phone: string, message: string) => {
  if (!phone) return;

  const cleanPhone = phone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
  if (!cleanPhone) return;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const separator = isIOS ? '&' : '?';
  const encodedMessage = encodeURIComponent(message);

  const smsUrl = `sms:${cleanPhone}${separator}body=${encodedMessage}`;
  window.open(smsUrl, '_self');
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
