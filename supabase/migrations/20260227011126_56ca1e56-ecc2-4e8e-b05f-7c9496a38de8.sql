-- Fix corrupted Oscar 250gr warehouse stock value
-- Current: 982.8199999999999 (wrong math)
-- Correct: 982.02 (982 boxes + 2 pieces, pieces_per_box=20)
UPDATE warehouse_stock SET quantity = 982.02 WHERE id = 'c284b490-7105-4e80-b602-7c8b208a585c';

-- Fix worker stock floating point
-- Current: 13.179999999999998 → should be 13.18
UPDATE worker_stock SET quantity = 13.18 WHERE id = 'e24c037b-0ffc-4cbb-b4b1-c2bb6d8fac91';
