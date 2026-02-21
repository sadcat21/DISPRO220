-- Create a secure view for workers that excludes password_hash
CREATE OR REPLACE VIEW public.workers_safe
WITH (security_invoker = on) AS
SELECT id, username, full_name, role, branch_id, is_active, created_at, updated_at
FROM public.workers;

-- Update the workers SELECT policy to be more restrictive (deny direct access)
-- But keep the current one since the view uses security_invoker