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

interface LoggedError {
  type: string;
  message: string;
  stack?: string;
  code?: unknown;
  query?: unknown;
  cause?: LoggedError;
}

/**
 * Errors keep their type, message, stack, code and SQL text, nothing else:
 * database errors carry query parameters (`params`, and Drizzle's message) and
 * row values (Postgres' `detail`), which may be Amounts, notes or token hashes.
 */
export function serializeError(err: unknown, depth = 0): LoggedError | undefined {
  if (!(err instanceof Error))
    return err === undefined ? undefined : { type: typeof err, message: CENSOR };
  const message = err.message.split('\nparams:')[0] ?? '';
  const out: LoggedError = { type: err.constructor.name, message };
  if (err.stack) out.stack = err.stack.replace(err.message, message);
  const extra = err as Error & { code?: unknown; query?: unknown };
  if (extra.code !== undefined) out.code = extra.code;
  if (typeof extra.query === 'string') out.query = extra.query;
  if (err.cause !== undefined && depth < 3) {
    const cause = serializeError(err.cause, depth + 1);
    if (cause) out.cause = cause;
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
      err: serializeError,
    },
  };
}
