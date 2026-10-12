import { dayOf, monthPeriodOfDay, periodParam, todayIn } from '@daric/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { workspaceMembers } from '../../db/schema';
import { call, registerUser, startTestApp, type TestApp } from '../../test/app';
import { testDatabase } from '../../test/db';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

const melli = { name: 'Melli', type: 'BANK', class: 'ASSET', currency: 'IRR', openingBalance: '0' };
const dollars = { ...melli, name: 'Dollars', type: 'CASH', currency: 'USD' };
const euros = { ...melli, name: 'Euros', type: 'CASH', currency: 'EUR' };
const food = { kind: 'EXPENSE', name: 'Food', icon: 'utensils', color: 'orange' };
const rent = { kind: 'EXPENSE', name: 'Rent', icon: 'key', color: 'brown' };
const salary = { kind: 'INCOME', name: 'Salary', icon: 'briefcase', color: 'green' };

const j = (year: number, month: number, day: number) => dayOf('jalali', { year, month, day });

type User = Awaited<ReturnType<typeof registerUser>>;

function client(t: TestApp, user: User, workspaceId = user.workspaceId) {
  const base = `/v1/workspaces/${workspaceId}`;
  const as = (method: string, path: string, body?: unknown) =>
    call(t.url, method, `${base}${path}`, { token: user.token, body });
  async function created(path: string, body: unknown): Promise<{ id: string }> {
    const res = await as('POST', path, body);
    expect(res.status).toBe(201);
    return res.body;
  }
  return {
    report: (period?: string) => as('GET', `/reports${period ? `?period=${period}` : ''}`),
    account: (body: unknown = melli) => created('/accounts', body),
    category: (body: unknown = food) => created('/categories', body),
    label: (name: string, controllable = false) => created('/labels', { name, controllable }),
    rate: (body: unknown) => created('/exchange-rates', body),
    record: (fields: {
      type?: string;
      accountId: string;
      categoryId: string;
      amount: string;
      occurredOn: string;
      labelIds?: string[];
    }) => created('/transactions', { type: 'EXPENSE', ...fields }),
    transfer: (accountId: string, toAccountId: string, occurredOn: string) =>
      created('/transactions', {
        type: 'TRANSFER',
        accountId,
        toAccountId,
        amount: '900',
        toAmount: '900',
        occurredOn,
      }),
  };
}

/** The twelve months up to `last`, as `1405-06`. */
function twelveMonthsTo(year: number, month: number): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const index = year * 12 + month - 1 - (11 - i);
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
  });
}

describe('Reports', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.close());

  async function setUp() {
    const user = await registerUser(t.url);
    return { user, api: client(t, user) };
  }

  it('report the current month by default, all zero in a new Workspace', async () => {
    const { api } = await setUp();
    const res = await api.report();
    expect(res.status).toBe(200);
    const month = monthPeriodOfDay(todayIn(new Date(), 'Asia/Tehran'), 'jalali');
    expect(res.body).toMatchObject({
      period: periodParam(month),
      baseCurrency: 'IRR',
      income: '0',
      expense: '0',
      net: '0',
      categories: [],
      labels: [],
      unlabeled: { income: '0', expense: '0' },
      ratesUsed: [],
      missing: [],
    });
    expect(res.body.trend).toHaveLength(12);
    expect(res.body.trend.at(-1)).toEqual({
      month: periodParam(month),
      income: '0',
      expense: '0',
      net: '0',
      missing: [],
    });
  });

  it('break a closed month down by Category and Label in the Base Currency, without Transfers', async () => {
    const { api } = await setUp();
    const account = await api.account();
    const savings = await api.account({ ...melli, name: 'Savings' });
    const usd = await api.account(dollars);
    const eur = await api.account(euros);
    const parent = await api.category(food);
    const groceries = await api.category({ ...food, name: 'Groceries', parentId: parent.id });
    const home = await api.category(rent);
    const pay = await api.category(salary);
    const out = await api.label('Eating out');
    await api.rate({ currency: 'USD', rate: '1000', effectiveOn: j(1405, 6, 1) });

    const day = j(1405, 6, 10);
    await api.record({
      accountId: account.id,
      categoryId: parent.id,
      amount: '100',
      occurredOn: day,
    });
    await api.record({
      accountId: account.id,
      categoryId: groceries.id,
      amount: '300',
      occurredOn: day,
      labelIds: [out.id],
    });
    // Two dollars at 1,000 rials each.
    await api.record({ accountId: usd.id, categoryId: home.id, amount: '200', occurredOn: day });
    // Euros have no rate: left out and flagged.
    await api.record({ accountId: eur.id, categoryId: home.id, amount: '500', occurredOn: day });
    await api.record({
      type: 'INCOME',
      accountId: account.id,
      categoryId: pay.id,
      amount: '5000',
      occurredOn: j(1405, 6, 25),
    });
    await api.transfer(account.id, savings.id, day);
    // Outside the month: only the trend counts them.
    await api.record({
      accountId: account.id,
      categoryId: home.id,
      amount: '700',
      occurredOn: j(1405, 5, 31),
    });
    await api.record({
      accountId: account.id,
      categoryId: home.id,
      amount: '800',
      occurredOn: j(1405, 7, 1),
    });

    const res = await api.report('1405-06');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      period: '1405-06',
      from: j(1405, 6, 1),
      to: j(1405, 6, 31),
      rateDay: j(1405, 6, 31),
      baseCurrency: 'IRR',
      income: '5000',
      expense: '2400',
      net: '2600',
      categories: [
        {
          categoryId: pay.id,
          type: 'INCOME',
          total: '5000',
          own: '5000',
          share: 100,
          children: [],
        },
        {
          categoryId: home.id,
          type: 'EXPENSE',
          total: '2000',
          own: '2000',
          share: 83,
          children: [],
        },
        {
          categoryId: parent.id,
          type: 'EXPENSE',
          total: '400',
          own: '100',
          share: 17,
          children: [{ categoryId: groceries.id, total: '300', share: 13 }],
        },
      ],
      labels: [{ labelId: out.id, income: '0', expense: '300', incomeShare: 0, expenseShare: 13 }],
      unlabeled: { income: '5000', expense: '2100' },
      ratesUsed: [{ currency: 'USD', rate: '1000', effectiveOn: j(1405, 6, 1) }],
      missing: ['EUR'],
      trend: twelveMonthsTo(1405, 6).map((month) => ({
        month,
        ...(month === '1405-06'
          ? { income: '5000', expense: '2400', net: '2600', missing: ['EUR'] }
          : month === '1405-05'
            ? { income: '0', expense: '700', net: '-700', missing: [] }
            : { income: '0', expense: '0', net: '0', missing: [] }),
      })),
      controllable: {
        expense: '0',
        share: 0,
        labels: [],
        trend: twelveMonthsTo(1405, 6).map((month) => ({ month, expense: '0', missing: [] })),
        monthlyAverage: '0',
        monthsAveraged: 0,
        averageRunning: false,
      },
    });
  });

  it('sum up spending under Controllable Labels, its trend and average month', async () => {
    const { api } = await setUp();
    const account = await api.account();
    const category = await api.category();
    const out = await api.label('Eating out', true);
    const subs = await api.label('Subscriptions', true);
    const trip = await api.label('Trip');
    const record = (amount: string, occurredOn: string, labelIds: string[]) =>
      api.record({ accountId: account.id, categoryId: category.id, amount, occurredOn, labelIds });
    await record('300', j(1405, 5, 10), [out.id]);
    // Two Controllable Labels: counted once in the total, under each in the breakdown.
    await record('100', j(1405, 6, 10), [out.id, subs.id]);
    await record('50', j(1405, 6, 11), [subs.id, trip.id]);
    await record('850', j(1405, 6, 12), [trip.id]);

    const res = await api.report('1405-06');
    expect(res.status).toBe(200);
    expect(res.body.controllable).toEqual({
      expense: '150',
      share: 15,
      labels: [
        { labelId: subs.id, expense: '150', share: 100 },
        { labelId: out.id, expense: '100', share: 67 },
      ],
      trend: twelveMonthsTo(1405, 6).map((month) => ({
        month,
        expense: month === '1405-05' ? '300' : month === '1405-06' ? '150' : '0',
        missing: [],
      })),
      monthlyAverage: '225',
      monthsAveraged: 2,
      averageRunning: false,
    });
  });

  it('report a whole year, its trend being its months', async () => {
    const { api } = await setUp();
    const account = await api.account();
    const category = await api.category();
    await api.record({
      accountId: account.id,
      categoryId: category.id,
      amount: '10',
      occurredOn: j(1404, 1, 1),
    });
    await api.record({
      accountId: account.id,
      categoryId: category.id,
      amount: '20',
      occurredOn: j(1404, 12, 29),
    });
    await api.record({
      accountId: account.id,
      categoryId: category.id,
      amount: '40',
      occurredOn: j(1405, 1, 1),
    });

    const res = await api.report('1404');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      period: '1404',
      from: j(1404, 1, 1),
      to: j(1404, 12, 29),
      expense: '30',
    });
    expect(res.body.trend.map((p: { month: string }) => p.month)).toEqual(twelveMonthsTo(1404, 12));
  });

  it('refuse a period that is neither a month nor a year', async () => {
    const { api } = await setUp();
    for (const period of ['1405-13', '05', 'soon']) {
      expect((await api.report(period)).status).toBe(400);
    }
  });

  it('show to every Member, Viewers too, and to no one outside the Workspace', async () => {
    const a = await setUp();
    const b = await setUp();
    const viewer = await registerUser(t.url);
    await db
      .insert(workspaceMembers)
      .values({ workspaceId: a.user.workspaceId, userId: viewer.userId, role: 'VIEWER' });
    const account = await a.api.account();
    const category = await a.api.category();
    await a.api.record({
      accountId: account.id,
      categoryId: category.id,
      amount: '10',
      occurredOn: j(1405, 6, 1),
    });

    const asViewer = await client(t, viewer, a.user.workspaceId).report('1405-06');
    expect(asViewer.status).toBe(200);
    expect(asViewer.body.expense).toBe('10');
    expect((await client(t, b.user, a.user.workspaceId).report('1405-06')).status).toBe(404);
    expect((await b.api.report('1405-06')).body.expense).toBe('0');
  });
});
