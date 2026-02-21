-- إضافة الأدوار المخصصة المتبقية
INSERT INTO public.custom_roles (code, name_ar, description_ar, is_system) VALUES
('delivery_rep', 'مندوب توصيل', 'مسؤول عن توصيل الطلبيات للعملاء', true),
('warehouse_manager', 'مسؤول المخزن', 'مسؤول عن إدارة المخزون والمنتجات', true)
ON CONFLICT (code) DO NOTHING;

-- ربط صلاحيات مندوب المبيعات (sales_rep)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 
    (SELECT id FROM public.custom_roles WHERE code = 'sales_rep'),
    id
FROM public.permissions 
WHERE code IN (
    'page_home',
    'page_my_promos',
    'page_customers',
    'customers_read',
    'customers_create',
    'customers_update',
    'promos_create',
    'promos_read',
    'promos_update',
    'promos_delete',
    'products_read',
    'create_orders',
    'orders_own',
    'scope_own'
)
ON CONFLICT DO NOTHING;

-- ربط صلاحيات مندوب التوصيل (delivery_rep)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 
    (SELECT id FROM public.custom_roles WHERE code = 'delivery_rep'),
    id
FROM public.permissions 
WHERE code IN (
    'page_home',
    'customers_read',
    'products_read',
    'orders_assigned',
    'update_order_status',
    'scope_own'
)
ON CONFLICT DO NOTHING;

-- ربط صلاحيات مسؤول المخزن (warehouse_manager)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 
    (SELECT id FROM public.custom_roles WHERE code = 'warehouse_manager'),
    id
FROM public.permissions 
WHERE code IN (
    'page_home',
    'page_products',
    'products_read',
    'products_create',
    'products_update',
    'orders_branch',
    'scope_branch'
)
ON CONFLICT DO NOTHING;