-- Drop the existing unique constraint
ALTER TABLE public.worker_roles DROP CONSTRAINT IF EXISTS worker_roles_worker_id_role_branch_id_key;

-- Create a new unique constraint that includes custom_role_id
CREATE UNIQUE INDEX worker_roles_unique_combo ON public.worker_roles (worker_id, role, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(custom_role_id, '00000000-0000-0000-0000-000000000000'::uuid));