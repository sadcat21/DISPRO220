-- حذف صلاحيات العروض من مندوب المبيعات
DELETE FROM public.role_permissions 
WHERE role_id = (SELECT id FROM public.custom_roles WHERE code = 'sales_rep')
AND permission_id IN (
    SELECT id FROM public.permissions 
    WHERE code IN ('promos_create', 'promos_read', 'promos_update', 'promos_delete', 'page_my_promos', 'view_all_promos')
);

-- إضافة صلاحية صفحة الطلبيات إذا لم تكن موجودة
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 
    (SELECT id FROM public.custom_roles WHERE code = 'sales_rep'),
    id
FROM public.permissions 
WHERE code IN ('page_orders', 'orders_own')
ON CONFLICT DO NOTHING;