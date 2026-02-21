-- Add custom_role_id to worker_roles table
ALTER TABLE public.worker_roles 
ADD COLUMN custom_role_id uuid REFERENCES public.custom_roles(id) ON DELETE SET NULL;

-- Create an index for better performance
CREATE INDEX idx_worker_roles_custom_role_id ON public.worker_roles(custom_role_id);

-- Comment for clarity
COMMENT ON COLUMN public.worker_roles.custom_role_id IS 'Reference to custom role that defines permissions for this worker';