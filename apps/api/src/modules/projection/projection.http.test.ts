import {
  addDays,
  dayOf,
  IRR,
  money,
  monthPeriodOfDay,
  periodDays,
  periodParam,
  previousPeriod,
  projectYear,
  todayIn,
} from '@daric/core';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLogs, workspaceMembers } from '../../db/schema';
import { call, registerUser, startTestApp, type TestApp } from '../../test/app';
import { testDatabase } from '../../test/db';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

const melli = { name: 'Melli', type: 'BANK', class: 'ASSET', currency: 'IRR', openingBalance: '0' };
const dollars = { ...melli, name: 'Dollars', type: 'CASH', currency: 'USD' };
const food = { kind: 'EXPENSE', name: 'Food', icon: 'utensils', color: 'orange' };
const rent = { kind: 'EXPENSE', name: 'Rent', icon: 'key', color: 'brown' };

// New Workspaces use the Jalali calendar in Asia/Tehran; the Projection runs on the real today.
const today = () => todayIn(new Date(), 'Asia/Tehran');
const thisMonth = () => monthPeriodOfDay(today(), 'jalali');
const firstOf = (month: { year: number; month: number }) =>
  dayOf('jalali', { year: month.year, month: month.month, day: 1 });

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
    projection: () => as('GET', '/projection'),
    settings: () => as('GET', '/projection/settings'),
    updateSettings: (body: unknown) => as('PATCH', '/projection/settings', body),
    account: (body: unknown = melli) => created('/accounts', body),
    category: (body: unknown = food) => created('/categories', body),
    rate: (body: unknown) => created('/exchange-rates', body),
    spend: (fields: {
      accountId: string;
      categoryId: string;
      amount: string;
      occurredOn: string;
    }) => created('/transactions', { type: 'EXPENSE', ...fields }),
    rule: (body: unknown) => created('/recurring', body),
    confirm: (ruleId: string, dueOn: string) =>
      as('POST', `/recurring/${ruleId}/occurrences/${dueOn}/confirm`, {}),
    archiveRule: (ruleId: string) => as('PATCH', `/recurring/${ruleId}`, { archived: true }),
  };
}

describe('Projection', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.close());

  async function setUp() {
    const user = await registerUser(t.url);
    return { user, api: client(t, user) };
  }

  async function addMember(workspaceId: string, role: 'ADMIN' | 'MEMBER' | 'VIEWER') {
    const user = await registerUser(t.url);
    await db.insert(workspaceMembers).values({ workspaceId, userId: user.userId, role });
    return user;
  }

  it('is zero with a warning in a new Workspace, looking back three months by default', async () => {
    const { api } = await setUp();
    expect((await api.settings()).body).toEqual({ trailingMonths: 3, version: 0 });

    const res = await api.projection();
    expect(res.status).toBe(200);
    const expected = projectYear({
      calendar: 'jalali',
      today: today(),
      trailingMonths: 3,
      base: IRR,
      rates: [],
      transactions: [],
      rules: [],
      historyFrom: null,
    });
    const zero = { actual: '0', average: '0', variable: '0', recurring: '0', projected: '0' };
    expect(res.body).toEqual({
      year: expected.year,
      today: today(),
      yearEnd: expected.yearEnd,
      baseCurrency: 'IRR',
      remaining: expected.remaining,
      window: expected.window.map(periodParam),
      monthsUsed: 0,
      income: zero,
      expense: zero,
      categories: [],
      recurring: [],
      ratesUsed: [],
      missing: [],
      warnings: [{ kind: 'no_history', monthsWanted: 3 }],
    });
  });

  it('adds actuals, the Trailing Average and Recurring Rules per Category', async () => {
    const { api } = await setUp();
    const account = await api.account();
    const groceries = await api.category();
    const rentCategory = await api.category(rent);
    const lastMonth = previousPeriod(thisMonth());
    const inLastMonth = addDays(periodDays(lastMonth, 'jalali').until, -1);

    await api.spend({
      accountId: account.id,
      categoryId: groceries.id,
      amount: '300000',
      occurredOn: inLastMonth,
    });
    await api.spend({
      accountId: account.id,
      categoryId: groceries.id,
      amount: '50000',
      occurredOn: today(),
    });
    // Tomorrow's Expense has not happened yet.
    await api.spend({
      accountId: account.id,
      categoryId: groceries.id,
      amount: '999',
      occurredOn: addDays(today(), 1),
    });
    // Rent confirmed last month is actual but not variable; it comes again each month.
    const rentRule = await api.rule({
      name: 'Rent',
      type: 'EXPENSE',
      accountId: account.id,
      categoryId: rentCategory.id,
      amount: '1000000',
      frequency: 'MONTHLY',
      startOn: firstOf(lastMonth),
    });
    expect((await api.confirm(rentRule.id, firstOf(lastMonth))).status).toBe(201);
    // An archived rule brings nothing.
    const gym = await api.rule({
      name: 'Gym',
      type: 'EXPENSE',
      accountId: account.id,
      categoryId: groceries.id,
      amount: '7777',
      frequency: 'WEEKLY',
      startOn: today(),
    });
    await api.archiveRule(gym.id);

    const res = await api.projection();
    expect(res.status).toBe(200);
    const expected = projectYear({
      calendar: 'jalali',
      today: today(),
      trailingMonths: 3,
      base: IRR,
      rates: [],
      transactions: [
        {
          type: 'EXPENSE',
          categoryId: groceries.id,
          occurredOn: inLastMonth,
          amount: money(300000n, IRR),
          recurring: false,
        },
        {
          type: 'EXPENSE',
          categoryId: groceries.id,
          occurredOn: today(),
          amount: money(50000n, IRR),
          recurring: false,
        },
        {
          type: 'EXPENSE',
          categoryId: rentCategory.id,
          occurredOn: firstOf(lastMonth),
          amount: money(1000000n, IRR),
          recurring: true,
        },
      ],
      rules: [
        {
          id: rentRule.id,
          name: 'Rent',
          type: 'EXPENSE',
          categoryId: rentCategory.id,
          amount: money(1000000n, IRR),
          frequency: 'MONTHLY',
          interval: 1,
          startOn: firstOf(lastMonth),
          endOn: null,
        },
      ],
      historyFrom: firstOf(lastMonth),
    });
    // History starts last month: one month averaged.
    expect(res.body.monthsUsed).toBe(1);
    expect(res.body.warnings).toEqual([{ kind: 'short_history', monthsUsed: 1, monthsWanted: 3 }]);
    expect(res.body.expense).toEqual({
      actual: String(expected.expense.actual),
      average: '300000',
      variable: String(expected.expense.variable),
      recurring: String(expected.expense.recurring),
      projected: String(expected.expense.projected),
    });
    const byCategory = Object.fromEntries(
      res.body.categories.map((c: { categoryId: string }) => [c.categoryId, c]),
    );
    expect(byCategory[rentCategory.id]).toMatchObject({ type: 'EXPENSE', average: '0' });
    expect(byCategory[groceries.id]).toMatchObject({ type: 'EXPENSE', average: '300000' });
    expect(res.body.recurring).toEqual([
      {
        ruleId: rentRule.id,
        name: 'Rent',
        type: 'EXPENSE',
        categoryId: rentCategory.id,
        occurrences: expected.recurring[0]?.occurrences,
        total: String(expected.recurring[0]?.total ?? 0n),
      },
    ]);
  });

  it('converts other currencies at their rates and flags those with none', async () => {
    const { api } = await setUp();
    const account = await api.account(dollars);
    const category = await api.category();
    await api.spend({
      accountId: account.id,
      categoryId: category.id,
      amount: '500',
      occurredOn: today(),
    });

    const unconverted = (await api.projection()).body;
    expect(unconverted.expense.actual).toBe('0');
    expect(unconverted.missing).toEqual(['USD']);
    expect(unconverted.warnings).toContainEqual({ kind: 'missing_rates', currencies: ['USD'] });

    await api.rate({ currency: 'USD', rate: '1000000', effectiveOn: today() });
    const converted = (await api.projection()).body;
    expect(converted.expense.actual).toBe('5000000');
    expect(converted.ratesUsed).toEqual([
      { currency: 'USD', rate: '1000000', effectiveOn: today() },
    ]);
    expect(converted.missing).toEqual([]);
  });

  it('lets an Admin change the trailing months, and nobody below', async () => {
    const { user, api } = await setUp();
    const member = client(t, await addMember(user.workspaceId, 'MEMBER'), user.workspaceId);
    expect((await member.updateSettings({ trailingMonths: 6 })).status).toBe(403);
    expect((await api.updateSettings({ trailingMonths: 0 })).status).toBe(400);
    expect((await api.updateSettings({ trailingMonths: 13 })).status).toBe(400);
    expect((await api.updateSettings({})).status).toBe(400);

    const res = await api.updateSettings({ trailingMonths: 6 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ trailingMonths: 6, version: 1 });
    expect((await api.updateSettings({ trailingMonths: 2 })).body).toEqual({
      trailingMonths: 2,
      version: 2,
    });
    expect((await member.settings()).body).toEqual({ trailingMonths: 2, version: 2 });
    const projection = (await member.projection()).body;
    expect(projection.window).toHaveLength(2);
    expect(projection.window.at(-1)).toBe(periodParam(previousPeriod(thisMonth())));

    const audit = await db
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.workspaceId, user.workspaceId), eq(auditLogs.actorUserId, user.userId)),
      )
      .orderBy(desc(auditLogs.createdAt));
    expect(audit[0]).toMatchObject({
      action: 'projection_settings.update',
      metadata: { fields: ['trailingMonths'] },
    });
  });

  it('keeps each Workspace to its own data and settings', async () => {
    const owner = await setUp();
    const account = await owner.api.account();
    const category = await owner.api.category();
    await owner.api.spend({
      accountId: account.id,
      categoryId: category.id,
      amount: '42',
      occurredOn: today(),
    });
    await owner.api.updateSettings({ trailingMonths: 5 });

    const stranger = await setUp();
    expect((await stranger.api.projection()).body.expense.actual).toBe('0');
    expect((await stranger.api.settings()).body).toEqual({ trailingMonths: 3, version: 0 });
    const intruder = client(t, stranger.user, owner.user.workspaceId);
    expect((await intruder.projection()).status).toBe(404);
  });
});
