import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { hasValidCsrfToken, isMobileClient } from './cookies';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global guard: a mutating request from a browser must echo its CSRF cookie in
 * `X-CSRF-Token` (double submit, ADR-0006). This covers login and registration
 * too, so another site cannot sign a browser into an account of its choosing.
 *
 * Requests that carry `Authorization` or the mobile client header are exempt:
 * a cross-site form cannot set headers, and AuthGuard never authenticates
 * them by cookie.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;
    if (req.get('authorization') !== undefined || isMobileClient(req)) return true;
    if (!hasValidCsrfToken(req)) throw new ForbiddenException('Missing or invalid CSRF token');
    return true;
  }
}
