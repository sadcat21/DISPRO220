
-- Add "رقم الفاتورة" for all 3 document types
INSERT INTO public.verification_checklist_items (document_type, group_title, label, field_type, sort_order) VALUES
('check', 'معلومات العميل والفاتورة', 'رقم الفاتورة', 'text', 9),
('receipt', 'معلومات العميل والفاتورة', 'رقم الفاتورة', 'text', 9),
('transfer', 'معلومات العميل والفاتورة', 'رقم الفاتورة', 'text', 9);

-- Fix duplicate "رقم الوصل" (number type) in receipt - change to text
UPDATE public.verification_checklist_items SET field_type = 'text' WHERE id = '49a3934d-9f1a-4c4b-afb3-ada6aba401e7';

-- Delete duplicate "رقم الوصل" in receipt (keep the corrected one)
DELETE FROM public.verification_checklist_items WHERE id = 'db4c7db5-4450-4d71-bff1-9635321b01e3';

-- Fix "رقم الوصل" in transfer - change to text type
UPDATE public.verification_checklist_items SET field_type = 'text', group_title = 'بيانات التحويل (Virement)' WHERE id = 'ab35a32e-061a-44c2-ae02-1ffc8bcbcdc8';
