-- Add approval workflow columns to stock_receipts
ALTER TABLE public.stock_receipts 
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed',
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.workers(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Create index for pending approvals lookup
CREATE INDEX IF NOT EXISTS idx_stock_receipts_status ON public.stock_receipts(status);

-- Allow warehouse managers to insert stock_receipts
-- (They already have access through existing policies, but let's ensure)
