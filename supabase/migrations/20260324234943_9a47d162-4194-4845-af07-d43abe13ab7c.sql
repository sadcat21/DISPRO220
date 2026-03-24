
-- Add warehouse_manager to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'warehouse_manager';
