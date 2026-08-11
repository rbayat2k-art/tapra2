import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger.js';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new AppError(404, 'not_found', `Route ${request.method} ${request.path} was not found.`));
};

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const correlationId = response.locals.correlationId as string | undefined;
  if (error instanceof ZodError) {
    response.status(400).json({
      error: { code: 'validation_failed', message: 'Request validation failed.', details: error.flatten() },
      correlationId,
    });
    return;
  }

  const appError = error instanceof AppError
    ? error
    : new AppError(500, 'internal_error', 'An unexpected server error occurred.');

  if (appError.status >= 500) {
    logger.error('request_failed', {
      correlationId,
      method: request.method,
      path: request.path,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
  }

  response.status(appError.status).json({
    error: { code: appError.code, message: appError.message, details: appError.details },
    correlationId,
  });
};
