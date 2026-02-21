-- Update get_worker_roles function to include custom role info
DROP FUNCTION IF EXISTS public.get_worker_roles(uuid);

CREATE OR REPLACE FUNCTION public.get_worker_roles(p_worker_id uuid)
RETURNS TABLE (
    role public.app_role,
    branch_id uuid,
    branch_name text,
    custom_role_id uuid,
    custom_role_code text,
    custom_role_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        wr.role, 
        wr.branch_id, 
        b.name as branch_name,
        cr.id as custom_role_id,
        cr.code as custom_role_code,
        cr.name_ar as custom_role_name
    FROM public.worker_roles wr
    LEFT JOIN public.branches b ON b.id = wr.branch_id
    LEFT JOIN public.custom_roles cr ON cr.id = wr.custom_role_id
    WHERE wr.worker_id = p_worker_id
$$;