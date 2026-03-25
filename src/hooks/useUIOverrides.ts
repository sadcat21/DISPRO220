import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { isAdminRole } from '@/lib/utils';

export interface UIOverride {
  id: string;
  worker_id: string;
  element_type: string;
  element_key: string;
  is_hidden: boolean;
  created_at: string;
  updated_by: string | null;
}

// Get all UI overrides for a specific worker (admin view)
export const useWorkerUIOverrides = (workerId: string | null) => {
  return useQuery({
    queryKey: ['worker-ui-overrides', workerId],
    queryFn: async () => {
      if (!workerId) return [];
      const { data, error } = await supabase
        .from('worker_ui_overrides')
        .select('*')
        .eq('worker_id', workerId);
      if (error) throw error;
      return data as UIOverride[];
    },
    enabled: !!workerId,
  });
};

// Get current worker's own overrides (for navigation filtering)
export const useMyUIOverrides = () => {
  const { workerId, role } = useAuth();

  return useQuery({
    queryKey: ['my-ui-overrides', workerId],
    queryFn: async () => {
      if (!workerId) return [];
      const { data, error } = await supabase
        .from('worker_ui_overrides')
        .select('element_type, element_key, is_hidden')
        .eq('worker_id', workerId)
        .eq('is_hidden', true);
      if (error) throw error;
      return data as { element_type: string; element_key: string; is_hidden: boolean }[];
    },
    enabled: !!workerId && role !== 'admin', // Admin sees everything
  });
};

// Check if a specific element is hidden for the current worker
export const useIsElementHidden = (elementType: string, elementKey: string): boolean => {
  const { role } = useAuth();
  const { data: overrides } = useMyUIOverrides();

  // Admin always sees everything
  if (isAdminRole(role)) return false;

  return overrides?.some(o => o.element_type === elementType && o.element_key === elementKey && o.is_hidden) ?? false;
};

// Toggle UI override for a worker
export const useToggleUIOverride = () => {
  const queryClient = useQueryClient();
  const { workerId: updatedBy } = useAuth();

  return useMutation({
    mutationFn: async ({
      workerId,
      elementType,
      elementKey,
      isHidden,
    }: {
      workerId: string;
      elementType: string;
      elementKey: string;
      isHidden: boolean;
    }) => {
      if (isHidden) {
        // Upsert the override
        const { error } = await supabase
          .from('worker_ui_overrides')
          .upsert(
            {
              worker_id: workerId,
              element_type: elementType,
              element_key: elementKey,
              is_hidden: true,
              updated_by: updatedBy,
            },
            { onConflict: 'worker_id,element_type,element_key' }
          );
        if (error) throw error;
      } else {
        // Remove the override (show element)
        const { error } = await supabase
          .from('worker_ui_overrides')
          .delete()
          .eq('worker_id', workerId)
          .eq('element_type', elementType)
          .eq('element_key', elementKey);
        if (error) throw error;
      }
    },
    onSuccess: (_, { workerId }) => {
      queryClient.invalidateQueries({ queryKey: ['worker-ui-overrides', workerId] });
      queryClient.invalidateQueries({ queryKey: ['my-ui-overrides', workerId] });
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });
};

// Predefined UI elements that can be hidden
export const UI_ELEMENTS = {
  pages: [
    { key: '/orders', label: 'الطلبيات' },
    { key: '/my-deliveries', label: 'توصيلاتي' },
    { key: '/my-promos', label: 'عملياتي' },
    { key: '/my-stock', label: 'مخزوني' },
    { key: '/product-offers', label: 'عروض المنتجات' },
    { key: '/promo-splits', label: 'تجزئة العروض' },
    { key: '/customer-accounts', label: 'حسابات العملاء' },
    { key: '/warehouse', label: 'المخزن' },
    { key: '/stock-receipts', label: 'وصولات المخزن' },
    { key: '/load-stock', label: 'تحميل للعامل' },
    { key: '/expenses', label: 'مصاريفي' },
    { key: '/daily-receipts', label: 'الفواتير اليومية' },
    { key: '/expenses-management', label: 'إدارة المصاريف' },
    { key: '/customer-debts', label: 'ديون العملاء' },
    { key: '/accounting', label: 'المحاسبة' },
    { key: '/worker-debts', label: 'ديون العمال' },
    { key: '/worker-tracking', label: 'تتبع العمال' },
    { key: '/worker-actions', label: 'إجراءات العمال' },
    { key: '/geo-operations', label: 'العمليات الجغرافية' },
    { key: '/activity-logs', label: 'سجل الأحداث' },
    { key: '/nearby-stores', label: 'المحلات القريبة' },
    { key: '/branches', label: 'الفروع' },
    { key: '/customers', label: 'العملاء' },
    { key: '/workers', label: 'العمال' },
    { key: '/products', label: 'المنتجات' },
    { key: '/permissions', label: 'الصلاحيات' },
    { key: '/settings', label: 'الإعدادات' },
    { key: '/promo-table', label: 'جدول العمليات' },
    { key: '/stats', label: 'الإحصائيات' },
    { key: '/guide', label: 'الدليل' },
    { key: '/available-offers', label: 'العروض المتاحة' },
    { key: '/manager-treasury', label: 'خزينة المدير' },
    { key: '/worker-liability', label: 'عهدة العمال' },
    { key: '/shared-invoices', label: 'الفواتير المشتركة' },
    { key: '/surplus-deficit', label: 'الفائض والعجز' },
    { key: '/rewards', label: 'المكافآت' },
    { key: '/my-rewards', label: 'مكافآتي' },
    { key: '/attendance', label: 'الحضور والانصراف' },
    { key: '/chat', label: 'المحادثات' },
  ],
  tabs: [
    { key: '/', label: 'الرئيسية' },
    { key: '/orders', label: 'الطلبيات' },
    { key: '/my-deliveries', label: 'توصيلاتي' },
    { key: '/my-promos', label: 'عملياتي' },
    { key: '/my-stock', label: 'مخزوني' },
    { key: '/expenses', label: 'مصاريفي' },
    { key: '/customer-debts', label: 'ديون العملاء' },
    { key: '/daily-receipts', label: 'الفواتير اليومية' },
    { key: '/my-rewards', label: 'مكافآتي' },
    { key: '/available-offers', label: 'العروض المتاحة' },
    { key: '/attendance', label: 'الحضور والانصراف' },
    { key: '/chat', label: 'المحادثات' },
    { key: '/customers', label: 'العملاء' },
    { key: '/workers', label: 'العمال' },
    { key: '/products', label: 'المنتجات' },
    { key: '/stats', label: 'الإحصائيات' },
    { key: '/warehouse', label: 'المخزن' },
    { key: '/rewards', label: 'المكافآت' },
    { key: '/manager-treasury', label: 'خزينة المدير' },
    { key: '/accounting', label: 'المحاسبة' },
    { key: '/promo-table', label: 'جدول العمليات' },
    { key: '/load-stock', label: 'تحميل للعامل' },
    { key: '/worker-actions', label: 'إجراءات العمال' },
    { key: '/promo-splits', label: 'تجزئة العروض' },
    { key: '/worker-tracking', label: 'تتبع العمال' },
    { key: '/geo-operations', label: 'العمليات الجغرافية' },
    { key: '/activity-logs', label: 'سجل الأحداث' },
    { key: '/surplus-deficit', label: 'الفائض والعجز' },
    { key: '/shared-invoices', label: 'الفواتير المشتركة' },
    { key: '/worker-liability', label: 'عهدة العمال' },
    { key: '/worker-debts', label: 'ديون العمال' },
  ],
  buttons: [
    // الرئيسية (WorkerHome)
    { key: 'home_direct_sale', label: 'بيع مباشر', group: 'الرئيسية' },
    { key: 'home_deliveries', label: 'توصيلاتي', group: 'الرئيسية' },
    { key: 'home_my_stock', label: 'رصيدي من المنتجات', group: 'الرئيسية' },
    { key: 'home_debts', label: 'إدارة الديون', group: 'الرئيسية' },
    { key: 'home_orders', label: 'إدارة الطلبيات', group: 'الرئيسية' },
    { key: 'home_promos', label: 'عملياتي', group: 'الرئيسية' },
    { key: 'home_customers', label: 'العملاء', group: 'الرئيسية' },
    { key: 'home_expenses', label: 'مصاريفي', group: 'الرئيسية' },
    { key: 'home_rewards', label: 'مكافآتي', group: 'الرئيسية' },
    { key: 'home_daily_receipts', label: 'الفواتير اليومية', group: 'الرئيسية' },
    { key: 'home_available_offers', label: 'العروض المتاحة', group: 'الرئيسية' },
    { key: 'home_attendance', label: 'الحضور والانصراف', group: 'الرئيسية' },
    { key: 'home_chat', label: 'المحادثات', group: 'الرئيسية' },
    { key: 'home_today_customers', label: 'عملاء اليوم', group: 'الرئيسية' },
    { key: 'home_worker_actions', label: 'إجراءات العمال', group: 'الرئيسية' },
    { key: 'home_warehouse_stock', label: 'مخزون الفرع', group: 'الرئيسية' },
    // الطلبيات (Orders)
    { key: 'create_order', label: 'إنشاء طلبية', group: 'الطلبيات' },
    { key: 'orders_search', label: 'بحث في الطلبيات', group: 'الطلبيات' },
    { key: 'orders_print', label: 'طباعة الطلبيات', group: 'الطلبيات' },
    // توصيلاتي (MyDeliveries)
    { key: 'deliveries_search', label: 'بحث في التوصيلات', group: 'توصيلاتي' },
    // رصيدي من المنتجات (MyStock)
    { key: 'stock_direct_sale', label: 'بيع مباشر', group: 'رصيدي من المنتجات' },
    { key: 'stock_load_request', label: 'طلب تحميل', group: 'رصيدي من المنتجات' },
    // عملياتي (MyPromos)
    { key: 'add_promo', label: 'إضافة عملية', group: 'عملياتي' },
    // مصاريفي (Expenses)
    { key: 'add_expense', label: 'إضافة مصروف', group: 'مصاريفي' },
    // العملاء (Customers)
    { key: 'add_customer', label: 'إضافة عميل', group: 'العملاء' },
    { key: 'manage_sectors', label: 'إدارة القطاعات', group: 'العملاء' },
    { key: 'customer_field_settings', label: 'إعدادات حقول العملاء', group: 'العملاء' },
    // تحميل للعامل (LoadStock)
    { key: 'load_stock', label: 'تحميل مخزون', group: 'تحميل للعامل' },
    { key: 'partial_load_orders', label: 'تحميل جزئي من الطلبيات', group: 'تحميل للعامل' },
    { key: 'load_empty_truck', label: 'تفريغ الشاحنة', group: 'تحميل للعامل' },
    { key: 'load_exchange', label: 'تبادل المنتجات', group: 'تحميل للعامل' },
    { key: 'load_sheet_print', label: 'طباعة ورقة الشحن', group: 'تحميل للعامل' },
    { key: 'load_review', label: 'مراجعة المخزون', group: 'تحميل للعامل' },
    { key: 'load_session_history', label: 'سجل جلسات الشحن', group: 'تحميل للعامل' },
    // عروض المنتجات (ProductOffers)
    { key: 'add_offer', label: 'إضافة عرض', group: 'عروض المنتجات' },
    // المخزن (WarehouseStock)
    { key: 'warehouse_direct_sale', label: 'بيع مباشر من المخزن', group: 'المخزن' },
    { key: 'warehouse_quick_load', label: 'تحميل سريع', group: 'المخزن' },
    { key: 'warehouse_factory_delivery', label: 'استلام من المصنع', group: 'المخزن' },
    { key: 'warehouse_review', label: 'مراجعة المخزن', group: 'المخزن' },
    { key: 'warehouse_pallet_calculator', label: 'حاسبة البالتات', group: 'المخزن' },
    // خزينة المدير (ManagerTreasury)
    { key: 'treasury_coin_exchange', label: 'صرف عملة', group: 'خزينة المدير' },
    { key: 'treasury_invoice_request', label: 'طلب فاتورة', group: 'خزينة المدير' },
    { key: 'treasury_quick_order', label: 'طلبية سريعة', group: 'خزينة المدير' },
    { key: 'treasury_settings', label: 'إعدادات الخزينة', group: 'خزينة المدير' },
    { key: 'treasury_handover', label: 'تسليم الخزينة', group: 'خزينة المدير' },
    // المحاسبة (AccountingSessions)
    { key: 'create_session', label: 'إنشاء جلسة محاسبة', group: 'المحاسبة' },
    // المكافآت (Rewards)
    { key: 'add_reward_task', label: 'إضافة مهمة مكافأة', group: 'المكافآت' },
    { key: 'reward_contest', label: 'إنشاء مسابقة', group: 'المكافآت' },
    { key: 'reward_settings', label: 'إعدادات المكافآت', group: 'المكافآت' },
    // ديون العملاء (CustomerDebts)
    { key: 'collect_debt_btn', label: 'تحصيل دين', group: 'ديون العملاء' },
    // وصولات المخزن (StockReceipts)
    { key: 'add_stock_receipt', label: 'إضافة وصل استلام', group: 'وصولات المخزن' },
    // إدارة المصاريف (ExpensesManagement)
    { key: 'manage_expense_categories', label: 'إدارة التصنيفات', group: 'إدارة المصاريف' },
    // الحضور والانصراف (Attendance)
    { key: 'attendance_settings', label: 'إعدادات الحضور', group: 'الحضور والانصراف' },
    { key: 'attendance_check_in', label: 'تسجيل حضور', group: 'الحضور والانصراف' },
    // المنتجات (Products)
    { key: 'add_product', label: 'إضافة منتج', group: 'المنتجات' },
    { key: 'pricing_groups', label: 'مجموعات التسعير', group: 'المنتجات' },
    { key: 'stamp_price', label: 'أسعار الطوابع', group: 'المنتجات' },
    // العمال (Workers)
    { key: 'add_worker', label: 'إضافة عامل', group: 'العمال' },
    // الفروع (Branches)
    { key: 'add_branch', label: 'إضافة فرع', group: 'الفروع' },
    // حسابات العملاء (CustomerAccounts)
    { key: 'approve_customer_account', label: 'الموافقة على حساب عميل', group: 'حسابات العملاء' },
    // تتبع العمال (WorkerTracking)
    { key: 'tracking_settings', label: 'إعدادات التتبع', group: 'تتبع العمال' },
    // عهدة العمال (WorkerLiability)
    { key: 'worker_financial_details', label: 'تفاصيل مالية للعامل', group: 'عهدة العمال' },
    // إجراءات العمال (WorkerActions)
    { key: 'wa_worker_profile', label: 'إعدادات البيانات', group: 'إجراءات العمال' },
    { key: 'wa_accounting', label: 'المحاسبة', group: 'إجراءات العمال' },
    { key: 'wa_load_stock', label: 'تحميل للعامل', group: 'إجراءات العمال' },
    { key: 'wa_truck_stock', label: 'رصيد الشاحنة', group: 'إجراءات العمال' },
    { key: 'wa_unload_truck', label: 'تفريغ الشاحنة', group: 'إجراءات العمال' },
    { key: 'wa_stock_review', label: 'جلسة مراجعة', group: 'إجراءات العمال' },
    { key: 'wa_session_history', label: 'سجل الجلسات', group: 'إجراءات العمال' },
    { key: 'wa_worker_debts', label: 'ديون العمال', group: 'إجراءات العمال' },
    { key: 'wa_liability', label: 'العهدة', group: 'إجراءات العمال' },
    { key: 'wa_coin_exchange', label: 'صرف عملة', group: 'إجراءات العمال' },
    { key: 'wa_expenses', label: 'المصاريف', group: 'إجراءات العمال' },
    { key: 'wa_tracking', label: 'التتبع', group: 'إجراءات العمال' },
    { key: 'wa_orders', label: 'الطلبيات', group: 'إجراءات العمال' },
    { key: 'wa_activity', label: 'سجل الأحداث', group: 'إجراءات العمال' },
    { key: 'wa_permissions', label: 'الصلاحيات', group: 'إجراءات العمال' },
    { key: 'wa_financial', label: 'البيانات المالية', group: 'إجراءات العمال' },
    { key: 'wa_points_log', label: 'سجل النقاط', group: 'إجراءات العمال' },
    { key: 'wa_rewards_page', label: 'المكافآت والعقوبات', group: 'إجراءات العمال' },
    { key: 'wa_handover_summary', label: 'ملخص التسليم', group: 'إجراءات العمال' },
    { key: 'wa_today_customers', label: 'عملاء اليوم', group: 'إجراءات العمال' },
    { key: 'wa_attendance_log', label: 'سجل المداومة', group: 'إجراءات العمال' },
    { key: 'wa_sales_summary', label: 'تجميع المبيعات', group: 'إجراءات العمال' },
    { key: 'wa_gifts_summary', label: 'تجميع العروض', group: 'إجراءات العمال' },
    { key: 'wa_achievements', label: 'المنجزات', group: 'إجراءات العمال' },
    { key: 'wa_sector_schedule', label: 'جدول السيكتور', group: 'إجراءات العمال' },
    { key: 'wa_sector_coverage', label: 'تعويض السيكتورات', group: 'إجراءات العمال' },
    { key: 'wa_orders_summary', label: 'تجميع الطلبيات', group: 'إجراءات العمال' },
  ],
  actions: [
    { key: 'collect_debt', label: 'تحصيل دين', group: 'ديون العملاء' },
    { key: 'modify_order', label: 'تعديل طلبية', group: 'الطلبيات' },
    { key: 'delete_order', label: 'حذف طلبية', group: 'الطلبيات' },
    { key: 'cancel_order', label: 'إلغاء طلبية', group: 'الطلبيات' },
    { key: 'print_receipt', label: 'طباعة فاتورة', group: 'الطلبيات' },
    { key: 'assign_order', label: 'تعيين عامل للطلبية', group: 'الطلبيات' },
    { key: 'verify_check', label: 'التحقق من الشيك', group: 'الطلبيات' },
    { key: 'modify_delivery', label: 'تعديل توصيلة', group: 'توصيلاتي' },
    { key: 'cancel_delivery', label: 'إلغاء توصيلة', group: 'توصيلاتي' },
    { key: 'delivery_payment', label: 'دفع التوصيلة', group: 'توصيلاتي' },
    { key: 'edit_promo', label: 'تعديل عملية', group: 'عملياتي' },
    { key: 'delete_promo', label: 'حذف عملية', group: 'عملياتي' },
    { key: 'delete_expense', label: 'حذف مصروف', group: 'مصاريفي' },
    { key: 'edit_customer', label: 'تعديل عميل', group: 'العملاء' },
    { key: 'delete_customer', label: 'حذف عميل', group: 'العملاء' },
    { key: 'view_customer_profile', label: 'عرض ملف العميل', group: 'العملاء' },
    { key: 'customer_special_prices', label: 'أسعار خاصة للعميل', group: 'العملاء' },
    { key: 'edit_product', label: 'تعديل منتج', group: 'المنتجات' },
    { key: 'delete_product', label: 'حذف منتج', group: 'المنتجات' },
    { key: 'group_price_update', label: 'تحديث أسعار جماعي', group: 'المنتجات' },
    { key: 'edit_worker', label: 'تعديل عامل', group: 'العمال' },
    { key: 'deactivate_worker', label: 'تعطيل عامل', group: 'العمال' },
    { key: 'worker_achievements', label: 'إنجازات العامل', group: 'العمال' },
    { key: 'review_expense', label: 'مراجعة مصروف', group: 'إدارة المصاريف' },
    { key: 'approve_debt_collection', label: 'الموافقة على تحصيل', group: 'ديون العملاء' },
    { key: 'reject_debt_collection', label: 'رفض تحصيل', group: 'ديون العملاء' },
    { key: 'complete_accounting_session', label: 'إتمام جلسة محاسبة', group: 'المحاسبة' },
    { key: 'view_accounting_details', label: 'عرض تفاصيل المحاسبة', group: 'المحاسبة' },
    { key: 'handover_print', label: 'طباعة التسليم', group: 'خزينة المدير' },
    { key: 'approve_customer_change', label: 'الموافقة على تعديل عميل', group: 'العملاء' },
    { key: 'reject_customer_change', label: 'رفض تعديل عميل', group: 'العملاء' },
    { key: 'stock_verification', label: 'التحقق من المخزون', group: 'المخزن' },
    { key: 'exchange_session', label: 'جلسة تبادل', group: 'المخزن' },
    { key: 'approve_load_request', label: 'الموافقة على طلب تحميل', group: 'تحميل للعامل' },
    { key: 'reward_dispute', label: 'نزاع مكافأة', group: 'المكافآت' },
    { key: 'edit_reward_task', label: 'تعديل مهمة مكافأة', group: 'المكافآت' },
    { key: 'delete_reward_task', label: 'حذف مهمة مكافأة', group: 'المكافآت' },
    { key: 'worker_points_adjust', label: 'تعديل نقاط العامل', group: 'المكافآت' },
    { key: 'view_attendance_log', label: 'عرض سجل الحضور', group: 'الحضور والانصراف' },
    { key: 'send_chat_message', label: 'إرسال رسالة', group: 'المحادثات' },
    { key: 'create_conversation', label: 'إنشاء محادثة', group: 'المحادثات' },
  ],
};
