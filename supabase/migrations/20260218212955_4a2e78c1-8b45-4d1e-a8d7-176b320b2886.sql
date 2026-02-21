
-- ============================================================
-- FIX ALL FK CONSTRAINTS FOR DATA MANAGEMENT WIPE TOOL
-- Using CASCADE where child record is meaningless without parent
-- Using SET NULL where reference is optional
-- ============================================================

-- promos → customers (CASCADE)
ALTER TABLE promos DROP CONSTRAINT IF EXISTS promos_customer_id_fkey;
ALTER TABLE promos ADD CONSTRAINT promos_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

-- promos → products (CASCADE)
ALTER TABLE promos DROP CONSTRAINT IF EXISTS promos_product_id_fkey;
ALTER TABLE promos ADD CONSTRAINT promos_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- orders → customers (CASCADE)
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_customer_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

-- order_items → orders (CASCADE)
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_order_id_fkey;
ALTER TABLE order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- order_items → products (CASCADE)
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;
ALTER TABLE order_items ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- customer_debts → customers (CASCADE)
ALTER TABLE customer_debts DROP CONSTRAINT IF EXISTS customer_debts_customer_id_fkey;
ALTER TABLE customer_debts ADD CONSTRAINT customer_debts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

-- debt_collections → customer_debts (CASCADE)
ALTER TABLE debt_collections DROP CONSTRAINT IF EXISTS debt_collections_debt_id_fkey;
ALTER TABLE debt_collections ADD CONSTRAINT debt_collections_debt_id_fkey FOREIGN KEY (debt_id) REFERENCES customer_debts(id) ON DELETE CASCADE;

-- debt_payments → customer_debts (CASCADE)
ALTER TABLE debt_payments DROP CONSTRAINT IF EXISTS debt_payments_debt_id_fkey;
ALTER TABLE debt_payments ADD CONSTRAINT debt_payments_debt_id_fkey FOREIGN KEY (debt_id) REFERENCES customer_debts(id) ON DELETE CASCADE;

-- accounting_session_items → accounting_sessions (CASCADE)
ALTER TABLE accounting_session_items DROP CONSTRAINT IF EXISTS accounting_session_items_session_id_fkey;
ALTER TABLE accounting_session_items ADD CONSTRAINT accounting_session_items_session_id_fkey FOREIGN KEY (session_id) REFERENCES accounting_sessions(id) ON DELETE CASCADE;

-- product_offer_tiers → product_offers (CASCADE)
ALTER TABLE product_offer_tiers DROP CONSTRAINT IF EXISTS product_offer_tiers_offer_id_fkey;
ALTER TABLE product_offer_tiers ADD CONSTRAINT product_offer_tiers_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES product_offers(id) ON DELETE CASCADE;

-- product_offer_tiers → products gift (SET NULL)
ALTER TABLE product_offer_tiers DROP CONSTRAINT IF EXISTS product_offer_tiers_gift_product_id_fkey;
ALTER TABLE product_offer_tiers ADD CONSTRAINT product_offer_tiers_gift_product_id_fkey FOREIGN KEY (gift_product_id) REFERENCES products(id) ON DELETE SET NULL;

-- product_offers → products (CASCADE)
ALTER TABLE product_offers DROP CONSTRAINT IF EXISTS product_offers_product_id_fkey;
ALTER TABLE product_offers ADD CONSTRAINT product_offers_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- product_offers → products gift (SET NULL)
ALTER TABLE product_offers DROP CONSTRAINT IF EXISTS product_offers_gift_product_id_fkey;
ALTER TABLE product_offers ADD CONSTRAINT product_offers_gift_product_id_fkey FOREIGN KEY (gift_product_id) REFERENCES products(id) ON DELETE SET NULL;

-- order_items → product_offers gift (SET NULL)
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_gift_offer_id_fkey;
ALTER TABLE order_items ADD CONSTRAINT order_items_gift_offer_id_fkey FOREIGN KEY (gift_offer_id) REFERENCES product_offers(id) ON DELETE SET NULL;

-- customer_special_prices → customers (CASCADE)
ALTER TABLE customer_special_prices DROP CONSTRAINT IF EXISTS customer_special_prices_customer_id_fkey;
ALTER TABLE customer_special_prices ADD CONSTRAINT customer_special_prices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

-- customer_special_prices → products (CASCADE)
ALTER TABLE customer_special_prices DROP CONSTRAINT IF EXISTS customer_special_prices_product_id_fkey;
ALTER TABLE customer_special_prices ADD CONSTRAINT customer_special_prices_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- customer_accounts → customers (SET NULL: account can remain after customer deletion)
ALTER TABLE customer_accounts DROP CONSTRAINT IF EXISTS customer_accounts_customer_id_fkey;
ALTER TABLE customer_accounts ADD CONSTRAINT customer_accounts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- quantity_price_tiers → products (CASCADE)
ALTER TABLE quantity_price_tiers DROP CONSTRAINT IF EXISTS quantity_price_tiers_product_id_fkey;
ALTER TABLE quantity_price_tiers ADD CONSTRAINT quantity_price_tiers_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- product_pricing_groups → products (CASCADE)
ALTER TABLE product_pricing_groups DROP CONSTRAINT IF EXISTS product_pricing_groups_product_id_fkey;
ALTER TABLE product_pricing_groups ADD CONSTRAINT product_pricing_groups_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- product_shortage_tracking → customers (CASCADE)
ALTER TABLE product_shortage_tracking DROP CONSTRAINT IF EXISTS product_shortage_tracking_customer_id_fkey;
ALTER TABLE product_shortage_tracking ADD CONSTRAINT product_shortage_tracking_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

-- product_shortage_tracking → products (CASCADE)
ALTER TABLE product_shortage_tracking DROP CONSTRAINT IF EXISTS product_shortage_tracking_product_id_fkey;
ALTER TABLE product_shortage_tracking ADD CONSTRAINT product_shortage_tracking_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- stock_movements → products (CASCADE)
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_product_id_fkey;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- navbar_preferences → workers (CASCADE)
ALTER TABLE navbar_preferences DROP CONSTRAINT IF EXISTS navbar_preferences_worker_id_fkey;
ALTER TABLE navbar_preferences ADD CONSTRAINT navbar_preferences_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE;
