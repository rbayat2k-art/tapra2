import express, { Router, type Request } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/async-handler.js';
import { AppError } from '../../shared/errors.js';
import { requirePermission } from '../access/authorization.js';
import {
  getActiveContext,
  getAuthenticatedSession,
  requireActiveContext,
  requireAuthentication,
  requireCsrf,
} from '../identity/middleware.js';
import {
  applySafeImportDecisions,
  approveCustomerImport,
  decideImportRecord,
  listCustomerImports,
  readCustomerImport,
  stageCustomerImport,
} from './import-service.js';

const uuid = z.string().uuid();
const actionInput = z.object({
  action: z.enum(['CREATE_NEW', 'LINK_TO_EXISTING', 'LINK_TO_STAGED', 'REJECT', 'KEEP_FOR_REVIEW']),
  targetCustomerId: z.string().uuid().optional(),
  targetRecordId: z.string().uuid().optional(),
});

function idempotencyKey(request: Request): string {
  const value = request.header('idempotency-key');
  if (!value) throw new AppError(400, 'idempotency_key_required', 'Idempotency-Key is required.');
  return uuid.parse(value);
}

function safeFileName(request: Request): string {
  const value = request.header('x-file-name')?.trim() ?? '';
  if (!/^[a-zA-Z0-9_. -]{1,255}\.csv$/i.test(value) || value.includes('..')) {
    throw new AppError(400, 'customer_import_file_name_invalid', 'A safe .csv file name is required.');
  }
  return value;
}

export function customerImportRoutes(): Router {
  const router = Router();
  router.use(requireAuthentication, requireActiveContext);

  router.get('/customer-imports', requirePermission('customer.read'), asyncHandler(async (_request, response) => {
    response.json({ imports: await listCustomerImports(getActiveContext(response.locals)) });
  }));

  router.get('/customer-imports/:jobId', requirePermission('customer.read'), asyncHandler(async (request, response) => {
    response.json({ import: await readCustomerImport(getActiveContext(response.locals), uuid.parse(request.params.jobId)) });
  }));

  router.post(
    '/customer-imports',
    requireCsrf,
    requirePermission('customer.import.create'),
    express.text({ type: ['text/csv', 'application/csv'], limit: '512kb' }),
    asyncHandler(async (request, response) => {
      if (typeof request.body !== 'string') throw new AppError(415, 'customer_import_media_type_invalid', 'Content-Type text/csv is required.');
      const result = await stageCustomerImport(
        getActiveContext(response.locals), getAuthenticatedSession(response.locals),
        {
          csv: request.body,
          fileName: safeFileName(request),
          sourceName: z.string().trim().min(1).max(200).parse(request.header('x-import-source') ?? 'Customer CSV import'),
          idempotencyKey: idempotencyKey(request),
          correlationId: response.locals.correlationId as string,
        },
      );
      response.status(201).json({ import: result });
    }),
  );

  router.post('/customer-imports/:jobId/apply-safe-decisions', requireCsrf, requirePermission('customer.import.review'), asyncHandler(async (request, response) => {
    response.json({ import: await applySafeImportDecisions(
      getActiveContext(response.locals), getAuthenticatedSession(response.locals), uuid.parse(request.params.jobId),
      response.locals.correlationId as string,
    ) });
  }));

  router.put('/customer-imports/:jobId/records/:recordId/decision', requireCsrf, requirePermission('customer.import.review'), asyncHandler(async (request, response) => {
    const input = actionInput.parse(request.body);
    response.json({ import: await decideImportRecord(
      getActiveContext(response.locals), getAuthenticatedSession(response.locals), {
        jobId: uuid.parse(request.params.jobId), recordId: uuid.parse(request.params.recordId),
        ...input, correlationId: response.locals.correlationId as string,
      },
    ) });
  }));

  router.post('/customer-imports/:jobId/approve', requireCsrf, requirePermission('customer.import.approve'), asyncHandler(async (request, response) => {
    response.json({ import: await approveCustomerImport(
      getActiveContext(response.locals), getAuthenticatedSession(response.locals), uuid.parse(request.params.jobId),
      response.locals.correlationId as string,
    ) });
  }));

  return router;
}
