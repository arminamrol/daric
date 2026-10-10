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

describe('User preferences', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.close());

  const me = (token: string) => call(t.url, 'GET', '/v1/me', { token });
  const patch = (token: string, body: unknown) =>
    call(t.url, 'PATCH', '/v1/me/preferences', { token, body });

  it('start as Jalali dates, Persian digits and the system theme', async () => {
    const a = await registerUser(t.url);
    expect((await me(a.token)).body.preferences).toEqual({
      displayCalendar: 'jalali',
      digits: 'persian',
      theme: 'system',
    });
  });

  it('let the User change their display calendar, digits and theme', async () => {
    const a = await registerUser(t.url);
    const res = await patch(a.token, {
      displayCalendar: 'gregorian',
      digits: 'latin',
      theme: 'dark',
    });
    expect(res.status).toBe(200);
    const expected = { displayCalendar: 'gregorian', digits: 'latin', theme: 'dark' };
    expect(res.body).toEqual(expected);
    expect((await me(a.token)).body.preferences).toEqual(expected);
  });

  it('change only the fields sent', async () => {
    const a = await registerUser(t.url);
    await patch(a.token, { theme: 'light' });
    const res = await patch(a.token, { digits: 'latin' });
    expect(res.body).toEqual({ displayCalendar: 'jalali', digits: 'latin', theme: 'light' });
  });

  it('leave the Workspace Calendar alone when the display calendar changes', async () => {
    const a = await registerUser(t.url);
    await patch(a.token, { displayCalendar: 'gregorian' });
    expect((await me(a.token)).body.workspaces[0].calendar).toBe('jalali');
  });

  it("do not change another User's preferences", async () => {
    const a = await registerUser(t.url);
    const b = await registerUser(t.url);
    await patch(a.token, { theme: 'dark' });
    expect((await me(b.token)).body.preferences.theme).toBe('system');
  });

  it.each([
    ['an unknown calendar', { displayCalendar: 'hijri' }],
    ['unknown digits', { digits: 'roman' }],
    ['an unknown theme', { theme: 'sepia' }],
    ['an empty body', {}],
  ])('reject %s', async (_, body) => {
    const a = await registerUser(t.url);
    expect((await patch(a.token, body)).status).toBe(400);
  });

  it('require a login', async () => {
    const res = await call(t.url, 'PATCH', '/v1/me/preferences', { body: { theme: 'dark' } });
    expect(res.status).toBe(401);
  });

  it('require the CSRF token from the web app', async () => {
    const web = browser(t.url);
    await web.call('GET', '/v1/auth/csrf');
    await web.call('POST', '/v1/auth/register', {
      body: { email: uniqueEmail(), password: testPassword },
    });
    const forged = await web.call('PATCH', '/v1/me/preferences', {
      body: { theme: 'dark' },
      csrf: false,
    });
    expect(forged.status).toBe(403);
    const ok = await web.call('PATCH', '/v1/me/preferences', { body: { theme: 'dark' } });
    expect(ok.status).toBe(200);
    expect((await web.call('GET', '/v1/me')).body.preferences.theme).toBe('dark');
  });
});
