
-- Allow admins to delete all expenses
CREATE POLICY "Admins can delete expenses"
ON public.expenses FOR DELETE
USING (is_admin() OR is_branch_admin());

-- Fix FK constraint: allow deleting accounting_sessions by setting session_id to NULL in manager_treasury
ALTER TABLE public.manager_treasury
  DROP CONSTRAINT manager_treasury_session_id_fkey;

ALTER TABLE public.manager_treasury
  ADD CONSTRAINT manager_treasury_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES public.accounting_sessions(id) ON DELETE SET NULL;
