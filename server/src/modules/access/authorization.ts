import type { RequestHandler } from 'express';
import { AppError } from '../../shared/errors.js';
import { getActiveContext } from '../identity/middleware.js';

export function requirePermission(permission: string): RequestHandler {
  return (_request, response, next) => {
    const context = getActiveContext(response.locals);
    if (!context.permissions.includes(permission)) {
      next(new AppError(403, 'permission_denied', `Permission ${permission} is required.`));
      return;
    }
    next();
  };
}
