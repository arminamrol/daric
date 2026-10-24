import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  browser,
  call,
  registerUser,
  startTestApp,
  testPassword,
  type TestApp,
} from '../../test/app';
import { uniqueEmail } from '../../test/db';

describe('Onboarding', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.close());

  const me = (token: string) => call(t.url, 'GET', '/v1/me', { token });
  const finish = (token: string) => call(t.url, 'POST', '/v1/me/onboarding', { token });

  it('is not finished for a User who just signed up', async () => {
    const a = await registerUser(t.url);
    expect((await me(a.token)).body.user.onboarded).toBe(false);
  });

  it('stays finished once the User finished or skipped it, on every device', async () => {
    const email = uniqueEmail();
    const a = await registerUser(t.url, email);
    const res = await finish(a.token);
    expect(res.status).toBe(204);
    expect((await me(a.token)).body.user.onboarded).toBe(true);

    const other = await call(t.url, 'POST', '/v1/auth/login', {
      body: { email, password: testPassword },
    });
    expect((await me(other.body.accessToken)).body.user.onboarded).toBe(true);
  });

  it('may be finished again without harm', async () => {
    const a = await registerUser(t.url);
    await finish(a.token);
    expect((await finish(a.token)).status).toBe(204);
    expect((await me(a.token)).body.user.onboarded).toBe(true);
  });

  it("does not finish another User's", async () => {
    const a = await registerUser(t.url);
    const b = await registerUser(t.url);
    await finish(a.token);
    expect((await me(b.token)).body.user.onboarded).toBe(false);
  });

  it('requires a login', async () => {
    expect((await call(t.url, 'POST', '/v1/me/onboarding')).status).toBe(401);
  });

  it('requires the CSRF token from the web app', async () => {
    const web = browser(t.url);
    await web.call('GET', '/v1/auth/csrf');
    await web.call('POST', '/v1/auth/register', {
      body: { email: uniqueEmail(), password: testPassword },
    });
    expect((await web.call('POST', '/v1/me/onboarding', { csrf: false })).status).toBe(403);
    expect((await web.call('POST', '/v1/me/onboarding')).status).toBe(204);
    expect((await web.call('GET', '/v1/me')).body.user.onboarded).toBe(true);
  });
});
