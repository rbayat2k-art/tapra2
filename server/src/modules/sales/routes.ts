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
  assignSalesLead,
  createSalesLead,
  listSalesAssignees,
  listSalesLeads,
  readSalesLead,
  recordSalesCall,
  salesCallOutcomes,
} from './sales-service.js';

const uuid = z.string().uuid();
const idempotencyKey = z.string().uuid();
const contextSnapshot = z.record(z.string(), z.unknown()).refine(
  (value) => JSON.stringify(value).length <= 4_000,
  'Sales context must be at most 4000 serialized characters.',
);
const createLeadInput = z.object({
  customerId: uuid,
  source: z.string().trim().min(1).max(200),
  declaredInterest: z.string().trim().min(2).max(500),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  campaignReference: z.string().trim().min(1).max(200).optional(),
  context: contextSnapshot.optional(),
});
const assignmentInput = z.object({
  targetMembershipId: uuid,
  reason: z.string().trim().min(3).max(500).optional(),
});
const callInput = z.object({
  outcome: z.enum(salesCallOutcomes),
  startedAt: z.iso.datetime({ offset: true }),
  note: z.string().trim().min(1).max(2_000).optional(),
  callbackAt: z.iso.datetime({ offset: true }).optional(),
  context: contextSnapshot.optional(),
}).superRefine((value, issueContext) => {
  if (value.outcome === 'callback_requested' && !value.callbackAt) {
    issueContext.addIssue({ code: 'custom', path: ['callbackAt'], message: 'callbackAt is required for callback_requested.' });
  }
});

function requireIdempotencyKey(request: Request): string {
  const header = request.header('idempotency-key');
  if (!header) throw new AppError(400, 'idempotency_key_required', 'Idempotency-Key is required.');
  return idempotencyKey.parse(header);
}

export function salesRoutes(): Router {
  const router = Router();
  router.use(requireAuthentication, requireActiveContext);

  router.get('/sales/leads', asyncHandler(async (_request, response) => {
    response.json({ leads: await listSalesLeads(getActiveContext(response.locals)) });
  }));

  router.get('/sales/assignees', asyncHandler(async (_request, response) => {
    response.json({ assignees: await listSalesAssignees(getActiveContext(response.locals)) });
  }));

  router.get('/sales/leads/:leadId', asyncHandler(async (request, response) => {
    response.json({ lead: await readSalesLead(getActiveContext(response.locals), uuid.parse(request.params.leadId)) });
  }));

  router.post('/sales/leads', requireCsrf, asyncHandler(async (request, response) => {
    response.status(201).json({ lead: await createSalesLead(
      getActiveContext(response.locals), getAuthenticatedSession(response.locals), createLeadInput.parse(request.body),
      requireIdempotencyKey(request), response.locals.correlationId as string,
    ) });
  }));

  router.post('/sales/leads/:leadId/assignments', requireCsrf, asyncHandler(async (request, response) => {
    response.status(201).json({ lead: await assignSalesLead(
      getActiveContext(response.locals), getAuthenticatedSession(response.locals), uuid.parse(request.params.leadId),
      assignmentInput.parse(request.body), requireIdempotencyKey(request), response.locals.correlationId as string,
    ) });
  }));

  router.post('/sales/leads/:leadId/calls', requireCsrf, asyncHandler(async (request, response) => {
    response.status(201).json({ lead: await recordSalesCall(
      getActiveContext(response.locals), getAuthenticatedSession(response.locals), uuid.parse(request.params.leadId),
      callInput.parse(request.body), requireIdempotencyKey(request), response.locals.correlationId as string,
    ) });
  }));

  return router;
}
