
-- Update manager_handovers to support multiple payment types per handover
-- and split cash into invoice_1 cash and invoice_2 cash
ALTER TABLE public.manager_handovers
  ADD COLUMN cash_invoice1 numeric NOT NULL DEFAULT 0,
  ADD COLUMN cash_invoice2 numeric NOT NULL DEFAULT 0,
  ADD COLUMN checks_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN receipts_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN transfers_amount numeric NOT NULL DEFAULT 0;
