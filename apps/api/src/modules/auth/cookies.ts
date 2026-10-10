import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieOptions, Request, Response } from 'express';
import type { IssuedTokens } from './token.service';

// ADR-0006: on the web both tokens live only in httpOnly cookies the server sets.
// `__Host-` pins a cookie to this host and Path=/; the refresh cookie needs a
// narrower Path, so it can only take the weaker `__Secure-` prefix.
export const ACCESS_COOKIE = '__Host-daric_access';
export const REFRESH_COOKIE = '__Secure-daric_refresh';
export const REFRESH_PATH = '/v1/auth/refresh';
/** Double-submit CSRF token: readable by the web app, echoed back in `X-CSRF-Token`. */
export const CSRF_COOKIE = '__Host-daric_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** Header the mobile app sends to get tokens in the body instead of cookies. */
export const CLIENT_HEADER = 'x-daric-client';

const base: CookieOptions = { secure: true, sameSite: 'lax' };

export function isMobileClient(req: Request): boolean {
  return req.get(CLIENT_HEADER) === 'mobile';
}

export function readCookie(req: Request, name: string): string | undefined {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function setSessionCookies(res: Response, tokens: IssuedTokens): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base,
    httpOnly: true,
    path: '/',
    expires: tokens.accessTokenExpiresAt,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base,
    httpOnly: true,
    path: REFRESH_PATH,
    expires: tokens.refreshTokenExpiresAt,
  });
}

/** Sets a fresh CSRF token. It lives as long as the browser session. */
export function setCsrfCookie(res: Response): string {
  const token = randomBytes(32).toString('base64url');
  res.cookie(CSRF_COOKIE, token, { ...base, httpOnly: false, path: '/' });
  return token;
}

/** Whether the request echoes its CSRF cookie in the CSRF header. */
export function hasValidCsrfToken(req: Request): boolean {
  const cookie = readCookie(req, CSRF_COOKIE);
  const header = req.get(CSRF_HEADER);
  if (!cookie || !header) return false;
  const a = Buffer.from(cookie);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}
