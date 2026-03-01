/**
 * Comprehensive trigger definitions for the Reward & Penalty system.
 * Each trigger maps to a real database event via DB triggers.
 */

export interface TriggerDefinition {
  key: string;
  label: string;
  description: string;
  /** Which DB table fires this trigger */
  dbTable: string;
  /** The DB event condition */
  dbEvent: string;
  /** Which category this fits best */
  categories: string[];
  /** Can be used for tasks (rewards) */
  forTasks: boolean;
  /** Can be used for penalties */
  forPenalties: boolean;
  /** Icon name from lucide */
  icon: string;
}

// ────────────────────────────────────────────
// TASK DATA SOURCES (for reward_tasks.data_source)
// ────────────────────────────────────────────
export const TASK_DATA_SOURCES: Record<string, { label: string; description: string; dbTable: string; category: string }> = {
  // المبيعات
  sales_count: {
    label: 'عدد المبيعات',
    description: 'عدد الطلبيات المسلّمة/المؤكدة يومياً',
    dbTable: 'orders',
    category: 'sales',
  },
  sales_amount: {
    label: 'إجمالي المبيعات',
    description: 'مجموع قيمة المبيعات (بالدينار)',
    dbTable: 'orders',
    category: 'sales',
  },
  sales_products_count: {
    label: 'عدد المنتجات المباعة',
    description: 'إجمالي الكميات المباعة في اليوم',
    dbTable: 'order_items',
    category: 'sales',
  },
  invoice_count: {
    label: 'عدد الفواتير',
    description: 'عدد الفواتير المصدرة',
    dbTable: 'orders',
    category: 'sales',
  },
  // الزيارات
  visits: {
    label: 'عدد الزيارات',
    description: 'عدد زيارات العملاء المسجلة',
    dbTable: 'visit_tracking',
    category: 'discipline',
  },
  visit_with_sale: {
    label: 'زيارة مع بيع',
    description: 'زيارات أدت لعملية بيع فعلية',
    dbTable: 'visit_tracking + orders',
    category: 'sales',
  },
  visit_new_area: {
    label: 'زيارة منطقة جديدة',
    description: 'زيارة عميل في قطاع لم يزره سابقاً',
    dbTable: 'visit_tracking',
    category: 'quality',
  },
  // التحصيل
  collections: {
    label: 'تحصيل الديون',
    description: 'عدد عمليات تحصيل الديون',
    dbTable: 'debt_payments',
    category: 'collection',
  },
  collection_amount: {
    label: 'إجمالي المبالغ المحصلة',
    description: 'مجموع المبالغ المحصلة من الديون',
    dbTable: 'debt_payments',
    category: 'collection',
  },
  full_debt_closure: {
    label: 'إغلاق دين كامل',
    description: 'تسديد دين بالكامل (حالة = مسدد)',
    dbTable: 'customer_debts',
    category: 'collection',
  },
  document_collection: {
    label: 'جمع المستندات',
    description: 'تحصيل مستندات (شيكات/إيصالات)',
    dbTable: 'document_collections',
    category: 'collection',
  },
  // العملاء
  new_customers: {
    label: 'عملاء جدد',
    description: 'تسجيل عملاء جدد في النظام',
    dbTable: 'customers',
    category: 'sales',
  },
  customer_reactivation: {
    label: 'إعادة تنشيط عميل',
    description: 'طلبية من عميل لم يشترِ منذ 30 يوم+',
    dbTable: 'orders',
    category: 'quality',
  },
  // المخزون والتحميل
  stock_accuracy: {
    label: 'دقة المخزون',
    description: 'تطابق المخزون الفعلي مع المتوقع عند التفريغ',
    dbTable: 'loading_sessions',
    category: 'discipline',
  },
  full_truck_return: {
    label: 'تفريغ كامل',
    description: 'إرجاع الشاحنة بكمية صفر (بيع كامل)',
    dbTable: 'loading_sessions',
    category: 'sales',
  },
  // الانضباط
  on_time_arrival: {
    label: 'الحضور في الوقت',
    description: 'بدء العمل قبل الوقت المحدد',
    dbTable: 'visit_tracking',
    category: 'discipline',
  },
  gps_compliance: {
    label: 'الالتزام بالمسار GPS',
    description: 'عدم الانحراف عن المسار المحدد',
    dbTable: 'visit_tracking',
    category: 'discipline',
  },
  zero_complaints: {
    label: 'صفر شكاوى',
    description: 'عدم وجود شكاوى مؤكدة خلال الفترة',
    dbTable: 'customer_approval_requests',
    category: 'quality',
  },
  // المالية
  cash_accuracy: {
    label: 'دقة النقد',
    description: 'تطابق المبالغ في جلسة المحاسبة (فرق = 0)',
    dbTable: 'accounting_session_items',
    category: 'discipline',
  },
  handover_on_time: {
    label: 'تسليم في الوقت',
    description: 'تسليم الخزينة في نفس يوم العمل',
    dbTable: 'manager_handovers',
    category: 'discipline',
  },
};

// ────────────────────────────────────────────
// PENALTY TRIGGERS (for reward_penalties.trigger_event)
// ────────────────────────────────────────────
export const PENALTY_TRIGGERS: Record<string, { label: string; description: string; dbTable: string; dbCondition: string; category: string }> = {
  manual: {
    label: 'يدوي',
    description: 'يتم تسجيلها يدوياً من المدير',
    dbTable: '-',
    dbCondition: '-',
    category: 'general',
  },
  // طلبيات
  cancel_visit: {
    label: 'إلغاء طلبية',
    description: 'عند تغيير حالة الطلبية إلى "ملغاة"',
    dbTable: 'orders',
    dbCondition: 'status → cancelled',
    category: 'sales',
  },
  missing_delivery: {
    label: 'فشل التسليم',
    description: 'عند تغيير حالة الطلبية إلى "فاشلة"',
    dbTable: 'orders',
    dbCondition: 'status → failed',
    category: 'sales',
  },
  wrong_invoice: {
    label: 'خطأ في الفاتورة',
    description: 'فاتورة مرفوضة أو تحتاج تعديل',
    dbTable: 'orders',
    dbCondition: 'invoice error flag',
    category: 'quality',
  },
  unauthorized_discount: {
    label: 'خصم غير مصرح',
    description: 'تطبيق خصم بدون موافقة مسبقة',
    dbTable: 'orders',
    dbCondition: 'discount without approval',
    category: 'quality',
  },
  product_return: {
    label: 'إرجاع منتج بسبب الموظف',
    description: 'إرجاع بسبب خطأ الموظف (كمية/نوع خاطئ)',
    dbTable: 'customer_credits',
    dbCondition: 'credit_type = product',
    category: 'quality',
  },
  // التحصيل
  debt_overdue: {
    label: 'تأخر تحصيل دين',
    description: 'عند تحول حالة الدين إلى "متأخر"',
    dbTable: 'customer_debts',
    dbCondition: 'status → overdue',
    category: 'collection',
  },
  document_missing: {
    label: 'عدم جمع مستند',
    description: 'زيارة بدون تحصيل المستند المطلوب',
    dbTable: 'debt_collections',
    dbCondition: 'action = no_payment',
    category: 'collection',
  },
  // الموقع والانضباط
  gps_deviation: {
    label: 'انحراف عن المسار GPS',
    description: 'مغادرة المنطقة المحددة أثناء العمل',
    dbTable: 'visit_tracking',
    dbCondition: 'distance > threshold',
    category: 'discipline',
  },
  late_arrival: {
    label: 'تأخير عن الموعد',
    description: 'بدء العمل بعد الوقت المحدد بأكثر من 30 دقيقة',
    dbTable: 'visit_tracking',
    dbCondition: 'first visit > start_time + 30min',
    category: 'discipline',
  },
  absence: {
    label: 'غياب بدون إذن',
    description: 'عدم تسجيل أي نشاط خلال يوم عمل',
    dbTable: 'visit_tracking',
    dbCondition: 'no records for date',
    category: 'discipline',
  },
  early_leave: {
    label: 'مغادرة مبكرة',
    description: 'إنهاء العمل قبل الوقت المحدد',
    dbTable: 'visit_tracking',
    dbCondition: 'last activity < end_time',
    category: 'discipline',
  },
  phone_unreachable: {
    label: 'عدم الرد على الهاتف',
    description: 'عدم الرد على اتصالات المدير',
    dbTable: '-',
    dbCondition: 'manual / report',
    category: 'discipline',
  },
  // المالية
  cash_discrepancy: {
    label: 'فرق في النقد',
    description: 'وجود فرق سلبي في جلسة المحاسبة',
    dbTable: 'accounting_session_items',
    dbCondition: 'difference < 0',
    category: 'financial',
  },
  stock_shortage: {
    label: 'نقص في المخزون',
    description: 'فرق بين المخزون المتوقع والفعلي عند التفريغ',
    dbTable: 'loading_sessions',
    dbCondition: 'unloading discrepancy',
    category: 'financial',
  },
  // العملاء
  confirmed_complaint: {
    label: 'شكوى مؤكدة',
    description: 'شكوى من عميل تم التحقق منها',
    dbTable: 'customer_approval_requests',
    dbCondition: 'type = complaint & approved',
    category: 'quality',
  },
  customer_loss: {
    label: 'فقدان عميل',
    description: 'عميل أصبح غير نشط بسبب سوء الخدمة',
    dbTable: 'customers',
    dbCondition: 'status → inactive',
    category: 'quality',
  },
  // أخرى
  unsafe_driving: {
    label: 'قيادة غير آمنة',
    description: 'تقرير عن قيادة متهورة أو مخالفة مرورية',
    dbTable: '-',
    dbCondition: 'manual report',
    category: 'safety',
  },
  truck_damage: {
    label: 'ضرر في الشاحنة',
    description: 'تلف أو ضرر في مركبة الشركة',
    dbTable: '-',
    dbCondition: 'manual report',
    category: 'safety',
  },
  policy_violation: {
    label: 'مخالفة سياسة الشركة',
    description: 'أي انتهاك لقواعد العمل الداخلية',
    dbTable: '-',
    dbCondition: 'manual report',
    category: 'general',
  },
};

// Category labels
export const TRIGGER_CATEGORIES: Record<string, string> = {
  sales: 'المبيعات',
  discipline: 'الانضباط',
  quality: 'الجودة',
  collection: 'التحصيل',
  financial: 'المالية',
  safety: 'السلامة',
  general: 'عام',
};

// Task category labels
export const TASK_CATEGORIES: Record<string, string> = {
  sales: 'أداء بيعي',
  discipline: 'انضباط',
  quality: 'جودة',
  collection: 'تحصيل',
};
