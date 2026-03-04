
ALTER TABLE public.accounting_session_items DROP CONSTRAINT IF EXISTS accounting_session_items_item_type_check;

ALTER TABLE public.accounting_session_items ADD CONSTRAINT accounting_session_items_item_type_check CHECK (
  item_type IN (
    'total_sales', 'total_paid', 'new_debts',
    'invoice1_total', 'invoice1_check', 'invoice1_transfer', 'invoice1_receipt', 'invoice1_espace_cash', 'invoice1_versement_cash',
    'invoice2_cash',
    'debt_collections_total', 'debt_collections_cash', 'debt_collections_check', 'debt_collections_transfer', 'debt_collections_receipt',
    'physical_cash', 'coin_amount', 'expenses', 'customer_surplus_cash'
  )
);
