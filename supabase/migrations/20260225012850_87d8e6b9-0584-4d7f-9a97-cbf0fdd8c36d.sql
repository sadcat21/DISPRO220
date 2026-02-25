
-- Add customer_type column to customers table
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_type text DEFAULT NULL;

-- Insert default customer types into app_settings
INSERT INTO public.app_settings (key, value)
VALUES ('customer_types', '["محل","سوبر ماركت","مول","كروسيست"]')
ON CONFLICT DO NOTHING;
