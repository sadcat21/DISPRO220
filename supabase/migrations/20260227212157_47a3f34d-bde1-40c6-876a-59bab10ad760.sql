
-- Add surplus and custom load tracking to loading_session_items
ALTER TABLE public.loading_session_items
  ADD COLUMN surplus_quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN is_custom_load boolean NOT NULL DEFAULT false,
  ADD COLUMN custom_load_note text;
