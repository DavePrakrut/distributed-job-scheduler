import { Request, Response, NextFunction } from 'express';
import { TokenService, TokenPayload } from '../services/token.service';
import { UnauthorizedError, ForbiddenError } from './error.middleware';
import { AuthenticatedRequest } from '../types';

/**
 * Middleware to authenticate requests via JWT
 */
export function authenticate(
  req: Request & { user?: TokenPayload },
  _res: Response,
  next: NextFunction,
): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authentication token missing or invalid');
    }

    const token = authHeader.split(' ')[1];
    const decoded = TokenService.verifyToken<TokenPayload>(token);

    // Inject user payload into request
    req.user = decoded;
    next();
  } catch (err) {
    next(new UnauthorizedError('Invalid or expired authentication token'));
  }
}

/**
 * Middleware to restrict access by user roles
 */
export function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    try {
      if (!req.user || !allowedRoles.includes(req.user.role)) {
        throw new ForbiddenError('You do not have permission to access this resource');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Helper to ensure a tenant query parameter, body parameter, or path parameter matches the user's tenant organization.
 */
export function checkTenant(
  fieldSource: 'params' | 'body' | 'query',
  paramName: string = 'organizationId',
) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    try {
      const source = req[fieldSource];
      const targetOrgId = source ? source[paramName] : undefined;

      if (!targetOrgId) {
        throw new ForbiddenError('Missing tenant scoping context');
      }

      if (req.user.organizationId !== targetOrgId) {
        throw new ForbiddenError('Access Denied: Tenant mismatch');
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
