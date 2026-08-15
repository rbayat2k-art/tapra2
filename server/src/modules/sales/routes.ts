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
  linkSalesMarketingContext,
  listSalesAssignees,
  listSalesLeads,
  readSalesLead,
  recordSalesCall,
  salesCallOutcomes,
  salesMarketingLinkTypes,
} from './sales-service.js';
import {
  approveSalesInvoice,
  createSaleAndInvoice,
  getPaymentInfrastructure,
  invoiceItemTypes,
  invoiceLineSourceTypes,
  listSalesInvoices,
  paymentMethods,
  paymentReviewDecisions,
  readSalesInvoice,
  recordSalesPayment,
  reviseSalesInvoice,
  reviewSalesPayment,
  saleEntryModes,
} from './invoice-service.js';

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
  promotionReference: z.string().trim().min(1).max(200).optional(),
  context: contextSnapshot.optional(),
});
const marketingLinkInput = z.object({
  type: z.enum(salesMarketingLinkTypes),
  referenceCode: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(300).optional(),
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
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const invoiceLineInput = z.object({
  itemType: z.enum(invoiceItemTypes),
  catalogReference: z.string().trim().min(1).max(200).optional(),
  itemName: z.string().trim().min(2).max(300),
  quantity: z.number().int().positive().max(1_000_000),
  unitPrice: money,
  discountAmount: money.default(0),
  sourceType: z.enum(invoiceLineSourceTypes).default('manual_addition'),
  snapshot: contextSnapshot.optional(),
});
const createSaleInput = z.object({
  customerId: uuid,
  leadId: uuid.optional(),
  entryMode: z.enum(saleEntryModes).default('direct'),
  sellerMembershipId: uuid.optional(),
  source: contextSnapshot.optional(),
  lines: z.array(invoiceLineInput).min(1).max(100),
});
const reviseInvoiceInput = z.object({
  lines: z.array(invoiceLineInput).min(1).max(100),
  reason: z.string().trim().min(3).max(1_000).optional(),
});
const manualPaymentMethods = paymentMethods.filter((method) => method !== 'payment_gateway');
const recordPaymentInput = z.object({
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  paymentMethod: z.enum(manualPaymentMethods),
  occurredAt: z.iso.datetime({ offset: true }),
  lastFourDigits: z.string().regex(/^[0-9]{4}$/).optional(),
  destinationAccountId: uuid,
  trackingNumber: z.string().trim().min(2).max(200),
  receiptReference: z.string().trim().min(1).max(500).optional(),
  correctsPaymentId: uuid.optional(),
});
const reviewPaymentInput = z.object({
  decision: z.enum(paymentReviewDecisions),
  reason: z.string().trim().min(3).max(1_000).optional(),
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

  router.post('/sales/leads/:leadId/marketing-links', requireCsrf, asyncHandler(async (request, response) => {
    response.status(201).json({ lead: await linkSalesMarketingContext(
      getActiveContext(response.locals), getAuthenticatedSession(response.locals), uuid.parse(request.params.leadId),
      marketingLinkInput.parse(request.body), requireIdempotencyKey(request), response.locals.correlationId as string,
    ) });
  }));

  router.post('/sales/leads/:leadId/calls', requireCsrf, asyncHandler(async (request, response) => {
    response.status(201).json({ lead: await recordSalesCall(
      getActiveContext(response.locals), getAuthenticatedSession(response.locals), uuid.parse(request.params.leadId),
      callInput.parse(request.body), requireIdempotencyKey(request), response.locals.correlationId as string,
    ) });
  }));

  router.get('/sales/invoices', asyncHandler(async (_request, response) => {
    response.json({ invoices: await listSalesInvoices(getActiveContext(response.locals)) });
  }));

  router.get('/sales/invoices/:invoiceId', asyncHandler(async (request, response) => {
    response.json({ invoice: await readSalesInvoice(getActiveContext(response.locals), uuid.parse(request.params.invoiceId)) });
  }));

  router.get('/sales/payment-infrastructure', asyncHandler(async (_request, response) => {
    response.json(await getPaymentInfrastructure(getActiveContext(response.locals)));
  }));

  router.post('/sales/sales', requireCsrf, asyncHandler(async (request, response) => {
    response.status(201).json({ invoice: await createSaleAndInvoice(
      getActiveContext(response.locals), getAuthenticatedSession(response.locals), createSaleInput.parse(request.body),
      requireIdempotencyKey(request), response.locals.correlationId as string,
    ) });
  }));

  router.put('/sales/invoices/:invoiceId', requireCsrf, asyncHandler(async (request, response) => {
    const input = reviseInvoiceInput.parse(request.body);
    response.json({ invoice: await reviseSalesInvoice(
      getActiveContext(response.locals), getAuthenticatedSession(response.locals), uuid.parse(request.params.invoiceId),
      input.lines, input.reason, response.locals.correlationId as string,
    ) });
  }));

  router.post('/sales/invoices/:invoiceId/supervisor-approval', requireCsrf, asyncHandler(async (request, response) => {
    response.json({ invoice: await approveSalesInvoice(
      getActiveContext(response.locals), getAuthenticatedSession(response.locals), uuid.parse(request.params.invoiceId),
      response.locals.correlationId as string,
    ) });
  }));

  router.post('/sales/invoices/:invoiceId/payments', requireCsrf, asyncHandler(async (request, response) => {
    response.status(201).json({ invoice: await recordSalesPayment(
      getActiveContext(response.locals), getAuthenticatedSession(response.locals), uuid.parse(request.params.invoiceId),
      recordPaymentInput.parse(request.body), requireIdempotencyKey(request), response.locals.correlationId as string,
    ) });
  }));

  router.post('/sales/invoices/:invoiceId/payments/:paymentId/review', requireCsrf, asyncHandler(async (request, response) => {
    response.json({ invoice: await reviewSalesPayment(
      getActiveContext(response.locals), getAuthenticatedSession(response.locals), uuid.parse(request.params.invoiceId),
      uuid.parse(request.params.paymentId), reviewPaymentInput.parse(request.body), response.locals.correlationId as string,
    ) });
  }));

  return router;
}
