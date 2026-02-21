-- Add missing permissions for delivery worker
INSERT INTO public.permissions (code, name_ar, category, resource, description_ar)
VALUES 
  ('page_my_deliveries', 'صفحة توصيلاتي', 'page_access', 'orders', 'الوصول لصفحة التوصيلات الخاصة بي')
ON CONFLICT (code) DO NOTHING;

-- Get the delivery_rep role id and assign the new permission
DO $$
DECLARE
  v_role_id uuid;
  v_perm_id uuid;
BEGIN
  SELECT id INTO v_role_id FROM custom_roles WHERE code = 'delivery_rep';
  SELECT id INTO v_perm_id FROM permissions WHERE code = 'page_my_deliveries';
  
  IF v_role_id IS NOT NULL AND v_perm_id IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id)
    VALUES (v_role_id, v_perm_id)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;