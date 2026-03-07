
-- نظام تجزئة العروض (Promo Splits)
-- جدول رئيسي لتتبع تجزئة العروض
CREATE TABLE public.promo_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid REFERENCES public.product_offers(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  split_type text NOT NULL DEFAULT 'quantity_accumulation', -- 'quantity_accumulation' (تجميع كميات لعميل واحد) | 'customer_group' (تجميع عملاء)
  name text NOT NULL,
  target_quantity numeric NOT NULL DEFAULT 0, -- الكمية المستهدفة من العرض (مثلا 1000 صندوق)
  target_quantity_unit text NOT NULL DEFAULT 'box', -- 'box' | 'piece'
  gift_quantity numeric NOT NULL DEFAULT 0, -- كمية الهدية الأصلية من العرض
  gift_quantity_unit text NOT NULL DEFAULT 'box',
  adjusted_gift_quantity numeric, -- كمية الهدية المعدلة (بعد خصم المدير)
  gift_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active', -- 'active' | 'completed' | 'cancelled'
  notes text,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.workers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- جدول العملاء المشاركين في التجزئة
CREATE TABLE public.promo_split_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  split_id uuid REFERENCES public.promo_splits(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  allocated_quantity numeric NOT NULL DEFAULT 0, -- الكمية المخصصة لهذا العميل
  delivered_quantity numeric NOT NULL DEFAULT 0, -- الكمية المسلمة فعليا
  gift_share numeric NOT NULL DEFAULT 0, -- حصة العميل من الهدية
  gift_delivered boolean NOT NULL DEFAULT false, -- هل تم تسليم الهدية
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- جدول جدولة دفعات الشراء
CREATE TABLE public.promo_split_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  split_customer_id uuid REFERENCES public.promo_split_customers(id) ON DELETE CASCADE NOT NULL,
  scheduled_date date NOT NULL,
  planned_quantity numeric NOT NULL DEFAULT 0,
  actual_quantity numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending', -- 'pending' | 'completed' | 'missed' | 'partial'
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_promo_splits_offer ON public.promo_splits(offer_id);
CREATE INDEX idx_promo_splits_product ON public.promo_splits(product_id);
CREATE INDEX idx_promo_splits_branch ON public.promo_splits(branch_id);
CREATE INDEX idx_promo_splits_status ON public.promo_splits(status);
CREATE INDEX idx_promo_split_customers_split ON public.promo_split_customers(split_id);
CREATE INDEX idx_promo_split_customers_customer ON public.promo_split_customers(customer_id);
CREATE INDEX idx_promo_split_installments_customer ON public.promo_split_installments(split_customer_id);
CREATE INDEX idx_promo_split_installments_date ON public.promo_split_installments(scheduled_date);

-- RLS
ALTER TABLE public.promo_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_split_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_split_installments ENABLE ROW LEVEL SECURITY;

-- Policies: admin & branch_admin full access, supervisors read
CREATE POLICY "Workers can view promo_splits" ON public.promo_splits FOR SELECT TO authenticated USING (public.is_worker());
CREATE POLICY "Admin/branch_admin manage promo_splits" ON public.promo_splits FOR ALL TO authenticated USING (public.is_admin() OR public.is_branch_admin()) WITH CHECK (public.is_admin() OR public.is_branch_admin());

CREATE POLICY "Workers can view promo_split_customers" ON public.promo_split_customers FOR SELECT TO authenticated USING (public.is_worker());
CREATE POLICY "Admin/branch_admin manage promo_split_customers" ON public.promo_split_customers FOR ALL TO authenticated USING (public.is_admin() OR public.is_branch_admin()) WITH CHECK (public.is_admin() OR public.is_branch_admin());

CREATE POLICY "Workers can view promo_split_installments" ON public.promo_split_installments FOR SELECT TO authenticated USING (public.is_worker());
CREATE POLICY "Admin/branch_admin manage promo_split_installments" ON public.promo_split_installments FOR ALL TO authenticated USING (public.is_admin() OR public.is_branch_admin()) WITH CHECK (public.is_admin() OR public.is_branch_admin());

-- updated_at triggers
CREATE TRIGGER set_promo_splits_updated_at BEFORE UPDATE ON public.promo_splits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_promo_split_customers_updated_at BEFORE UPDATE ON public.promo_split_customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_promo_split_installments_updated_at BEFORE UPDATE ON public.promo_split_installments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
