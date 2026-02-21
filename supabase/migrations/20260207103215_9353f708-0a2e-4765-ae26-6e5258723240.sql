
-- Add multilingual columns to expense_categories (name stays as primary/Arabic)
ALTER TABLE public.expense_categories ADD COLUMN IF NOT EXISTS name_fr text;
ALTER TABLE public.expense_categories ADD COLUMN IF NOT EXISTS name_en text;

-- Migrate existing Arabic category "أخرى" translations
UPDATE public.expense_categories SET name_fr = 'Autres', name_en = 'Other' WHERE name = 'أخرى';

-- Add receipt_urls array column to expenses for multiple receipts
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS receipt_urls text[] DEFAULT '{}';

-- Migrate existing single receipt_url to receipt_urls array
UPDATE public.expenses SET receipt_urls = ARRAY[receipt_url] WHERE receipt_url IS NOT NULL AND (receipt_urls IS NULL OR receipt_urls = '{}');
