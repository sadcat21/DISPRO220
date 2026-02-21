
-- Assign debt permissions to ALL existing roles by default
INSERT INTO role_permissions (role_id, permission_id)
SELECT cr.id, p.id
FROM custom_roles cr
CROSS JOIN permissions p
WHERE p.code IN ('page_customer_debts', 'view_customer_debts', 'collect_debts')
AND NOT EXISTS (
  SELECT 1 FROM role_permissions rp WHERE rp.role_id = cr.id AND rp.permission_id = p.id
);
