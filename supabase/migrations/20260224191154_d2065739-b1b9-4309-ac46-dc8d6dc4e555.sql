
-- Fix Oscar 250gr promos: set gratuite_quantity = 1 (1 gift piece was delivered)
UPDATE public.promos SET gratuite_quantity = 1 
WHERE id IN ('6a2a6eb8-02c6-4f1a-98fd-ed83ecc44283', 'd8ce604d-2fcc-47a8-8081-f6856c9b0e64');

-- Fix Oscar 250gr order_items: set gift_quantity = 1 and link to offer
UPDATE public.order_items SET gift_quantity = 1, gift_offer_id = '9e2c3ad8-f235-4f66-af29-92c7c299f809' 
WHERE id IN ('1398bf8c-7fb0-4305-917c-b07c57be9da8', '2757eee9-4797-4dca-88a1-b5224ccf254d');
