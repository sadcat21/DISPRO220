
-- Allow admins and branch admins to manage expense categories
CREATE POLICY "Admins can manage expense categories"
  ON public.expense_categories FOR ALL
  USING (public.is_admin() OR public.is_branch_admin())
  WITH CHECK (public.is_admin() OR public.is_branch_admin());
