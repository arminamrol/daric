import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient } from './index';

const user = { id: '01900000-0000-7000-8000-000000000000', email: 'sara@example.com' };
const preferences = { displayCalendar: 'jalali', digits: 'persian', theme: 'system' } as const;
const workspace = {
  id: '01900000-0000-7000-9000-000000000001',
  type: 'PERSONAL',
  name: 'Personal',
  baseCurrency: 'IRR',
  calendar: 'jalali',
  timezone: 'Asia/Tehran',
  moneyDisplay: 'rial',
  role: 'OWNER',
} as const;
const session = {
  user,
  accessTokenExpiresAt: '2026-10-10T10:15:00.000Z',
  refreshTokenExpiresAt: '2026-11-09T10:00:00.000Z',
};

interface Sent {
  url: string;
  method: string;
  headers: Headers;
  credentials: RequestCredentials | undefined;
  body: unknown;
}

/**
 * A fake API and browser cookie store: `routes` answer by "METHOD path",
 * and a route may set cookies the client can then read.
 */
function fakeServer(
  routes: Record<
    string,
    (req: Sent) => { status: number; body?: unknown; cookies?: Record<string, string> }
  >,
  initialCookies: Record<string, string> = {},
) {
  const cookies = new Map(Object.entries(initialCookies));
  const sent: Sent[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    const req: Sent = {
      url,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      credentials: init?.credentials,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    sent.push(req);
    const route = routes[`${req.method} ${new URL(url, 'http://web.test').pathname}`];
    if (!route) return new Response(null, { status: 404 });
    const res = route(req);
    for (const [k, v] of Object.entries(res.cookies ?? {})) cookies.set(k, v);
    return new Response(res.body === undefined ? null : JSON.stringify(res.body), {
      status: res.status,
      headers: { 'content-type': 'application/json' },
    });
  };
  const client = createApiClient({ fetch, readCookie: (name) => cookies.get(name) });
  return { client, sent };
}

describe('api-client', () => {
  it('sends credentials so the browser attaches the session cookies', async () => {
    const { client, sent } = fakeServer({
      'GET /v1/me': () => ({ status: 200, body: { user, preferences, workspaces: [] } }),
    });
    expect(await client.me()).toEqual({ user, preferences, workspaces: [] });
    expect(sent[0]?.credentials).toBe('include');
    expect(sent[0]?.url).toBe('/v1/me');
  });

  it('echoes the CSRF cookie in the CSRF header on mutating requests', async () => {
    const { client, sent } = fakeServer(
      { 'POST /v1/auth/login': () => ({ status: 200, body: session }) },
      { '__Host-daric_csrf': 'csrf-1' },
    );
    const result = await client.login({ email: user.email, password: 'secret password' });

    expect(result).toEqual(session);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.headers.get('x-csrf-token')).toBe('csrf-1');
    expect(sent[0]?.headers.get('content-type')).toBe('application/json');
    expect(sent[0]?.body).toEqual({ email: user.email, password: 'secret password' });
    expect(sent[0]?.credentials).toBe('include');
  });

  it('fetches a CSRF cookie first when the browser has none', async () => {
    const { client, sent } = fakeServer({
      'GET /v1/auth/csrf': () => ({ status: 204, cookies: { '__Host-daric_csrf': 'fresh' } }),
      'POST /v1/auth/register': () => ({ status: 201, body: session }),
    });
    await client.register({ email: user.email, password: 'secret password' });

    expect(sent.map((r) => `${r.method} ${r.url}`)).toEqual([
      'GET /v1/auth/csrf',
      'POST /v1/auth/register',
    ]);
    expect(sent[1]?.headers.get('x-csrf-token')).toBe('fresh');
  });

  it('does not send a CSRF header on reads', async () => {
    const { client, sent } = fakeServer(
      { 'GET /v1/me': () => ({ status: 200, body: { user, preferences, workspaces: [] } }) },
      { '__Host-daric_csrf': 'csrf-1' },
    );
    await client.me();
    expect(sent[0]?.headers.has('x-csrf-token')).toBe(false);
  });

  it('never asks for tokens: it sends no Authorization header and no mobile client header', async () => {
    const { client, sent } = fakeServer(
      { 'POST /v1/auth/login': () => ({ status: 200, body: session }) },
      { '__Host-daric_csrf': 'csrf-1' },
    );
    await client.login({ email: user.email, password: 'secret password' });
    expect(sent[0]?.headers.has('authorization')).toBe(false);
    expect(sent[0]?.headers.has('x-daric-client')).toBe(false);
  });

  it('turns error responses into ApiError with the status', async () => {
    const { client } = fakeServer(
      {
        'POST /v1/auth/login': () => ({
          status: 401,
          body: { statusCode: 401, message: 'Email or password is incorrect' },
        }),
      },
      { '__Host-daric_csrf': 'csrf-1' },
    );
    const error = await client
      .login({ email: user.email, password: 'wrong' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401 });
  });

  it("updates a Workspace's settings", async () => {
    const { client, sent } = fakeServer(
      {
        [`PATCH /v1/workspaces/${workspace.id}`]: (req) => ({
          status: 200,
          body: { ...workspace, ...(req.body as object) },
        }),
      },
      { '__Host-daric_csrf': 'csrf-1' },
    );
    const updated = await client.updateWorkspace(workspace.id, { moneyDisplay: 'toman' });

    expect(updated).toEqual({ ...workspace, moneyDisplay: 'toman' });
    expect(sent[0]?.body).toEqual({ moneyDisplay: 'toman' });
    expect(sent[0]?.headers.get('x-csrf-token')).toBe('csrf-1');
  });

  it("updates the User's preferences", async () => {
    const { client, sent } = fakeServer(
      {
        'PATCH /v1/me/preferences': (req) => ({
          status: 200,
          body: { ...preferences, ...(req.body as object) },
        }),
      },
      { '__Host-daric_csrf': 'csrf-1' },
    );
    const updated = await client.updatePreferences({ digits: 'latin' });

    expect(updated).toEqual({ ...preferences, digits: 'latin' });
    expect(sent[0]?.body).toEqual({ digits: 'latin' });
    expect(sent[0]?.headers.get('x-csrf-token')).toBe('csrf-1');
  });

  describe('Accounts', () => {
    const account = {
      id: '01900000-0000-7000-8000-0000000000a1',
      name: 'Melli',
      type: 'BANK',
      class: 'ASSET',
      currency: 'IRR',
      openingBalance: '9007199254740993',
      balance: '9007199254740993',
      archived: false,
    } as const;
    const base = `/v1/workspaces/${workspace.id}/accounts`;

    it('lists them with Amounts as bigints, archived ones only when asked', async () => {
      const { client, sent } = fakeServer({
        [`GET ${base}`]: () => ({ status: 200, body: [account] }),
      });
      const [listed] = await client.listAccounts(workspace.id);
      expect(listed?.balance).toBe(9007199254740993n);
      await client.listAccounts(workspace.id, { includeArchived: true });
      expect(sent.map((r) => r.url)).toEqual([base, `${base}?includeArchived=true`]);
    });

    it('sends bigint Amounts as decimal strings', async () => {
      const { client, sent } = fakeServer(
        {
          [`POST ${base}`]: () => ({ status: 201, body: account }),
          [`PATCH ${base}/${account.id}`]: () => ({ status: 200, body: account }),
        },
        { '__Host-daric_csrf': 'csrf-1' },
      );
      const { id, balance, archived, ...input } = account;
      void balance;
      void archived;
      await client.createAccount(workspace.id, { ...input, openingBalance: 9007199254740993n });
      await client.updateAccount(workspace.id, id, { openingBalance: -5n, archived: true });
      expect(sent.map((r) => r.body)).toEqual([
        { ...input, openingBalance: '9007199254740993' },
        { openingBalance: '-5', archived: true },
      ]);
    });
  });

  describe('Categories', () => {
    const category = {
      id: '01900000-0000-7000-8000-0000000000c1',
      kind: 'EXPENSE',
      parentId: null,
      name: 'خوراک',
      icon: 'utensils',
      color: 'orange',
      position: 0,
      archived: false,
    } as const;
    const base = `/v1/workspaces/${workspace.id}/categories`;

    it('lists, creates, updates and reorders them', async () => {
      const { client, sent } = fakeServer(
        {
          [`GET ${base}`]: () => ({ status: 200, body: [category] }),
          [`POST ${base}`]: () => ({ status: 201, body: category }),
          [`PATCH ${base}/${category.id}`]: () => ({ status: 200, body: category }),
          [`PUT ${base}/order`]: () => ({ status: 200, body: [category] }),
        },
        { '__Host-daric_csrf': 'csrf-1' },
      );
      expect(await client.listCategories(workspace.id)).toEqual([category]);
      await client.listCategories(workspace.id, { includeArchived: true });
      const { id, kind, name, icon, color } = category;
      await client.createCategory(workspace.id, { kind, name, icon, color });
      await client.updateCategory(workspace.id, id, { archived: true });
      await client.reorderCategories(workspace.id, { ids: [id] });
      expect(sent.map((r) => [r.method, r.url, r.body])).toEqual([
        ['GET', base, undefined],
        ['GET', `${base}?includeArchived=true`, undefined],
        ['POST', base, { kind, name, icon, color }],
        ['PATCH', `${base}/${id}`, { archived: true }],
        ['PUT', `${base}/order`, { ids: [id] }],
      ]);
    });
  });

  it('prefixes paths with the base URL', async () => {
    const sent: string[] = [];
    const client = createApiClient({
      baseUrl: 'https://api.daric.test',
      fetch: async (input) => {
        sent.push(String(input));
        return new Response(JSON.stringify({ user, preferences, workspaces: [] }), { status: 200 });
      },
      readCookie: () => undefined,
    });
    await client.me();
    expect(sent).toEqual(['https://api.daric.test/v1/me']);
  });
});
