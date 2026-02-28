
-- Create table for dynamic verification checklist items
CREATE TABLE public.verification_checklist_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_type text NOT NULL CHECK (document_type IN ('check', 'receipt', 'transfer')),
  group_title text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL DEFAULT 'checkbox' CHECK (field_type IN ('checkbox', 'text', 'number', 'date')),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  uses_company_info boolean NOT NULL DEFAULT false,
  company_info_template text,
  branch_id uuid REFERENCES public.branches(id),
  created_by uuid REFERENCES public.workers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.verification_checklist_items ENABLE ROW LEVEL SECURITY;

-- Everyone can read
CREATE POLICY "Everyone can read verification items"
ON public.verification_checklist_items FOR SELECT
USING (true);

-- Admins can manage
CREATE POLICY "Admins can manage verification items"
ON public.verification_checklist_items FOR ALL
USING (is_admin() OR is_branch_admin())
WITH CHECK (is_admin() OR is_branch_admin());

-- Seed default items for checks
INSERT INTO public.verification_checklist_items (document_type, group_title, label, field_type, sort_order) VALUES
('check', 'بيانات الشيك', 'الشيك سليم (غير ممزق، بدون خربشات)', 'checkbox', 1),
('check', 'بيانات الشيك', 'إمضاء العميل موجود على الشيك', 'checkbox', 2),
('check', 'بيانات الشيك', 'ختم العميل موجود على الشيك', 'checkbox', 3),
('check', 'بيانات الشيك', 'المبلغ مطابق للفاتورة', 'number', 4),
('check', 'بيانات الشيك', 'اسم الشركة المستلمة مكتوب على الشيك', 'checkbox', 5),
('check', 'بيانات الشيك', 'رقم الشيك', 'text', 6),
('check', 'معلومات العميل والفاتورة', 'اسم العميل على الشيك مطابق لاسم الفاتورة', 'checkbox', 10),
('check', 'معلومات العميل والفاتورة', 'الفاتورة مختومة بختم العميل', 'checkbox', 11),
('check', 'معلومات العميل والفاتورة', 'تاريخ الاستحقاق', 'date', 12),

-- Seed default items for receipts (versement)
('receipt', 'بيانات وصل الدفع (Versement)', 'وصل الدفع سليم وواضح', 'checkbox', 1),
('receipt', 'بيانات وصل الدفع (Versement)', 'المبلغ مطابق للفاتورة', 'number', 2),
('receipt', 'بيانات وصل الدفع (Versement)', 'ختم البنك موجود على الوصل', 'checkbox', 3),
('receipt', 'بيانات وصل الدفع (Versement)', 'الحساب المستلم صحيح', 'checkbox', 4),
('receipt', 'بيانات وصل الدفع (Versement)', 'رقم الوصل', 'text', 5),
('receipt', 'معلومات العميل والفاتورة', 'اسم المرسل (الدافع) مطابق لاسم العميل', 'checkbox', 10),
('receipt', 'معلومات العميل والفاتورة', 'اسم المستفيد صحيح', 'checkbox', 11),
('receipt', 'معلومات العميل والفاتورة', 'الفاتورة مختومة بختم العميل', 'checkbox', 12),
('receipt', 'معلومات العميل والفاتورة', 'تاريخ الدفع', 'date', 13),

-- Seed default items for transfers (virement)
('transfer', 'بيانات التحويل (Virement)', 'إثبات التحويل سليم وواضح', 'checkbox', 1),
('transfer', 'بيانات التحويل (Virement)', 'المبلغ مطابق للفاتورة', 'number', 2),
('transfer', 'بيانات التحويل (Virement)', 'رقم مرجع التحويل', 'text', 3),
('transfer', 'بيانات التحويل (Virement)', 'الحساب المستلم صحيح', 'checkbox', 4),
('transfer', 'معلومات العميل والفاتورة', 'اسم المرسل مطابق لاسم العميل', 'checkbox', 10),
('transfer', 'معلومات العميل والفاتورة', 'اسم المستفيد صحيح', 'checkbox', 11),
('transfer', 'معلومات العميل والفاتورة', 'الفاتورة مختومة بختم العميل', 'checkbox', 12),
('transfer', 'معلومات العميل والفاتورة', 'تاريخ التحويل', 'date', 13);
