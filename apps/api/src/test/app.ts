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
  const headers: Record<string, string> = { ...options.headers };
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
