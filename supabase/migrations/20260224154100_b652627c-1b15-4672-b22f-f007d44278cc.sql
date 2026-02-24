
-- Add granted column to worker_permissions to support deny overrides
ALTER TABLE public.worker_permissions ADD COLUMN IF NOT EXISTS granted boolean NOT NULL DEFAULT true;

-- Update get_worker_permissions to respect individual overrides with priority
CREATE OR REPLACE FUNCTION public.get_worker_permissions(p_worker_id uuid)
RETURNS TABLE(permission_code text, permission_name text, category text, resource text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    -- Get role-based permissions MINUS individually denied ones
    SELECT DISTINCT p.code, p.name_ar, p.category, p.resource
    FROM public.worker_roles wr
    JOIN public.role_permissions rp ON rp.role_id = wr.custom_role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE wr.worker_id = p_worker_id
    AND NOT EXISTS (
        SELECT 1 FROM public.worker_permissions wp
        WHERE wp.worker_id = p_worker_id
        AND wp.permission_id = p.id
        AND wp.granted = false
    )
    
    UNION
    
    -- Individual worker permissions that are explicitly granted
    SELECT DISTINCT p.code, p.name_ar, p.category, p.resource
    FROM public.worker_permissions wp
    JOIN public.permissions p ON p.id = wp.permission_id
    WHERE wp.worker_id = p_worker_id
    AND wp.granted = true
$$;

-- Update worker_has_permission to also check individual overrides with priority
CREATE OR REPLACE FUNCTION public.worker_has_permission(p_worker_id uuid, p_permission_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT CASE
        -- If individual override exists, use it
        WHEN EXISTS (
            SELECT 1 FROM public.worker_permissions wp
            JOIN public.permissions p ON p.id = wp.permission_id
            WHERE wp.worker_id = p_worker_id AND p.code = p_permission_code
        ) THEN (
            SELECT wp.granted FROM public.worker_permissions wp
            JOIN public.permissions p ON p.id = wp.permission_id
            WHERE wp.worker_id = p_worker_id AND p.code = p_permission_code
            LIMIT 1
        )
        -- Otherwise check role-based
        ELSE EXISTS (
            SELECT 1 
            FROM public.worker_roles wr
            JOIN public.custom_roles cr ON cr.code = wr.role::text
            JOIN public.role_permissions rp ON rp.role_id = cr.id
            JOIN public.permissions p ON p.id = rp.permission_id
            WHERE wr.worker_id = p_worker_id AND p.code = p_permission_code
        )
    END
$$;
