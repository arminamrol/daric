import { IRR, type Money, type Plan } from '@daric/core';
import { z } from 'zod';

const positiveInt = z.coerce.number().int().positive();
/** `true`/`false` from the environment; `z.coerce.boolean()` would read "false" as true. */
const flag = z.enum(['true', 'false']).transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: positiveInt.default(3000),
  DATABASE_URL: z.url(),
  /** HMAC key for access tokens; at least 32 characters. */
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: positiveInt.default(15 * 60),
  REFRESH_TOKEN_TTL_SECONDS: positiveInt.default(30 * 24 * 60 * 60),
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
  RATE_LIMIT_PER_MINUTE: positiveInt.default(120),
  /** Requests per minute per client on login and registration. */
  AUTH_RATE_LIMIT_PER_MINUTE: positiveInt.default(10),
  /** Requests per hour per client on routes that send mail (password reset, verification resend). */
  MAIL_RATE_LIMIT_PER_HOUR: positiveInt.default(5),
  /** Hops of reverse proxies in front of the API, for client IPs in rate limits and audit logs. */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  /** Minutes between runs of the month-end Net Worth Snapshot job; 0 turns it off. */
  SNAPSHOT_JOB_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(60),
  /** SMTP server outgoing mail goes through; Mailpit in development. */
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: positiveInt.default(1025),
  /** TLS from the start (usually port 465); otherwise STARTTLS is used when the server offers it. */
  SMTP_SECURE: flag.default(false),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(1).default('Daric <no-reply@daric.local>'),
  /** Origin of the web app; links in emails point here. */
  APP_URL: z
    .url()
    .default('http://localhost:5173')
    .transform((u) => u.replace(/\/+$/, '')),
  /** Whether Plans limit anything; off (every Entitlement unlimited) on a self-hosted server. */
  BILLING_ENABLED: flag.default(false),
  /** Days of Plus every new User gets at sign-up. */
  TRIAL_DAYS: positiveInt.default(14),
  /** Signed-in Devices a User may have on each Plan. */
  FREE_DEVICE_LIMIT: positiveInt.default(1),
  PLUS_DEVICE_LIMIT: positiveInt.default(3),
  /** AI analyses a User may run per month on each Plan. */
  FREE_AI_ANALYSES_PER_MONTH: z.coerce.number().int().min(0).default(1),
  PLUS_AI_ANALYSES_PER_MONTH: z.coerce.number().int().min(0).default(30),
  /** Price of one month of Plus, an Amount in IRR (rials). */
  PLUS_MONTHLY_PRICE_IRR: positiveInt.default(2_000_000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Config = z.output<typeof envSchema>;

/** One Plan's limits; `null` is unlimited. */
export interface PlanLimits {
  signedInDevices: number | null;
  shareWorkspace: boolean;
  aiAnalysesPerMonth: number | null;
}

/** Plans, their limits and prices, as the Entitlement service reads them. */
export interface BillingConfig {
  enabled: boolean;
  trialDays: number;
  limits: Record<Plan, PlanLimits>;
  plusMonthlyPrice: Money;
}

export function billingConfig(config: Config): BillingConfig {
  return {
    enabled: config.BILLING_ENABLED,
    trialDays: config.TRIAL_DAYS,
    limits: {
      FREE: {
        signedInDevices: config.FREE_DEVICE_LIMIT,
        shareWorkspace: false,
        aiAnalysesPerMonth: config.FREE_AI_ANALYSES_PER_MONTH,
      },
      PLUS: {
        signedInDevices: config.PLUS_DEVICE_LIMIT,
        shareWorkspace: true,
        aiAnalysesPerMonth: config.PLUS_AI_ANALYSES_PER_MONTH,
      },
    },
    plusMonthlyPrice: { amount: BigInt(config.PLUS_MONTHLY_PRICE_IRR), currency: IRR },
  };
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
