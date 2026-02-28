
-- Pallet settings: how many boxes per pallet for each product
CREATE TABLE public.pallet_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  boxes_per_pallet integer NOT NULL DEFAULT 1,
  branch_id uuid REFERENCES public.branches(id),
  created_by uuid REFERENCES public.workers(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(product_id, branch_id)
);

ALTER TABLE public.pallet_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage pallet_settings"
ON public.pallet_settings FOR ALL
USING (is_admin() OR is_branch_admin());

CREATE POLICY "Workers can view pallet_settings"
ON public.pallet_settings FOR SELECT
USING (is_worker());

-- Factory orders: receiving from factory or sending to factory
CREATE TABLE public.factory_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_type text NOT NULL DEFAULT 'receiving', -- 'receiving' or 'sending'
  branch_id uuid REFERENCES public.branches(id),
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'confirmed'
  notes text,
  created_by uuid REFERENCES public.workers(id),
  confirmed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.factory_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage factory_orders"
ON public.factory_orders FOR ALL
USING (is_admin() OR is_branch_admin());

CREATE POLICY "Workers can view factory_orders"
ON public.factory_orders FOR SELECT
USING (is_worker());

-- Factory order items: products + pallets
CREATE TABLE public.factory_order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  factory_order_id uuid NOT NULL REFERENCES public.factory_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  product_quantity numeric NOT NULL DEFAULT 0,
  pallet_quantity numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.factory_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage factory_order_items"
ON public.factory_order_items FOR ALL
USING (EXISTS (
  SELECT 1 FROM factory_orders fo
  WHERE fo.id = factory_order_items.factory_order_id
  AND (is_admin() OR is_branch_admin())
));

CREATE POLICY "Workers can view factory_order_items"
ON public.factory_order_items FOR SELECT
USING (EXISTS (
  SELECT 1 FROM factory_orders fo
  WHERE fo.id = factory_order_items.factory_order_id
  AND is_worker()
));

-- Add pallet tracking columns to warehouse_stock
ALTER TABLE public.warehouse_stock
ADD COLUMN IF NOT EXISTS pallet_quantity numeric NOT NULL DEFAULT 0;
