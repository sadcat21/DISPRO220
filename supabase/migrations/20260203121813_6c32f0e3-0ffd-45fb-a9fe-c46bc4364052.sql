-- 1) Ensure workers are active by default
ALTER TABLE public.workers
  ALTER COLUMN is_active SET DEFAULT true;

-- 2) Activate any existing inactive accounts (so no one is blocked)
UPDATE public.workers
SET is_active = true
WHERE is_active IS DISTINCT FROM true;

-- 3) Update password verification function to NOT depend on is_active
CREATE OR REPLACE FUNCTION public.verify_worker_password(
  p_username text,
  p_password_hash text
)
RETURNS TABLE(
  id uuid,
  username text,
  full_name text,
  role public.app_role
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.id, w.username, w.full_name, w.role
  FROM public.workers w
  WHERE lower(w.username) = lower(p_username)
    AND w.password_hash = p_password_hash;
$$;