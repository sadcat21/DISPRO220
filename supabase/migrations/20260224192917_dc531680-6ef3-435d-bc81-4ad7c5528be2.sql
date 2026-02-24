
-- Fix Oscar 250gr: 15 boxes = 15 gift pieces, 5 boxes = 5 gift pieces
UPDATE public.order_items SET gift_quantity = 15 WHERE id = '1398bf8c-7fb0-4305-917c-b07c57be9da8';
UPDATE public.order_items SET gift_quantity = 5 WHERE id = '2757eee9-4797-4dca-88a1-b5224ccf254d';

UPDATE public.promos SET gratuite_quantity = 15 WHERE id = '6a2a6eb8-02c6-4f1a-98fd-ed83ecc44283';
UPDATE public.promos SET gratuite_quantity = 5 WHERE id = 'd8ce604d-2fcc-47a8-8081-f6856c9b0e64';
