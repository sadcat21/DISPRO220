-- Add gift_quantity column to order_items to track gift boxes per item
ALTER TABLE public.order_items ADD COLUMN gift_quantity integer NOT NULL DEFAULT 0;

-- Add gift_offer_id to track which offer was applied
ALTER TABLE public.order_items ADD COLUMN gift_offer_id uuid REFERENCES public.product_offers(id) ON DELETE SET NULL;