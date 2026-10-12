import { todayIn } from '@daric/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { workspaceMembers } from '../../db/schema';
import { call, registerUser, startTestApp, type TestApp } from '../../test/app';
import { testDatabase } from '../../test/db';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

type User = Awaited<ReturnType<typeof registerUser>>;

const account = (name: string, currency: string, openingBalance: string, cls = 'ASSET') => ({
  name,
  type: cls === 'ASSET' ? 'BANK' : 'LOAN',
  class: cls,
  currency,
  openingBalance,
});

function client(t: TestApp, user: User, workspaceId = user.workspaceId) {
  const base = `/v1/workspaces/${workspaceId}`;
  const as = (method: string, path: string, body?: unknown) =>
    call(t.url, method, `${base}${path}`, { token: user.token, body });
  return {
    netWorth: () => as('GET', '/net-worth'),
    account: async (body: unknown) => (await as('POST', '/accounts', body)).body,
    archive: (id: string) => as('PATCH', `/accounts/${id}`, { archived: true }),
    value: (id: string, amount: string, valuedOn: string) =>
      as('POST', `/accounts/${id}/valuations`, { amount, valuedOn }),
    rate: (currency: string, rate: string, effectiveOn: string) =>
      as('POST', '/exchange-rates', { currency, rate, effectiveOn }),
    transfer: (accountId: string, toAccountId: string, amount: string) =>
      as('POST', '/transactions', {
        type: 'TRANSFER',
        accountId,
        toAccountId,
        amount,
        occurredOn: '2026-01-05',
      }),
  };
}

describe('Net Worth', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.close());

  async function setUp() {
    const user = await registerUser(t.url);
    return { user, api: client(t, user) };
  }

  it('is zero in the Base Currency for a new Workspace, on today in its timezone', async () => {
    const { api } = await setUp();
    const res = await api.netWorth();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      day: todayIn(new Date(), 'Asia/Tehran'),
      baseCurrency: 'IRR',
      total: '0',
      assets: '0',
      liabilities: '0',
      byCurrency: [],
      accounts: [],
      ratesUsed: [],
      missing: [],
    });
  });

  it('subtracts Liabilities from Assets across currencies, taking Valuations over balances', async () => {
    const { api } = await setUp();
    const bank = await api.account(account('Melli', 'IRR', '80000000'));
    const loan = await api.account(account('Loan', 'IRR', '30000000', 'LIABILITY'));
    const savings = await api.account(account('Savings', 'USD', '10000'));
    const gold = await api.account({ ...account('Gold', 'EUR', '0'), type: 'OTHER_ASSET' });
    const car = await api.account({ ...account('Car', 'IRR', '0'), type: 'OTHER_ASSET' });
    // The car's balance becomes 5,000,000 but its Valuation counts instead.
    expect((await api.transfer(bank.id, car.id, '5000000')).status).toBe(201);
    await api.value(car.id, '400000000', '2026-01-01');
    await api.value(car.id, '450000000', '2026-02-01');
    // A Valuation dated after today does not count yet.
    await api.value(car.id, '1', '2999-01-01');
    await api.value(gold.id, '20000', '2026-01-01');
    await api.rate('USD', '1000000', '2026-01-01');

    const { body } = await api.netWorth();
    // 75,000,000 + 450,000,000 + 100 USD at 1,000,000 − 30,000,000; the EUR has no rate.
    expect(body).toMatchObject({
      total: '595000000',
      assets: '625000000',
      liabilities: '30000000',
      ratesUsed: [{ currency: 'USD', rate: '1000000', effectiveOn: '2026-01-01' }],
      missing: ['EUR'],
      byCurrency: [
        { currency: 'EUR', assets: '20000', liabilities: '0', net: '20000' },
        { currency: 'IRR', assets: '525000000', liabilities: '30000000', net: '495000000' },
        { currency: 'USD', assets: '10000', liabilities: '0', net: '10000' },
      ],
    });
    expect(body.accounts).toEqual([
      {
        accountId: bank.id,
        name: 'Melli',
        class: 'ASSET',
        currency: 'IRR',
        archived: false,
        value: '75000000',
        valuedOn: null,
        inBase: '75000000',
      },
      expect.objectContaining({ accountId: loan.id, value: '30000000', inBase: '30000000' }),
      expect.objectContaining({ accountId: savings.id, value: '10000', inBase: '100000000' }),
      expect.objectContaining({
        accountId: gold.id,
        value: '20000',
        valuedOn: '2026-01-01',
        inBase: null,
      }),
      expect.objectContaining({ accountId: car.id, value: '450000000', valuedOn: '2026-02-01' }),
    ]);
  });

  it('counts archived Accounts, marked as such', async () => {
    const { api } = await setUp();
    const old = await api.account(account('Old', 'IRR', '7'));
    await api.archive(old.id);
    const { body } = await api.netWorth();
    expect(body.total).toBe('7');
    expect(body.accounts).toEqual([expect.objectContaining({ accountId: old.id, archived: true })]);
  });

  it('is seen by every Member, Viewers too', async () => {
    const { user, api } = await setUp();
    await api.account(account('Melli', 'IRR', '5'));
    const viewer = await registerUser(t.url);
    await db
      .insert(workspaceMembers)
      .values({ workspaceId: user.workspaceId, userId: viewer.userId, role: 'VIEWER' });
    const res = await client(t, viewer, user.workspaceId).netWorth();
    expect(res.status).toBe(200);
    expect(res.body.total).toBe('5');
  });

  it("answer 404 for another Workspace's Net Worth", async () => {
    const a = await setUp();
    const b = await setUp();
    expect((await client(t, a.user, b.user.workspaceId).netWorth()).status).toBe(404);
  });
});
