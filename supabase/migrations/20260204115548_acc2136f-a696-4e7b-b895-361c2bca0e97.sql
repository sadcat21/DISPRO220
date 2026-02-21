-- إضافة صلاحيات مفقودة للطلبيات
INSERT INTO public.permissions (code, name_ar, description_ar, category, resource)
VALUES 
  ('view_assigned_orders', 'عرض الطلبيات المسندة', 'عرض الطلبيات المسندة للعامل', 'crud', 'orders'),
  ('page_orders', 'صفحة الطلبيات', 'الوصول لصفحة الطلبيات', 'page_access', 'orders')
ON CONFLICT (code) DO NOTHING;

-- إضافة صلاحيات لمندوب التوصيل
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 
    (SELECT id FROM public.custom_roles WHERE code = 'delivery_rep'),
    id
FROM public.permissions 
WHERE code IN ('page_home', 'view_assigned_orders', 'update_order_status', 'customers_read')
ON CONFLICT DO NOTHING;

-- التأكد من أن مندوب المبيعات لديه صلاحية صفحة الطلبيات
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 
    (SELECT id FROM public.custom_roles WHERE code = 'sales_rep'),
    id
FROM public.permissions 
WHERE code = 'page_orders'
ON CONFLICT DO NOTHING;