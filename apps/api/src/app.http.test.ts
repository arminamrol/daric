import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, startTestApp, type TestApp } from './test/app';
import { uniqueEmail } from './test/db';

describe('HTTP hardening', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp({ env: { CORS_ORIGINS: 'https://app.daric.test' } });
  });
  afterAll(() => t.close());

  it('sends security headers', async () => {
    const res = await call(t.url, 'GET', '/v1/me');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('strict-transport-security')).toMatch(/max-age=/);
    expect(res.headers.get('content-security-policy')).toBeTruthy();
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  it('allows credentialed CORS only from configured origins', async () => {
    const preflight = (origin: string) =>
      fetch(`${t.url}/v1/auth/login`, {
        method: 'OPTIONS',
        headers: { origin, 'access-control-request-method': 'POST' },
      });
    const allowed = await preflight('https://app.daric.test');
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://app.daric.test');
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');

    const denied = await preflight('https://evil.test');
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('publishes an OpenAPI document generated from the zod schemas', async () => {
    const res = await call(t.url, 'GET', '/v1/openapi.json');
    expect(res.status).toBe(200);
    const ref: string =
      res.body.paths['/v1/auth/register'].post.requestBody.content['application/json'].schema.$ref;
    const schema = res.body.components.schemas[ref.replace('#/components/schemas/', '')];
    expect(schema).toMatchObject({
      type: 'object',
      properties: { email: { type: 'string' }, password: { type: 'string', minLength: 8 } },
      required: expect.arrayContaining(['email', 'password']),
    });
    expect(res.body.paths['/v1/workspaces/{wsId}'].patch).toBeDefined();
  });
});

describe('rate limiting', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp({ env: { AUTH_RATE_LIMIT_PER_MINUTE: '3' } });
  });
  afterAll(() => t.close());

  it('limits login attempts per client', async () => {
    const attempt = () =>
      call(t.url, 'POST', '/v1/auth/login', {
        body: { email: uniqueEmail(), password: 'wrong password!' },
      });
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await attempt()).status);
    expect(statuses).toEqual([401, 401, 401, 429]);
  });

  it('does not count other routes against the login limit', async () => {
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await call(t.url, 'GET', '/v1/me')).status);
    expect(statuses).toEqual([401, 401, 401, 401, 401]);
  });
});
