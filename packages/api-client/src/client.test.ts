import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient, transactionConflict } from './index';

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
