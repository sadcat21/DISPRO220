-- Drop and recreate verify_worker_password with all needed fields
DROP FUNCTION IF EXISTS public.verify_worker_password(text, text);

CREATE FUNCTION public.verify_worker_password(
  p_username text,
  p_password_hash text
)
RETURNS TABLE(
  id uuid,
  username text,
  full_name text,
  role public.app_role,
  branch_id uuid,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.id, w.username, w.full_name, w.role, w.branch_id, w.is_active, w.created_at, w.updated_at
  FROM public.workers w
  WHERE lower(w.username) = lower(p_username)
    AND w.password_hash = p_password_hash;
$$;