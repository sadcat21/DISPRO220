
CREATE OR REPLACE FUNCTION public.is_worker()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() AND role IN ('admin', 'worker', 'branch_admin', 'supervisor')
    )
$$;
