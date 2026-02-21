-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'worker');

-- Workers table (for custom auth)
CREATE TABLE public.workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role app_role NOT NULL DEFAULT 'worker',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customers table
CREATE TABLE public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES public.workers(id)
);

-- Products table
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES public.workers(id)
);

-- Promos table
CREATE TABLE public.promos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID NOT NULL REFERENCES public.workers(id),
    customer_id UUID NOT NULL REFERENCES public.customers(id),
    product_id UUID NOT NULL REFERENCES public.products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    promo_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_promos_worker ON public.promos(worker_id);
CREATE INDEX idx_promos_customer ON public.promos(customer_id);
CREATE INDEX idx_promos_product ON public.promos(product_id);
CREATE INDEX idx_promos_date ON public.promos(promo_date);

-- User roles table for Supabase auth integration
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE,
    role app_role NOT NULL,
    UNIQUE (user_id)
);

-- Enable RLS on all tables
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM public.user_roles WHERE user_id = auth.uid()
$$;

-- Helper function to get current user's worker_id
CREATE OR REPLACE FUNCTION public.get_worker_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT worker_id FROM public.user_roles WHERE user_id = auth.uid()
$$;

-- Helper function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() AND role = 'admin'
    )
$$;

-- Helper function to check if user is worker
CREATE OR REPLACE FUNCTION public.is_worker()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() AND role IN ('admin', 'worker')
    )
$$;

-- RLS Policies for workers table (admin only)
CREATE POLICY "Admins can view all workers"
ON public.workers FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can insert workers"
ON public.workers FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update workers"
ON public.workers FOR UPDATE
TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can delete workers"
ON public.workers FOR DELETE
TO authenticated
USING (public.is_admin());

-- RLS Policies for customers table
CREATE POLICY "Workers can view all customers"
ON public.customers FOR SELECT
TO authenticated
USING (public.is_worker());

CREATE POLICY "Workers can insert customers"
ON public.customers FOR INSERT
TO authenticated
WITH CHECK (public.is_worker());

CREATE POLICY "Admins can update customers"
ON public.customers FOR UPDATE
TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can delete customers"
ON public.customers FOR DELETE
TO authenticated
USING (public.is_admin());

-- RLS Policies for products table
CREATE POLICY "Workers can view active products"
ON public.products FOR SELECT
TO authenticated
USING (public.is_worker() AND is_active = true);

CREATE POLICY "Admins can insert products"
ON public.products FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update products"
ON public.products FOR UPDATE
TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins can delete products"
ON public.products FOR DELETE
TO authenticated
USING (public.is_admin());

-- RLS Policies for promos table
CREATE POLICY "Workers can view own promos"
ON public.promos FOR SELECT
TO authenticated
USING (
    public.is_admin() OR worker_id = public.get_worker_id()
);

CREATE POLICY "Workers can insert own promos"
ON public.promos FOR INSERT
TO authenticated
WITH CHECK (
    public.is_worker() AND worker_id = public.get_worker_id()
);

-- RLS Policies for user_roles table
CREATE POLICY "Users can view own role"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.is_admin());

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_workers_updated_at
BEFORE UPDATE ON public.workers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to hash password (for use in edge function)
CREATE OR REPLACE FUNCTION public.verify_worker_password(p_username TEXT, p_password_hash TEXT)
RETURNS TABLE(id UUID, username TEXT, full_name TEXT, role app_role)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT w.id, w.username, w.full_name, w.role
    FROM public.workers w
    WHERE w.username = p_username 
    AND w.password_hash = p_password_hash
    AND w.is_active = true
$$;