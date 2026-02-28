CREATE POLICY "Admins can delete stock_receipts"
ON public.stock_receipts FOR DELETE
USING (is_admin() OR is_branch_admin());

-- Also add DELETE policy for stock_receipt_items (child records)
CREATE POLICY "Admins can delete stock_receipt_items"
ON public.stock_receipt_items FOR DELETE
USING (is_admin() OR is_branch_admin());