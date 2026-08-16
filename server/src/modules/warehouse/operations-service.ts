import type { PoolClient } from 'pg';
import { withWorkspaceTransaction } from '../../infrastructure/database/pool.js';
import { AppError } from '../../shared/errors.js';
import { appendAuditEntry, auditIdentity } from '../audit/audit-service.js';
import type { AuthenticatedSession, MembershipContext } from '../identity/types.js';
import {
  assertLocation,
  assertWarehouseAccess,
  lockWarehouseIdempotency,
  postInventoryMovement,
  requireWarehousePermission,
  resolveOwnerCompanyId,
  resolveStockIdentity,
  type WarehouseMutationContext,
} from './core-service.js';
import { formatQuantity, parseQuantity } from './quantity.js';

interface TrackedLineInput {
  inventoryItemId: string;
  quantity: string;
  lotCode?: string;
  serialCode?: string;
  manufacturedAt?: string;
  expiresAt?: string;
  evidenceNote?: string;
}

async function audit(
  client: PoolClient,
  mutation: WarehouseMutationContext,
  companyId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  state: unknown,
  reason?: string,
): Promise<void> {
  await appendAuditEntry(client, {
    workspaceId: mutation.context.workspace.id, companyId, ...auditIdentity(mutation.session),
    action, resourceType, resourceId, result: 'success', newState: state, reason,
    correlationId: mutation.correlationId,
  });
}

export async function createReceipt(
  mutation: WarehouseMutationContext,
  input: {
    ownerCompanyId?: string; warehouseId: string; receivingLocationId: string; receiptType: 'PURCHASE' | 'MANUAL';
    sourceNote: string; reason?: string; lines: TrackedLineInput[];
  },
  idempotencyKey: string,
): Promise<{ id: string; status: string }> {
  requireWarehousePermission(mutation.context, 'warehouse.receiving.create');
  if (input.receiptType === 'MANUAL') {
    requireWarehousePermission(mutation.context, 'warehouse.receiving.manual');
    if (!input.reason) throw new AppError(400, 'manual_receiving_reason_required', 'Manual Receiving requires a reason.');
  }
  const companyId = resolveOwnerCompanyId(mutation.context, input.ownerCompanyId);
  return withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
    await lockWarehouseIdempotency(client, 'receipt', idempotencyKey);
    const repeated = await client.query<{ id: string; status: string }>('SELECT id, status FROM warehouse_receipts WHERE workspace_id = $1 AND idempotency_key = $2', [mutation.context.workspace.id, idempotencyKey]);
    if (repeated.rows[0]) return repeated.rows[0];
    await assertWarehouseAccess(client, mutation.context, input.warehouseId, companyId);
    await assertLocation(client, mutation.context.workspace.id, input.warehouseId, input.receivingLocationId, ['RECEIVING', 'SELLABLE']);
    const receipt = await client.query<{ id: string; status: string }>(`
      INSERT INTO warehouse_receipts(workspace_id, owner_company_id, warehouse_id, receiving_location_id,
        receipt_type, source_note, reason, created_by_user_account_id, idempotency_key)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, status
    `, [mutation.context.workspace.id, companyId, input.warehouseId, input.receivingLocationId, input.receiptType,
      input.sourceNote, input.reason ?? null, mutation.session.userAccountId, idempotencyKey]);
    for (const [index, line] of input.lines.entries()) {
      parseQuantity(line.quantity, { positive: true });
      if (!line.evidenceNote) throw new AppError(400, 'receiving_evidence_required', 'Every Receiving line requires an evidence note.');
      await client.query(`
        INSERT INTO warehouse_receipt_lines(workspace_id, owner_company_id, receipt_id, line_number, inventory_item_id,
          quantity, lot_code, serial_code, manufactured_at, expires_at, evidence_note)
        VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, $8, $9, $10, $11)
      `, [mutation.context.workspace.id, companyId, receipt.rows[0]!.id, index + 1, line.inventoryItemId,
        formatQuantity(parseQuantity(line.quantity)), line.lotCode ?? null, line.serialCode ?? null,
        line.manufacturedAt ?? null, line.expiresAt ?? null, line.evidenceNote]);
    }
    await audit(client, mutation, companyId, 'warehouse.receipt.created', 'warehouse_receipt', receipt.rows[0]!.id,
      { ...receipt.rows[0], receiptType: input.receiptType, lineCount: input.lines.length }, input.reason);
    return receipt.rows[0]!;
  });
}

export async function postReceipt(
  mutation: WarehouseMutationContext,
  receiptId: string,
): Promise<{ id: string; status: string }> {
  requireWarehousePermission(mutation.context, 'warehouse.receiving.post');
  return withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
    const receipt = await client.query<{
      id: string; owner_company_id: string; warehouse_id: string; receiving_location_id: string; receipt_type: 'PURCHASE' | 'MANUAL'; status: string; reason: string | null;
    }>('SELECT id, owner_company_id, warehouse_id, receiving_location_id, receipt_type, status, reason FROM warehouse_receipts WHERE workspace_id = $1 AND id = $2 FOR UPDATE', [mutation.context.workspace.id, receiptId]);
    const header = receipt.rows[0];
    if (!header) throw new AppError(404, 'warehouse_receipt_not_found', 'Receiving record was not found.');
    if (header.status === 'POSTED') return { id: header.id, status: header.status };
    if (header.status !== 'DRAFT') throw new AppError(409, 'warehouse_receipt_not_postable', 'Only a DRAFT Receiving record can be posted.');
    if (header.receipt_type === 'MANUAL') {
      requireWarehousePermission(mutation.context, 'warehouse.receiving.manual');
      if (!header.reason) throw new AppError(409, 'manual_receiving_reason_required', 'Manual Receiving requires a reason.');
    }
    await assertWarehouseAccess(client, mutation.context, header.warehouse_id, header.owner_company_id);
    const lines = await client.query<{
      id: string; inventory_item_id: string; quantity: string; lot_code: string | null; serial_code: string | null;
      manufactured_at: string | null; expires_at: string | null;
    }>(`SELECT id, inventory_item_id, quantity::text, lot_code, serial_code, manufactured_at::text, expires_at::text
      FROM warehouse_receipt_lines WHERE workspace_id = $1 AND receipt_id = $2 ORDER BY line_number FOR UPDATE`,
    [mutation.context.workspace.id, receiptId]);
    if (lines.rows.length === 0) throw new AppError(409, 'warehouse_receipt_empty', 'Receiving must contain at least one line.');
    for (const line of lines.rows) {
      const identity = await resolveStockIdentity(client, {
        workspaceId: mutation.context.workspace.id, ownerCompanyId: header.owner_company_id,
        inventoryItemId: line.inventory_item_id, quantity: line.quantity,
        lotCode: line.lot_code ?? undefined, serialCode: line.serial_code ?? undefined,
        manufacturedAt: line.manufactured_at ?? undefined, expiresAt: line.expires_at ?? undefined,
      });
      await postInventoryMovement(client, {
        workspaceId: mutation.context.workspace.id, ownerCompanyId: header.owner_company_id,
        stockIdentityId: identity.id, movementType: 'RECEIPT', quantity: line.quantity,
        toWarehouseId: header.warehouse_id, toLocationId: header.receiving_location_id,
        sourceType: 'WAREHOUSE_RECEIPT', sourceId: header.id, sourceLineId: line.id,
        reason: header.reason ?? undefined, session: mutation.session, correlationId: mutation.correlationId,
      });
    }
    await client.query(`UPDATE warehouse_receipts SET status = 'POSTED', posted_by_user_account_id = $3, posted_at = now()
      WHERE workspace_id = $1 AND id = $2`, [mutation.context.workspace.id, receiptId, mutation.session.userAccountId]);
    await audit(client, mutation, header.owner_company_id, 'warehouse.receipt.posted', 'warehouse_receipt', receiptId,
      { status: 'POSTED', movementCount: lines.rows.length }, header.reason ?? undefined);
    return { id: receiptId, status: 'POSTED' };
  });
}

export async function createReservation(
  mutation: WarehouseMutationContext,
  input: { ownerCompanyId?: string; invoiceLineId: string },
  idempotencyKey: string,
): Promise<{ id: string; status: string; requestedQuantity: string; reservedQuantity: string; shortageQuantity: string }> {
  requireWarehousePermission(mutation.context, 'warehouse.reservation.manage');
  const companyId = resolveOwnerCompanyId(mutation.context, input.ownerCompanyId);
  return withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
    await lockWarehouseIdempotency(client, 'reservation', idempotencyKey);
    const repeated = await client.query<{ id: string; status: string; requestedQuantity: string; reservedQuantity: string; shortageQuantity: string }>(`
      SELECT id, status, requested_quantity::text AS "requestedQuantity", reserved_quantity::text AS "reservedQuantity",
        shortage_quantity::text AS "shortageQuantity" FROM inventory_reservations
      WHERE workspace_id = $1 AND idempotency_key = $2
    `, [mutation.context.workspace.id, idempotencyKey]);
    if (repeated.rows[0]) return repeated.rows[0];
    const invoiceLine = await client.query<{
      id: string; invoice_id: string; invoice_revision: number; item_type: string; inventory_item_id: string | null;
      quantity: number; fulfillment_status: string; current_revision: number; invoice_status: string;
    }>(`
      SELECT line.id, line.invoice_id, line.invoice_revision, line.item_type, line.inventory_item_id, line.quantity,
        line.fulfillment_status, invoice.revision AS current_revision, invoice.status AS invoice_status
      FROM sales_invoice_lines line JOIN sales_invoices invoice ON invoice.id = line.invoice_id
      WHERE line.workspace_id = $1 AND line.company_id = $2 AND line.id = $3 FOR UPDATE OF line, invoice
    `, [mutation.context.workspace.id, companyId, input.invoiceLineId]);
    const line = invoiceLine.rows[0];
    if (!line) throw new AppError(404, 'invoice_line_not_found', 'Invoice Line was not found.');
    if (line.invoice_revision !== line.current_revision) throw new AppError(409, 'old_invoice_revision_denied', 'Only the current Invoice revision can be reserved.');
    if (line.invoice_status !== 'financially_approved' || line.fulfillment_status !== 'eligible') {
      throw new AppError(409, 'invoice_line_not_financially_eligible', 'Invoice Line is not financially eligible for reservation.');
    }
    if (line.item_type !== 'goods' || !line.inventory_item_id) {
      throw new AppError(409, 'inventory_item_unresolved', 'A stable InventoryItem is required before goods can be reserved.');
    }
    const requested = BigInt(line.quantity) * 1_000_000n;
    const candidates = await client.query<{
      warehouse_id: string; location_id: string; stock_identity_id: string; on_hand_quantity: string; allocated_quantity: string;
    }>(`
      SELECT balance.warehouse_id, balance.location_id, balance.stock_identity_id, balance.on_hand_quantity::text,
        COALESCE((SELECT sum(allocation.quantity) FROM inventory_allocations allocation
          WHERE allocation.workspace_id = balance.workspace_id AND allocation.owner_company_id = balance.owner_company_id
            AND allocation.location_id = balance.location_id AND allocation.stock_identity_id = balance.stock_identity_id
            AND allocation.status = 'ACTIVE'), 0)::text AS allocated_quantity
      FROM inventory_balances balance JOIN stock_identities identity ON identity.id = balance.stock_identity_id
      JOIN warehouses warehouse ON warehouse.id = balance.warehouse_id
      JOIN warehouse_locations location ON location.id = balance.location_id AND location.warehouse_id = balance.warehouse_id
      WHERE balance.workspace_id = $1 AND balance.owner_company_id = $2 AND identity.inventory_item_id = $3
        AND balance.on_hand_quantity > 0 AND warehouse.is_active = true
        AND location.is_active = true AND location.location_type = 'SELLABLE'
      ORDER BY balance.warehouse_id, balance.location_id, balance.stock_identity_id FOR UPDATE OF balance
    `, [mutation.context.workspace.id, companyId, line.inventory_item_id]);
    let remaining = requested;
    const allocations: Array<{ warehouseId: string; locationId: string; stockIdentityId: string; quantity: bigint }> = [];
    for (const candidate of candidates.rows) {
      if (remaining === 0n) break;
      const available = parseQuantity(candidate.on_hand_quantity) - parseQuantity(candidate.allocated_quantity);
      if (available <= 0n) continue;
      const quantity = available < remaining ? available : remaining;
      allocations.push({ warehouseId: candidate.warehouse_id, locationId: candidate.location_id, stockIdentityId: candidate.stock_identity_id, quantity });
      remaining -= quantity;
    }
    const reserved = requested - remaining;
    const status = remaining === 0n ? 'RESERVED' : 'PARTIALLY_RESERVED';
    const reservation = await client.query<{ id: string }>(`
      INSERT INTO inventory_reservations(workspace_id, owner_company_id, invoice_id, invoice_line_id, invoice_revision,
        inventory_item_id, requested_quantity, reserved_quantity, shortage_quantity, status, created_by_user_account_id, idempotency_key)
      VALUES ($1, $2, $3, $4, $5, $6, $7::numeric, $8::numeric, $9::numeric, $10, $11, $12) RETURNING id
    `, [mutation.context.workspace.id, companyId, line.invoice_id, line.id, line.invoice_revision, line.inventory_item_id,
      formatQuantity(requested), formatQuantity(reserved), formatQuantity(remaining), status, mutation.session.userAccountId, idempotencyKey]);
    for (const allocation of allocations) {
      await client.query(`INSERT INTO inventory_allocations(workspace_id, owner_company_id, reservation_id, warehouse_id,
        location_id, stock_identity_id, quantity) VALUES ($1, $2, $3, $4, $5, $6, $7::numeric)`,
      [mutation.context.workspace.id, companyId, reservation.rows[0]!.id, allocation.warehouseId, allocation.locationId,
        allocation.stockIdentityId, formatQuantity(allocation.quantity)]);
    }
    await client.query(`UPDATE sales_invoice_lines SET fulfillment_status = $4
      WHERE workspace_id = $1 AND company_id = $2 AND id = $3`,
    [mutation.context.workspace.id, companyId, line.id, status === 'RESERVED' ? 'in_progress' : 'awaiting_stock']);
    const result = {
      id: reservation.rows[0]!.id, status, requestedQuantity: formatQuantity(requested),
      reservedQuantity: formatQuantity(reserved), shortageQuantity: formatQuantity(remaining),
    };
    await audit(client, mutation, companyId, 'warehouse.reservation.created', 'inventory_reservation', result.id, result);
    return result;
  });
}

export async function releaseReservation(
  mutation: WarehouseMutationContext,
  reservationId: string,
  reason: string,
): Promise<{ id: string; status: 'RELEASED' }> {
  requireWarehousePermission(mutation.context, 'warehouse.reservation.manage');
  return withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
    const reservation = await client.query<{ id: string; owner_company_id: string; invoice_line_id: string; invoice_revision: number; status: string }>(`
      SELECT id, owner_company_id, invoice_line_id, invoice_revision, status FROM inventory_reservations
      WHERE workspace_id = $1 AND id = $2 FOR UPDATE
    `, [mutation.context.workspace.id, reservationId]);
    const row = reservation.rows[0];
    if (!row) throw new AppError(404, 'inventory_reservation_not_found', 'Reservation was not found.');
    if (row.status === 'RELEASED') return { id: row.id, status: 'RELEASED' };
    await client.query(`UPDATE inventory_allocations SET status = 'RELEASED', released_at = now()
      WHERE workspace_id = $1 AND reservation_id = $2 AND status = 'ACTIVE'`, [mutation.context.workspace.id, reservationId]);
    await client.query(`UPDATE inventory_reservations SET status = 'RELEASED', released_by_user_account_id = $3,
      release_reason = $4, released_at = now() WHERE workspace_id = $1 AND id = $2`,
    [mutation.context.workspace.id, reservationId, mutation.session.userAccountId, reason]);
    await client.query(`UPDATE sales_invoice_lines line SET fulfillment_status = 'eligible'
      FROM sales_invoices invoice WHERE line.workspace_id = $1 AND line.company_id = $2 AND line.id = $3
        AND invoice.id = line.invoice_id AND line.invoice_revision = invoice.revision AND invoice.status = 'financially_approved'`,
    [mutation.context.workspace.id, row.owner_company_id, row.invoice_line_id]);
    await audit(client, mutation, row.owner_company_id, 'warehouse.reservation.released', 'inventory_reservation', row.id,
      { status: 'RELEASED' }, reason);
    return { id: row.id, status: 'RELEASED' };
  });
}

export async function createTransfer(
  mutation: WarehouseMutationContext,
  input: {
    ownerCompanyId?: string; sourceWarehouseId: string; destinationWarehouseId: string;
    sourceLocationId: string; destinationLocationId: string; reason: string;
    lines: Array<{ stockIdentityId: string; quantity: string }>;
  },
  idempotencyKey: string,
): Promise<{ id: string; status: string }> {
  requireWarehousePermission(mutation.context, 'warehouse.transfer.manage');
  const companyId = resolveOwnerCompanyId(mutation.context, input.ownerCompanyId);
  return withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
    await lockWarehouseIdempotency(client, 'transfer', idempotencyKey);
    const repeated = await client.query<{ id: string; status: string }>('SELECT id, status FROM warehouse_transfers WHERE workspace_id = $1 AND idempotency_key = $2', [mutation.context.workspace.id, idempotencyKey]);
    if (repeated.rows[0]) return repeated.rows[0];
    await assertWarehouseAccess(client, mutation.context, input.sourceWarehouseId, companyId);
    await assertWarehouseAccess(client, mutation.context, input.destinationWarehouseId, companyId);
    await assertLocation(client, mutation.context.workspace.id, input.sourceWarehouseId, input.sourceLocationId);
    await assertLocation(client, mutation.context.workspace.id, input.destinationWarehouseId, input.destinationLocationId);
    const transfer = await client.query<{ id: string; status: string }>(`
      INSERT INTO warehouse_transfers(workspace_id, owner_company_id, source_warehouse_id, destination_warehouse_id,
        source_location_id, destination_location_id, reason, created_by_user_account_id, idempotency_key)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, status
    `, [mutation.context.workspace.id, companyId, input.sourceWarehouseId, input.destinationWarehouseId,
      input.sourceLocationId, input.destinationLocationId, input.reason, mutation.session.userAccountId, idempotencyKey]);
    for (const [index, line] of input.lines.entries()) {
      const quantity = formatQuantity(parseQuantity(line.quantity, { positive: true }));
      const identity = await client.query('SELECT 1 FROM stock_identities WHERE workspace_id = $1 AND owner_company_id = $2 AND id = $3', [mutation.context.workspace.id, companyId, line.stockIdentityId]);
      if (!identity.rowCount) throw new AppError(404, 'stock_identity_not_found', 'Transfer Stock identity was not found.');
      await client.query(`INSERT INTO warehouse_transfer_lines(workspace_id, owner_company_id, transfer_id, line_number,
        stock_identity_id, requested_quantity) VALUES ($1, $2, $3, $4, $5, $6::numeric)`,
      [mutation.context.workspace.id, companyId, transfer.rows[0]!.id, index + 1, line.stockIdentityId, quantity]);
    }
    await audit(client, mutation, companyId, 'warehouse.transfer.created', 'warehouse_transfer', transfer.rows[0]!.id,
      { ...transfer.rows[0], lineCount: input.lines.length }, input.reason);
    return transfer.rows[0]!;
  });
}

export async function dispatchTransfer(mutation: WarehouseMutationContext, transferId: string): Promise<{ id: string; status: string }> {
  requireWarehousePermission(mutation.context, 'warehouse.transfer.manage');
  return changeTransferState(mutation, transferId, 'DISPATCH');
}

export async function receiveTransfer(mutation: WarehouseMutationContext, transferId: string): Promise<{ id: string; status: string }> {
  requireWarehousePermission(mutation.context, 'warehouse.transfer.manage');
  return changeTransferState(mutation, transferId, 'RECEIVE');
}

export async function reverseTransfer(
  mutation: WarehouseMutationContext,
  transferId: string,
  reason: string,
): Promise<{ id: string; status: 'CANCELLED'; reversedMovementCount: number }> {
  requireWarehousePermission(mutation.context, 'warehouse.transfer.manage');
  requireWarehousePermission(mutation.context, 'warehouse.movement.reverse');
  if (mutation.session.impersonationId) {
    throw new AppError(403, 'warehouse_approval_impersonation_forbidden', 'Inventory reversal is forbidden during impersonation.');
  }
  return withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
    await lockWarehouseIdempotency(client, 'transfer-reversal', transferId);
    const transfer = await client.query<{
      id: string; owner_company_id: string; source_warehouse_id: string; destination_warehouse_id: string;
      status: 'DRAFT' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';
    }>(`SELECT id, owner_company_id, source_warehouse_id, destination_warehouse_id, status
      FROM warehouse_transfers WHERE workspace_id = $1 AND id = $2 FOR UPDATE`,
    [mutation.context.workspace.id, transferId]);
    const header = transfer.rows[0];
    if (!header) throw new AppError(404, 'warehouse_transfer_not_found', 'Warehouse Transfer was not found.');
    if (header.status === 'CANCELLED') return { id: header.id, status: 'CANCELLED', reversedMovementCount: 0 };
    await assertWarehouseAccess(client, mutation.context, header.source_warehouse_id, header.owner_company_id);
    await assertWarehouseAccess(client, mutation.context, header.destination_warehouse_id, header.owner_company_id);

    const lines = await client.query<{
      id: string; requested_quantity: string; received_quantity: string;
    }>(`SELECT id, requested_quantity::text, received_quantity::text
      FROM warehouse_transfer_lines WHERE workspace_id = $1 AND transfer_id = $2 ORDER BY line_number FOR UPDATE`,
    [mutation.context.workspace.id, transferId]);
    const movements = await client.query<{
      id: string; stock_identity_id: string; movement_type: 'TRANSFER_OUT' | 'TRANSFER_IN'; quantity: string;
      from_warehouse_id: string | null; from_location_id: string | null; to_warehouse_id: string | null;
      to_location_id: string | null; source_line_id: string | null; reversed: boolean;
    }>(`SELECT movement.id, movement.stock_identity_id, movement.movement_type, movement.quantity::text,
        movement.from_warehouse_id, movement.from_location_id, movement.to_warehouse_id, movement.to_location_id,
        movement.source_line_id, EXISTS (
          SELECT 1 FROM inventory_movements reversal WHERE reversal.reverses_movement_id = movement.id
        ) AS reversed
      FROM inventory_movements movement
      WHERE movement.workspace_id = $1 AND movement.source_type = 'WAREHOUSE_TRANSFER'
        AND movement.source_id = $2 AND movement.movement_type IN ('TRANSFER_OUT', 'TRANSFER_IN')
      ORDER BY movement.source_line_id, movement.occurred_at, movement.id FOR UPDATE OF movement`,
    [mutation.context.workspace.id, transferId]);

    const movementsByLine = new Map<string, typeof movements.rows>();
    for (const movement of movements.rows) {
      if (!movement.source_line_id || movement.reversed) {
        throw new AppError(409, 'warehouse_transfer_reversal_unsafe', 'Transfer movement lineage is incomplete or already reversed.');
      }
      const grouped = movementsByLine.get(movement.source_line_id) ?? [];
      grouped.push(movement);
      movementsByLine.set(movement.source_line_id, grouped);
    }

    const lineIds = new Set(lines.rows.map((line) => line.id));
    if (lineIds.size === 0 || [...movementsByLine.keys()].some((lineId) => !lineIds.has(lineId))) {
      throw new AppError(409, 'warehouse_transfer_reversal_unsafe', 'Transfer movement lineage references an unknown or missing Line.');
    }
    for (const line of lines.rows) {
      const lineMovements = movementsByLine.get(line.id) ?? [];
      const outbound = lineMovements.filter((movement) => movement.movement_type === 'TRANSFER_OUT');
      const inbound = lineMovements.filter((movement) => movement.movement_type === 'TRANSFER_IN');
      const received = parseQuantity(line.received_quantity);
      const requested = parseQuantity(line.requested_quantity);
      const validDraft = header.status === 'DRAFT' && received === 0n && outbound.length === 0 && inbound.length === 0;
      const validInTransit = header.status === 'IN_TRANSIT' && received === 0n && outbound.length === 1 && inbound.length === 0;
      const validReceived = header.status === 'RECEIVED' && received === requested && outbound.length === 1 && inbound.length === 1;
      if (!validDraft && !validInTransit && !validReceived) {
        throw new AppError(409, 'warehouse_transfer_reversal_unsafe', 'Partial or inconsistent Transfer state cannot be reversed automatically.');
      }
    }
    const orderedMovements = [...movements.rows].sort((left, right) => {
      const leftOrder = left.movement_type === 'TRANSFER_IN' ? 0 : 1;
      const rightOrder = right.movement_type === 'TRANSFER_IN' ? 0 : 1;
      return leftOrder - rightOrder || (left.source_line_id ?? '').localeCompare(right.source_line_id ?? '') || left.id.localeCompare(right.id);
    });
    for (const movement of orderedMovements) {
      await postInventoryMovement(client, {
        workspaceId: mutation.context.workspace.id, ownerCompanyId: header.owner_company_id,
        stockIdentityId: movement.stock_identity_id, movementType: 'REVERSAL', quantity: movement.quantity,
        fromWarehouseId: movement.to_warehouse_id ?? undefined, fromLocationId: movement.to_location_id ?? undefined,
        toWarehouseId: movement.from_warehouse_id ?? undefined, toLocationId: movement.from_location_id ?? undefined,
        sourceType: 'WAREHOUSE_TRANSFER_REVERSAL', sourceId: transferId, sourceLineId: movement.source_line_id ?? undefined,
        reversesMovementId: movement.id, reason, session: mutation.session, correlationId: mutation.correlationId,
      });
    }

    await client.query(`UPDATE warehouse_transfers SET status = 'CANCELLED', reversed_from_status = $3,
      reversal_reason = $4, reversed_by_user_account_id = $5, reversed_at = now()
      WHERE workspace_id = $1 AND id = $2`,
    [mutation.context.workspace.id, transferId, header.status, reason, mutation.session.userAccountId]);
    await audit(client, mutation, header.owner_company_id, 'warehouse.transfer.reversed', 'warehouse_transfer', transferId,
      { status: 'CANCELLED', reversedFromStatus: header.status, reversedMovementCount: orderedMovements.length }, reason);
    return { id: transferId, status: 'CANCELLED', reversedMovementCount: orderedMovements.length };
  });
}

async function changeTransferState(
  mutation: WarehouseMutationContext,
  transferId: string,
  action: 'DISPATCH' | 'RECEIVE',
): Promise<{ id: string; status: string }> {
  return withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
    const transfer = await client.query<{
      id: string; owner_company_id: string; source_warehouse_id: string; destination_warehouse_id: string;
      source_location_id: string; destination_location_id: string; status: string;
    }>('SELECT id, owner_company_id, source_warehouse_id, destination_warehouse_id, source_location_id, destination_location_id, status FROM warehouse_transfers WHERE workspace_id = $1 AND id = $2 FOR UPDATE', [mutation.context.workspace.id, transferId]);
    const header = transfer.rows[0];
    if (!header) throw new AppError(404, 'warehouse_transfer_not_found', 'Warehouse Transfer was not found.');
    if (action === 'DISPATCH' && header.status === 'IN_TRANSIT') return { id: header.id, status: header.status };
    if (action === 'RECEIVE' && header.status === 'RECEIVED') return { id: header.id, status: header.status };
    if ((action === 'DISPATCH' && header.status !== 'DRAFT') || (action === 'RECEIVE' && header.status !== 'IN_TRANSIT')) {
      throw new AppError(409, 'warehouse_transfer_state_invalid', 'Warehouse Transfer is not in the required state.');
    }
    await assertWarehouseAccess(client, mutation.context, action === 'DISPATCH' ? header.source_warehouse_id : header.destination_warehouse_id, header.owner_company_id);
    const lines = await client.query<{ id: string; stock_identity_id: string; requested_quantity: string }>(`
      SELECT id, stock_identity_id, requested_quantity::text FROM warehouse_transfer_lines
      WHERE workspace_id = $1 AND transfer_id = $2 ORDER BY line_number FOR UPDATE
    `, [mutation.context.workspace.id, transferId]);
    for (const line of lines.rows) {
      await postInventoryMovement(client, {
        workspaceId: mutation.context.workspace.id, ownerCompanyId: header.owner_company_id,
        stockIdentityId: line.stock_identity_id, movementType: action === 'DISPATCH' ? 'TRANSFER_OUT' : 'TRANSFER_IN',
        quantity: line.requested_quantity,
        fromWarehouseId: action === 'DISPATCH' ? header.source_warehouse_id : undefined,
        fromLocationId: action === 'DISPATCH' ? header.source_location_id : undefined,
        toWarehouseId: action === 'RECEIVE' ? header.destination_warehouse_id : undefined,
        toLocationId: action === 'RECEIVE' ? header.destination_location_id : undefined,
        sourceType: 'WAREHOUSE_TRANSFER', sourceId: header.id, sourceLineId: line.id,
        session: mutation.session, correlationId: mutation.correlationId,
      });
    }
    if (action === 'DISPATCH') {
      await client.query(`UPDATE warehouse_transfers SET status = 'IN_TRANSIT', dispatched_by_user_account_id = $3,
        dispatched_at = now() WHERE workspace_id = $1 AND id = $2`, [mutation.context.workspace.id, transferId, mutation.session.userAccountId]);
    } else {
      await client.query(`UPDATE warehouse_transfer_lines SET received_quantity = requested_quantity WHERE workspace_id = $1 AND transfer_id = $2`, [mutation.context.workspace.id, transferId]);
      await client.query(`UPDATE warehouse_transfers SET status = 'RECEIVED', received_by_user_account_id = $3,
        received_at = now() WHERE workspace_id = $1 AND id = $2`, [mutation.context.workspace.id, transferId, mutation.session.userAccountId]);
    }
    const status = action === 'DISPATCH' ? 'IN_TRANSIT' : 'RECEIVED';
    await audit(client, mutation, header.owner_company_id,
      action === 'DISPATCH' ? 'warehouse.transfer.dispatched' : 'warehouse.transfer.received',
      'warehouse_transfer', header.id, { status });
    return { id: header.id, status };
  });
}

type ControlType = 'adjustment' | 'count';

export async function createAdjustment(
  mutation: WarehouseMutationContext,
  input: { ownerCompanyId?: string; warehouseId: string; locationId: string; reason: string; evidenceNote: string; lines: Array<{ stockIdentityId: string; direction: 'IN' | 'OUT'; quantity: string }> },
  idempotencyKey: string,
): Promise<{ id: string; status: string }> {
  requireWarehousePermission(mutation.context, 'warehouse.adjustment.create');
  const companyId = resolveOwnerCompanyId(mutation.context, input.ownerCompanyId);
  return withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
    await lockWarehouseIdempotency(client, 'adjustment', idempotencyKey);
    const repeated = await client.query<{ id: string; status: string }>('SELECT id, status FROM inventory_adjustments WHERE workspace_id = $1 AND idempotency_key = $2', [mutation.context.workspace.id, idempotencyKey]);
    if (repeated.rows[0]) return repeated.rows[0];
    await assertWarehouseAccess(client, mutation.context, input.warehouseId, companyId);
    await assertLocation(client, mutation.context.workspace.id, input.warehouseId, input.locationId);
    const created = await client.query<{ id: string; status: string }>(`
      INSERT INTO inventory_adjustments(workspace_id, owner_company_id, warehouse_id, location_id, reason, evidence_note,
        created_by_actor_user_account_id, created_by_effective_user_account_id, idempotency_key)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, status
    `, [mutation.context.workspace.id, companyId, input.warehouseId, input.locationId, input.reason, input.evidenceNote,
      mutation.session.actorUserAccountId, mutation.session.userAccountId, idempotencyKey]);
    for (const [index, line] of input.lines.entries()) {
      await client.query(`INSERT INTO inventory_adjustment_lines(workspace_id, owner_company_id, adjustment_id, line_number,
        stock_identity_id, direction, quantity) VALUES ($1, $2, $3, $4, $5, $6, $7::numeric)`,
      [mutation.context.workspace.id, companyId, created.rows[0]!.id, index + 1, line.stockIdentityId, line.direction,
        formatQuantity(parseQuantity(line.quantity, { positive: true }))]);
    }
    await audit(client, mutation, companyId, 'warehouse.adjustment.created', 'inventory_adjustment', created.rows[0]!.id,
      { ...created.rows[0], lineCount: input.lines.length }, input.reason);
    return created.rows[0]!;
  });
}

export async function submitAdjustment(mutation: WarehouseMutationContext, adjustmentId: string): Promise<{ id: string; status: string }> {
  requireWarehousePermission(mutation.context, 'warehouse.adjustment.create');
  return submitControl(mutation, 'adjustment', adjustmentId);
}

export async function approveAdjustment(mutation: WarehouseMutationContext, adjustmentId: string): Promise<{ id: string; status: string }> {
  requireWarehousePermission(mutation.context, 'warehouse.adjustment.approve');
  return approveControl(mutation, 'adjustment', adjustmentId);
}

export async function createCount(
  mutation: WarehouseMutationContext,
  input: { ownerCompanyId?: string; warehouseId: string; locationId: string; reason: string; lines: Array<{ stockIdentityId: string; actualQuantity: string }> },
  idempotencyKey: string,
): Promise<{ id: string; status: string }> {
  requireWarehousePermission(mutation.context, 'warehouse.count.create');
  const companyId = resolveOwnerCompanyId(mutation.context, input.ownerCompanyId);
  return withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
    await lockWarehouseIdempotency(client, 'count', idempotencyKey);
    const repeated = await client.query<{ id: string; status: string }>('SELECT id, status FROM inventory_counts WHERE workspace_id = $1 AND idempotency_key = $2', [mutation.context.workspace.id, idempotencyKey]);
    if (repeated.rows[0]) return repeated.rows[0];
    await assertWarehouseAccess(client, mutation.context, input.warehouseId, companyId);
    await assertLocation(client, mutation.context.workspace.id, input.warehouseId, input.locationId);
    const created = await client.query<{ id: string; status: string }>(`
      INSERT INTO inventory_counts(workspace_id, owner_company_id, warehouse_id, location_id, reason,
        created_by_actor_user_account_id, created_by_effective_user_account_id, idempotency_key)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, status
    `, [mutation.context.workspace.id, companyId, input.warehouseId, input.locationId, input.reason,
      mutation.session.actorUserAccountId, mutation.session.userAccountId, idempotencyKey]);
    for (const [index, line] of input.lines.entries()) {
      const balance = await client.query<{ quantity: string }>(`
        SELECT COALESCE(on_hand_quantity, 0)::text AS quantity FROM inventory_balances
        WHERE workspace_id = $1 AND owner_company_id = $2 AND location_id = $3 AND stock_identity_id = $4
      `, [mutation.context.workspace.id, companyId, input.locationId, line.stockIdentityId]);
      const expected = balance.rows[0]?.quantity ?? '0';
      await client.query(`INSERT INTO inventory_count_lines(workspace_id, owner_company_id, count_id, line_number,
        stock_identity_id, expected_quantity, actual_quantity) VALUES ($1, $2, $3, $4, $5, $6::numeric, $7::numeric)`,
      [mutation.context.workspace.id, companyId, created.rows[0]!.id, index + 1, line.stockIdentityId,
        formatQuantity(parseQuantity(expected)), formatQuantity(parseQuantity(line.actualQuantity))]);
    }
    await audit(client, mutation, companyId, 'warehouse.count.created', 'inventory_count', created.rows[0]!.id,
      { ...created.rows[0], lineCount: input.lines.length }, input.reason);
    return created.rows[0]!;
  });
}

export async function submitCount(mutation: WarehouseMutationContext, countId: string): Promise<{ id: string; status: string }> {
  requireWarehousePermission(mutation.context, 'warehouse.count.create');
  return submitControl(mutation, 'count', countId);
}

export async function approveCount(mutation: WarehouseMutationContext, countId: string): Promise<{ id: string; status: string }> {
  requireWarehousePermission(mutation.context, 'warehouse.count.approve');
  return approveControl(mutation, 'count', countId);
}

async function submitControl(mutation: WarehouseMutationContext, type: ControlType, id: string): Promise<{ id: string; status: string }> {
  const table = type === 'adjustment' ? 'inventory_adjustments' : 'inventory_counts';
  return withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
    const result = await client.query<{ id: string; owner_company_id: string; status: string }>(`SELECT id, owner_company_id, status FROM ${table} WHERE workspace_id = $1 AND id = $2 FOR UPDATE`, [mutation.context.workspace.id, id]);
    const row = result.rows[0];
    if (!row) throw new AppError(404, `inventory_${type}_not_found`, `Inventory ${type} was not found.`);
    if (row.status === 'SUBMITTED') return { id: row.id, status: row.status };
    if (!['DRAFT', 'OPEN'].includes(row.status)) throw new AppError(409, `inventory_${type}_not_submittable`, `Inventory ${type} cannot be submitted.`);
    await client.query(`UPDATE ${table} SET status = 'SUBMITTED', submitted_at = now() WHERE workspace_id = $1 AND id = $2`, [mutation.context.workspace.id, id]);
    await audit(client, mutation, row.owner_company_id, `warehouse.${type}.submitted`, `inventory_${type}`, id, { status: 'SUBMITTED' });
    return { id, status: 'SUBMITTED' };
  });
}

async function approveControl(mutation: WarehouseMutationContext, type: ControlType, id: string): Promise<{ id: string; status: string }> {
  if (mutation.session.impersonationId) throw new AppError(403, 'warehouse_approval_impersonation_forbidden', 'Inventory maker-checker approval is forbidden during impersonation.');
  const table = type === 'adjustment' ? 'inventory_adjustments' : 'inventory_counts';
  const lineTable = type === 'adjustment' ? 'inventory_adjustment_lines' : 'inventory_count_lines';
  return withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
    const result = await client.query<{
      id: string; owner_company_id: string; warehouse_id: string; location_id: string; status: string; reason: string;
      created_by_actor_user_account_id: string; created_by_effective_user_account_id: string;
    }>(`SELECT id, owner_company_id, warehouse_id, location_id, status, reason,
      created_by_actor_user_account_id, created_by_effective_user_account_id FROM ${table}
      WHERE workspace_id = $1 AND id = $2 FOR UPDATE`, [mutation.context.workspace.id, id]);
    const header = result.rows[0];
    if (!header) throw new AppError(404, `inventory_${type}_not_found`, `Inventory ${type} was not found.`);
    if (header.status === 'POSTED') return { id: header.id, status: header.status };
    if (header.status !== 'SUBMITTED') throw new AppError(409, `inventory_${type}_not_approvable`, `Inventory ${type} is not submitted.`);
    if ([header.created_by_actor_user_account_id, header.created_by_effective_user_account_id]
      .includes(mutation.session.actorUserAccountId)
      || [header.created_by_actor_user_account_id, header.created_by_effective_user_account_id]
        .includes(mutation.session.userAccountId)) {
      throw new AppError(409, 'warehouse_maker_checker_denied', 'Creator cannot approve or post their own inventory control.');
    }
    const lines = type === 'adjustment'
      ? await client.query<{ id: string; stock_identity_id: string; direction: 'IN' | 'OUT'; quantity: string; actual_quantity: null }>(`
        SELECT id, stock_identity_id, direction, quantity::text, NULL::numeric AS actual_quantity FROM ${lineTable}
        WHERE workspace_id = $1 AND ${type}_id = $2 ORDER BY line_number FOR UPDATE
      `, [mutation.context.workspace.id, id])
      : await client.query<{ id: string; stock_identity_id: string; direction: null; quantity: null; actual_quantity: string }>(`
        SELECT id, stock_identity_id, NULL::text AS direction, NULL::numeric AS quantity,
          actual_quantity::text FROM ${lineTable}
        WHERE workspace_id = $1 AND ${type}_id = $2 ORDER BY line_number FOR UPDATE
      `, [mutation.context.workspace.id, id]);
    for (const line of lines.rows) {
      let direction: 'IN' | 'OUT';
      let quantity: string;
      if (type === 'count') {
        await client.query(`
          INSERT INTO inventory_balances(workspace_id, owner_company_id, warehouse_id, location_id, stock_identity_id)
          VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING
        `, [mutation.context.workspace.id, header.owner_company_id, header.warehouse_id, header.location_id, line.stock_identity_id]);
        const current = await client.query<{ on_hand_quantity: string }>(`SELECT on_hand_quantity::text FROM inventory_balances
          WHERE workspace_id = $1 AND location_id = $2 AND stock_identity_id = $3 FOR UPDATE`,
        [mutation.context.workspace.id, header.location_id, line.stock_identity_id]);
        const currentQuantity = parseQuantity(current.rows[0]!.on_hand_quantity);
        const actualQuantity = parseQuantity(line.actual_quantity!);
        if (currentQuantity === actualQuantity) continue;
        direction = actualQuantity > currentQuantity ? 'IN' : 'OUT';
        quantity = formatQuantity(actualQuantity > currentQuantity
          ? actualQuantity - currentQuantity : currentQuantity - actualQuantity);
      } else {
        direction = line.direction!;
        quantity = line.quantity!;
      }
      if (parseQuantity(quantity) === 0n) continue;
      await postInventoryMovement(client, {
        workspaceId: mutation.context.workspace.id, ownerCompanyId: header.owner_company_id,
        stockIdentityId: line.stock_identity_id,
        movementType: type === 'adjustment'
          ? (direction === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT')
          : (direction === 'IN' ? 'COUNT_RECONCILIATION_IN' : 'COUNT_RECONCILIATION_OUT'),
        quantity,
        fromWarehouseId: direction === 'OUT' ? header.warehouse_id : undefined,
        fromLocationId: direction === 'OUT' ? header.location_id : undefined,
        toWarehouseId: direction === 'IN' ? header.warehouse_id : undefined,
        toLocationId: direction === 'IN' ? header.location_id : undefined,
        sourceType: type === 'adjustment' ? 'INVENTORY_ADJUSTMENT' : 'INVENTORY_COUNT', sourceId: id, sourceLineId: line.id,
        reason: header.reason, session: mutation.session, correlationId: mutation.correlationId,
      });
    }
    await client.query(`UPDATE ${table} SET status = 'POSTED', approved_by_actor_user_account_id = $3,
      approved_by_effective_user_account_id = $4, posted_at = now() WHERE workspace_id = $1 AND id = $2`,
    [mutation.context.workspace.id, id, mutation.session.actorUserAccountId, mutation.session.userAccountId]);
    await audit(client, mutation, header.owner_company_id, `warehouse.${type}.posted`, `inventory_${type}`, id,
      { status: 'POSTED', movementCount: lines.rows.length }, header.reason);
    return { id, status: 'POSTED' };
  });
}

export const returnDispositions = ['SELLABLE', 'QUARANTINE', 'DAMAGED', 'RETURN_TO_SUPPLIER', 'SCRAP'] as const;
export type ReturnDisposition = typeof returnDispositions[number];

export async function createReturn(
  mutation: WarehouseMutationContext,
  input: {
    ownerCompanyId?: string; warehouseId: string; returnsLocationId: string; customerId?: string; invoiceId?: string;
    reason: string; evidenceNote: string; lines: TrackedLineInput[];
  },
  idempotencyKey: string,
): Promise<{ id: string; status: string }> {
  requireWarehousePermission(mutation.context, 'warehouse.return.manage');
  const companyId = resolveOwnerCompanyId(mutation.context, input.ownerCompanyId);
  return withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
    await lockWarehouseIdempotency(client, 'return', idempotencyKey);
    const repeated = await client.query<{ id: string; status: string }>('SELECT id, status FROM inventory_returns WHERE workspace_id = $1 AND idempotency_key = $2', [mutation.context.workspace.id, idempotencyKey]);
    if (repeated.rows[0]) return repeated.rows[0];
    await assertWarehouseAccess(client, mutation.context, input.warehouseId, companyId);
    await assertLocation(client, mutation.context.workspace.id, input.warehouseId, input.returnsLocationId, ['RETURNS']);
    const created = await client.query<{ id: string; status: string }>(`
      INSERT INTO inventory_returns(workspace_id, owner_company_id, warehouse_id, returns_location_id, customer_id,
        invoice_id, reason, evidence_note, created_by_user_account_id, idempotency_key)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, status
    `, [mutation.context.workspace.id, companyId, input.warehouseId, input.returnsLocationId, input.customerId ?? null,
      input.invoiceId ?? null, input.reason, input.evidenceNote, mutation.session.userAccountId, idempotencyKey]);
    for (const [index, line] of input.lines.entries()) {
      await client.query(`INSERT INTO inventory_return_lines(workspace_id, owner_company_id, return_id, line_number,
        inventory_item_id, quantity, lot_code, serial_code) VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, $8)`,
      [mutation.context.workspace.id, companyId, created.rows[0]!.id, index + 1, line.inventoryItemId,
        formatQuantity(parseQuantity(line.quantity, { positive: true })), line.lotCode ?? null, line.serialCode ?? null]);
    }
    await audit(client, mutation, companyId, 'warehouse.return.created', 'inventory_return', created.rows[0]!.id,
      { ...created.rows[0], lineCount: input.lines.length }, input.reason);
    return created.rows[0]!;
  });
}

export async function receiveReturn(mutation: WarehouseMutationContext, returnId: string): Promise<{ id: string; status: string }> {
  requireWarehousePermission(mutation.context, 'warehouse.return.manage');
  return withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
    const returned = await client.query<{ id: string; owner_company_id: string; warehouse_id: string; returns_location_id: string; status: string; reason: string }>(`
      SELECT id, owner_company_id, warehouse_id, returns_location_id, status, reason FROM inventory_returns
      WHERE workspace_id = $1 AND id = $2 FOR UPDATE
    `, [mutation.context.workspace.id, returnId]);
    const header = returned.rows[0];
    if (!header) throw new AppError(404, 'inventory_return_not_found', 'Inventory Return was not found.');
    if (header.status === 'RECEIVED' || header.status === 'INSPECTED') return { id: header.id, status: header.status };
    if (header.status !== 'DRAFT') throw new AppError(409, 'inventory_return_not_receivable', 'Inventory Return is not receivable.');
    const lines = await client.query<{ id: string; inventory_item_id: string; quantity: string; lot_code: string | null; serial_code: string | null }>(`
      SELECT id, inventory_item_id, quantity::text, lot_code, serial_code FROM inventory_return_lines
      WHERE workspace_id = $1 AND return_id = $2 ORDER BY line_number FOR UPDATE
    `, [mutation.context.workspace.id, returnId]);
    for (const line of lines.rows) {
      const identity = await resolveStockIdentity(client, {
        workspaceId: mutation.context.workspace.id, ownerCompanyId: header.owner_company_id,
        inventoryItemId: line.inventory_item_id, quantity: line.quantity,
        lotCode: line.lot_code ?? undefined, serialCode: line.serial_code ?? undefined,
      });
      await client.query('UPDATE inventory_return_lines SET stock_identity_id = $3 WHERE workspace_id = $1 AND id = $2', [mutation.context.workspace.id, line.id, identity.id]);
      await postInventoryMovement(client, {
        workspaceId: mutation.context.workspace.id, ownerCompanyId: header.owner_company_id,
        stockIdentityId: identity.id, movementType: 'RETURN_RECEIPT', quantity: line.quantity,
        toWarehouseId: header.warehouse_id, toLocationId: header.returns_location_id,
        sourceType: 'INVENTORY_RETURN', sourceId: header.id, sourceLineId: line.id, reason: header.reason,
        session: mutation.session, correlationId: mutation.correlationId,
      });
    }
    await client.query(`UPDATE inventory_returns SET status = 'RECEIVED', received_by_user_account_id = $3,
      received_at = now() WHERE workspace_id = $1 AND id = $2`, [mutation.context.workspace.id, returnId, mutation.session.userAccountId]);
    await audit(client, mutation, header.owner_company_id, 'warehouse.return.received', 'inventory_return', returnId,
      { status: 'RECEIVED', movementCount: lines.rows.length }, header.reason);
    return { id: returnId, status: 'RECEIVED' };
  });
}

export async function inspectReturnLine(
  mutation: WarehouseMutationContext,
  returnId: string,
  lineId: string,
  input: { disposition: ReturnDisposition; quantity: string; destinationLocationId?: string; reason: string },
): Promise<{ id: string; status: string }> {
  requireWarehousePermission(mutation.context, 'warehouse.return.manage');
  return withWorkspaceTransaction({ workspaceId: mutation.context.workspace.id, companyId: mutation.context.company?.id ?? null }, async (client) => {
    const returned = await client.query<{ id: string; owner_company_id: string; warehouse_id: string; returns_location_id: string; status: string }>(`
      SELECT id, owner_company_id, warehouse_id, returns_location_id, status FROM inventory_returns
      WHERE workspace_id = $1 AND id = $2 FOR UPDATE
    `, [mutation.context.workspace.id, returnId]);
    const header = returned.rows[0];
    if (!header) throw new AppError(404, 'inventory_return_not_found', 'Inventory Return was not found.');
    if (!['RECEIVED', 'INSPECTED'].includes(header.status)) throw new AppError(409, 'inventory_return_not_inspectable', 'Return must be received before inspection.');
    const lineResult = await client.query<{ id: string; quantity: string; stock_identity_id: string }>(`
      SELECT id, quantity::text, stock_identity_id FROM inventory_return_lines
      WHERE workspace_id = $1 AND return_id = $2 AND id = $3 FOR UPDATE
    `, [mutation.context.workspace.id, returnId, lineId]);
    const line = lineResult.rows[0];
    if (!line?.stock_identity_id) throw new AppError(409, 'return_stock_identity_missing', 'Return line has no received Stock identity.');
    const quantity = parseQuantity(input.quantity, { positive: true });
    const already = await client.query<{ quantity: string }>('SELECT COALESCE(sum(quantity), 0)::text AS quantity FROM inventory_return_inspections WHERE workspace_id = $1 AND return_line_id = $2', [mutation.context.workspace.id, lineId]);
    if (parseQuantity(already.rows[0]!.quantity) + quantity > parseQuantity(line.quantity)) {
      throw new AppError(409, 'return_disposition_overflow', 'Disposition quantity exceeds the received Return Line quantity.');
    }
    const needsDestination = ['SELLABLE', 'QUARANTINE', 'DAMAGED'].includes(input.disposition);
    if (needsDestination && !input.destinationLocationId) throw new AppError(400, 'return_destination_required', 'This Return disposition requires a destination Location.');
    if (!needsDestination && input.destinationLocationId) throw new AppError(400, 'return_destination_forbidden', 'This Return disposition does not accept a destination Location.');
    if (input.destinationLocationId) {
      const allowed = input.disposition === 'QUARANTINE' ? ['QUARANTINE'] : input.disposition === 'DAMAGED' ? ['DAMAGED'] : ['SELLABLE'];
      await assertLocation(client, mutation.context.workspace.id, header.warehouse_id, input.destinationLocationId, allowed);
    }
    const inspection = await client.query<{ id: string }>(`
      INSERT INTO inventory_return_inspections(workspace_id, owner_company_id, return_id, return_line_id, disposition,
        quantity, destination_location_id, reason, inspected_by_user_account_id)
      VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, $8, $9) RETURNING id
    `, [mutation.context.workspace.id, header.owner_company_id, returnId, lineId, input.disposition,
      formatQuantity(quantity), input.destinationLocationId ?? null, input.reason, mutation.session.userAccountId]);
    await postInventoryMovement(client, {
      workspaceId: mutation.context.workspace.id, ownerCompanyId: header.owner_company_id,
      stockIdentityId: line.stock_identity_id,
      movementType: input.disposition === 'RETURN_TO_SUPPLIER' ? 'RETURN_TO_SUPPLIER'
        : input.disposition === 'SCRAP' ? 'SCRAP' : 'INTERNAL_MOVE',
      quantity: formatQuantity(quantity), fromWarehouseId: header.warehouse_id, fromLocationId: header.returns_location_id,
      toWarehouseId: input.destinationLocationId ? header.warehouse_id : undefined,
      toLocationId: input.destinationLocationId,
      sourceType: 'RETURN_INSPECTION', sourceId: returnId, sourceLineId: inspection.rows[0]!.id,
      reason: input.reason, session: mutation.session, correlationId: mutation.correlationId,
    });
    const pending = await client.query<{ quantity: string }>(`
      SELECT (SELECT COALESCE(sum(line.quantity), 0) FROM inventory_return_lines line WHERE line.return_id = $1)
        - (SELECT COALESCE(sum(inspection.quantity), 0) FROM inventory_return_inspections inspection WHERE inspection.return_id = $1) AS quantity
    `, [returnId]);
    const status = parseQuantity(pending.rows[0]!.quantity) === 0n ? 'INSPECTED' : 'RECEIVED';
    await client.query('UPDATE inventory_returns SET status = $3 WHERE workspace_id = $1 AND id = $2', [mutation.context.workspace.id, returnId, status]);
    await audit(client, mutation, header.owner_company_id, 'warehouse.return.inspected', 'inventory_return_inspection', inspection.rows[0]!.id,
      { returnId, lineId, disposition: input.disposition, quantity: formatQuantity(quantity), returnStatus: status }, input.reason);
    return { id: inspection.rows[0]!.id, status };
  });
}
