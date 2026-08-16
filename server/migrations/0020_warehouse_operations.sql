CREATE TABLE warehouse_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  owner_company_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  receiving_location_id uuid NOT NULL,
  receipt_type text NOT NULL CHECK (receipt_type IN ('PURCHASE', 'MANUAL')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'POSTED', 'CANCELLED')),
  source_note text NOT NULL CHECK (length(trim(source_note)) BETWEEN 3 AND 1000),
  reason text,
  created_by_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  posted_by_user_account_id uuid REFERENCES user_accounts(id),
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, owner_company_id) REFERENCES companies(workspace_id, id),
  FOREIGN KEY (workspace_id, warehouse_id) REFERENCES warehouses(workspace_id, id),
  FOREIGN KEY (workspace_id, receiving_location_id) REFERENCES warehouse_locations(workspace_id, id),
  CHECK ((receipt_type = 'MANUAL') = (reason IS NOT NULL)),
  CHECK ((status = 'POSTED') = (posted_at IS NOT NULL AND posted_by_user_account_id IS NOT NULL))
);

CREATE TABLE warehouse_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  owner_company_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number > 0),
  inventory_item_id uuid NOT NULL,
  quantity numeric(20,6) NOT NULL CHECK (quantity > 0),
  lot_code text,
  serial_code text,
  manufactured_at timestamptz,
  expires_at timestamptz,
  evidence_note text NOT NULL CHECK (length(trim(evidence_note)) BETWEEN 3 AND 1000),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, receipt_id, line_number),
  FOREIGN KEY (workspace_id, receipt_id) REFERENCES warehouse_receipts(workspace_id, id),
  FOREIGN KEY (workspace_id, inventory_item_id) REFERENCES inventory_items(workspace_id, id),
  FOREIGN KEY (workspace_id, owner_company_id) REFERENCES companies(workspace_id, id),
  CHECK (expires_at IS NULL OR manufactured_at IS NULL OR expires_at > manufactured_at)
);

CREATE TABLE inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  owner_company_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  invoice_line_id uuid NOT NULL,
  invoice_revision integer NOT NULL CHECK (invoice_revision > 0),
  inventory_item_id uuid NOT NULL,
  requested_quantity numeric(20,6) NOT NULL CHECK (requested_quantity > 0),
  reserved_quantity numeric(20,6) NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  shortage_quantity numeric(20,6) NOT NULL CHECK (shortage_quantity >= 0),
  status text NOT NULL CHECK (status IN ('PARTIALLY_RESERVED', 'RESERVED', 'RELEASED')),
  created_by_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  released_by_user_account_id uuid REFERENCES user_accounts(id),
  release_reason text,
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  UNIQUE (workspace_id, owner_company_id, invoice_line_id, invoice_revision),
  FOREIGN KEY (workspace_id, owner_company_id) REFERENCES companies(workspace_id, id),
  FOREIGN KEY (workspace_id, owner_company_id, invoice_id) REFERENCES sales_invoices(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, owner_company_id, invoice_line_id) REFERENCES sales_invoice_lines(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, inventory_item_id) REFERENCES inventory_items(workspace_id, id),
  CHECK (requested_quantity = reserved_quantity + shortage_quantity),
  CHECK (status = 'RELEASED' OR ((status = 'RESERVED') = (shortage_quantity = 0))),
  CHECK ((status = 'RELEASED') = (released_at IS NOT NULL AND released_by_user_account_id IS NOT NULL)),
  CHECK (status <> 'RELEASED' OR release_reason IS NOT NULL)
);

CREATE TABLE inventory_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  owner_company_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  location_id uuid NOT NULL,
  stock_identity_id uuid NOT NULL,
  quantity numeric(20,6) NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RELEASED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, reservation_id) REFERENCES inventory_reservations(workspace_id, id),
  FOREIGN KEY (workspace_id, owner_company_id) REFERENCES companies(workspace_id, id),
  FOREIGN KEY (workspace_id, warehouse_id) REFERENCES warehouses(workspace_id, id),
  FOREIGN KEY (workspace_id, location_id) REFERENCES warehouse_locations(workspace_id, id),
  FOREIGN KEY (workspace_id, stock_identity_id) REFERENCES stock_identities(workspace_id, id),
  CHECK ((status = 'RELEASED') = (released_at IS NOT NULL))
);

CREATE TABLE warehouse_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  owner_company_id uuid NOT NULL,
  source_warehouse_id uuid NOT NULL,
  destination_warehouse_id uuid NOT NULL,
  source_location_id uuid NOT NULL,
  destination_location_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 1000),
  created_by_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  dispatched_by_user_account_id uuid REFERENCES user_accounts(id),
  received_by_user_account_id uuid REFERENCES user_accounts(id),
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz,
  received_at timestamptz,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, owner_company_id) REFERENCES companies(workspace_id, id),
  FOREIGN KEY (workspace_id, source_warehouse_id) REFERENCES warehouses(workspace_id, id),
  FOREIGN KEY (workspace_id, destination_warehouse_id) REFERENCES warehouses(workspace_id, id),
  FOREIGN KEY (workspace_id, source_location_id) REFERENCES warehouse_locations(workspace_id, id),
  FOREIGN KEY (workspace_id, destination_location_id) REFERENCES warehouse_locations(workspace_id, id),
  CHECK (source_warehouse_id <> destination_warehouse_id),
  CHECK ((status IN ('IN_TRANSIT', 'RECEIVED')) = (dispatched_at IS NOT NULL AND dispatched_by_user_account_id IS NOT NULL)),
  CHECK ((status = 'RECEIVED') = (received_at IS NOT NULL AND received_by_user_account_id IS NOT NULL))
);

CREATE TABLE warehouse_transfer_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  owner_company_id uuid NOT NULL,
  transfer_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number > 0),
  stock_identity_id uuid NOT NULL,
  requested_quantity numeric(20,6) NOT NULL CHECK (requested_quantity > 0),
  received_quantity numeric(20,6) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, transfer_id, line_number),
  FOREIGN KEY (workspace_id, transfer_id) REFERENCES warehouse_transfers(workspace_id, id),
  FOREIGN KEY (workspace_id, owner_company_id) REFERENCES companies(workspace_id, id),
  FOREIGN KEY (workspace_id, stock_identity_id) REFERENCES stock_identities(workspace_id, id),
  CHECK (received_quantity <= requested_quantity)
);

CREATE INDEX warehouse_receipts_history_idx ON warehouse_receipts(workspace_id, owner_company_id, created_at, id);
CREATE INDEX inventory_reservations_invoice_idx ON inventory_reservations(workspace_id, owner_company_id, invoice_id, invoice_revision);
CREATE INDEX inventory_allocations_active_idx ON inventory_allocations(workspace_id, owner_company_id, location_id, stock_identity_id) WHERE status = 'ACTIVE';
CREATE INDEX warehouse_transfers_history_idx ON warehouse_transfers(workspace_id, owner_company_id, created_at, id);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'warehouse_receipts', 'warehouse_receipt_lines', 'inventory_reservations', 'inventory_allocations',
    'warehouse_transfers', 'warehouse_transfer_lines'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I_context_policy ON %I FOR ALL TO tapra2_app USING (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid AND (NULLIF(current_setting(''app.company_id'', true), '''') IS NULL OR owner_company_id = NULLIF(current_setting(''app.company_id'', true), '''')::uuid)) WITH CHECK (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid AND (NULLIF(current_setting(''app.company_id'', true), '''') IS NULL OR owner_company_id = NULLIF(current_setting(''app.company_id'', true), '''')::uuid))',
      table_name, table_name
    );
  END LOOP;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON warehouse_receipts, warehouse_receipt_lines,
  inventory_reservations, inventory_allocations, warehouse_transfers, warehouse_transfer_lines TO tapra2_app;
