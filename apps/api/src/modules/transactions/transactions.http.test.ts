import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppRequest } from '../../common/request';
import { RolesGuard, WorkspaceGuard } from '../../common/workspace.guard';
import { auditLogs, transactionLabels, transactions, workspaceMembers } from '../../db/schema';
import { call, registerUser, startTestApp, type TestApp } from '../../test/app';
import { testDatabase } from '../../test/db';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

const melli = {
  name: 'Melli',
  type: 'BANK',
  class: 'ASSET',
  currency: 'IRR',
  openingBalance: '1000000',
};
const card = {
  name: 'Card',
  type: 'CARD',
  class: 'LIABILITY',
  currency: 'USD',
  openingBalance: '0',
};
const food = { kind: 'EXPENSE', name: 'Food', icon: 'utensils', color: 'orange' };
const salary = { kind: 'INCOME', name: 'Salary', icon: 'briefcase', color: 'green' };

type User = Awaited<ReturnType<typeof registerUser>>;

async function storedTransactions(workspaceId: string) {
  return db.select().from(transactions).where(eq(transactions.workspaceId, workspaceId));
}

async function storedLabelIds(transactionId: string) {
  const rows = await db
    .select({ labelId: transactionLabels.labelId })
    .from(transactionLabels)
    .where(eq(transactionLabels.transactionId, transactionId));
  return rows.map((r) => r.labelId).sort();
}

/** Calls against one test app, as `user`, in their own Workspace unless told otherwise. */
function client(t: TestApp, user: User, workspaceId = user.workspaceId) {
  const base = `/v1/workspaces/${workspaceId}`;
  const as = (method: string, path: string, body?: unknown) =>
    call(t.url, method, `${base}${path}`, { token: user.token, body });
  return {
    record: (body: unknown) => as('POST', '/transactions', body),
    list: (query = '') => as('GET', `/transactions${query}`),
    get: (id: string) => as('GET', `/transactions/${id}`),
    async account(body: unknown = melli): Promise<{ id: string; balance: string }> {
      const res = await as('POST', '/accounts', body);
      expect(res.status).toBe(201);
      return res.body;
    },
    async category(body: unknown = food): Promise<{ id: string }> {
      const res = await as('POST', '/categories', body);
      expect(res.status).toBe(201);
      return res.body;
    },
    async label(name: string, fields: Record<string, unknown> = {}): Promise<{ id: string }> {
      const res = await as('POST', '/labels', { name, ...fields });
      expect(res.status).toBe(201);
      return res.body;
    },
    attach: (transactionId: string, labelId: string) =>
      as('PUT', `/transactions/${transactionId}/labels/${labelId}`),
    detach: (transactionId: string, labelId: string) =>
      as('DELETE', `/transactions/${transactionId}/labels/${labelId}`),
    balance: async (accountId: string) =>
      (await as('GET', `/accounts/${accountId}`)).body.balance as string,
    archive: (kind: 'accounts' | 'categories' | 'labels', id: string) =>
      as('PATCH', `/${kind}/${id}`, { archived: true }),
  };
}

describe('Transactions', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.close());

  /** A fresh Owner with an IRR bank Account and an Expense Category. */
  async function setUp() {
    const user = await registerUser(t.url);
    const api = client(t, user);
    const account = await api.account();
    const category = await api.category();
    const expense = (fields: Record<string, unknown> = {}) => ({
      type: 'EXPENSE',
      accountId: account.id,
      categoryId: category.id,
      amount: '250000',
      occurredOn: '2026-10-10',
      ...fields,
    });
    return { user, api, account, category, expense };
  }

  async function addMember(workspaceId: string, role: 'ADMIN' | 'MEMBER' | 'VIEWER') {
    const user = await registerUser(t.url);
    await db.insert(workspaceMembers).values({ workspaceId, userId: user.userId, role });
    return user;
  }

  it('record an Expense and take it off the Account balance', async () => {
    const { user, api, account, expense } = await setUp();
    const res = await api.record(expense({ note: '  Bread  ' }));
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      ...expense(),
      note: 'Bread',
      createdBy: user.userId,
      labelIds: [],
      version: 1,
    });
    expect(await api.balance(account.id)).toBe('750000');
    expect((await api.get(res.body.id)).body).toEqual(res.body);
    expect((await api.list()).body).toEqual([res.body]);
  });

  it('add Income to an Asset, and move a Liability the other way', async () => {
    const { api, account, expense } = await setUp();
    const salaryCategory = await api.category(salary);
    const income = expense({ type: 'INCOME', categoryId: salaryCategory.id, amount: '400000' });
    expect((await api.record(income)).status).toBe(201);
    expect(await api.balance(account.id)).toBe('1400000');

    const loan = await api.account(card);
    expect((await api.record(expense({ accountId: loan.id, amount: '1999' }))).status).toBe(201);
    expect((await api.record({ ...income, accountId: loan.id, amount: '500' })).status).toBe(201);
    // A card's balance is what is owed: the purchase raised it, the refund lowered it.
    expect(await api.balance(loan.id)).toBe('1499');
  });

  it('record a Transaction once when the same id is sent twice', async () => {
    const { user, api, account, expense } = await setUp();
    const id = uuidv7();
    const first = await api.record(expense({ id, note: 'Bread' }));
    expect(first.status).toBe(201);
    expect(first.body.id).toBe(id);
    const again = await api.record(expense({ id, note: 'Bread' }));
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(await storedTransactions(user.workspaceId)).toHaveLength(1);
    expect(await api.balance(account.id)).toBe('750000');
  });

  it('refuse to reuse an id for a different Transaction', async () => {
    const { user, api, expense } = await setUp();
    const id = uuidv7();
    await api.record(expense({ id }));
    const res = await api.record(expense({ id, amount: '1' }));
    expect(res.status).toBe(409);
    const [stored] = await storedTransactions(user.workspaceId);
    expect(stored?.amount).toBe(250000n);
  });

  it("refuse an id another Workspace already used, without showing that Workspace's Transaction", async () => {
    const a = await setUp();
    const b = await setUp();
    const id = uuidv7();
    await b.api.record(b.expense({ id, note: 'secret' }));
    const res = await a.api.record(a.expense({ id }));
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(await storedTransactions(a.user.workspaceId)).toEqual([]);
  });

  it('keep Amounts beyond 2^53 exact', async () => {
    const { api, expense } = await setUp();
    const res = await api.record(expense({ amount: '9007199254740993' }));
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe('9007199254740993');
  });

  it.each([
    ['a zero Amount', { amount: '0' }],
    ['a negative Amount', { amount: '-250000' }],
    ['a fractional Amount', { amount: '2.5' }],
    ['an Amount as a number', { amount: 250000 }],
    ['a Transfer', { type: 'TRANSFER' }],
    ['a day that does not exist', { occurredOn: '2026-02-30' }],
    ['a missing Account', { accountId: undefined }],
    ['an id that is not a UUIDv7', { id: randomUUID() }],
    ['a note over 1000 characters', { note: 'x'.repeat(1001) }],
  ])('reject %s', async (_, change) => {
    const { user, api, expense } = await setUp();
    expect((await api.record(expense(change))).status).toBe(400);
    expect(await storedTransactions(user.workspaceId)).toEqual([]);
  });

  it('reject a Category of the other kind', async () => {
    const { user, api, expense } = await setUp();
    const salaryCategory = await api.category(salary);
    expect((await api.record(expense({ categoryId: salaryCategory.id }))).status).toBe(400);
    expect((await api.record(expense({ type: 'INCOME' }))).status).toBe(400);
    expect(await storedTransactions(user.workspaceId)).toEqual([]);
  });

  it('reject an Account or Category that is archived or does not exist', async () => {
    const { user, api, expense } = await setUp();
    const oldAccount = await api.account();
    await api.archive('accounts', oldAccount.id);
    const oldCategory = await api.category();
    await api.archive('categories', oldCategory.id);
    for (const change of [
      { accountId: oldAccount.id },
      { categoryId: oldCategory.id },
      { accountId: randomUUID() },
      { categoryId: randomUUID() },
    ]) {
      expect((await api.record(expense(change))).status).toBe(400);
    }
    expect(await storedTransactions(user.workspaceId)).toEqual([]);
  });

  it("reject another Workspace's Account or Category", async () => {
    const a = await setUp();
    const b = await setUp();
    expect((await a.api.record(a.expense({ accountId: b.account.id }))).status).toBe(400);
    expect((await a.api.record(a.expense({ categoryId: b.category.id }))).status).toBe(400);
    expect(await storedTransactions(a.user.workspaceId)).toEqual([]);
    expect(await b.api.balance(b.account.id)).toBe('1000000');
  });

  it('list newest first, filtered by Period of the Workspace Calendar', async () => {
    const { api, expense } = await setUp();
    // The Workspace Calendar is Jalali: Mehr 1405 runs 2026-09-23 to 2026-10-22.
    const record = async (occurredOn: string) =>
      (await api.record(expense({ occurredOn }))).body.id as string;
    const shahrivarEnd = await record('2026-09-22');
    const mehrStart = await record('2026-09-23');
    const mehrEnd = await record('2026-10-22');
    const aban = await record('2026-10-23');
    const nextYear = await record('2027-03-21');
    const ids = async (query = '') => (await api.list(query)).body.map((x: { id: string }) => x.id);
    expect(await ids()).toEqual([nextYear, aban, mehrEnd, mehrStart, shahrivarEnd]);
    expect(await ids('?period=1405-07')).toEqual([mehrEnd, mehrStart]);
    expect(await ids('?period=1405')).toEqual([aban, mehrEnd, mehrStart, shahrivarEnd]);
    expect(await ids('?period=1406')).toEqual([nextYear]);
  });

  it('follow the Workspace Calendar when it changes', async () => {
    const { user, api, expense } = await setUp();
    const september = (await api.record(expense({ occurredOn: '2026-09-22' }))).body.id;
    await api.record(expense({ occurredOn: '2026-10-01' }));
    await call(t.url, 'PATCH', `/v1/workspaces/${user.workspaceId}`, {
      token: user.token,
      body: { calendar: 'gregorian' },
    });
    const res = await api.list('?period=2026-09');
    expect(res.body.map((x: { id: string }) => x.id)).toEqual([september]);
  });

  it('filter by Account, and by Category with a parent including its children', async () => {
    const { api, account, category, expense } = await setUp();
    const other = await api.account({ ...melli, name: 'Cash', type: 'CASH' });
    const child = await api.category({ ...food, name: 'Bread', parentId: category.id });
    const unrelated = await api.category({ ...food, name: 'Rent' });
    const onParent = (await api.record(expense())).body.id;
    const onChild = (await api.record(expense({ categoryId: child.id, accountId: other.id }))).body
      .id;
    const onUnrelated = (await api.record(expense({ categoryId: unrelated.id }))).body.id;
    const ids = async (query: string) =>
      new Set((await api.list(query)).body.map((x: { id: string }) => x.id));
    expect(await ids(`?accountId=${account.id}`)).toEqual(new Set([onParent, onUnrelated]));
    expect(await ids(`?categoryId=${category.id}`)).toEqual(new Set([onParent, onChild]));
    expect(await ids(`?categoryId=${child.id}`)).toEqual(new Set([onChild]));
    expect(await ids(`?categoryId=${category.id}&accountId=${other.id}`)).toEqual(
      new Set([onChild]),
    );
  });

  it.each([['?period=1405-13'], ['?period=mehr'], ['?accountId=melli'], ['?categoryId=1']])(
    'refuse the filter %s',
    async (query) => {
      const { api } = await setUp();
      expect((await api.list(query)).status).toBe(400);
    },
  );

  it('leave deleted Transactions out of lists and balances', async () => {
    const { user, api, account, expense } = await setUp();
    const kept = (await api.record(expense())).body.id;
    const gone = (await api.record(expense())).body.id;
    await db.update(transactions).set({ deletedAt: new Date() }).where(eq(transactions.id, gone));
    expect((await api.list()).body.map((x: { id: string }) => x.id)).toEqual([kept]);
    expect((await api.get(gone)).status).toBe(404);
    expect(await api.balance(account.id)).toBe('750000');
    expect(await storedTransactions(user.workspaceId)).toHaveLength(2);
  });

  it('let Members record Transactions and Viewers only see them', async () => {
    const { user: owner, api, account, category, expense } = await setUp();
    const member = await addMember(owner.workspaceId, 'MEMBER');
    const viewer = await addMember(owner.workspaceId, 'VIEWER');
    const asMember = client(t, member, owner.workspaceId);
    const asViewer = client(t, viewer, owner.workspaceId);
    const recorded = await asMember.record(expense());
    expect(recorded.status).toBe(201);
    expect(recorded.body.createdBy).toBe(member.userId);
    expect((await asViewer.record(expense())).status).toBe(403);
    expect((await asViewer.list()).body).toHaveLength(1);
    expect((await asViewer.get(recorded.body.id)).status).toBe(200);
    expect(await api.balance(account.id)).toBe('750000');
    expect(category.id).toBeDefined();
  });

  it("answer 404 for another Workspace's Transactions, by its id or by ours", async () => {
    const a = await setUp();
    const b = await setUp();
    const bTransaction = (await b.api.record(b.expense())).body;
    const aInB = client(t, a.user, b.user.workspaceId);
    expect((await aInB.list()).status).toBe(404);
    expect((await aInB.record(b.expense())).status).toBe(404);
    expect((await aInB.get(bTransaction.id)).status).toBe(404);
    expect((await a.api.get(bTransaction.id)).status).toBe(404);
    expect((await a.api.list()).body).toEqual([]);
    expect(
      (await a.api.list(`?accountId=${b.account.id}&categoryId=${b.category.id}`)).body,
    ).toEqual([]);
  });

  it('answer 404 for Transactions that do not exist or ids that are not uuids', async () => {
    const { api } = await setUp();
    for (const id of [randomUUID(), 'not-a-uuid']) {
      expect((await api.get(id)).status).toBe(404);
    }
  });

  it('require a login', async () => {
    const { user } = await setUp();
    const res = await call(t.url, 'GET', `/v1/workspaces/${user.workspaceId}/transactions`);
    expect(res.status).toBe(401);
  });

  it('write ids to the audit log, never Amounts or notes', async () => {
    const { user, api, expense } = await setUp();
    const { body: created } = await api.record(expense({ amount: '424242', note: 'pharmacy' }));
    const rows = await db
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.workspaceId, user.workspaceId), eq(auditLogs.actorUserId, user.userId)),
      )
      .orderBy(desc(auditLogs.createdAt));
    const recorded = rows.filter((r) => r.action.startsWith('transaction.'));
    expect(recorded).toMatchObject([
      { action: 'transaction.create', metadata: { transactionId: created.id } },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/424242|pharmacy/);
  });
});

describe('Labels on Transactions', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.close());

  /** A fresh Owner with an Account, a Category and two Labels. */
  async function setUp() {
    const user = await registerUser(t.url);
    const api = client(t, user);
    const account = await api.account();
    const category = await api.category();
    const travel = await api.label('Travel');
    const eatingOut = await api.label('Eating out', { controllable: true });
    const expense = (fields: Record<string, unknown> = {}) => ({
      type: 'EXPENSE',
      accountId: account.id,
      categoryId: category.id,
      amount: '250000',
      occurredOn: '2026-10-10',
      ...fields,
    });
    const record = async (fields: Record<string, unknown> = {}) => {
      const res = await api.record(expense(fields));
      expect(res.status).toBe(201);
      return res.body as { id: string; labelIds: string[]; version: number };
    };
    return { user, api, account, category, travel, eatingOut, expense, record };
  }

  async function addMember(workspaceId: string, role: 'MEMBER' | 'VIEWER') {
    const user = await registerUser(t.url);
    await db.insert(workspaceMembers).values({ workspaceId, userId: user.userId, role });
    return user;
  }

  it('record a Transaction with Labels and show them on it', async () => {
    const { api, travel, eatingOut, record } = await setUp();
    const both = [travel.id, eatingOut.id].sort();
    const recorded = await record({ labelIds: [eatingOut.id, travel.id] });
    expect(recorded.labelIds).toEqual(both);
    expect(await storedLabelIds(recorded.id)).toEqual(both);
    expect((await api.get(recorded.id)).body.labelIds).toEqual(both);
    expect((await api.list()).body[0].labelIds).toEqual(both);
  });

  it('filter the list by Label, with the other filters', async () => {
    const { api, category, travel, eatingOut, record } = await setUp();
    const trip = await record({ labelIds: [travel.id] });
    const dinner = await record({ labelIds: [travel.id, eatingOut.id], occurredOn: '2026-10-09' });
    await record();
    const ids = async (query: string) =>
      (await api.list(query)).body.map((x: { id: string }) => x.id);
    expect(await ids(`?labelId=${travel.id}`)).toEqual([trip.id, dinner.id]);
    expect(await ids(`?labelId=${eatingOut.id}`)).toEqual([dinner.id]);
    expect(await ids(`?labelId=${eatingOut.id}&categoryId=${category.id}&period=1405-07`)).toEqual([
      dinner.id,
    ]);
    expect((await api.list('?labelId=travel')).status).toBe(400);
    expect(await ids(`?labelId=${randomUUID()}`)).toEqual([]);
  });

  it('treat a replay with the same Labels in any order as the same Transaction', async () => {
    const { user, api, travel, eatingOut, expense } = await setUp();
    const id = uuidv7();
    const first = await api.record(expense({ id, labelIds: [travel.id, eatingOut.id] }));
    expect(first.status).toBe(201);
    const again = await api.record(expense({ id, labelIds: [eatingOut.id, travel.id] }));
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect((await api.record(expense({ id, labelIds: [travel.id] }))).status).toBe(409);
    expect((await api.record(expense({ id }))).status).toBe(409);
    expect(await storedTransactions(user.workspaceId)).toHaveLength(1);
    expect(await storedLabelIds(id)).toEqual([travel.id, eatingOut.id].sort());
  });

  it('answer a replay with the stored Transaction after its Labels changed', async () => {
    const { api, travel, eatingOut, expense } = await setUp();
    const id = uuidv7();
    await api.record(expense({ id, labelIds: [travel.id] }));
    await api.attach(id, eatingOut.id);
    // An offline client still sends the create it queued.
    const again = await api.record(expense({ id, labelIds: [travel.id] }));
    expect(again.status).toBe(200);
    expect(again.body.labelIds).toEqual([travel.id, eatingOut.id].sort());
    expect((await api.record(expense({ id, amount: '1', labelIds: [travel.id] }))).status).toBe(
      409,
    );
  });

  it('read Label ids in any case', async () => {
    const { api, travel, expense } = await setUp();
    const id = uuidv7();
    const first = await api.record(expense({ id, labelIds: [travel.id.toUpperCase()] }));
    expect(first.body.labelIds).toEqual([travel.id]);
    expect((await api.record(expense({ id, labelIds: [travel.id] }))).status).toBe(200);
    const twice = [travel.id, travel.id.toUpperCase()];
    expect((await api.record(expense({ labelIds: twice }))).status).toBe(400);
  });

  it("reject a Label that is archived, missing or another Workspace's", async () => {
    const a = await setUp();
    const b = await setUp();
    const old = await a.api.label('Old');
    await a.api.archive('labels', old.id);
    for (const labelId of [old.id, randomUUID(), b.travel.id]) {
      expect((await a.api.record(a.expense({ labelIds: [a.travel.id, labelId] }))).status).toBe(
        400,
      );
    }
    expect(await storedTransactions(a.user.workspaceId)).toEqual([]);
  });

  it('attach and detach a Label, each as often as sent', async () => {
    const { user, api, travel, eatingOut, record } = await setUp();
    const recorded = await record({ labelIds: [eatingOut.id] });

    const attached = await api.attach(recorded.id, travel.id);
    expect(attached.status).toBe(200);
    expect(attached.body.labelIds).toEqual([travel.id, eatingOut.id].sort());
    expect(attached.body.version).toBe(recorded.version + 1);
    const again = await api.attach(recorded.id, travel.id);
    expect(again.status).toBe(200);
    expect(again.body).toEqual(attached.body);

    const detached = await api.detach(recorded.id, eatingOut.id);
    expect(detached.status).toBe(200);
    expect(detached.body.labelIds).toEqual([travel.id]);
    expect(detached.body.version).toBe(recorded.version + 2);
    expect((await api.detach(recorded.id, eatingOut.id)).body).toEqual(detached.body);

    expect(await storedLabelIds(recorded.id)).toEqual([travel.id]);
    expect(await storedTransactions(user.workspaceId)).toHaveLength(1);
  });

  it('keep an archived Label on its Transactions and let it be detached, not attached', async () => {
    const { api, travel, eatingOut, record } = await setUp();
    const recorded = await record({ labelIds: [travel.id] });
    await api.archive('labels', travel.id);
    await api.archive('labels', eatingOut.id);
    expect((await api.get(recorded.id)).body.labelIds).toEqual([travel.id]);
    expect((await api.list(`?labelId=${travel.id}`)).body).toHaveLength(1);
    expect((await api.attach(recorded.id, eatingOut.id)).status).toBe(400);
    expect((await api.detach(recorded.id, travel.id)).body.labelIds).toEqual([]);
  });

  it('refuse a 21st Label on one Transaction', async () => {
    const { api, record } = await setUp();
    const many = [];
    for (let i = 0; i < 20; i++) many.push((await api.label(`Label ${i}`)).id);
    const recorded = await record({ labelIds: many });
    expect(recorded.labelIds).toHaveLength(20);
    const extra = await api.label('One too many');
    expect((await api.attach(recorded.id, extra.id)).status).toBe(400);
    // Attaching one it already has is still fine.
    expect((await api.attach(recorded.id, many[0] ?? '')).status).toBe(200);
    expect(await storedLabelIds(recorded.id)).toHaveLength(20);
  });

  it('answer 404 for a deleted Transaction', async () => {
    const { api, travel, record } = await setUp();
    const recorded = await record();
    await db
      .update(transactions)
      .set({ deletedAt: new Date() })
      .where(eq(transactions.id, recorded.id));
    expect((await api.attach(recorded.id, travel.id)).status).toBe(404);
    expect((await api.detach(recorded.id, travel.id)).status).toBe(404);
    expect(await storedLabelIds(recorded.id)).toEqual([]);
  });

  it("refuse to attach another Workspace's Label, or to touch its Transactions", async () => {
    const a = await setUp();
    const b = await setUp();
    const aTransaction = await a.record();
    const bTransaction = await b.record({ labelIds: [b.travel.id] });
    expect((await a.api.attach(aTransaction.id, b.travel.id)).status).toBe(404);
    expect((await a.api.attach(bTransaction.id, a.travel.id)).status).toBe(404);
    expect((await a.api.detach(bTransaction.id, b.travel.id)).status).toBe(404);
    const aInB = client(t, a.user, b.user.workspaceId);
    expect((await aInB.attach(bTransaction.id, b.eatingOut.id)).status).toBe(404);
    expect((await aInB.detach(bTransaction.id, b.travel.id)).status).toBe(404);
    expect(await storedLabelIds(aTransaction.id)).toEqual([]);
    expect(await storedLabelIds(bTransaction.id)).toEqual([b.travel.id]);
  });

  it('answer 404 for Labels or Transactions that do not exist or ids that are not uuids', async () => {
    const { api, travel, record } = await setUp();
    const recorded = await record();
    for (const id of [randomUUID(), 'not-a-uuid']) {
      expect((await api.attach(recorded.id, id)).status).toBe(404);
      expect((await api.attach(id, travel.id)).status).toBe(404);
      expect((await api.detach(id, travel.id)).status).toBe(404);
    }
  });

  it('let Members label Transactions and Viewers only see Labels on them', async () => {
    const { user: owner, travel, eatingOut, record } = await setUp();
    const recorded = await record({ labelIds: [travel.id] });
    const asMember = client(t, await addMember(owner.workspaceId, 'MEMBER'), owner.workspaceId);
    const asViewer = client(t, await addMember(owner.workspaceId, 'VIEWER'), owner.workspaceId);
    expect((await asMember.attach(recorded.id, eatingOut.id)).status).toBe(200);
    expect((await asViewer.attach(recorded.id, eatingOut.id)).status).toBe(403);
    expect((await asViewer.detach(recorded.id, travel.id)).status).toBe(403);
    expect((await asViewer.get(recorded.id)).body.labelIds).toEqual(
      [travel.id, eatingOut.id].sort(),
    );
  });

  it('write ids to the audit log', async () => {
    const { user, api, travel, record } = await setUp();
    const recorded = await record();
    await api.attach(recorded.id, travel.id);
    await api.attach(recorded.id, travel.id);
    await api.detach(recorded.id, travel.id);
    await api.detach(recorded.id, travel.id);
    const rows = await db
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.workspaceId, user.workspaceId), eq(auditLogs.actorUserId, user.userId)),
      )
      .orderBy(desc(auditLogs.createdAt));
    // Only real changes are logged.
    expect(rows.filter((r) => r.action.startsWith('transaction.label'))).toMatchObject([
      {
        action: 'transaction.label_detach',
        metadata: { transactionId: recorded.id, labelId: travel.id },
      },
      {
        action: 'transaction.label_attach',
        metadata: { transactionId: recorded.id, labelId: travel.id },
      },
    ]);
  });
});

describe('Transactions with the app-layer membership checks removed', () => {
  let t: TestApp;
  beforeAll(async () => {
    // Only row-level security is left between user A and user B's Transactions.
    const allowAll = {
      canActivate: (context: { switchToHttp(): { getRequest(): AppRequest } }) => {
        const req = context.switchToHttp().getRequest();
        req.membership = { workspaceId: String(req.params['wsId']), role: 'OWNER' };
        return true;
      },
    };
    t = await startTestApp({
      override: (builder) =>
        builder
          .overrideGuard(WorkspaceGuard)
          .useValue(allowAll)
          .overrideGuard(RolesGuard)
          .useValue(allowAll),
    });
  });
  afterAll(() => t.close());

  it("still keep user A out of user B's Transactions", async () => {
    const a = await registerUser(t.url);
    const b = await registerUser(t.url);
    const bApi = client(t, b);
    const account = await bApi.account();
    const category = await bApi.category();
    const expense = {
      type: 'EXPENSE',
      accountId: account.id,
      categoryId: category.id,
      amount: '250000',
      occurredOn: '2026-10-10',
    };
    const { body: bTransaction } = await bApi.record(expense);

    const aInB = client(t, a, b.workspaceId);
    expect((await aInB.list()).body).toEqual([]);
    expect((await aInB.get(bTransaction.id)).status).toBe(404);
    expect((await aInB.record(expense)).status).toBe(404);
    // A's own Workspace, B's Account and Category.
    expect((await client(t, a).record(expense)).status).toBe(400);

    const bLabel = await bApi.label('Secret');
    expect((await aInB.attach(bTransaction.id, bLabel.id)).status).toBe(404);
    const aApi = client(t, a);
    const aTransaction = (
      await aApi.record({
        ...expense,
        accountId: (await aApi.account()).id,
        categoryId: (await aApi.category()).id,
      })
    ).body;
    // A's own Transaction, B's Label: refused by the lookup and by the foreign key.
    expect((await aApi.attach(aTransaction.id, bLabel.id)).status).toBe(404);
    expect(
      (
        await aApi.record({
          ...expense,
          accountId: aTransaction.accountId,
          categoryId: aTransaction.categoryId,
          labelIds: [bLabel.id],
        })
      ).status,
    ).toBe(400);
    expect(await storedLabelIds(aTransaction.id)).toEqual([]);
    expect(await storedLabelIds(bTransaction.id)).toEqual([]);
    expect(await storedTransactions(b.workspaceId)).toHaveLength(1);
    expect(await storedTransactions(a.workspaceId)).toHaveLength(1);
  });
});
