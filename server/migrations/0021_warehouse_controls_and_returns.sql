CREATE TABLE inventory_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  owner_company_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  location_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'POSTED', 'CANCELLED')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 1000),
  evidence_note text NOT NULL CHECK (length(trim(evidence_note)) BETWEEN 3 AND 1000),
  created_by_actor_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  created_by_effective_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  approved_by_actor_user_account_id uuid REFERENCES user_accounts(id),
  approved_by_effective_user_account_id uuid REFERENCES user_accounts(id),
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  posted_at timestamptz,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, owner_company_id) REFERENCES companies(workspace_id, id),
  FOREIGN KEY (workspace_id, warehouse_id) REFERENCES warehouses(workspace_id, id),
  FOREIGN KEY (workspace_id, location_id) REFERENCES warehouse_locations(workspace_id, id),
  CHECK ((status IN ('SUBMITTED', 'POSTED')) = (submitted_at IS NOT NULL)),
  CHECK ((status = 'POSTED') = (posted_at IS NOT NULL AND approved_by_actor_user_account_id IS NOT NULL
    AND approved_by_effective_user_account_id IS NOT NULL))
);

CREATE TABLE inventory_adjustment_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  owner_company_id uuid NOT NULL,
  adjustment_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number > 0),
  stock_identity_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('IN', 'OUT')),
  quantity numeric(20,6) NOT NULL CHECK (quantity > 0),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, adjustment_id, line_number),
  FOREIGN KEY (workspace_id, adjustment_id) REFERENCES inventory_adjustments(workspace_id, id),
  FOREIGN KEY (workspace_id, owner_company_id) REFERENCES companies(workspace_id, id),
  FOREIGN KEY (workspace_id, stock_identity_id) REFERENCES stock_identities(workspace_id, id)
);

CREATE TABLE inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  owner_company_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  location_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SUBMITTED', 'POSTED', 'CANCELLED')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 1000),
  created_by_actor_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  created_by_effective_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  approved_by_actor_user_account_id uuid REFERENCES user_accounts(id),
  approved_by_effective_user_account_id uuid REFERENCES user_accounts(id),
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  posted_at timestamptz,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, owner_company_id) REFERENCES companies(workspace_id, id),
  FOREIGN KEY (workspace_id, warehouse_id) REFERENCES warehouses(workspace_id, id),
  FOREIGN KEY (workspace_id, location_id) REFERENCES warehouse_locations(workspace_id, id),
  CHECK ((status IN ('SUBMITTED', 'POSTED')) = (submitted_at IS NOT NULL)),
  CHECK ((status = 'POSTED') = (posted_at IS NOT NULL AND approved_by_actor_user_account_id IS NOT NULL
    AND approved_by_effective_user_account_id IS NOT NULL))
);

CREATE TABLE inventory_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  owner_company_id uuid NOT NULL,
  count_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number > 0),
  stock_identity_id uuid NOT NULL,
  expected_quantity numeric(20,6) NOT NULL CHECK (expected_quantity >= 0),
  actual_quantity numeric(20,6) NOT NULL CHECK (actual_quantity >= 0),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, count_id, line_number),
  FOREIGN KEY (workspace_id, count_id) REFERENCES inventory_counts(workspace_id, id),
  FOREIGN KEY (workspace_id, owner_company_id) REFERENCES companies(workspace_id, id),
  FOREIGN KEY (workspace_id, stock_identity_id) REFERENCES stock_identities(workspace_id, id)
);

CREATE TABLE inventory_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  owner_company_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  returns_location_id uuid NOT NULL,
  customer_id uuid,
  invoice_id uuid,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'RECEIVED', 'INSPECTED', 'CANCELLED')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 1000),
  evidence_note text NOT NULL CHECK (length(trim(evidence_note)) BETWEEN 3 AND 1000),
  created_by_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  received_by_user_account_id uuid REFERENCES user_accounts(id),
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, owner_company_id) REFERENCES companies(workspace_id, id),
  FOREIGN KEY (workspace_id, warehouse_id) REFERENCES warehouses(workspace_id, id),
  FOREIGN KEY (workspace_id, returns_location_id) REFERENCES warehouse_locations(workspace_id, id),
  FOREIGN KEY (workspace_id, owner_company_id, customer_id) REFERENCES customers(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, owner_company_id, invoice_id) REFERENCES sales_invoices(workspace_id, company_id, id),
  CHECK ((status IN ('RECEIVED', 'INSPECTED')) = (received_at IS NOT NULL AND received_by_user_account_id IS NOT NULL))
);

CREATE TABLE inventory_return_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  owner_company_id uuid NOT NULL,
  return_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number > 0),
  inventory_item_id uuid NOT NULL,
  quantity numeric(20,6) NOT NULL CHECK (quantity > 0),
  lot_code text,
  serial_code text,
  stock_identity_id uuid,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, return_id, line_number),
  FOREIGN KEY (workspace_id, return_id) REFERENCES inventory_returns(workspace_id, id),
  FOREIGN KEY (workspace_id, owner_company_id) REFERENCES companies(workspace_id, id),
  FOREIGN KEY (workspace_id, inventory_item_id) REFERENCES inventory_items(workspace_id, id),
  FOREIGN KEY (workspace_id, stock_identity_id) REFERENCES stock_identities(workspace_id, id)
);

CREATE TABLE inventory_return_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  owner_company_id uuid NOT NULL,
  return_id uuid NOT NULL,
  return_line_id uuid NOT NULL,
  disposition text NOT NULL CHECK (disposition IN (
    'SELLABLE', 'QUARANTINE', 'DAMAGED', 'RETURN_TO_SUPPLIER', 'SCRAP'
  )),
  quantity numeric(20,6) NOT NULL CHECK (quantity > 0),
  destination_location_id uuid,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 1000),
  inspected_by_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  inspected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, return_id) REFERENCES inventory_returns(workspace_id, id),
  FOREIGN KEY (workspace_id, return_line_id) REFERENCES inventory_return_lines(workspace_id, id),
  FOREIGN KEY (workspace_id, owner_company_id) REFERENCES companies(workspace_id, id),
  FOREIGN KEY (workspace_id, destination_location_id) REFERENCES warehouse_locations(workspace_id, id),
  CHECK ((disposition IN ('SELLABLE', 'QUARANTINE', 'DAMAGED')) = (destination_location_id IS NOT NULL))
);

CREATE INDEX inventory_adjustments_queue_idx ON inventory_adjustments(workspace_id, owner_company_id, status, created_at);
CREATE INDEX inventory_counts_queue_idx ON inventory_counts(workspace_id, owner_company_id, status, created_at);
CREATE INDEX inventory_returns_history_idx ON inventory_returns(workspace_id, owner_company_id, created_at, id);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'inventory_adjustments', 'inventory_adjustment_lines', 'inventory_counts', 'inventory_count_lines',
    'inventory_returns', 'inventory_return_lines', 'inventory_return_inspections'
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

GRANT SELECT, INSERT, UPDATE ON inventory_adjustments, inventory_adjustment_lines,
  inventory_counts, inventory_count_lines, inventory_returns, inventory_return_lines,
  inventory_return_inspections TO tapra2_app;
