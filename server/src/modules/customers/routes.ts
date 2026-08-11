import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../access/authorization.js';
import { getActiveContext, getAuthenticatedSession, requireActiveContext, requireAuthentication, requireCsrf } from '../identity/middleware.js';
import { asyncHandler } from '../../shared/async-handler.js';
import { AppError } from '../../shared/errors.js';
import { createCustomer, listCustomers, readCustomer } from './customer-service.js';

const customerInput = z.object({
  fullName: z.string().trim().min(2).max(200),
  phonePrimary: z.string().trim().regex(/^[0-9+ -]{7,20}$/),
  phoneSecondary: z.string().trim().regex(/^[0-9+ -]{7,20}$/).optional().or(z.literal('')),
  address: z.string().trim().max(500).optional().or(z.literal('')),
  province: z.string().trim().max(100).optional().or(z.literal('')),
  city: z.string().trim().max(100).optional().or(z.literal('')),
  postalCode: z.string().trim().max(20).optional().or(z.literal('')),
});

const customerId = z.string().uuid();
const idempotencyKey = z.string().uuid();

export function customerRoutes(): Router {
  const router = Router();
  router.use(requireAuthentication, requireActiveContext);

  router.get('/customers', requirePermission('customer.read'), asyncHandler(async (_request, response) => {
    response.json({ customers: await listCustomers(getActiveContext(response.locals)) });
  }));

  router.get('/customers/:customerId', requirePermission('customer.read'), asyncHandler(async (request, response) => {
    response.json({ customer: await readCustomer(getActiveContext(response.locals), customerId.parse(request.params.customerId)) });
  }));

  router.post('/customers', requireCsrf, requirePermission('customer.create'), asyncHandler(async (request, response) => {
    const keyHeader = request.header('idempotency-key');
    if (!keyHeader) throw new AppError(400, 'idempotency_key_required', 'Idempotency-Key is required.');
    const customer = await createCustomer(
      getActiveContext(response.locals),
      getAuthenticatedSession(response.locals),
      customerInput.parse(request.body),
      idempotencyKey.parse(keyHeader),
      response.locals.correlationId as string,
    );
    response.status(201).json({ customer });
  }));

  return router;
}
