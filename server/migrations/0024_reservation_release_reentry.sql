DO $$
DECLARE constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'inventory_reservations'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) = 'UNIQUE (workspace_id, owner_company_id, invoice_line_id, invoice_revision)';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE inventory_reservations DROP CONSTRAINT %I', constraint_name);
  END IF;
END;
$$;

CREATE UNIQUE INDEX inventory_reservations_active_invoice_line_idx
  ON inventory_reservations(workspace_id, owner_company_id, invoice_line_id, invoice_revision)
  WHERE status <> 'RELEASED';
