-- Fix RLS for product_offers when the app is not using Supabase Auth sessions.
-- We validate privileges by checking the provided created_by (worker id) against workers table.
-- NOTE: This is only as strong as the integrity of created_by supplied by the client.

-- 1) Helper function (SECURITY DEFINER) to validate manager roles by worker id
create or replace function public.can_manage_product_offers(p_worker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workers w
    where w.id = p_worker_id
      and w.is_active = true
      and w.role in ('admin'::public.app_role, 'branch_admin'::public.app_role)
  );
$$;

-- 2) Ensure RLS is enabled
alter table public.product_offers enable row level security;

-- 3) Replace policies (drop if exist)
DO $$
begin
  -- SELECT
  if exists (select 1 from pg_policies where schemaname='public' and tablename='product_offers' and policyname='Product offers are readable') then
    drop policy "Product offers are readable" on public.product_offers;
  end if;

  -- INSERT
  if exists (select 1 from pg_policies where schemaname='public' and tablename='product_offers' and policyname='Managers can insert product offers') then
    drop policy "Managers can insert product offers" on public.product_offers;
  end if;

  -- UPDATE
  if exists (select 1 from pg_policies where schemaname='public' and tablename='product_offers' and policyname='Managers can update product offers') then
    drop policy "Managers can update product offers" on public.product_offers;
  end if;

  -- DELETE
  if exists (select 1 from pg_policies where schemaname='public' and tablename='product_offers' and policyname='Managers can delete product offers') then
    drop policy "Managers can delete product offers" on public.product_offers;
  end if;
end $$;

-- 4) Read access (workers need to see offers + notifications)
create policy "Product offers are readable"
on public.product_offers
for select
to anon, authenticated
using (true);

-- 5) Write access for admins/branch_admin (based on worker id supplied in created_by)
create policy "Managers can insert product offers"
on public.product_offers
for insert
to anon, authenticated
with check (public.can_manage_product_offers(created_by));

create policy "Managers can update product offers"
on public.product_offers
for update
to anon, authenticated
using (public.can_manage_product_offers(created_by))
with check (public.can_manage_product_offers(created_by));

create policy "Managers can delete product offers"
on public.product_offers
for delete
to anon, authenticated
using (public.can_manage_product_offers(created_by));
