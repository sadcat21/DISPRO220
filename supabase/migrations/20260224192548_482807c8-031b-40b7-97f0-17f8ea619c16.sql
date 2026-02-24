
-- Fix the latest Oscar 250gr sale (4 boxes = 4 gift pieces)
UPDATE public.order_items SET gift_quantity = 4, gift_offer_id = '9e2c3ad8-f235-4f66-af29-92c7c299f809' 
WHERE id = 'b685ad07-8760-4b73-95c1-cac5d80bc0ff';

UPDATE public.promos SET gratuite_quantity = 4 
WHERE id = 'f19cbcd8-895b-4ff3-99c3-2111c09641f8';
