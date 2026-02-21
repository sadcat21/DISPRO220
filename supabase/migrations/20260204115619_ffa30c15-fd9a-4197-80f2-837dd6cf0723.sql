-- تحديث دالة get_worker_permissions لتحصل على الصلاحيات من الدور الوظيفي
CREATE OR REPLACE FUNCTION public.get_worker_permissions(p_worker_id uuid)
RETURNS TABLE(permission_code text, permission_name text, category text, resource text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT DISTINCT p.code, p.name_ar, p.category, p.resource
    FROM public.worker_roles wr
    JOIN public.role_permissions rp ON rp.role_id = wr.custom_role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE wr.worker_id = p_worker_id
$$;