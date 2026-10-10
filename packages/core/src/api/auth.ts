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

export const authResultSchema = z.object({
  user: userSchema,
  accessToken: z.string(),
  accessTokenExpiresAt: z.iso.datetime(),
  refreshToken: z.string(),
  refreshTokenExpiresAt: z.iso.datetime(),
});
export type AuthResult = z.infer<typeof authResultSchema>;
