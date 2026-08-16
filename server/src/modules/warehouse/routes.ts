import { Router, type Request } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/async-handler.js';
import { AppError } from '../../shared/errors.js';
import {
  getActiveContext,
  getAuthenticatedSession,
  requireActiveContext,
  requireAuthentication,
  requireCsrf,
} from '../identity/middleware.js';
import {
  createInventoryItem,
  createWarehouse,
  createWarehouseLocation,
  listWarehouseOverview,
  reverseInventoryMovement,
  trackingModes,
  verifyInventoryBalanceProjection,
} from './core-service.js';
import {
  approveAdjustment,
  approveCount,
  createAdjustment,
  createCount,
  createReceipt,
  createReservation,
  createReturn,
  createTransfer,
  dispatchTransfer,
  inspectReturnLine,
  postReceipt,
  receiveReturn,
  receiveTransfer,
  releaseReservation,
  reverseTransfer,
  returnDispositions,
  submitAdjustment,
  submitCount,
} from './operations-service.js';

const uuid = z.string().uuid();
const quantity = z.string().regex(/^(0|[1-9][0-9]{0,13})(?:\.[0-9]{1,6})?$/);
const positiveQuantity = quantity.refine((value) => !/^0(?:\.0+)?$/.test(value), 'Quantity must be positive.');
const shortText = z.string().trim().min(2).max(300);
const reason = z.string().trim().min(3).max(1_000);
const trackedLine = z.object({
  inventoryItemId: uuid,
  quantity: positiveQuantity,
  lotCode: z.string().trim().min(1).max(120).optional(),
  serialCode: z.string().trim().min(1).max(200).optional(),
  manufacturedAt: z.iso.datetime({ offset: true }).optional(),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
  evidenceNote: reason.optional(),
});

function requireIdempotencyKey(request: Request): string {
  const value = request.header('idempotency-key');
  if (!value) throw new AppError(400, 'idempotency_key_required', 'Idempotency-Key is required.');
  return uuid.parse(value);
}

function mutation(response: { locals: Record<string, unknown> }) {
  return {
    context: getActiveContext(response.locals),
    session: getAuthenticatedSession(response.locals),
    correlationId: response.locals.correlationId as string,
  };
}

export function warehouseRoutes(): Router {
  const router = Router();
  router.use(requireAuthentication, requireActiveContext);

  router.get('/warehouse', asyncHandler(async (_request, response) => {
    response.json({ warehouse: await listWarehouseOverview(getActiveContext(response.locals)) });
  }));

  router.get('/warehouse/projection/verify', asyncHandler(async (_request, response) => {
    response.json({ projection: await verifyInventoryBalanceProjection(getActiveContext(response.locals)) });
  }));

  router.post('/warehouse/warehouses', requireCsrf, asyncHandler(async (request, response) => {
    const input = z.object({
      ownerCompanyId: uuid.optional(), operatorUnitId: uuid.optional(), code: z.string().trim().min(2).max(40),
      name: shortText, description: z.string().trim().max(1_000).optional(),
    }).refine((value) => !(value.ownerCompanyId && value.operatorUnitId), 'Choose Company or Shared Service operator, not both.').parse(request.body);
    response.status(201).json({ warehouse: await createWarehouse(mutation(response), input) });
  }));

  router.post('/warehouse/warehouses/:warehouseId/locations', requireCsrf, asyncHandler(async (request, response) => {
    const input = z.object({
      code: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(200),
      locationType: z.enum(['RECEIVING', 'SELLABLE', 'PICKING', 'PACKING', 'RETURNS', 'QUARANTINE', 'DAMAGED', 'TRANSIT']),
    }).parse(request.body);
    response.status(201).json({ location: await createWarehouseLocation(mutation(response), uuid.parse(request.params.warehouseId), input) });
  }));

  router.post('/warehouse/items', requireCsrf, asyncHandler(async (request, response) => {
    const input = z.object({
      sku: z.string().trim().min(1).max(100), name: shortText, catalogReference: z.string().trim().min(1).max(200),
      trackingMode: z.enum(trackingModes), uom: z.string().trim().min(1).max(20),
    }).parse(request.body);
    response.status(201).json({ item: await createInventoryItem(mutation(response), input) });
  }));

  router.post('/warehouse/receipts', requireCsrf, asyncHandler(async (request, response) => {
    const input = z.object({
      ownerCompanyId: uuid.optional(), warehouseId: uuid, receivingLocationId: uuid,
      receiptType: z.enum(['PURCHASE', 'MANUAL']), sourceNote: reason, reason: reason.optional(),
      lines: z.array(trackedLine.extend({ evidenceNote: reason })).min(1).max(500),
    }).superRefine((value, ctx) => {
      if (value.receiptType === 'MANUAL' && !value.reason) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Reason is required for manual Receiving.' });
    }).parse(request.body);
    response.status(201).json({ receipt: await createReceipt(mutation(response), input, requireIdempotencyKey(request)) });
  }));

  router.post('/warehouse/receipts/:receiptId/post', requireCsrf, asyncHandler(async (request, response) => {
    response.json({ receipt: await postReceipt(mutation(response), uuid.parse(request.params.receiptId)) });
  }));

  router.post('/warehouse/reservations', requireCsrf, asyncHandler(async (request, response) => {
    const input = z.object({ ownerCompanyId: uuid.optional(), invoiceLineId: uuid }).parse(request.body);
    response.status(201).json({ reservation: await createReservation(mutation(response), input, requireIdempotencyKey(request)) });
  }));

  router.post('/warehouse/reservations/:reservationId/release', requireCsrf, asyncHandler(async (request, response) => {
    const input = z.object({ reason }).parse(request.body);
    response.json({ reservation: await releaseReservation(mutation(response), uuid.parse(request.params.reservationId), input.reason) });
  }));

  router.post('/warehouse/transfers', requireCsrf, asyncHandler(async (request, response) => {
    const input = z.object({
      ownerCompanyId: uuid.optional(), sourceWarehouseId: uuid, destinationWarehouseId: uuid,
      sourceLocationId: uuid, destinationLocationId: uuid, reason,
      lines: z.array(z.object({ stockIdentityId: uuid, quantity: positiveQuantity })).min(1).max(500),
    }).parse(request.body);
    response.status(201).json({ transfer: await createTransfer(mutation(response), input, requireIdempotencyKey(request)) });
  }));

  router.post('/warehouse/transfers/:transferId/dispatch', requireCsrf, asyncHandler(async (request, response) => {
    response.json({ transfer: await dispatchTransfer(mutation(response), uuid.parse(request.params.transferId)) });
  }));
  router.post('/warehouse/transfers/:transferId/receive', requireCsrf, asyncHandler(async (request, response) => {
    response.json({ transfer: await receiveTransfer(mutation(response), uuid.parse(request.params.transferId)) });
  }));
  router.post('/warehouse/transfers/:transferId/reverse', requireCsrf, asyncHandler(async (request, response) => {
    const input = z.object({ reason }).parse(request.body);
    response.json({ transfer: await reverseTransfer(mutation(response), uuid.parse(request.params.transferId), input.reason) });
  }));

  router.post('/warehouse/adjustments', requireCsrf, asyncHandler(async (request, response) => {
    const input = z.object({
      ownerCompanyId: uuid.optional(), warehouseId: uuid, locationId: uuid, reason, evidenceNote: reason,
      lines: z.array(z.object({ stockIdentityId: uuid, direction: z.enum(['IN', 'OUT']), quantity: positiveQuantity })).min(1).max(500),
    }).parse(request.body);
    response.status(201).json({ adjustment: await createAdjustment(mutation(response), input, requireIdempotencyKey(request)) });
  }));
  router.post('/warehouse/adjustments/:adjustmentId/submit', requireCsrf, asyncHandler(async (request, response) => {
    response.json({ adjustment: await submitAdjustment(mutation(response), uuid.parse(request.params.adjustmentId)) });
  }));
  router.post('/warehouse/adjustments/:adjustmentId/approve', requireCsrf, asyncHandler(async (request, response) => {
    response.json({ adjustment: await approveAdjustment(mutation(response), uuid.parse(request.params.adjustmentId)) });
  }));

  router.post('/warehouse/counts', requireCsrf, asyncHandler(async (request, response) => {
    const input = z.object({
      ownerCompanyId: uuid.optional(), warehouseId: uuid, locationId: uuid, reason,
      lines: z.array(z.object({ stockIdentityId: uuid, actualQuantity: quantity })).min(1).max(1_000),
    }).parse(request.body);
    response.status(201).json({ count: await createCount(mutation(response), input, requireIdempotencyKey(request)) });
  }));
  router.post('/warehouse/counts/:countId/submit', requireCsrf, asyncHandler(async (request, response) => {
    response.json({ count: await submitCount(mutation(response), uuid.parse(request.params.countId)) });
  }));
  router.post('/warehouse/counts/:countId/approve', requireCsrf, asyncHandler(async (request, response) => {
    response.json({ count: await approveCount(mutation(response), uuid.parse(request.params.countId)) });
  }));

  router.post('/warehouse/returns', requireCsrf, asyncHandler(async (request, response) => {
    const input = z.object({
      ownerCompanyId: uuid.optional(), warehouseId: uuid, returnsLocationId: uuid, customerId: uuid.optional(), invoiceId: uuid.optional(),
      reason, evidenceNote: reason, lines: z.array(trackedLine.omit({ evidenceNote: true })).min(1).max(500),
    }).parse(request.body);
    response.status(201).json({ inventoryReturn: await createReturn(mutation(response), input, requireIdempotencyKey(request)) });
  }));
  router.post('/warehouse/returns/:returnId/receive', requireCsrf, asyncHandler(async (request, response) => {
    response.json({ inventoryReturn: await receiveReturn(mutation(response), uuid.parse(request.params.returnId)) });
  }));
  router.post('/warehouse/returns/:returnId/lines/:lineId/inspect', requireCsrf, asyncHandler(async (request, response) => {
    const input = z.object({
      disposition: z.enum(returnDispositions), quantity: positiveQuantity, destinationLocationId: uuid.optional(), reason,
    }).parse(request.body);
    response.json({ inspection: await inspectReturnLine(
      mutation(response), uuid.parse(request.params.returnId), uuid.parse(request.params.lineId), input,
    ) });
  }));

  router.post('/warehouse/movements/:movementId/reverse', requireCsrf, asyncHandler(async (request, response) => {
    const input = z.object({ reason }).parse(request.body);
    response.json({ movement: await reverseInventoryMovement(mutation(response), uuid.parse(request.params.movementId), input.reason) });
  }));

  return router;
}
