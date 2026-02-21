-- Add visible_to_roles column to expense_categories
-- NULL or empty array means visible to all roles
ALTER TABLE public.expense_categories 
ADD COLUMN visible_to_roles text[] DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.expense_categories.visible_to_roles IS 'Array of custom_role codes that can see this category. NULL means visible to all.';