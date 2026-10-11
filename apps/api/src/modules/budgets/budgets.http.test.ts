import { randomUUID } from 'node:crypto';
import { monthPeriodOfDay, periodParam, todayIn } from '@daric/core';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLogs, budgets, workspaceMembers } from '../../db/schema';
import { call, registerUser, startTestApp, type TestApp } from '../../test/app';
import { testDatabase } from '../../test/db';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

const melli = { name: 'Melli', type: 'BANK', class: 'ASSET', currency: 'IRR', openingBalance: '0' };
const dollars = {
  name: 'Dollars',
  type: 'CASH',
  class: 'ASSET',
  currency: 'USD',
  openingBalance: '0',
};
const food = { kind: 'EXPENSE', name: 'Food', icon: 'utensils', color: 'orange' };
const rent = { kind: 'EXPENSE', name: 'Rent', icon: 'key', color: 'brown' };
const salary = { kind: 'INCOME', name: 'Salary', icon: 'briefcase', color: 'green' };

// Mehr 1405 runs from 2026-09-23 to 2026-10-22; new Workspaces use the Jalali calendar.
const MEHR = '?month=1405-07';
const IN_MEHR = '2026-10-01';
const IN_SHAHRIVAR = '2026-09-01';

type User = Awaited<ReturnType<typeof registerUser>>;

async function storedBudgets(workspaceId: string) {
  return db.select().from(budgets).where(eq(budgets.workspaceId, workspaceId));
}

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
    create: (body: unknown, query = MEHR) => as('POST', `/budgets${query}`, body),
    list: (query = MEHR) => as('GET', `/budgets${query}`),
    get: (id: string, query = MEHR) => as('GET', `/budgets/${id}${query}`),
    update: (id: string, body: unknown, query = MEHR) =>
      as('PATCH', `/budgets/${id}${query}`, body),
    remove: (id: string) => as('DELETE', `/budgets/${id}`),
    account: (body: unknown = melli) => created('/accounts', body),
    category: (body: unknown = food) => created('/categories', body),
    label: (name: string) => created('/labels', { name }),
    archive: (kind: 'categories' | 'labels', id: string) =>
      as('PATCH', `/${kind}/${id}`, { archived: true }),
    async spend(fields: {
      accountId: string;
      categoryId: string;
      amount: string;
      occurredOn?: string;
      labelIds?: string[];
      type?: string;
    }) {
      return created('/transactions', { type: 'EXPENSE', occurredOn: IN_MEHR, ...fields });
    },
    transfer: (accountId: string, toAccountId: string, amount: string) =>
      created('/transactions', {
        type: 'TRANSFER',
        accountId,
        toAccountId,
        amount,
        occurredOn: IN_MEHR,
      }),
  };
}

describe('Budgets', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.close());

  async function setUp() {
    const user = await registerUser(t.url);
    const api = client(t, user);
    const account = await api.account();
    const category = await api.category();
    return { user, api, account, category };
  }

  async function addMember(workspaceId: string, role: 'ADMIN' | 'MEMBER' | 'VIEWER') {
    const user = await registerUser(t.url);
    await db.insert(workspaceMembers).values({ workspaceId, userId: user.userId, role });
    return user;
  }

  it('start with none in a new Workspace', async () => {
    const { api } = await setUp();
    expect((await api.list()).body).toEqual([]);
  });

  it('set a monthly limit in the Base Currency and show its progress', async () => {
    const { api, category } = await setUp();
    const res = await api.create({ categoryId: category.id, period: 'MONTHLY', amount: '1000' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      categoryId: category.id,
      labelId: null,
      period: 'MONTHLY',
      amount: '1000',
      currency: 'IRR',
      version: 1,
      progress: {
        period: '1405-07',
        spent: '0',
        remaining: '1000',
        percent: 0,
        state: 'ok',
        otherCurrencyExpenses: 0,
      },
    });
    expect((await api.get(res.body.id)).body).toEqual(res.body);
    expect((await api.list()).body).toEqual([res.body]);
  });

  it("count a parent Category's children, only in the month, and never Income or Transfers", async () => {
    const { api, account, category } = await setUp();
    const groceries = await api.category({ ...food, name: 'Groceries', parentId: category.id });
    const other = await api.category(rent);
    const income = await api.category(salary);
    const savings = await api.account({ ...melli, name: 'Savings' });
    await api.spend({ accountId: account.id, categoryId: category.id, amount: '100' });
    await api.spend({ accountId: account.id, categoryId: groceries.id, amount: '200' });
    await api.spend({ accountId: account.id, categoryId: other.id, amount: '5000' });
    await api.spend({
      accountId: account.id,
      categoryId: category.id,
      amount: '7000',
      occurredOn: IN_SHAHRIVAR,
    });
    await api.spend({
      type: 'INCOME',
      accountId: account.id,
      categoryId: income.id,
      amount: '9000',
    });
    await api.transfer(account.id, savings.id, '3000');

    const { body: parent } = await api.create({
      categoryId: category.id,
      period: 'MONTHLY',
      amount: '1000',
    });
    expect(parent.progress).toMatchObject({ spent: '300', remaining: '700', percent: 30 });
    const { body: child } = await api.create({
      categoryId: groceries.id,
      period: 'MONTHLY',
      amount: '1000',
    });
    expect(child.progress.spent).toBe('200');
    // The month before holds the 7000.
    expect((await api.get(parent.id, '?month=1405-06')).body.progress).toMatchObject({
      period: '1405-06',
      spent: '7000',
      state: 'over',
    });
  });

  it('count a whole year for a yearly Budget, the year holding the month asked for', async () => {
    const { api, account, category } = await setUp();
    await api.spend({ accountId: account.id, categoryId: category.id, amount: '100' });
    await api.spend({
      accountId: account.id,
      categoryId: category.id,
      amount: '200',
      occurredOn: IN_SHAHRIVAR,
    });
    // 1404, the year before.
    await api.spend({
      accountId: account.id,
      categoryId: category.id,
      amount: '400',
      occurredOn: '2026-03-01',
    });
    const { body } = await api.create({
      categoryId: category.id,
      period: 'YEARLY',
      amount: '1000',
    });
    expect(body.progress).toMatchObject({ period: '1405', spent: '300' });
    expect((await api.get(body.id, '?month=1404-12')).body.progress).toMatchObject({
      period: '1404',
      spent: '400',
    });
  });

  it('narrow to the Expenses carrying the Label', async () => {
    const { api, account, category } = await setUp();
    const eatingOut = await api.label('Eating out');
    const friends = await api.label('Friends');
    await api.spend({
      accountId: account.id,
      categoryId: category.id,
      amount: '100',
      labelIds: [eatingOut.id, friends.id],
    });
    await api.spend({
      accountId: account.id,
      categoryId: category.id,
      amount: '200',
      labelIds: [friends.id],
    });
    const { body } = await api.create({
      categoryId: category.id,
      labelId: eatingOut.id,
      period: 'MONTHLY',
      amount: '1000',
    });
    expect(body).toMatchObject({ labelId: eatingOut.id, progress: { spent: '100' } });
  });

  it('warn from 80% and show overspent above 100%', async () => {
    const { api, account, category } = await setUp();
    const { body: budget } = await api.create({
      categoryId: category.id,
      period: 'MONTHLY',
      amount: '1000',
    });
    await api.spend({ accountId: account.id, categoryId: category.id, amount: '800' });
    expect((await api.get(budget.id)).body.progress).toMatchObject({
      percent: 80,
      state: 'warning',
    });
    await api.spend({ accountId: account.id, categoryId: category.id, amount: '201' });
    expect((await api.get(budget.id)).body.progress).toMatchObject({
      spent: '1001',
      remaining: '-1',
      percent: 100,
      state: 'over',
    });
  });

  it('leave out deleted Expenses', async () => {
    const { user, api, account, category } = await setUp();
    const spent = await api.spend({ accountId: account.id, categoryId: category.id, amount: '50' });
    await call(t.url, 'DELETE', `/v1/workspaces/${user.workspaceId}/transactions/${spent.id}`, {
      token: user.token,
    });
    const { body } = await api.create({ categoryId: category.id, period: 'MONTHLY', amount: '1' });
    expect(body.progress.spent).toBe('0');
  });

  it('leave out Expenses in other currencies, and say how many', async () => {
    const { api, account, category } = await setUp();
    const usd = await api.account(dollars);
    await api.spend({ accountId: account.id, categoryId: category.id, amount: '100' });
    await api.spend({ accountId: usd.id, categoryId: category.id, amount: '5' });
    const { body } = await api.create({
      categoryId: category.id,
      period: 'MONTHLY',
      amount: '1000',
    });
    expect(body.progress).toMatchObject({ spent: '100', otherCurrencyExpenses: 1 });
  });

  it('show the current month when none is asked for', async () => {
    const { api, account, category } = await setUp();
    const today = todayIn(new Date(), 'Asia/Tehran');
    await api.spend({
      accountId: account.id,
      categoryId: category.id,
      amount: '10',
      occurredOn: today,
    });
    const { body } = await api.create(
      { categoryId: category.id, period: 'MONTHLY', amount: '1000' },
      '',
    );
    expect(body.progress).toMatchObject({
      period: periodParam(monthPeriodOfDay(today, 'jalali')),
      spent: '10',
    });
  });

  it('change the limit, Period and Label, and delete a Budget', async () => {
    const { user, api, category } = await setUp();
    const label = await api.label('Eating out');
    const { body: budget } = await api.create({
      categoryId: category.id,
      period: 'MONTHLY',
      amount: '1000',
    });
    const changed = await api.update(budget.id, {
      amount: '2000',
      period: 'YEARLY',
      labelId: label.id,
    });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({
      amount: '2000',
      period: 'YEARLY',
      labelId: label.id,
      version: 2,
      progress: { period: '1405', remaining: '2000' },
    });
    expect((await api.update(budget.id, { labelId: null })).body.labelId).toBeNull();

    expect((await api.remove(budget.id)).status).toBe(204);
    expect((await api.get(budget.id)).status).toBe(404);
    expect((await api.remove(budget.id)).status).toBe(404);
    expect(await storedBudgets(user.workspaceId)).toEqual([]);
  });

  it('allow one Budget per Category, Label and Period', async () => {
    const { user, api, category } = await setUp();
    const label = await api.label('Eating out');
    const monthly = { categoryId: category.id, period: 'MONTHLY', amount: '1000' };
    expect((await api.create(monthly)).status).toBe(201);
    expect((await api.create(monthly)).status).toBe(409);
    expect((await api.create({ ...monthly, period: 'YEARLY' })).status).toBe(201);
    const { body: labelled } = await api.create({ ...monthly, labelId: label.id });
    expect((await api.create({ ...monthly, labelId: label.id })).status).toBe(409);
    expect((await api.update(labelled.id, { labelId: null })).status).toBe(409);
    expect(await storedBudgets(user.workspaceId)).toHaveLength(3);
  });

  it.each([
    ['a zero limit', { period: 'MONTHLY', amount: '0' }],
    ['an unknown Period', { period: 'WEEKLY', amount: '10' }],
    ['a currency of its own', { period: 'MONTHLY', amount: '10', currency: 'USD' }],
  ])('reject %s', async (_, fields) => {
    const { user, api, category } = await setUp();
    expect((await api.create({ categoryId: category.id, ...fields })).status).toBe(400);
    expect(await storedBudgets(user.workspaceId)).toEqual([]);
  });

  it('reject an Income Category, or a Category or Label that is archived or missing', async () => {
    const { user, api, category } = await setUp();
    const income = await api.category(salary);
    const archivedCategory = await api.category(rent);
    await api.archive('categories', archivedCategory.id);
    const archivedLabel = await api.label('Old');
    await api.archive('labels', archivedLabel.id);
    const monthly = { period: 'MONTHLY', amount: '10' };
    for (const fields of [
      { categoryId: income.id },
      { categoryId: archivedCategory.id },
      { categoryId: randomUUID() },
      { categoryId: category.id, labelId: archivedLabel.id },
      { categoryId: category.id, labelId: randomUUID() },
    ]) {
      expect((await api.create({ ...monthly, ...fields })).status).toBe(400);
    }
    const { body: budget } = await api.create({ ...monthly, categoryId: category.id });
    expect((await api.update(budget.id, { categoryId: income.id })).status).toBe(400);
    expect((await api.update(budget.id, { labelId: archivedLabel.id })).status).toBe(400);
    expect(await storedBudgets(user.workspaceId)).toHaveLength(1);
  });

  it('keep showing a Budget whose Category was archived since', async () => {
    const { api, category } = await setUp();
    const { body: budget } = await api.create({
      categoryId: category.id,
      period: 'MONTHLY',
      amount: '10',
    });
    await api.archive('categories', category.id);
    expect((await api.list()).body).toMatchObject([{ id: budget.id }]);
    // Changing only the limit keeps the archived Category.
    expect((await api.update(budget.id, { amount: '20' })).status).toBe(200);
  });

  it('reject a malformed month', async () => {
    const { api } = await setUp();
    for (const query of ['?month=1405', '?month=1405-13', '?month=x']) {
      expect((await api.list(query)).status).toBe(400);
    }
  });

  it('let only Owners and Admins change Budgets; every Member sees them', async () => {
    const { user: owner, api, category } = await setUp();
    const monthly = { categoryId: category.id, period: 'MONTHLY', amount: '10' };
    const { body: budget } = await api.create(monthly);
    const admin = client(t, await addMember(owner.workspaceId, 'ADMIN'), owner.workspaceId);
    expect((await admin.create({ ...monthly, period: 'YEARLY' })).status).toBe(201);
    for (const role of ['MEMBER', 'VIEWER'] as const) {
      const other = client(t, await addMember(owner.workspaceId, role), owner.workspaceId);
      expect((await other.create({ ...monthly, amount: '20' })).status).toBe(403);
      expect((await other.update(budget.id, { amount: '20' })).status).toBe(403);
      expect((await other.remove(budget.id)).status).toBe(403);
      expect((await other.list()).body).toHaveLength(2);
      expect((await other.get(budget.id)).status).toBe(200);
    }
    expect(await storedBudgets(owner.workspaceId)).toHaveLength(2);
  });

  it("answer 404 for another Workspace's Budgets, and refuse its Categories and Labels", async () => {
    const a = await setUp();
    const b = await setUp();
    const bLabel = await b.api.label('Secret');
    const { body: bBudget } = await b.api.create({
      categoryId: b.category.id,
      period: 'MONTHLY',
      amount: '10',
    });
    const aInB = client(t, a.user, b.user.workspaceId);
    expect((await aInB.list()).status).toBe(404);
    expect(
      (await aInB.create({ categoryId: b.category.id, period: 'YEARLY', amount: '1' })).status,
    ).toBe(404);
    expect((await a.api.get(bBudget.id)).status).toBe(404);
    expect((await a.api.update(bBudget.id, { amount: '1' })).status).toBe(404);
    expect((await a.api.remove(bBudget.id)).status).toBe(404);
    expect((await a.api.list()).body).toEqual([]);
    const monthly = { period: 'MONTHLY', amount: '10' };
    expect((await a.api.create({ ...monthly, categoryId: b.category.id })).status).toBe(400);
    expect(
      (await a.api.create({ ...monthly, categoryId: a.category.id, labelId: bLabel.id })).status,
    ).toBe(400);
    expect((await b.api.get(bBudget.id)).body.amount).toBe('10');
  });

  it('answer 404 for Budgets that do not exist or ids that are not uuids', async () => {
    const { api } = await setUp();
    for (const id of [randomUUID(), 'not-a-uuid']) {
      expect((await api.get(id)).status).toBe(404);
      expect((await api.update(id, { amount: '1' })).status).toBe(404);
      expect((await api.remove(id)).status).toBe(404);
    }
  });

  it('write ids and field names to the audit log, never Amounts', async () => {
    const { user, api, category } = await setUp();
    const { body: budget } = await api.create({
      categoryId: category.id,
      period: 'MONTHLY',
      amount: '987654',
    });
    await api.update(budget.id, { amount: '123456' });
    await api.remove(budget.id);
    const rows = await db
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.workspaceId, user.workspaceId), eq(auditLogs.actorUserId, user.userId)),
      )
      .orderBy(desc(auditLogs.createdAt));
    expect(rows.filter((r) => r.action.startsWith('budget.'))).toMatchObject([
      { action: 'budget.delete', metadata: { budgetId: budget.id } },
      { action: 'budget.update', metadata: { budgetId: budget.id, fields: ['amount'] } },
      { action: 'budget.create', metadata: { budgetId: budget.id } },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/987654|123456/);
  });
});
