import { Router, type Request } from 'express';
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
  addAddress,
  addPhone,
  checkDuplicates,
  createCustomer,
  listCustomers,
  mergeCustomerIdentities,
  mergeCustomers,
  readCustomer,
  readTimeline,
  unmergeCustomerIdentity,
  unmergeCustomers,
} from './customer-service.js';

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));
const sourceInput = z.object({
  type: z.enum(['manual', 'legacy_crm', 'excel', 'call_center', 'website', 'campaign', 'external_company', 'api_integration']).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  reference: optionalText(200),
  importReference: optionalText(200),
  observedAt: z.iso.datetime({ offset: true }).optional(),
  rawSourceReference: optionalText(500),
  confidence: z.number().min(0).max(1).optional(),
  verificationStatus: z.enum(['unverified', 'verified', 'rejected']).optional(),
}).optional();

const phoneValue = z.string().trim().regex(/^[0-9+() -]{7,32}$/);
const customerInput = z.object({
  fullName: z.string().trim().min(2).max(200),
  phonePrimary: phoneValue,
  phoneSecondary: phoneValue.optional().or(z.literal('')),
  address: optionalText(500),
  province: optionalText(100),
  city: optionalText(100),
  postalCode: optionalText(20),
  source: sourceInput,
});
const addPhoneInput = z.object({
  value: phoneValue,
  label: z.string().trim().min(1).max(50).optional(),
  isPrimary: z.boolean().optional(),
  verificationStatus: z.enum(['unverified', 'verified', 'rejected']).optional(),
  source: sourceInput,
});
const addAddressInput = z.object({
  province: optionalText(100),
  city: optionalText(100),
  addressText: z.string().trim().min(2).max(500),
  postalCode: optionalText(20),
  label: z.string().trim().min(1).max(50).optional(),
  isPrimary: z.boolean().optional(),
  source: sourceInput,
});
const duplicateInput = z.object({
  phone: phoneValue,
  fullName: optionalText(200),
  excludeCustomerId: z.string().uuid().optional(),
});
const mergeInput = z.object({
  customerId: z.string().uuid(),
  targetCustomerId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});
const unmergeInput = z.object({ reason: z.string().trim().min(3).max(500) });
const identityMergeInput = z.object({
  identityId: z.string().uuid(),
  targetIdentityId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

const customerId = z.string().uuid();
const operationId = z.string().uuid();
const idempotencyKey = z.string().uuid();

function requireIdempotencyKey(request: Request): string {
  const header = request.header('idempotency-key');
  if (!header) throw new AppError(400, 'idempotency_key_required', 'Idempotency-Key is required.');
  return idempotencyKey.parse(header);
}

export function customerRoutes(): Router {
  const router = Router();
  router.use(requireAuthentication, requireActiveContext);

  router.get('/customers', requirePermission('customer.read'), asyncHandler(async (_request, response) => {
    response.json({ customers: await listCustomers(getActiveContext(response.locals)) });
  }));

  router.post('/customers/duplicates/check', requireCsrf, requirePermission('customer.read'), asyncHandler(async (request, response) => {
    response.json(await checkDuplicates(getActiveContext(response.locals), duplicateInput.parse(request.body)));
  }));

  router.post('/customers/merge', requireCsrf, requirePermission('customer.merge'), asyncHandler(async (request, response) => {
    response.json(await mergeCustomers(
      getActiveContext(response.locals), getAuthenticatedSession(response.locals), mergeInput.parse(request.body),
      requireIdempotencyKey(request), response.locals.correlationId as string,
    ));
  }));

  router.post('/customers/merges/:operationId/unmerge', requireCsrf, requirePermission('customer.merge'), asyncHandler(async (request, response) => {
    response.json(await unmergeCustomers(
      getActiveContext(response.locals), getAuthenticatedSession(response.locals), operationId.parse(request.params.operationId),
      unmergeInput.parse(request.body).reason, response.locals.correlationId as string,
    ));
  }));

  router.post('/customer-identities/merge', requireCsrf, requirePermission('customer.identity.reconcile'), asyncHandler(async (request, response) => {
    response.json({ operation: await mergeCustomerIdentities(
      getActiveContext(response.locals), getAuthenticatedSession(response.locals), identityMergeInput.parse(request.body),
      requireIdempotencyKey(request), response.locals.correlationId as string,
    ) });
  }));

  router.post('/customer-identities/merges/:operationId/unmerge', requireCsrf, requirePermission('customer.identity.reconcile'), asyncHandler(async (request, response) => {
    response.json({ operation: await unmergeCustomerIdentity(
      getActiveContext(response.locals), getAuthenticatedSession(response.locals), operationId.parse(request.params.operationId),
      unmergeInput.parse(request.body).reason, response.locals.correlationId as string,
    ) });
  }));

  router.get('/customers/:customerId', requirePermission('customer.read'), asyncHandler(async (request, response) => {
    response.json({ customer: await readCustomer(getActiveContext(response.locals), customerId.parse(request.params.customerId)) });
  }));

  router.get('/customers/:customerId/timeline', requirePermission('customer.read'), asyncHandler(async (request, response) => {
    response.json({ timeline: await readTimeline(getActiveContext(response.locals), customerId.parse(request.params.customerId)) });
  }));

  router.post('/customers', requireCsrf, requirePermission('customer.create'), asyncHandler(async (request, response) => {
    const customer = await createCustomer(
      getActiveContext(response.locals), getAuthenticatedSession(response.locals), customerInput.parse(request.body),
      requireIdempotencyKey(request), response.locals.correlationId as string,
    );
    response.status(201).json({ customer });
  }));

  router.post('/customers/:customerId/phones', requireCsrf, requirePermission('customer.identity.manage'), asyncHandler(async (request, response) => {
    response.status(201).json({ customer: await addPhone(
      getActiveContext(response.locals), getAuthenticatedSession(response.locals), customerId.parse(request.params.customerId),
      addPhoneInput.parse(request.body), requireIdempotencyKey(request), response.locals.correlationId as string,
    ) });
  }));

  router.post('/customers/:customerId/addresses', requireCsrf, requirePermission('customer.identity.manage'), asyncHandler(async (request, response) => {
    response.status(201).json({ customer: await addAddress(
      getActiveContext(response.locals), getAuthenticatedSession(response.locals), customerId.parse(request.params.customerId),
      addAddressInput.parse(request.body), requireIdempotencyKey(request), response.locals.correlationId as string,
    ) });
  }));

  return router;
}
