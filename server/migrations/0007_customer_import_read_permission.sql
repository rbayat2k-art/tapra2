INSERT INTO permissions(code, description) VALUES
  ('customer.import.read', 'Read sanitized Customer import summaries in the active context')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions(role_id, permission_code)
SELECT role.id, 'customer.import.read'
FROM roles role
WHERE role.code = 'customer_manager'
ON CONFLICT DO NOTHING;
