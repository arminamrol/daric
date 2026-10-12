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
const salary = { kind: 'INCOME', name: 'Salary', icon: 'briefcase', color: 'green' };

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
    projection: (mode?: string) => as('GET', `/projection${mode ? `?mode=${mode}` : ''}`),
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
    plannedItems: () => as('GET', '/projection/planned-items'),
    plannedItem: (itemId: string) => as('GET', `/projection/planned-items/${itemId}`),
    addPlanned: (body: unknown) => as('POST', '/projection/planned-items', body),
    updatePlanned: (itemId: string, body: unknown) =>
      as('PATCH', `/projection/planned-items/${itemId}`, body),
    removePlanned: (itemId: string) => as('DELETE', `/projection/planned-items/${itemId}`),
    archiveCategory: (categoryId: string) =>
      as('PATCH', `/categories/${categoryId}`, { archived: true }),
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
    expect((await api.settings()).body).toEqual({
      trailingMonths: 3,
      mode: 'AUTOMATIC',
      version: 0,
    });

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
    const zero = {
      actual: '0',
      average: '0',
      variable: '0',
      recurring: '0',
      planned: '0',
      projected: '0',
    };
    expect(res.body).toEqual({
      mode: 'AUTOMATIC',
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
      planned: [],
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
      planned: '0',
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
    expect(res.body).toEqual({ trailingMonths: 6, mode: 'AUTOMATIC', version: 1 });
    expect((await api.updateSettings({ trailingMonths: 2 })).body).toEqual({
      trailingMonths: 2,
      mode: 'AUTOMATIC',
      version: 2,
    });
    expect((await member.settings()).body).toEqual({
      trailingMonths: 2,
      mode: 'AUTOMATIC',
      version: 2,
    });
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
    expect((await stranger.api.settings()).body).toEqual({
      trailingMonths: 3,
      mode: 'AUTOMATIC',
      version: 0,
    });
    const intruder = client(t, stranger.user, owner.user.workspaceId);
    expect((await intruder.projection()).status).toBe(404);
  });

  describe('Planned Items', () => {
    it('are kept per Workspace, a Fixed Monthly one always in a Category', async () => {
      const { user, api } = await setUp();
      const rentCategory = await api.category(rent);
      const fixed = {
        name: 'Rent',
        kind: 'FIXED_MONTHLY',
        type: 'EXPENSE',
        categoryId: rentCategory.id,
        amount: '250000',
        startOn: today(),
      };
      expect((await api.addPlanned({ ...fixed, categoryId: null })).status).toBe(400);
      expect((await api.addPlanned({ ...fixed, endOn: addDays(today(), -1) })).status).toBe(400);
      const created = await api.addPlanned(fixed);
      expect(created.status).toBe(201);
      expect(created.body).toEqual({
        id: expect.any(String),
        ...fixed,
        currency: 'IRR',
        endOn: null,
        version: 1,
      });
      const oneOff = await api.addPlanned({
        name: 'Insurance',
        kind: 'ONE_OFF',
        type: 'EXPENSE',
        amount: '90000',
        startOn: today(),
      });
      expect(oneOff.body).toMatchObject({ categoryId: null, endOn: null });
      expect(
        (await api.addPlanned({ ...fixed, kind: 'ONE_OFF', endOn: addDays(today(), 30) })).status,
      ).toBe(400);

      expect((await api.plannedItems()).body.map((i: { name: string }) => i.name)).toEqual([
        'Rent',
        'Insurance',
      ]);
      expect((await api.plannedItem(created.body.id)).body).toEqual(created.body);

      const updated = await api.updatePlanned(created.body.id, {
        amount: '300000',
        endOn: addDays(today(), 60),
      });
      expect(updated.status).toBe(200);
      expect(updated.body).toMatchObject({
        amount: '300000',
        endOn: addDays(today(), 60),
        version: 2,
      });
      expect((await api.updatePlanned(created.body.id, { categoryId: null })).status).toBe(400);
      expect((await api.updatePlanned(oneOff.body.id, { endOn: today() })).status).toBe(400);
      expect((await api.updatePlanned(oneOff.body.id, { kind: 'FIXED_MONTHLY' })).status).toBe(400);

      expect((await api.removePlanned(oneOff.body.id)).status).toBe(204);
      expect((await api.plannedItem(oneOff.body.id)).status).toBe(404);
      expect((await api.removePlanned(oneOff.body.id)).status).toBe(404);

      const audit = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.workspaceId, user.workspaceId))
        .orderBy(desc(auditLogs.createdAt));
      expect(audit.map((a) => a.action)).toEqual(
        expect.arrayContaining([
          'planned_item.create',
          'planned_item.update',
          'planned_item.delete',
        ]),
      );
      expect(audit.find((a) => a.action === 'planned_item.update')?.metadata).toEqual({
        plannedItemId: created.body.id,
        fields: ['amount', 'endOn'],
      });
    });

    it('need an active Category of their type', async () => {
      const { api } = await setUp();
      const food = await api.category();
      const salaryCategory = await api.category(salary);
      const item = {
        name: 'Salary',
        kind: 'FIXED_MONTHLY',
        type: 'INCOME',
        categoryId: food.id,
        amount: '1000',
        startOn: today(),
      };
      expect((await api.addPlanned(item)).status).toBe(400);
      expect(
        (await api.addPlanned({ ...item, categoryId: '01900000-0000-7000-8000-000000000000' }))
          .status,
      ).toBe(400);
      const created = await api.addPlanned({ ...item, categoryId: salaryCategory.id });
      expect(created.status).toBe(201);
      expect((await api.updatePlanned(created.body.id, { categoryId: food.id })).status).toBe(400);
      const bonus = await api.category({ ...salary, name: 'Bonus' });
      expect((await api.archiveCategory(bonus.id)).status).toBe(200);
      expect((await api.updatePlanned(created.body.id, { categoryId: bonus.id })).status).toBe(400);
      // An archived Category the item already has may stay.
      expect((await api.archiveCategory(salaryCategory.id)).status).toBe(200);
      expect((await api.updatePlanned(created.body.id, { amount: '2000' })).status).toBe(200);
    });

    it('may be changed by Admins and seen by every Member', async () => {
      const { user } = await setUp();
      const viewer = client(t, await addMember(user.workspaceId, 'VIEWER'), user.workspaceId);
      const member = client(t, await addMember(user.workspaceId, 'MEMBER'), user.workspaceId);
      const admin = client(t, await addMember(user.workspaceId, 'ADMIN'), user.workspaceId);
      const item = {
        name: 'Gift',
        kind: 'ONE_OFF',
        type: 'EXPENSE',
        amount: '1000',
        startOn: today(),
      };
      expect((await member.addPlanned(item)).status).toBe(403);
      const created = await admin.addPlanned(item);
      expect(created.status).toBe(201);
      expect((await viewer.plannedItems()).body).toHaveLength(1);
      expect((await member.updatePlanned(created.body.id, { amount: '5' })).status).toBe(403);
      expect((await viewer.removePlanned(created.body.id)).status).toBe(403);

      const stranger = await setUp();
      expect((await stranger.api.plannedItems()).body).toEqual([]);
      expect((await stranger.api.plannedItem(created.body.id)).status).toBe(404);
    });
  });

  describe('modes', () => {
    async function withPlan() {
      const { user, api } = await setUp();
      const account = await api.account();
      const groceries = await api.category();
      const rentCategory = await api.category(rent);
      const salaryCategory = await api.category(salary);
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
        categoryId: rentCategory.id,
        amount: '40000',
        occurredOn: inLastMonth,
      });
      const rentRule = await api.rule({
        name: 'Rent',
        type: 'EXPENSE',
        accountId: account.id,
        categoryId: rentCategory.id,
        amount: '1000000',
        frequency: 'MONTHLY',
        startOn: firstOf(lastMonth),
      });
      const salaryItem = (
        await api.addPlanned({
          name: 'Salary',
          kind: 'FIXED_MONTHLY',
          type: 'INCOME',
          categoryId: salaryCategory.id,
          amount: '5000000',
          startOn: firstOf(lastMonth),
        })
      ).body;
      const giftItem = (
        await api.addPlanned({
          name: 'Gift',
          kind: 'ONE_OFF',
          type: 'EXPENSE',
          amount: '70000',
          startOn: addDays(today(), 1),
        })
      ).body;
      const expectedIn = (mode: 'AUTOMATIC' | 'MANUAL' | 'COMBINED') =>
        projectYear({
          calendar: 'jalali',
          today: today(),
          mode,
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
              categoryId: rentCategory.id,
              occurredOn: inLastMonth,
              amount: money(40000n, IRR),
              recurring: false,
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
          plannedItems: [
            {
              id: salaryItem.id,
              name: 'Salary',
              kind: 'FIXED_MONTHLY',
              type: 'INCOME',
              categoryId: salaryCategory.id,
              amount: money(5000000n, IRR),
              startOn: firstOf(lastMonth),
              endOn: null,
            },
            {
              id: giftItem.id,
              name: 'Gift',
              kind: 'ONE_OFF',
              type: 'EXPENSE',
              categoryId: null,
              amount: money(70000n, IRR),
              startOn: addDays(today(), 1),
              endOn: null,
            },
          ],
          historyFrom: inLastMonth,
        });
      return { user, api, expectedIn, rentCategory };
    }

    const wire = (f: Record<string, bigint>) =>
      Object.fromEntries(Object.entries(f).map(([k, v]) => [k, String(v)]));

    it('works out Manual and Combined Projections when asked', async () => {
      const { api, expectedIn, rentCategory } = await withPlan();
      for (const mode of ['MANUAL', 'COMBINED'] as const) {
        const expected = expectedIn(mode);
        const res = await api.projection(mode);
        expect(res.status).toBe(200);
        expect(res.body.mode).toBe(mode);
        expect(res.body.income).toEqual(wire({ ...expected.income }));
        expect(res.body.expense).toEqual(wire({ ...expected.expense }));
        expect(res.body.planned).toEqual(
          expected.planned.map((p) => ({ ...p, total: String(p.total) })),
        );
        expect(res.body.recurring.map((r: { ruleId: string }) => r.ruleId)).toEqual(
          expected.recurring.map((r) => r.ruleId),
        );
      }
      // Combined: the rent rule overrides the rent Category's average.
      const combined = (await api.projection('COMBINED')).body;
      const rentLine = combined.categories.find(
        (c: { categoryId: string | null }) => c.categoryId === rentCategory.id,
      );
      expect(rentLine).toMatchObject({ average: '0', variable: '0' });
      expect((await api.projection('GUESS')).status).toBe(400);
    });

    it('shows the Workspace’s mode unless another is asked for', async () => {
      const { user, api, expectedIn } = await withPlan();
      expect((await api.projection()).body.mode).toBe('AUTOMATIC');
      expect((await api.projection()).body.planned).toEqual([]);
      const member = client(t, await addMember(user.workspaceId, 'MEMBER'), user.workspaceId);
      expect((await member.updateSettings({ mode: 'MANUAL' })).status).toBe(403);
      expect((await api.updateSettings({ mode: 'MANUAL' })).body).toEqual({
        trailingMonths: 3,
        mode: 'MANUAL',
        version: 1,
      });
      const shown = (await member.projection()).body;
      expect(shown.mode).toBe('MANUAL');
      expect(shown.expense.projected).toBe(String(expectedIn('MANUAL').expense.projected));
      expect((await member.projection('AUTOMATIC')).body.mode).toBe('AUTOMATIC');
      // Changing one setting keeps the other.
      expect((await api.updateSettings({ trailingMonths: 4 })).body).toMatchObject({
        trailingMonths: 4,
        mode: 'MANUAL',
      });
    });
  });
});
