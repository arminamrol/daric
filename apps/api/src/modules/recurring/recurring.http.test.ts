import { randomUUID } from 'node:crypto';
import { addDays, calendarDateOf, dayOf, todayIn } from '@daric/core';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLogs, transactions, workspaceMembers } from '../../db/schema';
import { call, registerUser, startTestApp, type TestApp } from '../../test/app';
import { testDatabase } from '../../test/db';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

const melli = { name: 'Melli', type: 'BANK', class: 'ASSET', currency: 'IRR', openingBalance: '0' };
const rentCategory = { kind: 'EXPENSE', name: 'Rent', icon: 'key', color: 'brown' };
const salaryCategory = { kind: 'INCOME', name: 'Salary', icon: 'briefcase', color: 'green' };

// New Workspaces use the Jalali calendar in Asia/Tehran, so rules are counted in Jalali months.
const today = todayIn(new Date(), 'Asia/Tehran');

/** The first day of the Jalali month `n` months before this one. */
function firstOfMonthsAgo(n: number) {
  const { year, month } = calendarDateOf(today, 'jalali');
  const index = year * 12 + (month - 1) - n;
  return dayOf('jalali', { year: Math.floor(index / 12), month: (index % 12) + 1, day: 1 });
}

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
  const occurrence = (ruleId: string, dueOn: string) => `/recurring/${ruleId}/occurrences/${dueOn}`;
  return {
    create: (body: unknown) => as('POST', '/recurring', body),
    list: (query = '') => as('GET', `/recurring${query}`),
    get: (id: string) => as('GET', `/recurring/${id}`),
    update: (id: string, body: unknown) => as('PATCH', `/recurring/${id}`, body),
    due: () => as('GET', '/recurring/due'),
    confirm: (ruleId: string, dueOn: string, body: unknown = {}) =>
      as('POST', `${occurrence(ruleId, dueOn)}/confirm`, body),
    skip: (ruleId: string, dueOn: string) => as('POST', `${occurrence(ruleId, dueOn)}/skip`),
    transactions: () => as('GET', '/transactions'),
    accounts: () => as('GET', '/accounts'),
    account: (body: unknown = melli) => created('/accounts', body),
    category: (body: unknown = rentCategory) => created('/categories', body),
    archive: (kind: 'accounts' | 'categories', id: string) =>
      as('PATCH', `/${kind}/${id}`, { archived: true }),
  };
}

describe('Recurring Rules', () => {
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
    const rent = {
      name: 'Rent',
      type: 'EXPENSE',
      accountId: account.id,
      categoryId: category.id,
      amount: '250000',
      frequency: 'MONTHLY',
    };
    return { user, api, account, category, rent };
  }

  async function addMember(workspaceId: string, role: 'ADMIN' | 'MEMBER' | 'VIEWER') {
    const user = await registerUser(t.url);
    await db.insert(workspaceMembers).values({ workspaceId, userId: user.userId, role });
    return user;
  }

  it('start with none, and nothing due, in a new Workspace', async () => {
    const { api } = await setUp();
    expect((await api.list()).body).toEqual([]);
    expect((await api.due()).body).toEqual({ occurrences: [], autoPosted: 0 });
  });

  it('make a rule that waits for confirmation by default, with its next occurrence', async () => {
    const { api, rent } = await setUp();
    const startOn = addDays(today, 10);
    const res = await api.create({ ...rent, startOn });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      ...rent,
      id: expect.any(String),
      interval: 1,
      startOn,
      endOn: null,
      autoPost: false,
      archived: false,
      nextDueOn: startOn,
      version: 1,
    });
    expect((await api.get(res.body.id)).body).toEqual(res.body);
    expect((await api.list()).body).toEqual([res.body]);
    // Not due before its first occurrence.
    expect((await api.due()).body.occurrences).toEqual([]);
  });

  it('list every missed occurrence as due, oldest first across rules', async () => {
    const { api, account, rent } = await setUp();
    const salary = await api.category(salaryCategory);
    const { body: rentRule } = await api.create({ ...rent, startOn: firstOfMonthsAgo(2) });
    const { body: salaryRule } = await api.create({
      ...rent,
      name: 'Salary',
      type: 'INCOME',
      categoryId: salary.id,
      amount: '900000',
      startOn: firstOfMonthsAgo(1),
    });
    const { body } = await api.due();
    expect(body.autoPosted).toBe(0);
    expect(
      body.occurrences.map((o: { ruleId: string; dueOn: string }) => [o.ruleId, o.dueOn]),
    ).toEqual([
      [rentRule.id, firstOfMonthsAgo(2)],
      [rentRule.id, firstOfMonthsAgo(1)],
      [salaryRule.id, firstOfMonthsAgo(1)],
      [rentRule.id, firstOfMonthsAgo(0)],
      [salaryRule.id, firstOfMonthsAgo(0)],
    ]);
    expect(body.occurrences[2]).toEqual({
      ruleId: salaryRule.id,
      dueOn: firstOfMonthsAgo(1),
      name: 'Salary',
      type: 'INCOME',
      accountId: account.id,
      categoryId: salary.id,
      amount: '900000',
    });
    // Nothing is recorded until confirmed.
    expect((await api.transactions()).body).toEqual([]);
  });

  it('confirm an occurrence once, with an edited Amount, on the day it fell due', async () => {
    const { user, api, account, category, rent } = await setUp();
    const dueOn = firstOfMonthsAgo(1);
    const { body: rule } = await api.create({ ...rent, startOn: dueOn });
    const confirmed = await api.confirm(rule.id, dueOn, { amount: '260000' });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body).toMatchObject({
      type: 'EXPENSE',
      accountId: account.id,
      categoryId: category.id,
      amount: '260000',
      occurredOn: dueOn,
      note: 'Rent',
      createdBy: user.userId,
    });
    expect((await api.due()).body.occurrences.map((o: { dueOn: string }) => o.dueOn)).toEqual([
      firstOfMonthsAgo(0),
    ]);

    // Confirming again records nothing more and answers with the same Transaction.
    const again = await api.confirm(rule.id, dueOn, { amount: '999' });
    expect(again.status).toBe(200);
    expect(again.body).toEqual(confirmed.body);
    const [both] = await Promise.all([
      api.confirm(rule.id, firstOfMonthsAgo(0)),
      api.confirm(rule.id, firstOfMonthsAgo(0)),
    ]);
    expect([200, 201]).toContain(both.status);
    expect((await api.transactions()).body).toHaveLength(2);
    expect((await api.accounts()).body[0].balance).toBe('-510000');
  });

  it('skip an occurrence, so it is no longer due and cannot be confirmed', async () => {
    const { api, rent } = await setUp();
    const dueOn = firstOfMonthsAgo(1);
    const { body: rule } = await api.create({ ...rent, startOn: dueOn });
    expect((await api.skip(rule.id, dueOn)).status).toBe(204);
    expect((await api.skip(rule.id, dueOn)).status).toBe(204);
    expect((await api.due()).body.occurrences.map((o: { dueOn: string }) => o.dueOn)).toEqual([
      firstOfMonthsAgo(0),
    ]);
    expect((await api.confirm(rule.id, dueOn)).status).toBe(409);
    await api.confirm(rule.id, firstOfMonthsAgo(0));
    expect((await api.skip(rule.id, firstOfMonthsAgo(0))).status).toBe(409);
    expect((await api.transactions()).body).toHaveLength(1);
  });

  it('refuse to confirm or skip a day that is not a Due Occurrence', async () => {
    const { api, rent } = await setUp();
    const { body: rule } = await api.create({ ...rent, startOn: firstOfMonthsAgo(1) });
    const notOnSchedule = addDays(firstOfMonthsAgo(1), 1);
    for (const day of [notOnSchedule, firstOfMonthsAgo(2), firstOfMonthsAgo(-1)]) {
      expect((await api.confirm(rule.id, day)).status).toBe(400);
      expect((await api.skip(rule.id, day)).status).toBe(400);
    }
    expect((await api.confirm(rule.id, 'not-a-day')).status).toBe(404);
    expect((await api.confirm(randomUUID(), firstOfMonthsAgo(1))).status).toBe(404);
    expect((await api.confirm(rule.id, firstOfMonthsAgo(1), { amount: '0' })).status).toBe(400);
    expect((await api.transactions()).body).toEqual([]);
  });

  it('record the occurrences of an auto-posting rule as they come due, once', async () => {
    const { user, api, rent } = await setUp();
    await api.create({ ...rent, startOn: firstOfMonthsAgo(1), autoPost: true });
    const [first, second] = await Promise.all([api.due(), api.due()]);
    expect(first.body.occurrences).toEqual([]);
    expect(first.body.autoPosted + second.body.autoPosted).toBe(2);
    expect((await api.due()).body).toEqual({ occurrences: [], autoPosted: 0 });
    const recorded = (await api.transactions()).body;
    expect(recorded.map((r: { occurredOn: string }) => r.occurredOn)).toEqual([
      firstOfMonthsAgo(0),
      firstOfMonthsAgo(1),
    ]);
    expect(recorded[0]).toMatchObject({ amount: '250000', note: 'Rent', createdBy: user.userId });
  });

  it('leave an auto-posting rule’s occurrences due while its Account is archived', async () => {
    const { api, account, rent } = await setUp();
    const { body: rule } = await api.create({
      ...rent,
      startOn: firstOfMonthsAgo(0),
      autoPost: true,
    });
    await api.archive('accounts', account.id);
    expect((await api.due()).body).toEqual({
      occurrences: [expect.objectContaining({ ruleId: rule.id })],
      autoPosted: 0,
    });
    expect((await api.confirm(rule.id, firstOfMonthsAgo(0))).status).toBe(400);
  });

  it('stop an archived rule: nothing due, no next occurrence, hidden by default', async () => {
    const { api, rent } = await setUp();
    const { body: rule } = await api.create({ ...rent, startOn: firstOfMonthsAgo(1) });
    const archived = await api.update(rule.id, { archived: true });
    expect(archived.body).toMatchObject({ archived: true, nextDueOn: null, version: 2 });
    expect((await api.due()).body.occurrences).toEqual([]);
    expect((await api.confirm(rule.id, firstOfMonthsAgo(1))).status).toBe(400);
    expect((await api.list()).body).toEqual([]);
    expect((await api.list('?includeArchived=true')).body).toEqual([archived.body]);
    const restored = await api.update(rule.id, { archived: false });
    expect(restored.body.archived).toBe(false);
    expect((await api.due()).body.occurrences).toHaveLength(2);
  });

  it('change a rule, keeping what was confirmed or skipped', async () => {
    const { api, rent } = await setUp();
    const salary = await api.category(salaryCategory);
    const { body: rule } = await api.create({ ...rent, startOn: firstOfMonthsAgo(1) });
    await api.skip(rule.id, firstOfMonthsAgo(1));
    const changed = await api.update(rule.id, {
      name: 'Salary',
      type: 'INCOME',
      categoryId: salary.id,
      amount: '5',
      autoPost: false,
    });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ name: 'Salary', type: 'INCOME', amount: '5', version: 2 });
    expect((await api.due()).body.occurrences).toMatchObject([
      { dueOn: firstOfMonthsAgo(0), type: 'INCOME', amount: '5' },
    ]);
    // A type that does not fit the Category, or an end before the start.
    expect((await api.update(rule.id, { type: 'EXPENSE' })).status).toBe(400);
    expect((await api.update(rule.id, { endOn: firstOfMonthsAgo(2) })).status).toBe(400);
    const ended = await api.update(rule.id, { endOn: firstOfMonthsAgo(1) });
    expect(ended.body.nextDueOn).toBeNull();
    expect((await api.due()).body.occurrences).toEqual([]);
  });

  it('bring nothing back due when the schedule changes', async () => {
    const { api, rent } = await setUp();
    const { body: rule } = await api.create({ ...rent, startOn: firstOfMonthsAgo(2) });
    for (const n of [2, 1, 0]) await api.confirm(rule.id, firstOfMonthsAgo(n));
    const moved = addDays(firstOfMonthsAgo(2), 4);
    const changed = await api.update(rule.id, { startOn: moved, frequency: 'WEEKLY' });
    expect(changed.status).toBe(200);
    expect((await api.due()).body.occurrences).toEqual([]);
    expect((await api.confirm(rule.id, moved)).status).toBe(400);
    expect(changed.body.nextDueOn > today).toBe(true);
  });

  it('answer 409 when confirming again after its Transaction was deleted', async () => {
    const { user, api, rent } = await setUp();
    const dueOn = firstOfMonthsAgo(0);
    const { body: rule } = await api.create({ ...rent, startOn: dueOn });
    const { body: confirmed } = await api.confirm(rule.id, dueOn);
    await call(t.url, 'DELETE', `/v1/workspaces/${user.workspaceId}/transactions/${confirmed.id}`, {
      token: user.token,
    });
    expect((await api.confirm(rule.id, dueOn)).status).toBe(409);
    expect((await api.due()).body.occurrences).toEqual([]);
  });

  it('auto-post only when a Member or above asks; a Viewer sees nothing of it', async () => {
    const { user: owner, api, rent } = await setUp();
    await api.create({ ...rent, startOn: firstOfMonthsAgo(0), autoPost: true });
    const viewer = client(t, await addMember(owner.workspaceId, 'VIEWER'), owner.workspaceId);
    expect((await viewer.due()).body).toEqual({ occurrences: [], autoPosted: 0 });
    expect((await api.transactions()).body).toEqual([]);
    expect((await api.due()).body.autoPosted).toBe(1);
  });

  it('reject an Account or Category that is archived, missing or does not fit', async () => {
    const { api, account, category, rent } = await setUp();
    const salary = await api.category(salaryCategory);
    const startOn = today;
    const otherAccount = await api.account({ ...melli, name: 'Old' });
    const otherCategory = await api.category({ ...rentCategory, name: 'Old' });
    await api.archive('accounts', otherAccount.id);
    await api.archive('categories', otherCategory.id);
    for (const body of [
      { ...rent, startOn, categoryId: salary.id },
      { ...rent, startOn, categoryId: randomUUID() },
      { ...rent, startOn, accountId: randomUUID() },
      { ...rent, startOn, accountId: otherAccount.id },
      { ...rent, startOn, categoryId: otherCategory.id },
      { ...rent, startOn, endOn: addDays(startOn, -1) },
      { ...rent, startOn, type: 'TRANSFER' },
    ]) {
      expect((await api.create(body)).status).toBe(400);
    }
    const { body: rule } = await api.create({ ...rent, startOn });
    expect(rule).toMatchObject({ accountId: account.id, categoryId: category.id });
    expect((await api.update(rule.id, { accountId: otherAccount.id })).status).toBe(400);
  });

  it('let Owners and Admins change rules, Members confirm and skip, and Viewers only look', async () => {
    const { user: owner, rent } = await setUp();
    const ownerApi = client(t, owner);
    const { body: rule } = await ownerApi.create({ ...rent, startOn: firstOfMonthsAgo(2) });
    const admin = client(t, await addMember(owner.workspaceId, 'ADMIN'), owner.workspaceId);
    const member = client(t, await addMember(owner.workspaceId, 'MEMBER'), owner.workspaceId);
    const viewer = client(t, await addMember(owner.workspaceId, 'VIEWER'), owner.workspaceId);

    expect((await admin.update(rule.id, { amount: '1' })).status).toBe(200);
    for (const other of [member, viewer]) {
      expect((await other.create({ ...rent, startOn: today })).status).toBe(403);
      expect((await other.update(rule.id, { amount: '2' })).status).toBe(403);
      expect((await other.list()).body).toHaveLength(1);
      expect((await other.get(rule.id)).status).toBe(200);
      expect((await other.due()).body.occurrences).toHaveLength(3);
    }
    expect((await viewer.confirm(rule.id, firstOfMonthsAgo(2))).status).toBe(403);
    expect((await viewer.skip(rule.id, firstOfMonthsAgo(2))).status).toBe(403);
    expect((await member.confirm(rule.id, firstOfMonthsAgo(2))).status).toBe(201);
    expect((await member.skip(rule.id, firstOfMonthsAgo(1))).status).toBe(204);
  });

  it("answer 404 for another Workspace's rules, and refuse its Accounts", async () => {
    const a = await setUp();
    const b = await setUp();
    const { body: bRule } = await b.api.create({ ...b.rent, startOn: firstOfMonthsAgo(0) });
    const aInB = client(t, a.user, b.user.workspaceId);
    expect((await aInB.list()).status).toBe(404);
    expect((await aInB.due()).status).toBe(404);
    expect((await a.api.get(bRule.id)).status).toBe(404);
    expect((await a.api.update(bRule.id, { amount: '1' })).status).toBe(404);
    expect((await a.api.confirm(bRule.id, firstOfMonthsAgo(0))).status).toBe(404);
    expect((await a.api.skip(bRule.id, firstOfMonthsAgo(0))).status).toBe(404);
    expect((await a.api.due()).body.occurrences).toEqual([]);
    expect(
      (await a.api.create({ ...a.rent, startOn: today, accountId: b.account.id })).status,
    ).toBe(400);
    expect((await b.api.due()).body.occurrences).toHaveLength(1);
  });

  it('answer 404 for rules that do not exist or ids that are not uuids', async () => {
    const { api } = await setUp();
    for (const id of [randomUUID(), 'not-a-uuid']) {
      expect((await api.get(id)).status).toBe(404);
      expect((await api.update(id, { amount: '1' })).status).toBe(404);
      expect((await api.skip(id, today)).status).toBe(404);
    }
  });

  it('write ids and field names to the audit log, never Amounts or names', async () => {
    const { user, api, rent } = await setUp();
    const dueOn = firstOfMonthsAgo(1);
    const { body: rule } = await api.create({ ...rent, name: 'Secret rent', startOn: dueOn });
    await api.update(rule.id, { amount: '123456' });
    const { body: confirmed } = await api.confirm(rule.id, dueOn, { amount: '987654' });
    await api.skip(rule.id, firstOfMonthsAgo(0));
    const rows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.workspaceId, user.workspaceId))
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id));
    expect(rows.filter((r) => r.action.startsWith('recurring.'))).toMatchObject([
      { action: 'recurring.skip', metadata: { ruleId: rule.id, dueOn: firstOfMonthsAgo(0) } },
      {
        action: 'recurring.confirm',
        metadata: { ruleId: rule.id, dueOn, transactionId: confirmed.id },
      },
      { action: 'recurring.update', metadata: { ruleId: rule.id, fields: ['amount'] } },
      { action: 'recurring.create', metadata: { ruleId: rule.id } },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/987654|123456|Secret/);
    const [stored] = await db
      .select({ note: transactions.note })
      .from(transactions)
      .where(and(eq(transactions.id, confirmed.id)));
    expect(stored?.note).toBe('Secret rent');
  });
});
