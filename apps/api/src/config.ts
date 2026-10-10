import { z } from 'zod';

const durationSeconds = z.coerce.number().int().positive();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  /** HMAC key for access tokens; at least 32 characters. */
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: durationSeconds.default(15 * 60),
  REFRESH_TOKEN_TTL_SECONDS: durationSeconds.default(30 * 24 * 60 * 60),
  /** Comma-separated origins allowed to call the API from a browser. */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  /** Requests per minute per client on every route. */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  /** Requests per minute per client on login and registration. */
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
  /** Hops of reverse proxies in front of the API, for client IPs in rate limits and audit logs. */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Config = z.output<typeof envSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
