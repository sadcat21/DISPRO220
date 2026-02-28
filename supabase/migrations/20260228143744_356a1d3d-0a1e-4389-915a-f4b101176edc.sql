ALTER TABLE public.worker_debts
DROP CONSTRAINT IF EXISTS worker_debts_session_id_fkey;

ALTER TABLE public.worker_debts
ADD CONSTRAINT worker_debts_session_id_fkey
FOREIGN KEY (session_id)
REFERENCES public.accounting_sessions(id)
ON DELETE SET NULL;