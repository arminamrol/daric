import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient, memoryTokenStore, transactionConflict } from './index';
import type { TokenStore } from './index';

const user = { id: '01900000-0000-7000-8000-000000000000', email: 'sara@example.com' };
const preferences = {
  locale: 'fa',
  displayCalendar: 'jalali',
  digits: 'persian',
  theme: 'system',
} as const;
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
  tokens?: TokenStore,
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
  const client = createApiClient({
    fetch,
    readCookie: (name) => cookies.get(name),
    ...(tokens && { tokens }),
  });
  return { client, sent };
}

describe('api-client', () => {
  it('sends credentials so the browser attaches the session cookies', async () => {
    const { client, sent } = fakeServer({
      'GET /v1/me': () => ({
        status: 200,
        body: { user: { ...user, emailVerified: true }, preferences, workspaces: [] },
      }),
    });
    expect(await client.me()).toEqual({
      user: { ...user, emailVerified: true },
      preferences,
      workspaces: [],
    });
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
      {
        'GET /v1/me': () => ({
          status: 200,
          body: { user: { ...user, emailVerified: true }, preferences, workspaces: [] },
        }),
      },
      { '__Host-daric_csrf': 'csrf-1' },
    );
    await client.me();
    expect(sent[0]?.headers.has('x-csrf-token')).toBe(false);
  });

  it('logs out with the CSRF header and no body: the browser sends the refresh cookie', async () => {
    const { client, sent } = fakeServer(
      { 'POST /v1/auth/logout': () => ({ status: 204 }) },
      { '__Host-daric_csrf': 'csrf-1' },
    );
    await client.logout();
    expect(sent[0]?.headers.get('x-csrf-token')).toBe('csrf-1');
    expect(sent[0]?.body).toBeUndefined();
    expect(sent[0]?.credentials).toBe('include');
  });

  it('sends the mailed-link requests with the CSRF header', async () => {
    const { client, sent } = fakeServer(
      {
        'POST /v1/auth/email/verify': () => ({ status: 204 }),
        'POST /v1/auth/email/verification': () => ({ status: 204 }),
        'POST /v1/auth/password/forgot': () => ({ status: 202 }),
        'POST /v1/auth/password/reset': () => ({ status: 204 }),
      },
      { '__Host-daric_csrf': 'csrf-1' },
    );
    await client.verifyEmail('verify-token');
    await client.resendVerification();
    await client.forgotPassword(user.email);
    await client.resetPassword({ token: 'reset-token', password: 'a new passphrase' });

    expect(sent.map((r) => [r.url, r.body])).toEqual([
      ['/v1/auth/email/verify', { token: 'verify-token' }],
      ['/v1/auth/email/verification', undefined],
      ['/v1/auth/password/forgot', { email: user.email }],
      ['/v1/auth/password/reset', { token: 'reset-token', password: 'a new passphrase' }],
    ]);
    expect(sent.every((r) => r.headers.get('x-csrf-token') === 'csrf-1')).toBe(true);
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

  it("reads the User's Subscription", async () => {
    const subscription = {
      billingEnabled: true,
      plan: 'PLUS',
      onTrial: true,
      trialEndsAt: '2026-10-28T08:00:00.000Z',
      expiresAt: '2026-10-28T08:00:00.000Z',
      entitlements: {
        signedInDevices: 3,
        shareWorkspace: true,
        aiAnalysesPerMonth: 30,
        aiAnalysesLeftThisMonth: 30,
      },
    };
    const { client } = fakeServer({
      'GET /v1/me/subscription': () => ({ status: 200, body: subscription }),
    });
    expect(await client.getSubscription()).toEqual(subscription);
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

  describe('Labels', () => {
    const label = {
      id: '01900000-0000-7000-8000-0000000000e1',
      name: 'سفر',
      controllable: true,
      archived: false,
    } as const;
    const base = `/v1/workspaces/${workspace.id}/labels`;

    it('lists, creates and updates them', async () => {
      const { client, sent } = fakeServer(
        {
          [`GET ${base}`]: () => ({ status: 200, body: [label] }),
          [`POST ${base}`]: () => ({ status: 201, body: label }),
          [`PATCH ${base}/${label.id}`]: () => ({ status: 200, body: label }),
        },
        { '__Host-daric_csrf': 'csrf-1' },
      );
      expect(await client.listLabels(workspace.id)).toEqual([label]);
      await client.listLabels(workspace.id, { includeArchived: true });
      await client.createLabel(workspace.id, { name: 'سفر', controllable: true });
      await client.updateLabel(workspace.id, label.id, { archived: true });
      expect(sent.map((r) => [r.method, r.url, r.body])).toEqual([
        ['GET', base, undefined],
        ['GET', `${base}?includeArchived=true`, undefined],
        ['POST', base, { name: 'سفر', controllable: true }],
        ['PATCH', `${base}/${label.id}`, { archived: true }],
      ]);
    });
  });

  describe('Budgets', () => {
    const budget = {
      id: '01900000-0000-7000-8000-0000000000b1',
      categoryId: '01900000-0000-7000-b000-000000000001',
      labelId: null,
      period: 'MONTHLY',
      amount: '1000',
      currency: 'IRR',
      version: 1,
      progress: {
        period: '1405-07',
        spent: '900',
        remaining: '100',
        percent: 90,
        state: 'warning',
        ratesUsed: [],
        otherCurrencyExpenses: 0,
      },
    } as const;
    const base = `/v1/workspaces/${workspace.id}/budgets`;

    it('lists them for a month with Amounts as bigints, and creates, updates and deletes them', async () => {
      const { client, sent } = fakeServer(
        {
          [`GET ${base}`]: () => ({ status: 200, body: [budget] }),
          [`POST ${base}`]: () => ({ status: 201, body: budget }),
          [`PATCH ${base}/${budget.id}`]: () => ({ status: 200, body: budget }),
          [`DELETE ${base}/${budget.id}`]: () => ({ status: 204 }),
        },
        { '__Host-daric_csrf': 'csrf-1' },
      );
      const [listed] = await client.listBudgets(workspace.id);
      expect(listed).toMatchObject({
        amount: 1000n,
        progress: { period: { kind: 'month', year: 1405, month: 7 }, remaining: 100n },
      });
      await client.listBudgets(workspace.id, { month: { kind: 'month', year: 1405, month: 6 } });
      await client.createBudget(workspace.id, {
        categoryId: budget.categoryId,
        period: 'MONTHLY',
        amount: 1000n,
      });
      await client.updateBudget(workspace.id, budget.id, { amount: 2000n });
      await client.deleteBudget(workspace.id, budget.id);
      expect(sent.map((r) => [r.method, r.url, r.body])).toEqual([
        ['GET', base, undefined],
        ['GET', `${base}?month=1405-06`, undefined],
        ['POST', base, { categoryId: budget.categoryId, period: 'MONTHLY', amount: '1000' }],
        ['PATCH', `${base}/${budget.id}`, { amount: '2000' }],
        ['DELETE', `${base}/${budget.id}`, undefined],
      ]);
    });
  });

  describe('Exchange Rates', () => {
    const rate = {
      id: '01900000-0000-7000-8000-0000000000c1',
      currency: 'USD',
      rate: '1050000.5',
      effectiveOn: '2026-10-01',
      version: 1,
    } as const;
    const base = `/v1/workspaces/${workspace.id}/exchange-rates`;

    it('lists, creates, updates and deletes them', async () => {
      const { client, sent } = fakeServer(
        {
          [`GET ${base}`]: () => ({ status: 200, body: [rate] }),
          [`POST ${base}`]: () => ({ status: 201, body: rate }),
          [`PATCH ${base}/${rate.id}`]: () => ({ status: 200, body: rate }),
          [`DELETE ${base}/${rate.id}`]: () => ({ status: 204 }),
        },
        { '__Host-daric_csrf': 'csrf-1' },
      );
      expect(await client.listExchangeRates(workspace.id)).toEqual([rate]);
      await client.createExchangeRate(workspace.id, {
        currency: 'USD',
        rate: '1050000.5',
        effectiveOn: '2026-10-01',
      });
      await client.updateExchangeRate(workspace.id, rate.id, { rate: '1060000' });
      await client.deleteExchangeRate(workspace.id, rate.id);
      expect(sent.map((r) => [r.method, r.url, r.body])).toEqual([
        ['GET', base, undefined],
        ['POST', base, { currency: 'USD', rate: '1050000.5', effectiveOn: '2026-10-01' }],
        ['PATCH', `${base}/${rate.id}`, { rate: '1060000' }],
        ['DELETE', `${base}/${rate.id}`, undefined],
      ]);
    });
  });

  describe('Valuations and Net Worth', () => {
    const accountId = '01900000-0000-7000-8000-0000000000a1';
    const valuation = {
      id: '01900000-0000-7000-8000-0000000000d1',
      accountId,
      amount: '950000000',
      valuedOn: '2026-10-01',
      version: 1,
    } as const;
    const base = `/v1/workspaces/${workspace.id}/accounts/${accountId}/valuations`;
    const netWorthPath = `/v1/workspaces/${workspace.id}/net-worth`;
    const netWorth = {
      day: '2026-10-11',
      baseCurrency: 'IRR',
      total: '950000000',
      assets: '950000000',
      liabilities: '0',
      byCurrency: [{ currency: 'IRR', assets: '950000000', liabilities: '0', net: '950000000' }],
      accounts: [
        {
          accountId,
          name: 'Gold',
          class: 'ASSET',
          currency: 'IRR',
          archived: false,
          value: '950000000',
          valuedOn: '2026-10-01',
          inBase: '950000000',
        },
      ],
      ratesUsed: [],
      missing: [],
    } as const;

    it('lists, creates, updates and deletes Valuations, and reads Net Worth with bigints', async () => {
      const { client, sent } = fakeServer(
        {
          [`GET ${base}`]: () => ({ status: 200, body: [valuation] }),
          [`POST ${base}`]: () => ({ status: 201, body: valuation }),
          [`PATCH ${base}/${valuation.id}`]: () => ({ status: 200, body: valuation }),
          [`DELETE ${base}/${valuation.id}`]: () => ({ status: 204 }),
          [`GET ${netWorthPath}`]: () => ({ status: 200, body: netWorth }),
        },
        { '__Host-daric_csrf': 'csrf-1' },
      );
      expect(await client.listValuations(workspace.id, accountId)).toEqual([
        { ...valuation, amount: 950_000_000n },
      ]);
      await client.createValuation(workspace.id, accountId, {
        amount: 950_000_000n,
        valuedOn: '2026-10-01',
      });
      await client.updateValuation(workspace.id, accountId, valuation.id, { amount: 1n });
      await client.deleteValuation(workspace.id, accountId, valuation.id);
      const read = await client.getNetWorth(workspace.id);
      expect(read.total).toBe(950_000_000n);
      expect(read.accounts[0]?.inBase).toBe(950_000_000n);
      expect(sent.map((r) => [r.method, r.url, r.body])).toEqual([
        ['GET', base, undefined],
        ['POST', base, { amount: '950000000', valuedOn: '2026-10-01' }],
        ['PATCH', `${base}/${valuation.id}`, { amount: '1' }],
        ['DELETE', `${base}/${valuation.id}`, undefined],
        ['GET', netWorthPath, undefined],
      ]);
    });
  });

  describe('Net Worth Snapshots', () => {
    const path = `/v1/workspaces/${workspace.id}/net-worth/snapshots`;
    const summary = {
      id: '01900000-0000-7000-8000-0000000000f1',
      kind: 'AUTO',
      day: '2026-09-22',
      takenAt: '2026-09-22T20:31:00.000Z',
      baseCurrency: 'IRR',
      total: '900000000',
      assets: '950000000',
      liabilities: '50000000',
      missing: [],
    } as const;
    const snapshot = {
      ...summary,
      kind: 'MANUAL',
      byCurrency: [],
      accounts: [],
      ratesUsed: [],
    } as const;

    it('lists, takes and reads snapshots with bigints', async () => {
      const { client, sent } = fakeServer(
        {
          [`GET ${path}`]: () => ({ status: 200, body: [summary] }),
          [`POST ${path}`]: () => ({ status: 201, body: snapshot }),
          [`GET ${path}/${summary.id}`]: () => ({ status: 200, body: snapshot }),
        },
        { '__Host-daric_csrf': 'csrf-1' },
      );
      expect(await client.listNetWorthSnapshots(workspace.id)).toEqual([
        { ...summary, total: 900_000_000n, assets: 950_000_000n, liabilities: 50_000_000n },
      ]);
      expect((await client.takeNetWorthSnapshot(workspace.id)).kind).toBe('MANUAL');
      expect((await client.getNetWorthSnapshot(workspace.id, summary.id)).total).toBe(900_000_000n);
      expect(sent.map((r) => [r.method, r.url])).toEqual([
        ['GET', path],
        ['POST', path],
        ['GET', `${path}/${summary.id}`],
      ]);
    });
  });

  describe('Projection', () => {
    const path = `/v1/workspaces/${workspace.id}/projection`;
    const figures = {
      actual: '4200000000',
      average: '400000000',
      variable: '2173333333',
      recurring: '1280000000',
      planned: '0',
      projected: '7653333333',
    };
    const zero = {
      actual: '0',
      average: '0',
      variable: '0',
      recurring: '0',
      planned: '0',
      projected: '0',
    };
    const projection = {
      mode: 'AUTOMATIC',
      year: 1405,
      today: '2026-10-09',
      yearEnd: '2027-03-20',
      baseCurrency: 'IRR',
      remaining: { daysLeftInMonth: 13, daysInMonth: 30, fullMonths: 5 },
      window: ['1405-04', '1405-05', '1405-06'],
      monthsUsed: 3,
      income: zero,
      expense: figures,
      categories: [
        { categoryId: '01900000-0000-7000-b000-000000000001', type: 'EXPENSE', ...figures },
      ],
      recurring: [
        {
          ruleId: '01900000-0000-7000-8000-0000000000e1',
          name: 'اجاره',
          type: 'EXPENSE',
          categoryId: '01900000-0000-7000-b000-000000000001',
          occurrences: ['2026-10-23'],
          total: '250000000',
        },
      ],
      planned: [],
      ratesUsed: [],
      missing: [],
      warnings: [{ kind: 'short_history', monthsUsed: 1, monthsWanted: 3 }],
    } as const;

    it('reads the Projection with bigints, and reads and changes its settings', async () => {
      const { client, sent } = fakeServer(
        {
          [`GET ${path}`]: () => ({ status: 200, body: projection }),
          [`GET ${path}/settings`]: () => ({
            status: 200,
            body: { trailingMonths: 3, mode: 'AUTOMATIC', version: 0 },
          }),
          [`PATCH ${path}/settings`]: () => ({
            status: 200,
            body: { trailingMonths: 6, mode: 'AUTOMATIC', version: 1 },
          }),
        },
        { '__Host-daric_csrf': 'csrf-1' },
      );
      const read = await client.getProjection(workspace.id);
      expect(read.expense.projected).toBe(7_653_333_333n);
      expect(read.categories[0]?.variable).toBe(2_173_333_333n);
      expect(read.recurring[0]?.total).toBe(250_000_000n);
      expect(read.window[0]).toEqual({ kind: 'month', year: 1405, month: 4 });
      expect(await client.getProjectionSettings(workspace.id)).toEqual({
        trailingMonths: 3,
        mode: 'AUTOMATIC',
        version: 0,
      });
      expect(await client.updateProjectionSettings(workspace.id, { trailingMonths: 6 })).toEqual({
        trailingMonths: 6,
        mode: 'AUTOMATIC',
        version: 1,
      });
      expect(sent.map((r) => [r.method, r.url, r.body])).toEqual([
        ['GET', path, undefined],
        ['GET', `${path}/settings`, undefined],
        ['PATCH', `${path}/settings`, { trailingMonths: 6 }],
      ]);
    });

    it('asks for a mode', async () => {
      const { client, sent } = fakeServer({
        [`GET ${path}`]: () => ({
          status: 200,
          body: { ...projection, mode: 'MANUAL' },
        }),
      });
      expect((await client.getProjection(workspace.id, { mode: 'MANUAL' })).mode).toBe('MANUAL');
      expect(sent.map((r) => r.url)).toEqual([`${path}?mode=MANUAL`]);
    });

    it('lists, makes, changes and deletes Planned Items', async () => {
      const item = {
        id: '01900000-0000-7000-8000-0000000000f1',
        name: 'بیمه',
        kind: 'ONE_OFF',
        type: 'EXPENSE',
        categoryId: null,
        amount: '150000000',
        currency: 'IRR',
        startOn: '2026-12-01',
        endOn: null,
        version: 1,
      } as const;
      const itemPath = `${path}/planned-items/${item.id}`;
      const { client, sent } = fakeServer(
        {
          [`GET ${path}/planned-items`]: () => ({ status: 200, body: [item] }),
          [`POST ${path}/planned-items`]: () => ({ status: 201, body: item }),
          [`PATCH ${itemPath}`]: () => ({
            status: 200,
            body: { ...item, amount: '5', version: 2 },
          }),
          [`DELETE ${itemPath}`]: () => ({ status: 204 }),
        },
        { '__Host-daric_csrf': 'csrf-1' },
      );
      const [listed] = await client.listPlannedItems(workspace.id);
      expect(listed?.amount).toBe(150_000_000n);
      await client.createPlannedItem(workspace.id, {
        name: 'بیمه',
        kind: 'ONE_OFF',
        type: 'EXPENSE',
        amount: 150_000_000n,
        startOn: '2026-12-01',
      });
      expect((await client.updatePlannedItem(workspace.id, item.id, { amount: 5n })).amount).toBe(
        5n,
      );
      await client.deletePlannedItem(workspace.id, item.id);
      expect(sent.map((r) => [r.method, r.url, r.body])).toEqual([
        ['GET', `${path}/planned-items`, undefined],
        [
          'POST',
          `${path}/planned-items`,
          {
            name: 'بیمه',
            kind: 'ONE_OFF',
            type: 'EXPENSE',
            amount: '150000000',
            startOn: '2026-12-01',
          },
        ],
        ['PATCH', itemPath, { amount: '5' }],
        ['DELETE', itemPath, undefined],
      ]);
    });
  });

  describe('Reports', () => {
    const path = `/v1/workspaces/${workspace.id}/reports`;
    const report = {
      period: '1405-07',
      from: '2026-09-23',
      to: '2026-10-22',
      rateDay: '2026-10-09',
      baseCurrency: 'IRR',
      income: '5000',
      expense: '7000',
      net: '-2000',
      categories: [
        {
          categoryId: '01900000-0000-7000-8000-0000000000c1',
          type: 'EXPENSE',
          total: '7000',
          own: '7000',
          share: 100,
          children: [],
        },
      ],
      labels: [],
      unlabeled: { income: '5000', expense: '7000' },
      ratesUsed: [],
      missing: [],
      trend: [{ month: '1405-07', income: '5000', expense: '7000', net: '-2000', missing: [] }],
      controllable: {
        expense: '1500',
        share: 21,
        labels: [{ labelId: '01900000-0000-7000-8000-0000000000d1', expense: '1500', share: 100 }],
        trend: [{ month: '1405-07', expense: '1500', missing: [] }],
        monthlyAverage: '1500',
        monthsAveraged: 1,
        averageRunning: true,
      },
    };

    it('reads a Period’s report with amounts as bigints and periods parsed', async () => {
      const { client, sent } = fakeServer({
        [`GET ${path}`]: (req) => ({
          status: 200,
          body: req.url.endsWith('?period=1405') ? { ...report, period: '1405' } : report,
        }),
      });
      const read = await client.getReport(workspace.id);
      expect(read.net).toBe(-2000n);
      expect(read.period).toEqual({ kind: 'month', year: 1405, month: 7 });
      expect(read.trend[0]?.month).toEqual({ kind: 'month', year: 1405, month: 7 });
      expect(read.categories[0]?.total).toBe(7000n);
      expect(read.controllable.monthlyAverage).toBe(1500n);
      expect(read.controllable.trend[0]?.month).toEqual({ kind: 'month', year: 1405, month: 7 });
      const year = await client.getReport(workspace.id, { period: { kind: 'year', year: 1405 } });
      expect(year.period).toEqual({ kind: 'year', year: 1405 });
      expect(sent.map((r) => r.url)).toEqual([path, `${path}?period=1405`]);
    });
  });

  describe('Recurring Rules', () => {
    const rule = {
      id: '01900000-0000-7000-8000-0000000000e1',
      name: 'اجاره',
      type: 'EXPENSE',
      accountId: '01900000-0000-7000-8000-0000000000a1',
      categoryId: '01900000-0000-7000-b000-000000000001',
      amount: '250000000',
      frequency: 'MONTHLY',
      interval: 1,
      startOn: '2026-09-23',
      endOn: null,
      autoPost: false,
      archived: false,
      nextDueOn: '2026-10-23',
      version: 1,
    } as const;
    const transaction = {
      id: '0199d0f0-0000-7000-8000-000000000001',
      type: 'EXPENSE',
      accountId: rule.accountId,
      categoryId: rule.categoryId,
      amount: '260000000',
      occurredOn: '2026-09-23',
      note: 'اجاره',
      createdBy: null,
      labelIds: [],
      version: 1,
    };
    const base = `/v1/workspaces/${workspace.id}/recurring`;
    const occurrence = `${base}/${rule.id}/occurrences/2026-09-23`;

    it('lists, makes and changes rules, and confirms and skips Due Occurrences', async () => {
      const { client, sent } = fakeServer(
        {
          [`GET ${base}`]: () => ({ status: 200, body: [rule] }),
          [`POST ${base}`]: () => ({ status: 201, body: rule }),
          [`PATCH ${base}/${rule.id}`]: () => ({ status: 200, body: rule }),
          [`GET ${base}/due`]: () => ({
            status: 200,
            body: {
              occurrences: [{ ...rule, ruleId: rule.id, dueOn: '2026-09-23' }].map(
                ({ ruleId, dueOn, name, type, accountId, categoryId, amount }) => ({
                  ruleId,
                  dueOn,
                  name,
                  type,
                  accountId,
                  categoryId,
                  amount,
                }),
              ),
              autoPosted: 1,
            },
          }),
          [`POST ${occurrence}/confirm`]: () => ({ status: 201, body: transaction }),
          [`POST ${occurrence}/skip`]: () => ({ status: 204 }),
        },
        { '__Host-daric_csrf': 'csrf-1' },
      );
      const [listed] = await client.listRecurringRules(workspace.id);
      expect(listed).toMatchObject({ amount: 250000000n, nextDueOn: '2026-10-23' });
      await client.listRecurringRules(workspace.id, { includeArchived: true });
      await client.createRecurringRule(workspace.id, {
        name: 'اجاره',
        type: 'EXPENSE',
        accountId: rule.accountId,
        categoryId: rule.categoryId,
        amount: 250000000n,
        frequency: 'MONTHLY',
        startOn: '2026-09-23',
      });
      await client.updateRecurringRule(workspace.id, rule.id, { archived: true });
      const due = await client.listDueOccurrences(workspace.id);
      expect(due).toMatchObject({ occurrences: [{ amount: 250000000n }], autoPosted: 1 });
      const confirmed = await client.confirmOccurrence(workspace.id, rule.id, '2026-09-23', {
        amount: 260000000n,
      });
      expect(confirmed.amount).toBe(260000000n);
      await client.skipOccurrence(workspace.id, rule.id, '2026-09-23');
      expect(sent.map((r) => [r.method, r.url, r.body])).toEqual([
        ['GET', base, undefined],
        ['GET', `${base}?includeArchived=true`, undefined],
        [
          'POST',
          base,
          {
            name: 'اجاره',
            type: 'EXPENSE',
            accountId: rule.accountId,
            categoryId: rule.categoryId,
            amount: '250000000',
            frequency: 'MONTHLY',
            startOn: '2026-09-23',
          },
        ],
        ['PATCH', `${base}/${rule.id}`, { archived: true }],
        ['GET', `${base}/due`, undefined],
        ['POST', `${occurrence}/confirm`, { amount: '260000000' }],
        ['POST', `${occurrence}/skip`, undefined],
      ]);
    });
  });

  describe('Transactions', () => {
    const transaction = {
      id: '0199d0f0-0000-7000-8000-000000000001',
      type: 'EXPENSE',
      accountId: '01900000-0000-7000-8000-0000000000a1',
      categoryId: '01900000-0000-7000-8000-0000000000c1',
      amount: '9007199254740993',
      occurredOn: '2026-10-10',
      note: null,
      createdBy: user.id,
      labelIds: ['01900000-0000-7000-8000-0000000000e1'],
      version: 1,
    } as const;
    const base = `/v1/workspaces/${workspace.id}/transactions`;
    const labelId = transaction.labelIds[0];

    it('lists them with filters, Amounts as bigints', async () => {
      const { client, sent } = fakeServer({
        [`GET ${base}`]: () => ({ status: 200, body: [transaction] }),
      });
      const [listed] = await client.listTransactions(workspace.id);
      expect(listed?.amount).toBe(9007199254740993n);
      await client.listTransactions(workspace.id, {
        period: { kind: 'month', year: 1405, month: 7 },
        accountId: transaction.accountId,
        categoryId: transaction.categoryId,
        labelId,
      });
      expect(sent.map((r) => r.url)).toEqual([
        base,
        `${base}?period=1405-07&accountId=${transaction.accountId}&categoryId=${transaction.categoryId}&labelId=${labelId}`,
      ]);
    });

    it('attaches and detaches a Label', async () => {
      const path = `${base}/${transaction.id}/labels/${labelId}`;
      const { client, sent } = fakeServer(
        {
          [`PUT ${path}`]: () => ({ status: 200, body: transaction }),
          [`DELETE ${path}`]: () => ({ status: 200, body: { ...transaction, labelIds: [] } }),
        },
        { '__Host-daric_csrf': 'csrf-1' },
      );
      expect((await client.attachLabel(workspace.id, transaction.id, labelId)).labelIds).toEqual([
        labelId,
      ]);
      expect((await client.detachLabel(workspace.id, transaction.id, labelId)).labelIds).toEqual(
        [],
      );
      expect(sent.map((r) => [r.method, r.url])).toEqual([
        ['PUT', path],
        ['DELETE', path],
      ]);
    });

    it('records one with its client-made id and the Amount as a decimal string', async () => {
      const { client, sent } = fakeServer(
        { [`POST ${base}`]: () => ({ status: 201, body: transaction }) },
        { '__Host-daric_csrf': 'csrf-1' },
      );
      const { createdBy, version, ...input } = transaction;
      void createdBy;
      void version;
      const recorded = await client.createTransaction(workspace.id, {
        ...input,
        labelIds: [...input.labelIds],
        amount: 9007199254740993n,
      });
      expect(recorded.id).toBe(transaction.id);
      expect(sent[0]?.body).toEqual(input);
    });

    it('reads, edits, deletes and restores one', async () => {
      const path = `${base}/${transaction.id}`;
      const { client, sent } = fakeServer(
        {
          [`GET ${path}`]: () => ({ status: 200, body: transaction }),
          [`PUT ${path}`]: () => ({ status: 200, body: { ...transaction, version: 2 } }),
          [`DELETE ${path}`]: () => ({ status: 204 }),
          [`POST ${path}/restore`]: () => ({ status: 200, body: { ...transaction, version: 4 } }),
        },
        { '__Host-daric_csrf': 'csrf-1' },
      );
      const { id, createdBy, labelIds, ...input } = transaction;
      void id;
      void createdBy;
      void labelIds;
      expect((await client.getTransaction(workspace.id, transaction.id)).amount).toBe(
        9007199254740993n,
      );
      const edited = await client.updateTransaction(workspace.id, transaction.id, {
        ...input,
        amount: 1n,
      });
      expect(edited.version).toBe(2);
      expect(await client.deleteTransaction(workspace.id, transaction.id)).toBeUndefined();
      expect((await client.restoreTransaction(workspace.id, transaction.id)).version).toBe(4);
      expect(sent.map((r) => [r.method, r.url, r.body])).toEqual([
        ['GET', path, undefined],
        ['PUT', path, { ...input, amount: '1' }],
        ['DELETE', path, undefined],
        ['POST', `${path}/restore`, undefined],
      ]);
    });

    it('reads the current copy out of a stale edit', async () => {
      const current = { ...transaction, amount: '5', version: 3 };
      const { client } = fakeServer(
        {
          [`PUT ${base}/${transaction.id}`]: () => ({
            status: 409,
            body: { statusCode: 409, message: 'stale', transaction: current },
          }),
        },
        { '__Host-daric_csrf': 'csrf-1' },
      );
      const { id, createdBy, labelIds, ...input } = transaction;
      void id;
      void createdBy;
      void labelIds;
      const error = await client
        .updateTransaction(workspace.id, transaction.id, { ...input, amount: 1n })
        .catch((e: unknown) => e);
      expect(transactionConflict(error)).toMatchObject({ amount: 5n, version: 3 });
      expect(transactionConflict(new ApiError(409, { message: 'id taken' }))).toBeUndefined();
      expect(transactionConflict(new Error('offline'))).toBeUndefined();
    });
  });

  describe('exportWorkspace', () => {
    it('downloads the export as a file named by the server', async () => {
      const sent: { url: string; init: RequestInit | undefined }[] = [];
      const client = createApiClient({
        fetch: async (input, init) => {
          sent.push({ url: String(input), init });
          return new Response(new Uint8Array([80, 75, 3, 4]), {
            status: 200,
            headers: {
              'content-type': 'application/zip',
              'content-disposition': 'attachment; filename="daric-export-2026-10-11.zip"',
            },
          });
        },
        readCookie: () => undefined,
      });

      const file = await client.exportWorkspace(workspace.id, 'csv');

      expect(sent[0]?.url).toBe(`/v1/workspaces/${workspace.id}/export?format=csv`);
      expect(sent[0]?.init?.credentials).toBe('include');
      expect(file.fileName).toBe('daric-export-2026-10-11.zip');
      expect(file.blob.type).toBe('application/zip');
      expect(new Uint8Array(await file.blob.arrayBuffer())).toEqual(new Uint8Array([80, 75, 3, 4]));
    });

    it('fails with the API error when the export is refused', async () => {
      const { client } = fakeServer({
        [`GET /v1/workspaces/${workspace.id}/export`]: () => ({
          status: 403,
          body: { message: 'Forbidden' },
        }),
      });
      const error = await client.exportWorkspace(workspace.id, 'json').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 403, body: { message: 'Forbidden' } });
    });
  });

  it('prefixes paths with the base URL', async () => {
    const sent: string[] = [];
    const client = createApiClient({
      baseUrl: 'https://api.daric.test',
      fetch: async (input) => {
        sent.push(String(input));
        return new Response(
          JSON.stringify({ user: { ...user, emailVerified: true }, preferences, workspaces: [] }),
          { status: 200 },
        );
      },
      readCookie: () => undefined,
    });
    await client.me();
    expect(sent).toEqual(['https://api.daric.test/v1/me']);
  });
  describe('with a token store (the mobile app)', () => {
    const me = { user: { ...user, emailVerified: true }, preferences, workspaces: [] };
    const signedIn = { ...session, accessToken: 'access-1', refreshToken: 'refresh-1' };

    function mobile(
      routes: Parameters<typeof fakeServer>[0],
      /** Null: signed out. */
      start: { accessToken: string; refreshToken: string } | null = {
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
      },
    ) {
      const tokens = memoryTokenStore(start ?? undefined);
      return { ...fakeServer(routes, {}, tokens), tokens };
    }

    it('sends the access token as a bearer header and identifies as the mobile app, without cookies or CSRF', async () => {
      const { client, sent } = mobile({
        'GET /v1/me': () => ({ status: 200, body: me }),
        [`PATCH /v1/workspaces/${workspace.id}`]: () => ({ status: 200, body: workspace }),
      });
      await client.me();
      await client.updateWorkspace(workspace.id, { name: 'Home' });
      expect(sent.map((r) => r.url)).toEqual(['/v1/me', `/v1/workspaces/${workspace.id}`]);
      for (const req of sent) {
        expect(req.headers.get('authorization')).toBe('Bearer access-1');
        expect(req.headers.get('x-daric-client')).toBe('mobile');
        expect(req.headers.has('x-csrf-token')).toBe(false);
        expect(req.credentials).toBe('omit');
      }
    });

    it('keeps the tokens a login hands out, and returns the session without them', async () => {
      const { client, tokens } = mobile(
        { 'POST /v1/auth/login': () => ({ status: 200, body: signedIn }) },
        null,
      );
      expect(await client.login({ email: user.email, password: 'secret password' })).toEqual(
        session,
      );
      expect(await tokens.read()).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    });

    it('keeps the tokens a sign-up hands out', async () => {
      const { client, tokens } = mobile(
        { 'POST /v1/auth/register': () => ({ status: 201, body: signedIn }) },
        null,
      );
      await client.register({ email: user.email, password: 'secret password' });
      expect(await tokens.read()).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    });

    it('sends no Authorization header while signed out', async () => {
      const { client, sent } = mobile({ 'GET /v1/me': () => ({ status: 401 }) }, null);
      await expect(client.me()).rejects.toMatchObject({ status: 401 });
      expect(sent).toHaveLength(1);
      expect(sent[0]?.headers.has('authorization')).toBe(false);
    });

    it('refreshes an expired access token once and repeats the request with the new one', async () => {
      const { client, sent, tokens } = mobile({
        'GET /v1/me': (req) =>
          req.headers.get('authorization') === 'Bearer access-2'
            ? { status: 200, body: me }
            : { status: 401 },
        'POST /v1/auth/refresh': () => ({
          status: 200,
          body: { ...signedIn, accessToken: 'access-2', refreshToken: 'refresh-2' },
        }),
      });
      expect(await client.me()).toEqual(me);
      expect(sent.map((r) => [r.method, r.url, r.body])).toEqual([
        ['GET', '/v1/me', undefined],
        ['POST', '/v1/auth/refresh', { refreshToken: 'refresh-1' }],
        ['GET', '/v1/me', undefined],
      ]);
      expect(sent[1]?.headers.has('authorization')).toBe(false);
      expect(await tokens.read()).toEqual({ accessToken: 'access-2', refreshToken: 'refresh-2' });
    });

    it('refreshes once for requests that fail together: a refresh token is good for one use', async () => {
      const { client, sent } = mobile({
        'GET /v1/me': (req) =>
          req.headers.get('authorization') === 'Bearer access-2'
            ? { status: 200, body: me }
            : { status: 401 },
        'POST /v1/auth/refresh': () => ({
          status: 200,
          body: { ...signedIn, accessToken: 'access-2', refreshToken: 'refresh-2' },
        }),
      });
      await Promise.all([client.me(), client.me(), client.me()]);
      expect(sent.filter((r) => r.url === '/v1/auth/refresh')).toHaveLength(1);
    });

    it('forgets the tokens when the refresh token is refused, and fails with the first 401', async () => {
      const { client, sent, tokens } = mobile({
        'GET /v1/me': () => ({ status: 401, body: { message: 'expired' } }),
        'POST /v1/auth/refresh': () => ({ status: 401 }),
      });
      const error = await client.me().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 401, body: { message: 'expired' } });
      expect(sent).toHaveLength(2);
      expect(await tokens.read()).toBeUndefined();
    });

    it('keeps the tokens when the refresh fails for another reason, so a later request tries again', async () => {
      const { client, tokens } = mobile({
        'GET /v1/me': () => ({ status: 401 }),
        'POST /v1/auth/refresh': () => ({ status: 503 }),
      });
      await expect(client.me()).rejects.toMatchObject({ status: 401 });
      expect(await tokens.read()).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    });

    it('does not refresh after a failed login', async () => {
      const { client, sent } = mobile(
        { 'POST /v1/auth/login': () => ({ status: 401 }) },
        { accessToken: 'stale', refreshToken: 'refresh-1' },
      );
      await expect(
        client.login({ email: user.email, password: 'wrong password' }),
      ).rejects.toMatchObject({ status: 401 });
      expect(sent.map((r) => r.url)).toEqual(['/v1/auth/login']);
      expect(sent[0]?.headers.has('authorization')).toBe(false);
    });

    it('logs out with the refresh token in the body and forgets the tokens', async () => {
      const { client, sent, tokens } = mobile({ 'POST /v1/auth/logout': () => ({ status: 204 }) });
      await client.logout();
      expect(sent[0]?.body).toEqual({ refreshToken: 'refresh-1' });
      expect(await tokens.read()).toBeUndefined();
    });

    it('forgets the tokens on logout even when the API cannot be reached', async () => {
      const tokens = memoryTokenStore({ accessToken: 'access-1', refreshToken: 'refresh-1' });
      const client = createApiClient({
        fetch: () => Promise.reject(new TypeError('Network request failed')),
        tokens,
      });
      await expect(client.logout()).rejects.toThrow('Network request failed');
      expect(await tokens.read()).toBeUndefined();
    });

    it('downloads an export with the bearer header', async () => {
      const { client, sent } = mobile({
        [`GET /v1/workspaces/${workspace.id}/export`]: () => ({ status: 200, body: {} }),
      });
      await client.exportWorkspace(workspace.id, 'json');
      expect(sent[0]?.headers.get('authorization')).toBe('Bearer access-1');
      expect(sent[0]?.headers.get('x-daric-client')).toBe('mobile');
    });
  });
});
