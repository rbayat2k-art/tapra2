import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withWorkspaceTransaction } from '../../infrastructure/database/pool.js';
import { AppError } from '../../shared/errors.js';
import { appendAuditEntry, auditIdentity } from '../audit/audit-service.js';
import type { AuthenticatedSession, MembershipContext } from '../identity/types.js';
import { formatQuantity, normalizeQuantity, parseQuantity } from './quantity.js';

export const trackingModes = ['NONE', 'LOT', 'SERIAL'] as const;
export type TrackingMode = typeof trackingModes[number];

export interface WarehouseMutationContext {
  context: MembershipContext;
  session: AuthenticatedSession;
  correlationId: string;
}

export function requireWarehousePermission(context: MembershipContext, permission: string): void {
  if (!context.permissions.includes(permission)) {
    throw new AppError(403, 'permission_denied', `Permission ${permission} is required.`);
  }
  if (!['WORKSPACE', 'COMPANY'].includes(context.scope.type)) {
    throw new AppError(403, 'warehouse_scope_unsupported', 'Warehouse Foundation currently supports only Workspace and Company scopes.');
  }
}

export function resolveOwnerCompanyId(context: MembershipContext, requested?: string): string {
  if (context.company) {
    if (requested && requested !== context.company.id) {
      throw new AppError(403, 'warehouse_cross_company_forbidden', 'The requested owner Company is outside the active Company context.');
    }
    return context.company.id;
  }
  if (context.scope.type !== 'WORKSPACE') {
    throw new AppError(403, 'warehouse_company_context_required', 'Warehouse operations require a Company or Workspace scope.');
  }
  if (!requested) throw new AppError(400, 'owner_company_required', 'ownerCompanyId is required in Workspace scope.');
  return requested;
}

export async function lockWarehouseIdempotency(client: PoolClient, namespace: string, key: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`warehouse:${namespace}:${key}`]);
}

async function assertCompanyExists(client: PoolClient, workspaceId: string, companyId: string): Promise<void> {
  const result = await client.query('SELECT 1 FROM companies WHERE workspace_id = $1 AND id = $2 AND is_active = true', [workspaceId, companyId]);
  if (result.rowCount !== 1) throw new AppError(404, 'company_not_found', 'The owner Company was not found.');
}

export async function assertWarehouseAccess(
  client: PoolClient,
  context: MembershipContext,
  warehouseId: string,
  ownerCompanyId?: string,
): Promise<{ id: string; operator_company_id: string | null }> {
  const result = await client.query<{ id: string; operator_company_id: string | null }>(`
    SELECT id, operator_company_id FROM warehouses
    WHERE workspace_id = $1 AND id = $2 AND is_active = true
  `, [context.workspace.id, warehouseId]);
  const warehouse = result.rows[0];
  if (!warehouse) throw new AppError(404, 'warehouse_not_found', 'Warehouse was not found in the active context.');
  if (context.scope.type !== 'WORKSPACE' && warehouse.operator_company_id !== context.company?.id) {
    throw new AppError(403, 'warehouse_cross_company_forbidden', 'Warehouse is outside the active Company context.');
  }
  if (ownerCompanyId && context.scope.type !== 'WORKSPACE' && warehouse.operator_company_id !== ownerCompanyId) {
    throw new AppError(403, 'warehouse_cross_company_forbidden', 'Cross-Company Warehouse operation requires Workspace scope.');
  }
  return warehouse;
}

export async function assertLocation(
  client: PoolClient,
  workspaceId: string,
  warehouseId: string,
  locationId: string,
  allowedTypes?: readonly string[],
): Promise<{ id: string; location_type: string }> {
  const result = await client.query<{ id: string; location_type: string }>(`
    SELECT id, location_type FROM warehouse_locations
    WHERE workspace_id = $1 AND warehouse_id = $2 AND id = $3 AND is_active = true
  `, [workspaceId, warehouseId, locationId]);
  const location = result.rows[0];
  if (!location) throw new AppError(404, 'warehouse_location_not_found', 'Warehouse Location was not found.');
  if (allowedTypes && !allowedTypes.includes(location.location_type)) {
    throw new AppError(409, 'warehouse_location_type_invalid', `Location type ${location.location_type} is not valid for this operation.`);
  }
  return location;
}

export async function listWarehouseOverview(context: MembershipContext): Promise<Record<string, unknown>> {
  requireWarehousePermission(context, 'warehouse.read');
  return withWorkspaceTransaction({ workspaceId: context.workspace.id, companyId: context.company?.id ?? null }, async (client) => {
    const [warehouses, locations, items, balances, movements, receipts, reservations, allocations, transfers, adjustments, counts, returns, returnLines] = await Promise.all([
      client.query(`SELECT id, operator_company_id AS "operatorCompanyId", operator_unit_id AS "operatorUnitId", code, name,
        description, is_active AS "isActive", created_at AS "createdAt" FROM warehouses ORDER BY name, id`),
      client.query(`SELECT id, warehouse_id AS "warehouseId", code, name, location_type AS "locationType",
        is_active AS "isActive" FROM warehouse_locations ORDER BY warehouse_id, code, id`),
      client.query(`SELECT id, sku, name, catalog_reference AS "catalogReference", tracking_mode AS "trackingMode", uom,
        is_active AS "isActive" FROM inventory_items ORDER BY name, id`),
      client.query(`SELECT balance.warehouse_id AS "warehouseId", balance.location_id AS "locationId",
        balance.stock_identity_id AS "stockIdentityId", balance.owner_company_id AS "ownerCompanyId",
        balance.on_hand_quantity::text AS "onHandQuantity", identity.inventory_item_id AS "inventoryItemId",
        identity.lot_id AS "lotId", identity.serial_id AS "serialId", item.sku, item.name, item.uom
        FROM inventory_balances balance JOIN stock_identities identity ON identity.id = balance.stock_identity_id
        JOIN inventory_items item ON item.id = identity.inventory_item_id
        WHERE balance.on_hand_quantity > 0 ORDER BY item.name, balance.warehouse_id, balance.location_id`),
      client.query(`SELECT id, owner_company_id AS "ownerCompanyId", stock_identity_id AS "stockIdentityId",
        movement_type AS "movementType", from_warehouse_id AS "fromWarehouseId", from_location_id AS "fromLocationId",
        to_warehouse_id AS "toWarehouseId", to_location_id AS "toLocationId", quantity::text,
        source_type AS "sourceType", source_id AS "sourceId", source_line_id AS "sourceLineId",
        reverses_movement_id AS "reversesMovementId", reason, occurred_at AS "occurredAt"
        FROM inventory_movements ORDER BY occurred_at DESC, id DESC LIMIT 200`),
      client.query(`SELECT id, owner_company_id AS "ownerCompanyId", warehouse_id AS "warehouseId",
        receiving_location_id AS "receivingLocationId", receipt_type AS "receiptType", status, source_note AS "sourceNote",
        reason, created_at AS "createdAt", posted_at AS "postedAt" FROM warehouse_receipts ORDER BY created_at DESC, id DESC LIMIT 100`),
      client.query(`SELECT id, owner_company_id AS "ownerCompanyId", invoice_id AS "invoiceId", invoice_line_id AS "invoiceLineId",
        invoice_revision AS "invoiceRevision", inventory_item_id AS "inventoryItemId", requested_quantity::text AS "requestedQuantity",
        reserved_quantity::text AS "reservedQuantity", shortage_quantity::text AS "shortageQuantity", status,
        created_at AS "createdAt", released_at AS "releasedAt", release_reason AS "releaseReason"
        FROM inventory_reservations ORDER BY created_at DESC, id DESC LIMIT 100`),
      client.query(`SELECT id, reservation_id AS "reservationId", warehouse_id AS "warehouseId", location_id AS "locationId",
        stock_identity_id AS "stockIdentityId", quantity::text, status, created_at AS "createdAt", released_at AS "releasedAt"
        FROM inventory_allocations ORDER BY created_at DESC, id DESC LIMIT 500`),
      client.query(`SELECT id, owner_company_id AS "ownerCompanyId", source_warehouse_id AS "sourceWarehouseId",
        destination_warehouse_id AS "destinationWarehouseId", source_location_id AS "sourceLocationId",
        destination_location_id AS "destinationLocationId", status, reason, created_at AS "createdAt",
        dispatched_at AS "dispatchedAt", received_at AS "receivedAt" FROM warehouse_transfers ORDER BY created_at DESC, id DESC LIMIT 100`),
      client.query(`SELECT id, owner_company_id AS "ownerCompanyId", warehouse_id AS "warehouseId", location_id AS "locationId",
        status, reason, evidence_note AS "evidenceNote", created_at AS "createdAt", submitted_at AS "submittedAt", posted_at AS "postedAt"
        FROM inventory_adjustments ORDER BY created_at DESC, id DESC LIMIT 100`),
      client.query(`SELECT id, owner_company_id AS "ownerCompanyId", warehouse_id AS "warehouseId", location_id AS "locationId",
        status, reason, created_at AS "createdAt", submitted_at AS "submittedAt", posted_at AS "postedAt"
        FROM inventory_counts ORDER BY created_at DESC, id DESC LIMIT 100`),
      client.query(`SELECT id, owner_company_id AS "ownerCompanyId", warehouse_id AS "warehouseId", returns_location_id AS "returnsLocationId",
        customer_id AS "customerId", invoice_id AS "invoiceId", status, reason, evidence_note AS "evidenceNote",
        created_at AS "createdAt", received_at AS "receivedAt" FROM inventory_returns ORDER BY created_at DESC, id DESC LIMIT 100`),
      client.query(`SELECT id, return_id AS "returnId", inventory_item_id AS "inventoryItemId", quantity::text,
        lot_code AS "lotCode", serial_code AS "serialCode", stock_identity_id AS "stockIdentityId"
        FROM inventory_return_lines ORDER BY return_id, line_number, id`),
    ]);
    return {
      warehouses: warehouses.rows, locations: locations.rows, items: items.rows, balances: balances.rows,
      movements: movements.rows, receipts: receipts.rows, reservations: reservations.rows, allocations: allocations.rows,
      transfers: transfers.rows, adjustments: adjustments.rows, counts: counts.rows, returns: returns.rows,
      returnLines: returnLines.rows,
    };
  });
}

interface ProjectionMismatch {
  owner_company_id: string;
  warehouse_id: string;
  location_id: string;
  stock_identity_id: string;
  rebuilt_quantity: string;
  projected_quantity: string;
}

export async function rebuildInventoryBalanceProjection(
  client: PoolClient,
  workspaceId: string,
): Promise<ProjectionMismatch[]> {
  const result = await client.query<ProjectionMismatch>(`
    WITH movement_deltas AS (
      SELECT workspace_id, owner_company_id, from_warehouse_id AS warehouse_id,
        from_location_id AS location_id, stock_identity_id, -quantity AS quantity
      FROM inventory_movements
      WHERE workspace_id = $1 AND from_location_id IS NOT NULL
      UNION ALL
      SELECT workspace_id, owner_company_id, to_warehouse_id AS warehouse_id,
        to_location_id AS location_id, stock_identity_id, quantity
      FROM inventory_movements
      WHERE workspace_id = $1 AND to_location_id IS NOT NULL
    ), rebuilt AS (
      SELECT workspace_id, owner_company_id, warehouse_id, location_id, stock_identity_id,
        sum(quantity)::numeric(20,6) AS on_hand_quantity
      FROM movement_deltas
      GROUP BY workspace_id, owner_company_id, warehouse_id, location_id, stock_identity_id
    )
    SELECT COALESCE(rebuilt.owner_company_id, balance.owner_company_id)::text AS owner_company_id,
      COALESCE(rebuilt.warehouse_id, balance.warehouse_id)::text AS warehouse_id,
      COALESCE(rebuilt.location_id, balance.location_id)::text AS location_id,
      COALESCE(rebuilt.stock_identity_id, balance.stock_identity_id)::text AS stock_identity_id,
      COALESCE(rebuilt.on_hand_quantity, 0)::text AS rebuilt_quantity,
      COALESCE(balance.on_hand_quantity, 0)::text AS projected_quantity
    FROM rebuilt
    FULL OUTER JOIN inventory_balances balance
      ON balance.workspace_id = rebuilt.workspace_id
      AND balance.owner_company_id = rebuilt.owner_company_id
      AND balance.warehouse_id = rebuilt.warehouse_id
      AND balance.location_id = rebuilt.location_id
      AND balance.stock_identity_id = rebuilt.stock_identity_id
    WHERE COALESCE(rebuilt.workspace_id, balance.workspace_id) = $1
      AND COALESCE(rebuilt.on_hand_quantity, 0) <> COALESCE(balance.on_hand_quantity, 0)
    ORDER BY owner_company_id, warehouse_id, location_id, stock_identity_id
    LIMIT 101
  `, [workspaceId]);
  return result.rows;
}

export async function verifyInventoryBalanceProjection(
  context: MembershipContext,
): Promise<{ consistent: true; checkedAt: string }> {
  requireWarehousePermission(context, 'warehouse.read');
  return withWorkspaceTransaction({ workspaceId: context.workspace.id, companyId: context.company?.id ?? null }, async (client) => {
    const mismatches = await rebuildInventoryBalanceProjection(client, context.workspace.id);
    if (mismatches.length > 0) {
      throw new AppError(409, 'inventory_projection_mismatch', 'Inventory Balance projection does not match the Movement ledger.', {
        mismatchCount: mismatches.length,
        mismatches: mismatches.slice(0, 100),
      });
    }
    return { consistent: true, checkedAt: new Date().toISOString() };
  });
}

export async function createWarehouse(
  mutation: WarehouseMutationContext,
  input: { ownerCompanyId?: string; operatorUnitId?: string; code: string; name: string; description?: string },
): Promise<Record<string, unknown>> {
  requireWarehousePermission(mutation.context, 'warehouse.manage');
  if (mutation.context.scope.type !== 'WORKSPACE' && input.operatorUnitId) {
    throw new AppError(403, 'warehouse_shared_operator_forbidden', 'Shared Service Warehouse creation requires Workspace scope.');
  }
  const ownerCompanyId = input.operatorUnitId ? null : resolveOwnerCompanyId(mutation.context, input.ownerCompanyId);
  return withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
    if (ownerCompanyId) await assertCompanyExists(client, mutation.context.workspace.id, ownerCompanyId);
    if (input.operatorUnitId) {
      const unit = await client.query(`SELECT 1 FROM organization_units WHERE workspace_id = $1 AND id = $2 AND unit_type = 'SHARED_SERVICE' AND is_active = true`, [mutation.context.workspace.id, input.operatorUnitId]);
      if (unit.rowCount !== 1) throw new AppError(404, 'shared_service_not_found', 'Shared Service operator was not found.');
    }
    const result = await client.query<Record<string, unknown>>(`
      INSERT INTO warehouses(workspace_id, operator_company_id, operator_unit_id, code, name, description, created_by_user_account_id)
      VALUES ($1, $2, $3, upper($4), $5, $6, $7)
      RETURNING id, operator_company_id AS "operatorCompanyId", operator_unit_id AS "operatorUnitId", code, name, description,
        is_active AS "isActive", created_at AS "createdAt"
    `, [mutation.context.workspace.id, ownerCompanyId, input.operatorUnitId ?? null, input.code, input.name, input.description ?? null, mutation.session.userAccountId]);
    const warehouse = result.rows[0]!;
    await appendAuditEntry(client, {
      workspaceId: mutation.context.workspace.id, companyId: ownerCompanyId, ...auditIdentity(mutation.session),
      action: 'warehouse.created', resourceType: 'warehouse', resourceId: warehouse.id as string,
      result: 'success', newState: warehouse, correlationId: mutation.correlationId,
    });
    return warehouse;
  });
}

export async function createWarehouseLocation(
  mutation: WarehouseMutationContext,
  warehouseId: string,
  input: { code: string; name: string; locationType: string },
): Promise<Record<string, unknown>> {
  requireWarehousePermission(mutation.context, 'warehouse.manage');
  return withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
    const warehouse = await assertWarehouseAccess(client, mutation.context, warehouseId);
    const result = await client.query<Record<string, unknown>>(`
      INSERT INTO warehouse_locations(workspace_id, warehouse_id, code, name, location_type)
      VALUES ($1, $2, upper($3), $4, $5)
      RETURNING id, warehouse_id AS "warehouseId", code, name, location_type AS "locationType", is_active AS "isActive"
    `, [mutation.context.workspace.id, warehouseId, input.code, input.name, input.locationType]);
    const location = result.rows[0]!;
    await appendAuditEntry(client, {
      workspaceId: mutation.context.workspace.id, companyId: warehouse.operator_company_id, ...auditIdentity(mutation.session),
      action: 'warehouse.location.created', resourceType: 'warehouse_location', resourceId: location.id as string,
      result: 'success', newState: location, correlationId: mutation.correlationId,
    });
    return location;
  });
}

export async function createInventoryItem(
  mutation: WarehouseMutationContext,
  input: { sku: string; name: string; catalogReference: string; trackingMode: TrackingMode; uom: string },
): Promise<Record<string, unknown>> {
  requireWarehousePermission(mutation.context, 'warehouse.item.manage');
  return withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
    const result = await client.query<Record<string, unknown>>(`
      INSERT INTO inventory_items(workspace_id, sku, name, catalog_reference, tracking_mode, uom, created_by_user_account_id)
      VALUES ($1, $2, $3, $4, $5, upper($6), $7)
      RETURNING id, sku, name, catalog_reference AS "catalogReference", tracking_mode AS "trackingMode", uom, is_active AS "isActive"
    `, [mutation.context.workspace.id, input.sku, input.name, input.catalogReference, input.trackingMode, input.uom, mutation.session.userAccountId]);
    const item = result.rows[0]!;
    await client.query(`UPDATE sales_invoice_lines SET inventory_item_id = $3
      WHERE workspace_id = $1 AND catalog_reference = $2 AND item_type = 'goods' AND inventory_item_id IS NULL`,
    [mutation.context.workspace.id, input.catalogReference, item.id]);
    await appendAuditEntry(client, {
      workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null, ...auditIdentity(mutation.session),
      action: 'warehouse.inventory_item.created', resourceType: 'inventory_item', resourceId: item.id as string,
      result: 'success', newState: item, correlationId: mutation.correlationId,
    });
    return item;
  });
}

interface StockIdentityRow {
  id: string;
  tracking_mode: TrackingMode;
  serial_id: string | null;
}

export async function resolveStockIdentity(
  client: PoolClient,
  input: {
    workspaceId: string; ownerCompanyId: string; inventoryItemId: string;
    quantity: string; lotCode?: string; serialCode?: string; manufacturedAt?: string; expiresAt?: string;
  },
): Promise<StockIdentityRow> {
  const itemResult = await client.query<{ tracking_mode: TrackingMode; is_active: boolean }>(`
    SELECT tracking_mode, is_active FROM inventory_items WHERE workspace_id = $1 AND id = $2 FOR UPDATE
  `, [input.workspaceId, input.inventoryItemId]);
  const item = itemResult.rows[0];
  if (!item || !item.is_active) throw new AppError(409, 'inventory_item_unresolved', 'A stable active InventoryItem is required.');
  const quantity = normalizeQuantity(input.quantity, { positive: true });
  if (item.tracking_mode === 'NONE' && (input.lotCode || input.serialCode)) {
    throw new AppError(409, 'tracking_identity_forbidden', 'NONE-tracked items cannot have Lot or Serial identity.');
  }
  if (item.tracking_mode === 'LOT' && (!input.lotCode || input.serialCode)) {
    throw new AppError(409, 'lot_identity_required', 'LOT-tracked items require exactly one Lot code.');
  }
  if (item.tracking_mode === 'SERIAL' && (!input.serialCode || input.lotCode || parseQuantity(quantity) !== 1_000_000n)) {
    throw new AppError(409, 'serial_quantity_invalid', 'SERIAL-tracked items require one Serial code and quantity exactly 1.000000.');
  }
  let lotId: string | null = null;
  let serialId: string | null = null;
  if (input.lotCode) {
    const lot = await client.query<{ id: string }>(`
      INSERT INTO inventory_lots(workspace_id, inventory_item_id, owner_company_id, lot_code, manufactured_at, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (workspace_id, inventory_item_id, owner_company_id, lot_code) DO UPDATE
        SET lot_code = EXCLUDED.lot_code
      RETURNING id
    `, [input.workspaceId, input.inventoryItemId, input.ownerCompanyId, input.lotCode, input.manufacturedAt ?? null, input.expiresAt ?? null]);
    lotId = lot.rows[0]!.id;
  }
  if (input.serialCode) {
    const serial = await client.query<{ id: string }>(`
      INSERT INTO inventory_serials(workspace_id, inventory_item_id, serial_code)
      VALUES ($1, $2, $3)
      ON CONFLICT (workspace_id, inventory_item_id, serial_code) DO UPDATE
        SET serial_code = EXCLUDED.serial_code
      RETURNING id
    `, [input.workspaceId, input.inventoryItemId, input.serialCode]);
    serialId = serial.rows[0]!.id;
  }
  const identity = await client.query<{ id: string }>(`
    INSERT INTO stock_identities(workspace_id, inventory_item_id, owner_company_id, lot_id, serial_id)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (workspace_id, inventory_item_id, owner_company_id, lot_id, serial_id) DO UPDATE
      SET inventory_item_id = EXCLUDED.inventory_item_id
    RETURNING id
  `, [input.workspaceId, input.inventoryItemId, input.ownerCompanyId, lotId, serialId]);
  return { id: identity.rows[0]!.id, tracking_mode: item.tracking_mode, serial_id: serialId };
}

interface MovementInput {
  workspaceId: string;
  ownerCompanyId: string;
  stockIdentityId: string;
  movementType: string;
  quantity: string;
  fromWarehouseId?: string;
  fromLocationId?: string;
  toWarehouseId?: string;
  toLocationId?: string;
  sourceType: string;
  sourceId: string;
  sourceLineId?: string;
  reversesMovementId?: string;
  reason?: string;
  session: AuthenticatedSession;
  correlationId: string;
}

async function lockOrCreateBalance(
  client: PoolClient,
  input: { workspaceId: string; ownerCompanyId: string; warehouseId: string; locationId: string; stockIdentityId: string },
): Promise<bigint> {
  await client.query(`
    INSERT INTO inventory_balances(workspace_id, owner_company_id, warehouse_id, location_id, stock_identity_id)
    VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING
  `, [input.workspaceId, input.ownerCompanyId, input.warehouseId, input.locationId, input.stockIdentityId]);
  const balance = await client.query<{ on_hand_quantity: string }>(`
    SELECT on_hand_quantity::text FROM inventory_balances
    WHERE workspace_id = $1 AND location_id = $2 AND stock_identity_id = $3 FOR UPDATE
  `, [input.workspaceId, input.locationId, input.stockIdentityId]);
  return parseQuantity(balance.rows[0]!.on_hand_quantity);
}

export async function postInventoryMovement(client: PoolClient, input: MovementInput): Promise<string> {
  const quantity = parseQuantity(input.quantity, { positive: true });
  const identity = await client.query<{ tracking_mode: TrackingMode }>(`
    SELECT item.tracking_mode FROM stock_identities identity
    JOIN inventory_items item ON item.id = identity.inventory_item_id
    WHERE identity.workspace_id = $1 AND identity.owner_company_id = $2 AND identity.id = $3
  `, [input.workspaceId, input.ownerCompanyId, input.stockIdentityId]);
  if (!identity.rows[0]) throw new AppError(404, 'stock_identity_not_found', 'Stock identity was not found.');
  if (identity.rows[0].tracking_mode === 'SERIAL' && quantity !== 1_000_000n) {
    throw new AppError(409, 'serial_quantity_invalid', 'SERIAL inventory movement quantity must be exactly 1.000000.');
  }
  if (identity.rows[0].tracking_mode === 'SERIAL') {
    const serialBalances = await client.query<{ on_hand_quantity: string }>(`
      SELECT on_hand_quantity::text FROM inventory_balances
      WHERE workspace_id = $1 AND owner_company_id = $2 AND stock_identity_id = $3
      ORDER BY location_id FOR UPDATE
    `, [input.workspaceId, input.ownerCompanyId, input.stockIdentityId]);
    const totalOnHand = serialBalances.rows.reduce((sum, row) => sum + parseQuantity(row.on_hand_quantity), 0n);
    if (input.toLocationId && !input.fromLocationId && totalOnHand > 0n) {
      throw new AppError(409, 'serial_already_on_hand', 'Serial is already on hand and cannot be received again.');
    }
  }

  if (input.fromWarehouseId && input.fromLocationId) {
    const current = await lockOrCreateBalance(client, {
      workspaceId: input.workspaceId, ownerCompanyId: input.ownerCompanyId,
      warehouseId: input.fromWarehouseId, locationId: input.fromLocationId, stockIdentityId: input.stockIdentityId,
    });
    const allocated = await client.query<{ quantity: string }>(`
      SELECT COALESCE(sum(quantity), 0)::text AS quantity FROM inventory_allocations
      WHERE workspace_id = $1 AND owner_company_id = $2 AND location_id = $3 AND stock_identity_id = $4 AND status = 'ACTIVE'
    `, [input.workspaceId, input.ownerCompanyId, input.fromLocationId, input.stockIdentityId]);
    const reserved = parseQuantity(allocated.rows[0]!.quantity);
    if (current - reserved < quantity) {
      throw new AppError(409, 'negative_inventory_denied', 'Movement would consume reserved stock or create negative inventory.');
    }
    await client.query(`UPDATE inventory_balances SET on_hand_quantity = $4::numeric, version = version + 1, updated_at = now()
      WHERE workspace_id = $1 AND location_id = $2 AND stock_identity_id = $3`,
    [input.workspaceId, input.fromLocationId, input.stockIdentityId, formatQuantity(current - quantity)]);
  }
  if (input.toWarehouseId && input.toLocationId) {
    const current = await lockOrCreateBalance(client, {
      workspaceId: input.workspaceId, ownerCompanyId: input.ownerCompanyId,
      warehouseId: input.toWarehouseId, locationId: input.toLocationId, stockIdentityId: input.stockIdentityId,
    });
    try {
      await client.query(`UPDATE inventory_balances SET on_hand_quantity = $4::numeric, version = version + 1, updated_at = now()
        WHERE workspace_id = $1 AND location_id = $2 AND stock_identity_id = $3`,
      [input.workspaceId, input.toLocationId, input.stockIdentityId, formatQuantity(current + quantity)]);
    } catch (error) {
      const databaseError = error as { code?: string; constraint?: string };
      if (databaseError.code === '23505' && databaseError.constraint === 'inventory_balances_one_active_serial_idx') {
        throw new AppError(409, 'serial_already_on_hand', 'Serial is already active in another ownership or Location state.');
      }
      throw error;
    }
  }

  const movementId = randomUUID();
  await client.query(`
    INSERT INTO inventory_movements(id, workspace_id, owner_company_id, stock_identity_id, movement_type,
      from_warehouse_id, from_location_id, to_warehouse_id, to_location_id, quantity,
      source_type, source_id, source_line_id, reverses_movement_id, reason,
      actor_user_account_id, effective_user_account_id, impersonation_id, idempotency_key, correlation_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::numeric, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
  `, [
    movementId, input.workspaceId, input.ownerCompanyId, input.stockIdentityId, input.movementType,
    input.fromWarehouseId ?? null, input.fromLocationId ?? null, input.toWarehouseId ?? null, input.toLocationId ?? null,
    formatQuantity(quantity), input.sourceType, input.sourceId, input.sourceLineId ?? null, input.reversesMovementId ?? null,
    input.reason ?? null, input.session.actorUserAccountId,
    input.session.userAccountId === input.session.actorUserAccountId ? null : input.session.userAccountId,
    input.session.impersonationId, randomUUID(), input.correlationId,
  ]);
  return movementId;
}

export async function reverseInventoryMovement(
  mutation: WarehouseMutationContext,
  movementId: string,
  reason: string,
): Promise<{ movementId: string }> {
  requireWarehousePermission(mutation.context, 'warehouse.movement.reverse');
  if (mutation.session.impersonationId) throw new AppError(403, 'warehouse_approval_impersonation_forbidden', 'Inventory reversal is forbidden during impersonation.');
  return withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
    await lockWarehouseIdempotency(client, 'movement-reversal', movementId);
    const original = await client.query<{
      id: string; owner_company_id: string; stock_identity_id: string; movement_type: string; source_type: string; quantity: string;
      from_warehouse_id: string | null; from_location_id: string | null; to_warehouse_id: string | null; to_location_id: string | null;
    }>(`SELECT id, owner_company_id, stock_identity_id, movement_type, source_type, quantity::text, from_warehouse_id, from_location_id,
      to_warehouse_id, to_location_id FROM inventory_movements WHERE workspace_id = $1 AND id = $2`,
    [mutation.context.workspace.id, movementId]);
    const row = original.rows[0];
    if (!row) throw new AppError(404, 'inventory_movement_not_found', 'Inventory Movement was not found.');
    if (row.movement_type === 'REVERSAL') throw new AppError(409, 'inventory_reversal_invalid', 'A reversal movement cannot itself be reversed.');
    if (row.source_type === 'WAREHOUSE_TRANSFER' || ['TRANSFER_OUT', 'TRANSFER_IN'].includes(row.movement_type)) {
      throw new AppError(409, 'transfer_document_reversal_required', 'Transfer movements can only be reversed atomically from the Transfer document.');
    }
    const existing = await client.query('SELECT 1 FROM inventory_movements WHERE workspace_id = $1 AND reverses_movement_id = $2', [mutation.context.workspace.id, movementId]);
    if (existing.rowCount) throw new AppError(409, 'inventory_movement_already_reversed', 'Inventory Movement is already reversed.');
    const reversedId = await postInventoryMovement(client, {
      workspaceId: mutation.context.workspace.id, ownerCompanyId: row.owner_company_id,
      stockIdentityId: row.stock_identity_id, movementType: 'REVERSAL', quantity: row.quantity,
      fromWarehouseId: row.to_warehouse_id ?? undefined, fromLocationId: row.to_location_id ?? undefined,
      toWarehouseId: row.from_warehouse_id ?? undefined, toLocationId: row.from_location_id ?? undefined,
      sourceType: 'MOVEMENT_REVERSAL', sourceId: movementId, reversesMovementId: movementId, reason,
      session: mutation.session, correlationId: mutation.correlationId,
    });
    await appendAuditEntry(client, {
      workspaceId: mutation.context.workspace.id, companyId: row.owner_company_id, ...auditIdentity(mutation.session),
      action: 'warehouse.movement.reversed', resourceType: 'inventory_movement', resourceId: reversedId,
      result: 'success', reason, previousState: { movementId }, newState: { reversalMovementId: reversedId },
      correlationId: mutation.correlationId,
    });
    return { movementId: reversedId };
  });
}
