INSERT INTO permissions(code, description) VALUES
  ('warehouse.read', 'Read Warehouse inventory and operational records in the active context'),
  ('warehouse.manage', 'Manage Warehouses and Warehouse Locations in the active context'),
  ('warehouse.item.manage', 'Manage Workspace Inventory Items and tracking identities'),
  ('warehouse.receiving.create', 'Create Warehouse Receiving records'),
  ('warehouse.receiving.post', 'Post validated Warehouse Receiving records to the inventory ledger'),
  ('warehouse.receiving.manual', 'Create manual Receiving with mandatory reason and evidence'),
  ('warehouse.reservation.manage', 'Create and release financially eligible inventory Reservations'),
  ('warehouse.transfer.manage', 'Create, dispatch and receive internal Warehouse Transfers'),
  ('warehouse.adjustment.create', 'Create Inventory Adjustments'),
  ('warehouse.adjustment.approve', 'Approve and post Inventory Adjustments created by another user'),
  ('warehouse.count.create', 'Create and submit Inventory Counts'),
  ('warehouse.count.approve', 'Approve and post Inventory Counts created by another user'),
  ('warehouse.return.manage', 'Receive and inspect Customer inventory Returns'),
  ('warehouse.movement.reverse', 'Reverse a posted Inventory Movement without rewriting history')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

CREATE TABLE warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  operator_company_id uuid,
  operator_unit_id uuid REFERENCES organization_units(id),
  code text NOT NULL CHECK (code = upper(code) AND length(trim(code)) BETWEEN 2 AND 40),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 200),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, code),
  FOREIGN KEY (workspace_id, operator_company_id) REFERENCES companies(workspace_id, id),
  CHECK ((operator_company_id IS NOT NULL)::integer + (operator_unit_id IS NOT NULL)::integer = 1)
);

CREATE TABLE warehouse_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  code text NOT NULL CHECK (code = upper(code) AND length(trim(code)) BETWEEN 1 AND 60),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  location_type text NOT NULL CHECK (location_type IN (
    'RECEIVING', 'STORAGE', 'PICKING', 'PACKING', 'RETURNS', 'QUARANTINE', 'DAMAGED', 'TRANSIT'
  )),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, warehouse_id, code),
  FOREIGN KEY (workspace_id, warehouse_id) REFERENCES warehouses(workspace_id, id)
);

CREATE TABLE inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  sku text NOT NULL CHECK (length(trim(sku)) BETWEEN 1 AND 100),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 300),
  catalog_reference text NOT NULL CHECK (length(trim(catalog_reference)) BETWEEN 1 AND 200),
  tracking_mode text NOT NULL CHECK (tracking_mode IN ('NONE', 'LOT', 'SERIAL')),
  uom text NOT NULL CHECK (uom = upper(uom) AND length(trim(uom)) BETWEEN 1 AND 20),
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, sku),
  UNIQUE (workspace_id, catalog_reference)
);

CREATE TABLE inventory_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  inventory_item_id uuid NOT NULL,
  owner_company_id uuid NOT NULL,
  lot_code text NOT NULL CHECK (length(trim(lot_code)) BETWEEN 1 AND 120),
  manufactured_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, inventory_item_id, owner_company_id, lot_code),
  FOREIGN KEY (workspace_id, inventory_item_id) REFERENCES inventory_items(workspace_id, id),
  FOREIGN KEY (workspace_id, owner_company_id) REFERENCES companies(workspace_id, id),
  CHECK (expires_at IS NULL OR manufactured_at IS NULL OR expires_at > manufactured_at)
);

CREATE TABLE inventory_serials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  inventory_item_id uuid NOT NULL,
  owner_company_id uuid NOT NULL,
  serial_code text NOT NULL CHECK (length(trim(serial_code)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, inventory_item_id, owner_company_id, serial_code),
  FOREIGN KEY (workspace_id, inventory_item_id) REFERENCES inventory_items(workspace_id, id),
  FOREIGN KEY (workspace_id, owner_company_id) REFERENCES companies(workspace_id, id)
);

CREATE TABLE stock_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  inventory_item_id uuid NOT NULL,
  owner_company_id uuid NOT NULL,
  lot_id uuid,
  serial_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE NULLS NOT DISTINCT (workspace_id, inventory_item_id, owner_company_id, lot_id, serial_id),
  FOREIGN KEY (workspace_id, inventory_item_id) REFERENCES inventory_items(workspace_id, id),
  FOREIGN KEY (workspace_id, owner_company_id) REFERENCES companies(workspace_id, id),
  FOREIGN KEY (workspace_id, lot_id) REFERENCES inventory_lots(workspace_id, id),
  FOREIGN KEY (workspace_id, serial_id) REFERENCES inventory_serials(workspace_id, id),
  CHECK (lot_id IS NULL OR serial_id IS NULL)
);

CREATE TABLE inventory_balances (
  workspace_id uuid NOT NULL,
  owner_company_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  location_id uuid NOT NULL,
  stock_identity_id uuid NOT NULL,
  on_hand_quantity numeric(20,6) NOT NULL DEFAULT 0 CHECK (on_hand_quantity >= 0),
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, location_id, stock_identity_id),
  FOREIGN KEY (workspace_id, owner_company_id) REFERENCES companies(workspace_id, id),
  FOREIGN KEY (workspace_id, warehouse_id) REFERENCES warehouses(workspace_id, id),
  FOREIGN KEY (workspace_id, location_id) REFERENCES warehouse_locations(workspace_id, id),
  FOREIGN KEY (workspace_id, stock_identity_id) REFERENCES stock_identities(workspace_id, id)
);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  owner_company_id uuid NOT NULL,
  stock_identity_id uuid NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN (
    'RECEIPT', 'INTERNAL_MOVE', 'TRANSFER_OUT', 'TRANSFER_IN', 'DISPATCH', 'RETURN_RECEIPT',
    'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'COUNT_RECONCILIATION_IN', 'COUNT_RECONCILIATION_OUT',
    'RETURN_TO_SUPPLIER', 'SCRAP', 'REVERSAL'
  )),
  from_warehouse_id uuid,
  from_location_id uuid,
  to_warehouse_id uuid,
  to_location_id uuid,
  quantity numeric(20,6) NOT NULL CHECK (quantity > 0),
  source_type text NOT NULL CHECK (length(trim(source_type)) BETWEEN 2 AND 80),
  source_id uuid NOT NULL,
  source_line_id uuid,
  reverses_movement_id uuid,
  reason text,
  actor_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  effective_user_account_id uuid REFERENCES user_accounts(id),
  impersonation_id uuid REFERENCES session_impersonations(id),
  idempotency_key uuid NOT NULL,
  correlation_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  UNIQUE (workspace_id, reverses_movement_id),
  FOREIGN KEY (workspace_id, owner_company_id) REFERENCES companies(workspace_id, id),
  FOREIGN KEY (workspace_id, stock_identity_id) REFERENCES stock_identities(workspace_id, id),
  FOREIGN KEY (workspace_id, from_warehouse_id) REFERENCES warehouses(workspace_id, id),
  FOREIGN KEY (workspace_id, from_location_id) REFERENCES warehouse_locations(workspace_id, id),
  FOREIGN KEY (workspace_id, to_warehouse_id) REFERENCES warehouses(workspace_id, id),
  FOREIGN KEY (workspace_id, to_location_id) REFERENCES warehouse_locations(workspace_id, id),
  FOREIGN KEY (workspace_id, reverses_movement_id) REFERENCES inventory_movements(workspace_id, id),
  CHECK (from_location_id IS NOT NULL OR to_location_id IS NOT NULL),
  CHECK ((from_location_id IS NULL) = (from_warehouse_id IS NULL)),
  CHECK ((to_location_id IS NULL) = (to_warehouse_id IS NULL)),
  CHECK ((movement_type = 'REVERSAL') = (reverses_movement_id IS NOT NULL)),
  CHECK (movement_type <> 'REVERSAL' OR reason IS NOT NULL)
);

CREATE OR REPLACE FUNCTION reject_posted_inventory_movement_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Posted InventoryMovement rows are immutable; create a REVERSAL movement instead.'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER inventory_movements_no_update
BEFORE UPDATE OR DELETE ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION reject_posted_inventory_movement_mutation();

CREATE OR REPLACE FUNCTION validate_stock_identity_tracking()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  mode text;
BEGIN
  SELECT tracking_mode INTO mode FROM inventory_items
  WHERE workspace_id = NEW.workspace_id AND id = NEW.inventory_item_id;
  IF mode = 'NONE' AND (NEW.lot_id IS NOT NULL OR NEW.serial_id IS NOT NULL) THEN
    RAISE EXCEPTION 'NONE-tracked InventoryItem cannot use Lot or Serial identity.' USING ERRCODE = '23514';
  ELSIF mode = 'LOT' AND (NEW.lot_id IS NULL OR NEW.serial_id IS NOT NULL) THEN
    RAISE EXCEPTION 'LOT-tracked InventoryItem requires exactly one Lot identity.' USING ERRCODE = '23514';
  ELSIF mode = 'SERIAL' AND (NEW.serial_id IS NULL OR NEW.lot_id IS NOT NULL) THEN
    RAISE EXCEPTION 'SERIAL-tracked InventoryItem requires exactly one Serial identity.' USING ERRCODE = '23514';
  END IF;
  IF NEW.lot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM inventory_lots lot WHERE lot.workspace_id = NEW.workspace_id AND lot.id = NEW.lot_id
      AND lot.inventory_item_id = NEW.inventory_item_id AND lot.owner_company_id = NEW.owner_company_id
  ) THEN
    RAISE EXCEPTION 'Lot does not belong to the InventoryItem and owner Company.' USING ERRCODE = '23514';
  END IF;
  IF NEW.serial_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM inventory_serials serial WHERE serial.workspace_id = NEW.workspace_id AND serial.id = NEW.serial_id
      AND serial.inventory_item_id = NEW.inventory_item_id AND serial.owner_company_id = NEW.owner_company_id
  ) THEN
    RAISE EXCEPTION 'Serial does not belong to the InventoryItem and owner Company.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stock_identities_tracking_check
BEFORE INSERT OR UPDATE ON stock_identities
FOR EACH ROW EXECUTE FUNCTION validate_stock_identity_tracking();

CREATE OR REPLACE FUNCTION validate_serial_movement_quantity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM stock_identities identity
    JOIN inventory_items item ON item.id = identity.inventory_item_id
    WHERE identity.workspace_id = NEW.workspace_id AND identity.id = NEW.stock_identity_id
      AND item.tracking_mode = 'SERIAL'
  ) AND NEW.quantity <> 1.000000 THEN
    RAISE EXCEPTION 'SERIAL InventoryMovement quantity must be exactly 1.000000.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_movements_serial_quantity_check
BEFORE INSERT ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION validate_serial_movement_quantity();

CREATE INDEX warehouse_locations_warehouse_idx ON warehouse_locations(workspace_id, warehouse_id, is_active);
CREATE INDEX inventory_items_catalog_idx ON inventory_items(workspace_id, catalog_reference, is_active);
CREATE INDEX inventory_balances_lookup_idx ON inventory_balances(workspace_id, owner_company_id, warehouse_id, stock_identity_id);
CREATE INDEX inventory_movements_history_idx ON inventory_movements(workspace_id, owner_company_id, stock_identity_id, occurred_at, id);
CREATE INDEX inventory_movements_source_idx ON inventory_movements(workspace_id, source_type, source_id, source_line_id);

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses FORCE ROW LEVEL SECURITY;
ALTER TABLE warehouse_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_locations FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_lots FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_serials ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_serials FORCE ROW LEVEL SECURITY;
ALTER TABLE stock_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_identities FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_balances FORCE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements FORCE ROW LEVEL SECURITY;

CREATE POLICY warehouses_context_policy ON warehouses FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid AND (
    NULLIF(current_setting('app.company_id', true), '') IS NULL
    OR operator_company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
  ))
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid AND (
    NULLIF(current_setting('app.company_id', true), '') IS NULL
    OR operator_company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
  ));
CREATE POLICY warehouse_locations_context_policy ON warehouse_locations FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid AND EXISTS (
    SELECT 1 FROM warehouses warehouse WHERE warehouse.id = warehouse_id AND warehouse.workspace_id = workspace_id
  ))
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid AND EXISTS (
    SELECT 1 FROM warehouses warehouse WHERE warehouse.id = warehouse_id AND warehouse.workspace_id = workspace_id
  ));
CREATE POLICY inventory_items_context_policy ON inventory_items FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['inventory_lots', 'inventory_serials', 'stock_identities', 'inventory_balances', 'inventory_movements']
  LOOP
    EXECUTE format(
      'CREATE POLICY %I_context_policy ON %I FOR ALL TO tapra2_app USING (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid AND (NULLIF(current_setting(''app.company_id'', true), '''') IS NULL OR owner_company_id = NULLIF(current_setting(''app.company_id'', true), '''')::uuid)) WITH CHECK (workspace_id = NULLIF(current_setting(''app.workspace_id'', true), '''')::uuid AND (NULLIF(current_setting(''app.company_id'', true), '''') IS NULL OR owner_company_id = NULLIF(current_setting(''app.company_id'', true), '''')::uuid))',
      table_name, table_name
    );
  END LOOP;
END;
$$;

GRANT SELECT, INSERT, UPDATE ON warehouses, warehouse_locations, inventory_items,
  inventory_lots, inventory_serials, stock_identities, inventory_balances TO tapra2_app;
GRANT SELECT, INSERT ON inventory_movements TO tapra2_app;
