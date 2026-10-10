import { z } from 'zod';

/** Emails are compared case-insensitively, so they are stored trimmed and lowercased. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** The upper bound keeps hashing cost bounded; argon2 would accept anything. */
export const passwordSchema = z.string().min(8).max(128);

export const registerInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

export const loginInputSchema = z.object({
  email: emailSchema,
  // Login never tells which rule a stored password broke, so only bound its size.
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
});
export type User = z.infer<typeof userSchema>;

/** Header the mobile app sends so the API hands it tokens instead of cookies (ADR-0006). */
export const CLIENT_HEADER = 'X-Daric-Client';
/** Double-submit CSRF token: the web app reads this cookie and echoes it in `CSRF_HEADER`. */
export const CSRF_COOKIE = '__Host-daric_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';

/** What a web client gets on sign-up or login; the tokens themselves travel only in httpOnly cookies. */
export const sessionSchema = z.object({
  user: userSchema,
  accessTokenExpiresAt: z.iso.datetime(),
  refreshTokenExpiresAt: z.iso.datetime(),
});
export type Session = z.infer<typeof sessionSchema>;

/** What the mobile app gets on sign-up or login: the session plus the tokens it keeps itself. */
export const authResultSchema = sessionSchema.extend({
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type AuthResult = z.infer<typeof authResultSchema>;

/** The mobile app sends its refresh token in the body; the web app's travels in a cookie. */
export const refreshInputSchema = z.object({
  refreshToken: z.string().min(1).max(256),
});
export type RefreshInput = z.infer<typeof refreshInputSchema>;
