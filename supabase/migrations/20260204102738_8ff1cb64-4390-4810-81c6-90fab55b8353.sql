-- Create permissions table for defining available permissions
CREATE TABLE public.permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text UNIQUE NOT NULL,
    name_ar text NOT NULL,
    description_ar text,
    category text NOT NULL, -- 'page_access', 'crud', 'data_scope'
    resource text, -- The resource this permission applies to (e.g., 'workers', 'customers', 'promos')
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Create custom_roles table for user-defined roles
CREATE TABLE public.custom_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text UNIQUE NOT NULL,
    name_ar text NOT NULL,
    description_ar text,
    is_system boolean DEFAULT false, -- System roles cannot be deleted
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES public.workers(id)
);

-- Create role_permissions junction table
CREATE TABLE public.role_permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id uuid REFERENCES public.custom_roles(id) ON DELETE CASCADE NOT NULL,
    permission_id uuid REFERENCES public.permissions(id) ON DELETE CASCADE NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(role_id, permission_id)
);

-- Enable RLS
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for permissions (read-only for all, manage by admin)
CREATE POLICY "Allow read access to permissions" ON public.permissions FOR SELECT USING (true);
CREATE POLICY "Admins can manage permissions" ON public.permissions FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- RLS Policies for custom_roles
CREATE POLICY "Allow read access to custom_roles" ON public.custom_roles FOR SELECT USING (true);
CREATE POLICY "Admins can manage custom_roles" ON public.custom_roles FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- RLS Policies for role_permissions
CREATE POLICY "Allow read access to role_permissions" ON public.role_permissions FOR SELECT USING (true);
CREATE POLICY "Admins can manage role_permissions" ON public.role_permissions FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Insert default permissions
INSERT INTO public.permissions (code, name_ar, description_ar, category, resource) VALUES
-- Page Access Permissions
('page_home', 'الصفحة الرئيسية', 'الوصول للصفحة الرئيسية', 'page_access', 'home'),
('page_my_promos', 'عملياتي', 'الوصول لصفحة عملياتي', 'page_access', 'my_promos'),
('page_workers', 'إدارة العمال', 'الوصول لصفحة إدارة العمال', 'page_access', 'workers'),
('page_products', 'إدارة المنتجات', 'الوصول لصفحة إدارة المنتجات', 'page_access', 'products'),
('page_customers', 'إدارة العملاء', 'الوصول لصفحة إدارة العملاء', 'page_access', 'customers'),
('page_stats', 'الإحصائيات', 'الوصول لصفحة الإحصائيات', 'page_access', 'stats'),
('page_promo_table', 'جدول العمليات', 'الوصول لجدول العمليات الشامل', 'page_access', 'promo_table'),
('page_branches', 'إدارة الفروع', 'الوصول لصفحة إدارة الفروع', 'page_access', 'branches'),
('page_settings', 'الإعدادات', 'الوصول لصفحة الإعدادات', 'page_access', 'settings'),
('page_permissions', 'إدارة الصلاحيات', 'الوصول لصفحة إدارة الصلاحيات', 'page_access', 'permissions'),

-- CRUD Permissions for Workers
('workers_create', 'إضافة عامل', 'إضافة عمال جدد', 'crud', 'workers'),
('workers_read', 'عرض العمال', 'عرض قائمة العمال', 'crud', 'workers'),
('workers_update', 'تعديل عامل', 'تعديل بيانات العمال', 'crud', 'workers'),
('workers_delete', 'حذف عامل', 'حذف العمال', 'crud', 'workers'),

-- CRUD Permissions for Customers
('customers_create', 'إضافة عميل', 'إضافة عملاء جدد', 'crud', 'customers'),
('customers_read', 'عرض العملاء', 'عرض قائمة العملاء', 'crud', 'customers'),
('customers_update', 'تعديل عميل', 'تعديل بيانات العملاء', 'crud', 'customers'),
('customers_delete', 'حذف عميل', 'حذف العملاء', 'crud', 'customers'),

-- CRUD Permissions for Products
('products_create', 'إضافة منتج', 'إضافة منتجات جديدة', 'crud', 'products'),
('products_read', 'عرض المنتجات', 'عرض قائمة المنتجات', 'crud', 'products'),
('products_update', 'تعديل منتج', 'تعديل بيانات المنتجات', 'crud', 'products'),
('products_delete', 'حذف منتج', 'حذف المنتجات', 'crud', 'products'),

-- CRUD Permissions for Promos
('promos_create', 'إضافة عملية', 'إضافة عمليات برومو جديدة', 'crud', 'promos'),
('promos_read', 'عرض العمليات', 'عرض قائمة العمليات', 'crud', 'promos'),
('promos_update', 'تعديل عملية', 'تعديل عمليات البرومو', 'crud', 'promos'),
('promos_delete', 'حذف عملية', 'حذف عمليات البرومو', 'crud', 'promos'),

-- CRUD Permissions for Branches
('branches_create', 'إضافة فرع', 'إضافة فروع جديدة', 'crud', 'branches'),
('branches_read', 'عرض الفروع', 'عرض قائمة الفروع', 'crud', 'branches'),
('branches_update', 'تعديل فرع', 'تعديل بيانات الفروع', 'crud', 'branches'),
('branches_delete', 'حذف فرع', 'حذف الفروع', 'crud', 'branches'),

-- Data Scope Permissions
('scope_own', 'بياناته فقط', 'رؤية بياناته الخاصة فقط', 'data_scope', 'all'),
('scope_branch', 'بيانات الفرع', 'رؤية بيانات الفرع', 'data_scope', 'all'),
('scope_all', 'جميع البيانات', 'رؤية جميع البيانات', 'data_scope', 'all');

-- Insert default system roles
INSERT INTO public.custom_roles (code, name_ar, description_ar, is_system) VALUES
('admin', 'مدير النظام', 'صلاحيات كاملة على النظام', true),
('branch_admin', 'مدير الفرع', 'إدارة فرع محدد', true),
('supervisor', 'مشرف', 'مراقبة الأداء والإحصائيات', true),
('worker', 'عامل', 'تسجيل العمليات اليومية', true),
('sales_rep', 'مندوب مبيعات', 'تسجيل عمليات البيع', true);

-- Assign all permissions to admin role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 
    (SELECT id FROM public.custom_roles WHERE code = 'admin'),
    id
FROM public.permissions;

-- Assign permissions to branch_admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 
    (SELECT id FROM public.custom_roles WHERE code = 'branch_admin'),
    id
FROM public.permissions 
WHERE code IN (
    'page_home', 'page_my_promos', 'page_workers', 'page_customers', 'page_stats', 'page_promo_table',
    'workers_create', 'workers_read', 'workers_update',
    'customers_create', 'customers_read', 'customers_update', 'customers_delete',
    'promos_create', 'promos_read',
    'products_read',
    'scope_branch'
);

-- Assign permissions to supervisor
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 
    (SELECT id FROM public.custom_roles WHERE code = 'supervisor'),
    id
FROM public.permissions 
WHERE code IN (
    'page_home', 'page_my_promos', 'page_stats', 'page_promo_table',
    'customers_read',
    'promos_read',
    'products_read',
    'workers_read',
    'scope_branch'
);

-- Assign permissions to worker
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 
    (SELECT id FROM public.custom_roles WHERE code = 'worker'),
    id
FROM public.permissions 
WHERE code IN (
    'page_home', 'page_my_promos',
    'customers_create', 'customers_read',
    'promos_create', 'promos_read',
    'products_read',
    'scope_own'
);

-- Assign permissions to sales_rep
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 
    (SELECT id FROM public.custom_roles WHERE code = 'sales_rep'),
    id
FROM public.permissions 
WHERE code IN (
    'page_home', 'page_my_promos', 'page_customers',
    'customers_create', 'customers_read', 'customers_update',
    'promos_create', 'promos_read',
    'products_read',
    'scope_own'
);

-- Create function to check if worker has specific permission
CREATE OR REPLACE FUNCTION public.worker_has_permission(p_worker_id uuid, p_permission_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.worker_roles wr
        JOIN public.custom_roles cr ON cr.code = wr.role::text
        JOIN public.role_permissions rp ON rp.role_id = cr.id
        JOIN public.permissions p ON p.id = rp.permission_id
        WHERE wr.worker_id = p_worker_id AND p.code = p_permission_code
    )
$$;

-- Create function to get all permissions for a worker
CREATE OR REPLACE FUNCTION public.get_worker_permissions(p_worker_id uuid)
RETURNS TABLE(permission_code text, permission_name text, category text, resource text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT DISTINCT p.code, p.name_ar, p.category, p.resource
    FROM public.worker_roles wr
    JOIN public.custom_roles cr ON cr.code = wr.role::text
    JOIN public.role_permissions rp ON rp.role_id = cr.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE wr.worker_id = p_worker_id
$$;