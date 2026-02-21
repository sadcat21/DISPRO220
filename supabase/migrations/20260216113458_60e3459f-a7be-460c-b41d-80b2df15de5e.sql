-- Add debt collection permissions
INSERT INTO permissions (code, name_ar, category, resource, description_ar) VALUES
  ('page_customer_debts', 'صفحة ديون العملاء', 'page_access', 'customer_debts', 'الوصول لصفحة ديون العملاء وتحصيلها'),
  ('collect_debts', 'تحصيل الديون', 'crud', 'customer_debts', 'تحصيل مبالغ الديون من العملاء'),
  ('view_customer_debts', 'عرض ديون العملاء', 'crud', 'customer_debts', 'عرض قائمة ديون العملاء');
