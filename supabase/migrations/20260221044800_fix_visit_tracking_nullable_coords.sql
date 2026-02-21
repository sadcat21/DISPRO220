-- Allow NULL latitude/longitude so operations without GPS are still recorded
ALTER TABLE public.visit_tracking 
  ALTER COLUMN latitude DROP NOT NULL,
  ALTER COLUMN longitude DROP NOT NULL;
