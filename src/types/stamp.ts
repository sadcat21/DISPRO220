export interface StampPriceTier {
  id: string;
  min_amount: number;
  max_amount: number | null;
  percentage: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
}

// طرق دفع الفاتورة
export type InvoicePaymentMethod = 'receipt' | 'check' | 'cash' | 'transfer';

export const INVOICE_PAYMENT_METHODS: Record<InvoicePaymentMethod, { label: string; description: string; hasStamp: boolean }> = {
  receipt: {
    label: 'وصل تحويل',
    description: 'العميل يحول المبلغ بنفسه ويسلم وصل التحويل',
    hasStamp: false,
  },
  check: {
    label: 'شيك',
    description: 'العميل يسلم شيك بقيمة المبلغ',
    hasStamp: false,
  },
  cash: {
    label: 'كاش',
    description: 'العميل يسلم المبلغ نقداً - يتم احتساب الطابع',
    hasStamp: true,
  },
  transfer: {
    label: 'تحويل بنكي',
    description: 'العميل يحول من حسابه البنكي إلى حسابنا',
    hasStamp: false,
  },
};
