import type { Writable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { inject } from 'vitest';
import { configureApp } from '../app';
import { AppModule } from '../app.module';
import { loadConfig, type Config } from '../config';
import { uniqueEmail } from './db';

export interface TestApp {
  app: INestApplication;
  url: string;
  close(): Promise<void>;
}

export const testPassword = 'correct horse battery';

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: inject('databaseUrl'),
    JWT_SECRET: 'test-secret-test-secret-test-secret!',
    AUTH_RATE_LIMIT_PER_MINUTE: '1000',
    RATE_LIMIT_PER_MINUTE: '10000',
    LOG_LEVEL: 'silent',
    ...overrides,
  });
}

/**
 * Boots the whole API on a random port against the test database.
 * `override` can swap providers or guards, e.g. to remove an app-layer check.
 */
export async function startTestApp(
  options: {
    env?: Record<string, string>;
    logStream?: Writable;
    override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
  } = {},
): Promise<TestApp> {
  const config = testConfig(options.env);
  const builder = Test.createTestingModule({
    imports: [AppModule.forRoot(config, { logStream: options.logStream })],
  });
  const moduleRef = await (options.override?.(builder) ?? builder).compile();
  const app = configureApp(
    moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true }),
    config,
  );
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  return { app, url: url.replace('[::1]', '127.0.0.1'), close: () => app.close() };
}

export async function call(
  base: string,
  method: string,
  path: string,
  options: { body?: unknown; token?: string; headers?: Record<string, string> } = {},
) {
  // Calls here act as the mobile app: tokens in the body, `Authorization: Bearer`, no cookies.
  // `browser()` below acts as the web app.
  const headers: Record<string, string> = { 'x-daric-client': 'mobile', ...options.headers };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.token) headers['authorization'] = `Bearer ${options.token}`;
  const init: RequestInit = { method, headers };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);
  const res = await fetch(`${base}${path}`, init);
  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : undefined;
  return { status: res.status, headers: res.headers, body: body as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Registers a fresh User through the API and returns their token and Workspace. */
export async function registerUser(base: string, email = uniqueEmail()) {
  const reg = await call(base, 'POST', '/v1/auth/register', {
    body: { email, password: testPassword },
  });
  if (reg.status !== 201)
    throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`);
  const me = await call(base, 'GET', '/v1/me', { token: reg.body.accessToken });
  return {
    email,
    userId: reg.body.user.id as string,
    token: reg.body.accessToken as string,
    workspaceId: me.body.workspaces[0].id as string,
  };
}

interface StoredCookie {
  value: string;
  path: string;
}

/**
 * A browser talking to the API like the web app: it keeps the cookies the
 * server sets (honouring their Path), never sends `Authorization`, and sends
 * the CSRF cookie back in `X-CSRF-Token` unless told not to.
 */
export function browser(base: string) {
  const jar = new Map<string, StoredCookie>();

  function cookieHeader(path: string): string {
    return [...jar]
      .filter(([, c]) => path.startsWith(c.path))
      .map(([name, c]) => `${name}=${c.value}`)
      .join('; ');
  }

  function store(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [pair = '', ...attrs] = line.split(';').map((p) => p.trim());
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const path = attrs.find((a) => a.toLowerCase().startsWith('path='))?.slice(5) ?? '/';
      const expired = attrs.some(
        (a) => /^max-age=0$/i.test(a) || /^expires=thu, 01 jan 1970/i.test(a),
      );
      if (expired || value === '') jar.delete(name);
      else jar.set(name, { value, path });
    }
  }

  return {
    cookie: (name: string) => jar.get(name)?.value,
    async call(
      method: string,
      path: string,
      options: { body?: unknown; csrf?: boolean | string; headers?: Record<string, string> } = {},
    ) {
      const headers: Record<string, string> = { ...options.headers };
      const cookies = cookieHeader(path);
      if (cookies) headers['cookie'] = cookies;
      const csrf =
        typeof options.csrf === 'string'
          ? options.csrf
          : options.csrf !== false
            ? jar.get('__Host-daric_csrf')?.value
            : undefined;
      if (csrf) headers['x-csrf-token'] = csrf;
      if (options.body !== undefined) headers['content-type'] = 'application/json';
      const init: RequestInit = { method, headers };
      if (options.body !== undefined) init.body = JSON.stringify(options.body);
      const res = await fetch(`${base}${path}`, init);
      store(res);
      const text = await res.text();
      const body = text ? (JSON.parse(text) as Record<string, unknown>) : undefined;
      return { status: res.status, headers: res.headers, body: body as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    },
  };
}
export type Browser = ReturnType<typeof browser>;
