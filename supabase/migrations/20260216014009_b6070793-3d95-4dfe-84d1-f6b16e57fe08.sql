-- Change period_start and period_end from date to timestamptz to preserve time info
ALTER TABLE public.accounting_sessions 
  ALTER COLUMN period_start TYPE timestamptz USING (period_start::timestamptz),
  ALTER COLUMN period_end TYPE timestamptz USING (period_end::timestamptz);