-- Remove duplicate rows, keep only the latest one
DELETE FROM public.app_settings
WHERE key = 'customer_field_rules_v1'
  AND id NOT IN (
    SELECT DISTINCT ON (COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'), key) id
    FROM public.app_settings
    WHERE key = 'customer_field_rules_v1'
    ORDER BY COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'), key, updated_at DESC
  );

-- Create a unique index that handles NULL branch_id properly
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_settings_branch_key_unique
ON public.app_settings (COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'), key);