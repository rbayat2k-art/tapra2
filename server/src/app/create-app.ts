import express from 'express';
import { correlationMiddleware } from './correlation.js';
import { query } from '../infrastructure/database/pool.js';
import { identityRoutes } from '../modules/identity/routes.js';
import { customerRoutes } from '../modules/customers/routes.js';
import { customerImportRoutes } from '../modules/customer-imports/routes.js';
import { asyncHandler } from '../shared/async-handler.js';
import { errorHandler, notFoundHandler } from '../shared/errors.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(correlationMiddleware);
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/v1/health', asyncHandler(async (_request, response) => {
    await query('SELECT 1');
    response.json({ status: 'ok', service: 'tapra2-server', timestamp: new Date().toISOString() });
  }));

  app.use('/api/v1', identityRoutes());
  app.use('/api/v1', customerRoutes());
  app.use('/api/v1', customerImportRoutes());

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
