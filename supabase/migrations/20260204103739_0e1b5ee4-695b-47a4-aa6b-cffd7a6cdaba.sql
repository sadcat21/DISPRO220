-- Create orders table for sales rep orders
CREATE TABLE public.orders (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES public.customers(id),
    created_by UUID NOT NULL REFERENCES public.workers(id),
    assigned_worker_id UUID REFERENCES public.workers(id),
    branch_id UUID REFERENCES public.branches(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'delivered', 'cancelled')),
    notes TEXT,
    delivery_date DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create order items table
CREATE TABLE public.order_items (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for orders
CREATE POLICY "View orders based on role" ON public.orders
FOR SELECT USING (
    is_admin() OR
    (get_user_role() = 'supervisor') OR
    (is_branch_admin() AND branch_id IN (SELECT id FROM branches WHERE admin_id = get_worker_id())) OR
    (created_by = get_worker_id()) OR
    (assigned_worker_id = get_worker_id())
);

CREATE POLICY "Sales rep can create orders" ON public.orders
FOR INSERT WITH CHECK (
    is_admin() OR
    (is_worker() AND created_by = get_worker_id())
);

CREATE POLICY "Update orders based on role" ON public.orders
FOR UPDATE USING (
    is_admin() OR
    (is_branch_admin() AND branch_id IN (SELECT id FROM branches WHERE admin_id = get_worker_id())) OR
    (created_by = get_worker_id() AND status = 'pending')
);

CREATE POLICY "Delete orders" ON public.orders
FOR DELETE USING (
    is_admin() OR
    (created_by = get_worker_id() AND status = 'pending')
);

-- RLS policies for order_items
CREATE POLICY "View order items" ON public.order_items
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM orders o WHERE o.id = order_id AND (
            is_admin() OR
            (get_user_role() = 'supervisor') OR
            (o.created_by = get_worker_id()) OR
            (o.assigned_worker_id = get_worker_id()) OR
            (is_branch_admin() AND o.branch_id IN (SELECT id FROM branches WHERE admin_id = get_worker_id()))
        )
    )
);

CREATE POLICY "Insert order items" ON public.order_items
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM orders o WHERE o.id = order_id AND (
            is_admin() OR
            (o.created_by = get_worker_id() AND o.status = 'pending')
        )
    )
);

CREATE POLICY "Delete order items" ON public.order_items
FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM orders o WHERE o.id = order_id AND (
            is_admin() OR
            (o.created_by = get_worker_id() AND o.status = 'pending')
        )
    )
);

-- Add trigger for updated_at
CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add new permissions for orders and supervision
INSERT INTO public.permissions (code, name_ar, description_ar, category, resource) VALUES
-- Order permissions
('view_orders', 'عرض الطلبيات', 'عرض قائمة الطلبيات', 'page_access', 'orders'),
('create_orders', 'إنشاء طلبيات', 'إنشاء طلبيات جديدة من العملاء', 'crud', 'orders'),
('assign_orders', 'تعيين الطلبيات', 'تعيين الطلبيات للعمال', 'crud', 'orders'),
('update_order_status', 'تحديث حالة الطلبية', 'تغيير حالة الطلبية', 'crud', 'orders'),
('delete_orders', 'حذف الطلبيات', 'حذف الطلبيات', 'crud', 'orders'),

-- Supervision permissions
('view_worker_activity', 'متابعة نشاط العمال', 'عرض نشاط وعمليات العمال', 'page_access', 'supervision'),
('view_all_promos', 'عرض جميع العمليات', 'عرض جميع عمليات البرومو', 'crud', 'promos'),
('view_reports', 'عرض التقارير', 'عرض تقارير الأداء والإحصائيات', 'page_access', 'stats'),

-- Data scope for orders
('orders_own', 'طلبياتي فقط', 'رؤية الطلبيات التي أنشأتها فقط', 'data_scope', 'orders'),
('orders_assigned', 'الطلبيات المعينة لي', 'رؤية الطلبيات المعينة لي', 'data_scope', 'orders'),
('orders_branch', 'طلبيات الفرع', 'رؤية جميع طلبيات الفرع', 'data_scope', 'orders'),
('orders_all', 'جميع الطلبيات', 'رؤية جميع الطلبيات', 'data_scope', 'orders');

-- Assign default permissions to system roles
-- Sales Rep permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT cr.id, p.id FROM public.custom_roles cr, public.permissions p
WHERE cr.code = 'sales_rep' AND p.code IN (
    'view_orders', 'create_orders', 'orders_own',
    'view_home', 'view_my_promos', 'view_customers',
    'customers_branch', 'promos_own'
);

-- Supervisor permissions (view only, no edit)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT cr.id, p.id FROM public.custom_roles cr, public.permissions p
WHERE cr.code = 'supervisor' AND p.code IN (
    'view_home', 'view_my_promos', 'view_workers', 'view_customers', 'view_stats', 'view_promo_table',
    'view_orders', 'view_worker_activity', 'view_all_promos', 'view_reports',
    'promos_all', 'customers_all', 'orders_all'
);

-- Worker permissions (view assigned orders)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT cr.id, p.id FROM public.custom_roles cr, public.permissions p
WHERE cr.code = 'worker' AND p.code IN (
    'view_orders', 'update_order_status', 'orders_assigned'
)
ON CONFLICT DO NOTHING;