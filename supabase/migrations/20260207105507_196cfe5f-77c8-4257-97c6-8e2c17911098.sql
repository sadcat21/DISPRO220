
-- 1. أوامر الاستلام من المصنع
CREATE TABLE public.stock_receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES public.branches(id),
  created_by UUID NOT NULL REFERENCES public.workers(id),
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  invoice_number TEXT,
  invoice_photo_url TEXT,
  notes TEXT,
  total_items INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. تفاصيل أمر الاستلام
CREATE TABLE public.stock_receipt_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt_id UUID NOT NULL REFERENCES public.stock_receipts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. حركات المخزون (السجل الكامل)
CREATE TABLE public.stock_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID REFERENCES public.branches(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('receipt', 'load', 'delivery', 'return_to_worker', 'return_to_warehouse', 'adjustment')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  worker_id UUID REFERENCES public.workers(id),
  order_id UUID REFERENCES public.orders(id),
  receipt_id UUID REFERENCES public.stock_receipts(id),
  return_reason TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES public.workers(id),
  approved_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES public.workers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. رصيد المخزن لكل فرع
CREATE TABLE public.warehouse_stock (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, product_id)
);

-- 5. رصيد العامل (الشاحنة) من المنتجات
CREATE TABLE public.worker_stock (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.workers(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL DEFAULT 0,
  branch_id UUID REFERENCES public.branches(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(worker_id, product_id)
);

-- 6. تنبيهات نفاد المخزون
CREATE TABLE public.stock_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  min_quantity INTEGER NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(branch_id, product_id)
);

-- Enable RLS
ALTER TABLE public.stock_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies - stock_receipts
CREATE POLICY "Workers can view stock receipts" ON public.stock_receipts
  FOR SELECT USING (is_worker());

CREATE POLICY "Admin/branch_admin can create stock receipts" ON public.stock_receipts
  FOR INSERT WITH CHECK (
    get_user_role() IN ('admin', 'branch_admin')
  );

CREATE POLICY "Admin/branch_admin can update stock receipts" ON public.stock_receipts
  FOR UPDATE USING (
    get_user_role() IN ('admin', 'branch_admin')
  );

-- RLS Policies - stock_receipt_items
CREATE POLICY "Workers can view receipt items" ON public.stock_receipt_items
  FOR SELECT USING (is_worker());

CREATE POLICY "Admin/branch_admin can manage receipt items" ON public.stock_receipt_items
  FOR INSERT WITH CHECK (
    get_user_role() IN ('admin', 'branch_admin')
  );

CREATE POLICY "Admin/branch_admin can delete receipt items" ON public.stock_receipt_items
  FOR DELETE USING (
    get_user_role() IN ('admin', 'branch_admin')
  );

-- RLS Policies - stock_movements
CREATE POLICY "Workers can view stock movements" ON public.stock_movements
  FOR SELECT USING (is_worker());

CREATE POLICY "Workers can create stock movements" ON public.stock_movements
  FOR INSERT WITH CHECK (is_worker());

CREATE POLICY "Admin/branch_admin can update movements" ON public.stock_movements
  FOR UPDATE USING (
    get_user_role() IN ('admin', 'branch_admin')
  );

-- RLS Policies - warehouse_stock
CREATE POLICY "Workers can view warehouse stock" ON public.warehouse_stock
  FOR SELECT USING (is_worker());

CREATE POLICY "System can manage warehouse stock" ON public.warehouse_stock
  FOR ALL USING (is_worker());

-- RLS Policies - worker_stock
CREATE POLICY "Workers can view worker stock" ON public.worker_stock
  FOR SELECT USING (is_worker());

CREATE POLICY "System can manage worker stock" ON public.worker_stock
  FOR ALL USING (is_worker());

-- RLS Policies - stock_alerts
CREATE POLICY "Workers can view stock alerts" ON public.stock_alerts
  FOR SELECT USING (is_worker());

CREATE POLICY "Admin can manage stock alerts" ON public.stock_alerts
  FOR ALL USING (get_user_role() IN ('admin', 'branch_admin'));

-- Indexes
CREATE INDEX idx_stock_movements_product ON public.stock_movements(product_id);
CREATE INDEX idx_stock_movements_worker ON public.stock_movements(worker_id);
CREATE INDEX idx_stock_movements_type ON public.stock_movements(movement_type);
CREATE INDEX idx_stock_movements_created ON public.stock_movements(created_at DESC);
CREATE INDEX idx_stock_movements_status ON public.stock_movements(status);
CREATE INDEX idx_warehouse_stock_branch ON public.warehouse_stock(branch_id);
CREATE INDEX idx_worker_stock_worker ON public.worker_stock(worker_id);

-- Triggers for updated_at
CREATE TRIGGER update_stock_receipts_updated_at
  BEFORE UPDATE ON public.stock_receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_warehouse_stock_updated_at
  BEFORE UPDATE ON public.warehouse_stock
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_worker_stock_updated_at
  BEFORE UPDATE ON public.worker_stock
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
