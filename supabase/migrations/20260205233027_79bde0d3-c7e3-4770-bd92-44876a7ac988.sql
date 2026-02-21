-- Create helper function to bind current Supabase auth session (auth.uid()) to a worker
-- This is needed because the app uses custom username/password auth, but RLS helpers rely on auth.uid().

CREATE OR REPLACE FUNCTION public.set_worker_session(p_worker_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: missing auth.uid()';
  END IF;

  SELECT w.role INTO v_role
  FROM public.workers w
  WHERE w.id = p_worker_id
    AND w.is_active = true;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Invalid worker or inactive';
  END IF;

  -- Ensure a single row per user_id
  DELETE FROM public.user_roles ur
  WHERE ur.user_id = auth.uid();

  INSERT INTO public.user_roles (user_id, worker_id, role)
  VALUES (auth.uid(), p_worker_id, v_role);
END;
$$;