import type { LoggerOptions } from 'pino';

/** Keys whose values never reach the logs: money, free text and credentials. */
const SENSITIVE_KEY = /amount|note|password|token|secret|authorization|cookie/i;
const CENSOR = '[redacted]';
const MAX_DEPTH = 8;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Copies plain objects and arrays with sensitive keys censored; leaves other values alone. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return CENSOR;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? CENSOR : redact(v, depth + 1);
  }
  return out;
}

interface LoggedRequest {
  id?: unknown;
  method?: string;
  url?: string;
}

/**
 * Pino options shared by the HTTP logger and anything else that logs.
 * Requests are logged by method and path only: headers carry tokens and
 * query strings may carry one-time tokens.
 */
export function loggerOptions(level: string): LoggerOptions {
  return {
    level,
    formatters: { log: (obj) => redact(obj) as Record<string, unknown> },
    serializers: {
      req: (req: LoggedRequest) => ({
        id: req.id,
        method: req.method,
        path: req.url?.split('?')[0],
      }),
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
    },
  };
}
