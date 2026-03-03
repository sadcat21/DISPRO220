-- Add worker profile fields for bilingual names and phone numbers
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS full_name_fr TEXT;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS print_name TEXT;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS work_phone TEXT;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS personal_phone TEXT;