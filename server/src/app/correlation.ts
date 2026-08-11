import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { logger } from '../shared/logger.js';

const requestIdPattern = /^[a-zA-Z0-9._-]{8,128}$/;

export const correlationMiddleware: RequestHandler = (request, response, next) => {
  const supplied = request.header('x-correlation-id');
  const correlationId = supplied && requestIdPattern.test(supplied) ? supplied : randomUUID();
  response.locals.correlationId = correlationId;
  response.setHeader('x-correlation-id', correlationId);
  const startedAt = performance.now();

  response.on('finish', () => {
    logger.info('request_completed', {
      correlationId,
      method: request.method,
      path: request.path,
      status: response.statusCode,
      durationMs: Math.round(performance.now() - startedAt),
    });
  });
  next();
};
