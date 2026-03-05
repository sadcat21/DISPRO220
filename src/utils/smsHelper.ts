/**
 * فتح تطبيق الرسائل النصية (SMS) مع رسالة جاهزة
 * يعمل على الويب وعلى تطبيق الأندرويد (Capacitor)
 */
export const openSmsApp = (phone: string, message: string) => {
  if (!phone) return;
  
  // تنظيف رقم الهاتف
  const cleanPhone = phone.replace(/\s+/g, '').replace(/[^\d+]/g, '');
  if (!cleanPhone) return;

  // استخدام رابط sms: لفتح تطبيق الرسائل
  // على أندرويد: sms:number?body=message
  // على iOS: sms:number&body=message
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
