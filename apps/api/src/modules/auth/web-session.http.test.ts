import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { browser, startTestApp, testPassword, type TestApp } from '../../test/app';
import { uniqueEmail } from '../../test/db';

let t: TestApp;
beforeAll(async () => {
  t = await startTestApp();
});
afterAll(() => t.close());

/** The raw Set-Cookie line for `name`. */
function setCookie(headers: Headers, name: string): string {
  const line = headers.getSetCookie().find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`no Set-Cookie for ${name}`);
  return line;
}

describe('web sign-up', () => {
  it('sets the tokens as httpOnly cookies and keeps them out of the body', async () => {
    const web = browser(t.url);
    await web.call('GET', '/v1/auth/csrf');
    const email = uniqueEmail();
    const res = await web.call('POST', '/v1/auth/register', {
      body: { email, password: testPassword },
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      user: { id: expect.any(String), email },
      accessTokenExpiresAt: expect.any(String),
      refreshTokenExpiresAt: expect.any(String),
    });

    const access = setCookie(res.headers, '__Host-daric_access');
    expect(access).toMatch(/; HttpOnly/i);
    expect(access).toMatch(/; Secure/i);
    expect(access).toMatch(/; SameSite=Lax/i);
    expect(access).toMatch(/; Path=\/(;|$)/);

    const refresh = setCookie(res.headers, '__Secure-daric_refresh');
    expect(refresh).toMatch(/; HttpOnly/i);
    expect(refresh).toMatch(/; Secure/i);
    expect(refresh).toMatch(/; SameSite=Lax/i);
    expect(refresh).toMatch(/; Path=\/v1\/auth\/refresh(;|$)/);

    const me = await web.call('GET', '/v1/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
  });
});

describe('web login', () => {
  it('signs a new browser in with cookies only', async () => {
    const { email } = await signedUpBrowser();
    const web = browser(t.url);
    await web.call('GET', '/v1/auth/csrf');
    const res = await web.call('POST', '/v1/auth/login', {
      body: { email, password: testPassword },
    });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'accessTokenExpiresAt',
      'refreshTokenExpiresAt',
      'user',
    ]);
    expect(web.cookie('__Host-daric_access')).toEqual(expect.any(String));
    expect(web.cookie('__Secure-daric_refresh')).toEqual(expect.any(String));
    expect((await web.call('GET', '/v1/me')).body.user.email).toBe(email);
  });

  it('is not signed in without the access cookie', async () => {
    const web = browser(t.url);
    expect((await web.call('GET', '/v1/me')).status).toBe(401);
  });
});

/** A browser signed up through the web flow, with its Personal Workspace id. */
async function signedUpBrowser() {
  const web = browser(t.url);
  await web.call('GET', '/v1/auth/csrf');
  const email = uniqueEmail();
  const reg = await web.call('POST', '/v1/auth/register', {
    body: { email, password: testPassword },
  });
  if (reg.status !== 201) throw new Error(`register failed: ${reg.status}`);
  const me = await web.call('GET', '/v1/me');
  return { web, email, workspaceId: me.body.workspaces[0].id as string };
}

describe('CSRF protection', () => {
  it('hands out a CSRF cookie that the web app can read', async () => {
    const web = browser(t.url);
    const res = await web.call('GET', '/v1/auth/csrf');
    expect(res.status).toBe(204);
    const csrf = setCookie(res.headers, '__Host-daric_csrf');
    expect(csrf).not.toMatch(/HttpOnly/i);
    expect(csrf).toMatch(/; Secure/i);
    expect(csrf).toMatch(/; SameSite=Lax/i);
    expect(csrf).toMatch(/; Path=\/(;|$)/);

    // Asking again keeps the same token.
    const first = web.cookie('__Host-daric_csrf');
    await web.call('GET', '/v1/auth/csrf');
    expect(web.cookie('__Host-daric_csrf')).toBe(first);
  });

  it('rejects a mutating request with the session cookie but no CSRF header', async () => {
    const { web, workspaceId } = await signedUpBrowser();
    const res = await web.call('PATCH', `/v1/workspaces/${workspaceId}`, {
      body: { name: 'forged' },
      csrf: false,
    });
    expect(res.status).toBe(403);
    const ws = await web.call('GET', `/v1/workspaces/${workspaceId}`);
    expect(ws.body.name).toBe('Personal');
  });

  it('rejects a CSRF header that does not match the cookie', async () => {
    const { web, workspaceId } = await signedUpBrowser();
    const res = await web.call('PATCH', `/v1/workspaces/${workspaceId}`, {
      body: { name: 'forged' },
      csrf: 'guessed-token',
    });
    expect(res.status).toBe(403);
  });

  it('accepts a mutating request that echoes the CSRF cookie', async () => {
    const { web, workspaceId } = await signedUpBrowser();
    const res = await web.call('PATCH', `/v1/workspaces/${workspaceId}`, {
      body: { name: 'Home' },
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Home');
  });

  it('does not ask for a CSRF token on reads', async () => {
    const { web } = await signedUpBrowser();
    expect((await web.call('GET', '/v1/me', { csrf: false })).status).toBe(200);
  });

  it.each(['register', 'login'])('rejects %s without a CSRF token', async (route) => {
    const web = browser(t.url);
    const res = await web.call('POST', `/v1/auth/${route}`, {
      body: { email: uniqueEmail(), password: testPassword },
    });
    expect(res.status).toBe(403);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it('rejects a CSRF header when there is no CSRF cookie', async () => {
    const web = browser(t.url);
    const res = await web.call('POST', '/v1/auth/register', {
      body: { email: uniqueEmail(), password: testPassword },
      csrf: 'made-up-token',
    });
    expect(res.status).toBe(403);
  });

  it('does not let the mobile client header turn the session cookie into a CSRF-free login', async () => {
    const { web, workspaceId } = await signedUpBrowser();
    const res = await web.call('PATCH', `/v1/workspaces/${workspaceId}`, {
      body: { name: 'forged' },
      csrf: false,
      headers: { 'x-daric-client': 'mobile' },
    });
    expect(res.status).toBe(401);
    expect((await web.call('GET', `/v1/workspaces/${workspaceId}`)).body.name).toBe('Personal');
  });

  it('gives the new session a new CSRF token', async () => {
    const web = browser(t.url);
    await web.call('GET', '/v1/auth/csrf');
    const before = web.cookie('__Host-daric_csrf');
    await web.call('POST', '/v1/auth/register', {
      body: { email: uniqueEmail(), password: testPassword },
    });
    expect(web.cookie('__Host-daric_csrf')).toEqual(expect.any(String));
    expect(web.cookie('__Host-daric_csrf')).not.toBe(before);
  });
});
