import {
  CSRF_COOKIE,
  CSRF_HEADER,
  type LoginInput,
  type Me,
  meSchema,
  type RegisterInput,
  type Session,
  sessionSchema,
} from '@daric/core';

/** A non-2xx answer from the API. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API answered ${status}`);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  /** Origin of the API; empty when the API is served from the web app's own origin. */
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Reads a cookie the page can see; defaults to `document.cookie`. */
  readCookie?: (name: string) => string | undefined;
}

export interface ApiClient {
  register(input: RegisterInput): Promise<Session>;
  login(input: LoginInput): Promise<Session>;
  me(): Promise<Me>;
}

function documentCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  for (const part of document.cookie.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

/**
 * The web app's API client (ADR-0006). The browser attaches the httpOnly
 * session cookies; this code never sees a token. The only cookie it reads is
 * the CSRF token, which it echoes in a header on every mutating request.
 */
export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? '';
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const readCookie = options.readCookie ?? documentCookie;

  async function csrfToken(): Promise<string | undefined> {
    const existing = readCookie(CSRF_COOKIE);
    if (existing) return existing;
    const res = await doFetch(`${baseUrl}/v1/auth/csrf`, { credentials: 'include' });
    if (!res.ok) throw new ApiError(res.status, await readBody(res));
    return readCookie(CSRF_COOKIE);
  }

  async function request<T>(
    method: string,
    path: string,
    schema: { parse(value: unknown): T },
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (method !== 'GET') {
      const csrf = await csrfToken();
      if (csrf) headers[CSRF_HEADER] = csrf;
    }
    const init: RequestInit = { method, headers, credentials: 'include' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await doFetch(`${baseUrl}${path}`, init);
    const parsed = await readBody(res);
    if (!res.ok) throw new ApiError(res.status, parsed);
    return schema.parse(parsed);
  }

  return {
    register: (input) => request('POST', '/v1/auth/register', sessionSchema, input),
    login: (input) => request('POST', '/v1/auth/login', sessionSchema, input),
    me: () => request('GET', '/v1/me', meSchema),
  };
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
