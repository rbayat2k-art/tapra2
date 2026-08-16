ALTER TABLE inventory_serials NO FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM inventory_serials
    GROUP BY workspace_id, inventory_item_id, serial_code
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot canonicalize physical Serial identities: duplicate workspace/item/serial rows require explicit reconciliation.'
      USING ERRCODE = '23505';
  END IF;
END;
$$;

ALTER TABLE warehouse_locations
  DROP CONSTRAINT warehouse_locations_location_type_check;

UPDATE warehouse_locations
SET location_type = 'SELLABLE'
WHERE location_type = 'STORAGE';

ALTER TABLE warehouse_locations
  ADD CONSTRAINT warehouse_locations_location_type_check
    CHECK (location_type IN (
      'RECEIVING', 'SELLABLE', 'PICKING', 'PACKING', 'RETURNS', 'QUARANTINE', 'DAMAGED', 'TRANSIT'
    ));

DROP POLICY inventory_serials_context_policy ON inventory_serials;

DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'inventory_serials'::regclass
      AND pg_get_constraintdef(oid) LIKE '%owner_company_id%'
  LOOP
    EXECUTE format('ALTER TABLE inventory_serials DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END;
$$;

ALTER TABLE inventory_serials
  DROP COLUMN owner_company_id,
  ADD CONSTRAINT inventory_serials_physical_identity_key
    UNIQUE (workspace_id, inventory_item_id, serial_code),
  ADD CONSTRAINT inventory_serials_item_reference_key
    UNIQUE (workspace_id, inventory_item_id, id);

ALTER TABLE stock_identities
  ADD CONSTRAINT stock_identities_serial_item_fk
    FOREIGN KEY (workspace_id, inventory_item_id, serial_id)
    REFERENCES inventory_serials(workspace_id, inventory_item_id, id);

CREATE POLICY inventory_serials_context_policy ON inventory_serials FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

ALTER TABLE inventory_serials FORCE ROW LEVEL SECURITY;

DROP POLICY audit_entries_context_policy ON audit_entries;
CREATE POLICY audit_entries_context_policy ON audit_entries FOR ALL TO tapra2_app
  USING (
    workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.company_id', true), '') IS NULL
      OR company_id IS NULL
      OR company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
    )
  )
  WITH CHECK (
    workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND (
      NULLIF(current_setting('app.company_id', true), '') IS NULL
      OR company_id IS NULL
      OR company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
    )
  );

GRANT UPDATE ON inventory_movements TO tapra2_app;

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
      AND serial.inventory_item_id = NEW.inventory_item_id
  ) THEN
    RAISE EXCEPTION 'Serial does not belong to the InventoryItem.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE inventory_balances
  ADD COLUMN serial_id uuid;

UPDATE inventory_balances balance
SET serial_id = identity.serial_id
FROM stock_identities identity
WHERE identity.workspace_id = balance.workspace_id
  AND identity.id = balance.stock_identity_id;

ALTER TABLE inventory_balances
  ADD CONSTRAINT inventory_balances_serial_fk
    FOREIGN KEY (workspace_id, serial_id) REFERENCES inventory_serials(workspace_id, id),
  ADD CONSTRAINT inventory_balances_serial_quantity_check
    CHECK (serial_id IS NULL OR on_hand_quantity IN (0, 1));

CREATE UNIQUE INDEX inventory_balances_one_active_serial_idx
  ON inventory_balances(workspace_id, serial_id)
  WHERE serial_id IS NOT NULL AND on_hand_quantity > 0;

CREATE OR REPLACE FUNCTION derive_inventory_balance_serial_id()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  identity_serial_id uuid;
  identity_owner_company_id uuid;
BEGIN
  SELECT serial_id, owner_company_id
  INTO identity_serial_id, identity_owner_company_id
  FROM stock_identities
  WHERE workspace_id = NEW.workspace_id
    AND id = NEW.stock_identity_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory Balance StockIdentity was not found.' USING ERRCODE = '23503';
  END IF;
  IF identity_owner_company_id <> NEW.owner_company_id THEN
    RAISE EXCEPTION 'Inventory Balance owner must match StockIdentity owner.' USING ERRCODE = '23514';
  END IF;

  NEW.serial_id := identity_serial_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_balances_derive_serial_trigger
BEFORE INSERT OR UPDATE OF stock_identity_id, owner_company_id, serial_id
ON inventory_balances
FOR EACH ROW EXECUTE FUNCTION derive_inventory_balance_serial_id();

CREATE OR REPLACE FUNCTION enforce_sellable_inventory_allocation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM warehouse_locations location
    WHERE location.workspace_id = NEW.workspace_id
      AND location.warehouse_id = NEW.warehouse_id
      AND location.id = NEW.location_id
      AND location.location_type = 'SELLABLE'
      AND location.is_active = true
  ) THEN
    RAISE EXCEPTION 'Inventory allocations require an active SELLABLE Location.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_allocations_sellable_location_trigger
BEFORE INSERT OR UPDATE OF warehouse_id, location_id
ON inventory_allocations
FOR EACH ROW EXECUTE FUNCTION enforce_sellable_inventory_allocation();

ALTER TABLE warehouse_transfers
  ADD COLUMN reversed_from_status text,
  ADD COLUMN reversal_reason text,
  ADD COLUMN reversed_by_user_account_id uuid REFERENCES user_accounts(id),
  ADD COLUMN reversed_at timestamptz;

UPDATE warehouse_transfers
SET reversed_from_status = 'DRAFT',
    reversal_reason = reason,
    reversed_by_user_account_id = created_by_user_account_id,
    reversed_at = created_at
WHERE status = 'CANCELLED';

DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'warehouse_transfers'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) LIKE '%dispatched_at%'
        OR pg_get_constraintdef(oid) LIKE '%received_at%'
      )
  LOOP
    EXECUTE format('ALTER TABLE warehouse_transfers DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END;
$$;

ALTER TABLE warehouse_transfers
  ADD CONSTRAINT warehouse_transfers_reversed_from_status_check
    CHECK (reversed_from_status IS NULL OR reversed_from_status IN ('DRAFT', 'IN_TRANSIT', 'RECEIVED')),
  ADD CONSTRAINT warehouse_transfers_dispatch_state_check CHECK (
    (status = 'DRAFT' AND dispatched_at IS NULL AND dispatched_by_user_account_id IS NULL)
    OR (status IN ('IN_TRANSIT', 'RECEIVED') AND dispatched_at IS NOT NULL AND dispatched_by_user_account_id IS NOT NULL)
    OR (status = 'CANCELLED' AND (
      (reversed_from_status = 'DRAFT' AND dispatched_at IS NULL AND dispatched_by_user_account_id IS NULL)
      OR (reversed_from_status IN ('IN_TRANSIT', 'RECEIVED') AND dispatched_at IS NOT NULL AND dispatched_by_user_account_id IS NOT NULL)
    ))
  ),
  ADD CONSTRAINT warehouse_transfers_receive_state_check CHECK (
    (status IN ('DRAFT', 'IN_TRANSIT') AND received_at IS NULL AND received_by_user_account_id IS NULL)
    OR (status = 'RECEIVED' AND received_at IS NOT NULL AND received_by_user_account_id IS NOT NULL)
    OR (status = 'CANCELLED' AND (
      (reversed_from_status IN ('DRAFT', 'IN_TRANSIT') AND received_at IS NULL AND received_by_user_account_id IS NULL)
      OR (reversed_from_status = 'RECEIVED' AND received_at IS NOT NULL AND received_by_user_account_id IS NOT NULL)
    ))
  ),
  ADD CONSTRAINT warehouse_transfers_reversal_state_check CHECK (
    (status = 'CANCELLED') = (
      reversed_from_status IS NOT NULL
      AND reversal_reason IS NOT NULL
      AND reversed_by_user_account_id IS NOT NULL
      AND reversed_at IS NOT NULL
    )
  );

CREATE INDEX warehouse_transfers_reversal_idx
  ON warehouse_transfers(workspace_id, owner_company_id, reversed_at)
  WHERE reversed_at IS NOT NULL;
