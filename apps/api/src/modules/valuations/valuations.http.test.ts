import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLogs, workspaceMembers } from '../../db/schema';
import { call, registerUser, startTestApp, type TestApp } from '../../test/app';
import { testDatabase } from '../../test/db';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

type User = Awaited<ReturnType<typeof registerUser>>;

const gold = {
  name: 'Gold coins',
  type: 'OTHER_ASSET',
  class: 'ASSET',
  currency: 'IRR',
  openingBalance: '0',
};
const valuation = { amount: '950000000', valuedOn: '2026-10-01' };

function client(t: TestApp, user: User, workspaceId = user.workspaceId) {
  const base = `/v1/workspaces/${workspaceId}`;
  const as = (method: string, path: string, body?: unknown) =>
    call(t.url, method, `${base}${path}`, { token: user.token, body });
  const of = (accountId: string, id?: string) =>
    `/accounts/${accountId}/valuations${id ? `/${id}` : ''}`;
  return {
    account: (body: unknown = gold) => as('POST', '/accounts', body),
    updateAccount: (id: string, body: unknown) => as('PATCH', `/accounts/${id}`, body),
    create: (accountId: string, body: unknown = valuation) => as('POST', of(accountId), body),
    list: (accountId: string) => as('GET', of(accountId)),
    update: (accountId: string, id: string, body: unknown) => as('PATCH', of(accountId, id), body),
    remove: (accountId: string, id: string) => as('DELETE', of(accountId, id)),
  };
}

describe('Valuations', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.close());

  async function setUp() {
    const user = await registerUser(t.url);
    const api = client(t, user);
    const { body: account } = await api.account();
    return { user, api, account };
  }

  async function addMember(workspaceId: string, role: 'ADMIN' | 'MEMBER' | 'VIEWER') {
    const user = await registerUser(t.url);
    await db.insert(workspaceMembers).values({ workspaceId, userId: user.userId, role });
    return user;
  }

  it('start with none on a new Account', async () => {
    const { api, account } = await setUp();
    expect((await api.list(account.id)).body).toEqual([]);
  });

  it('record what an Account was worth on a day, listed newest first', async () => {
    const { api, account } = await setUp();
    const res = await api.create(account.id);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      accountId: account.id,
      amount: '950000000',
      valuedOn: '2026-10-01',
      version: 1,
    });
    await api.create(account.id, { amount: '900000000', valuedOn: '2026-09-01' });
    await api.create(account.id, { amount: '0', valuedOn: '2026-10-05' });
    const { body } = await api.list(account.id);
    expect(body.map((v: typeof valuation) => [v.valuedOn, v.amount])).toEqual([
      ['2026-10-05', '0'],
      ['2026-10-01', '950000000'],
      ['2026-09-01', '900000000'],
    ]);
  });

  it('allow one Valuation per Account and day', async () => {
    const { api, account } = await setUp();
    expect((await api.create(account.id)).status).toBe(201);
    expect((await api.create(account.id, { ...valuation, amount: '1' })).status).toBe(409);
    const { body: other } = await api.create(account.id, { ...valuation, valuedOn: '2026-10-02' });
    expect((await api.update(account.id, other.id, { valuedOn: '2026-10-01' })).status).toBe(409);
    // Another Account may have one that day.
    const { body: car } = await api.account({ ...gold, name: 'Car' });
    expect((await api.create(car.id)).status).toBe(201);
  });

  it('refuse malformed input, a negative value and a new Valuation on an archived Account', async () => {
    const { api, account } = await setUp();
    expect((await api.create(account.id, { ...valuation, amount: '-1' })).status).toBe(400);
    expect((await api.create(account.id, { ...valuation, amount: 5 })).status).toBe(400);
    expect((await api.create(account.id, { ...valuation, valuedOn: '2026-13-01' })).status).toBe(
      400,
    );
    const { body: kept } = await api.create(account.id);
    expect((await api.update(account.id, kept.id, {})).status).toBe(400);
    expect((await api.update(account.id, kept.id, { accountId: account.id })).status).toBe(400);
    await api.updateAccount(account.id, { archived: true });
    expect((await api.create(account.id, { ...valuation, valuedOn: '2026-10-09' })).status).toBe(
      400,
    );
    // Those it has stay correctable.
    expect((await api.update(account.id, kept.id, { amount: '1' })).status).toBe(200);
    expect((await api.list(account.id)).body).toHaveLength(1);
  });

  it('change the value and day, and delete a Valuation', async () => {
    const { api, account } = await setUp();
    const { body: created } = await api.create(account.id);
    const res = await api.update(account.id, created.id, {
      amount: '960000000',
      valuedOn: '2026-10-03',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ...created,
      amount: '960000000',
      valuedOn: '2026-10-03',
      version: 2,
    });
    expect((await api.remove(account.id, created.id)).status).toBe(204);
    expect((await api.list(account.id)).body).toEqual([]);
  });

  it("answer 404 for a Valuation through another of the Workspace's Accounts", async () => {
    const { api, account } = await setUp();
    const { body: car } = await api.account({ ...gold, name: 'Car' });
    const { body: created } = await api.create(account.id);
    expect((await api.update(car.id, created.id, { amount: '1' })).status).toBe(404);
    expect((await api.remove(car.id, created.id)).status).toBe(404);
  });

  it('let only Owners and Admins change Valuations; every Member sees them', async () => {
    const { user: owner, api, account } = await setUp();
    const { body: created } = await api.create(account.id);
    const admin = client(t, await addMember(owner.workspaceId, 'ADMIN'), owner.workspaceId);
    expect((await admin.create(account.id, { ...valuation, valuedOn: '2026-10-02' })).status).toBe(
      201,
    );
    for (const role of ['MEMBER', 'VIEWER'] as const) {
      const other = client(t, await addMember(owner.workspaceId, role), owner.workspaceId);
      expect(
        (await other.create(account.id, { ...valuation, valuedOn: '2026-10-03' })).status,
      ).toBe(403);
      expect((await other.update(account.id, created.id, { amount: '1' })).status).toBe(403);
      expect((await other.remove(account.id, created.id)).status).toBe(403);
      expect((await other.list(account.id)).body).toHaveLength(2);
    }
  });

  it("answer 404 for another Workspace's Accounts and Valuations", async () => {
    const a = await setUp();
    const b = await setUp();
    const { body: bValuation } = await b.api.create(b.account.id);
    const aInB = client(t, a.user, b.user.workspaceId);
    expect((await aInB.list(b.account.id)).status).toBe(404);
    expect((await a.api.list(b.account.id)).status).toBe(404);
    expect((await a.api.create(b.account.id)).status).toBe(404);
    expect((await a.api.update(b.account.id, bValuation.id, { amount: '1' })).status).toBe(404);
    expect((await a.api.remove(b.account.id, bValuation.id)).status).toBe(404);
    expect((await b.api.list(b.account.id)).body).toEqual([bValuation]);
  });

  it('answer 404 for Accounts or Valuations that do not exist or ids that are not uuids', async () => {
    const { api, account } = await setUp();
    for (const id of [randomUUID(), 'not-a-uuid']) {
      expect((await api.list(id)).status).toBe(404);
      expect((await api.create(id)).status).toBe(404);
      expect((await api.update(account.id, id, { amount: '1' })).status).toBe(404);
      expect((await api.remove(account.id, id)).status).toBe(404);
    }
  });

  it('write ids and field names to the audit log, never Amounts', async () => {
    const { user, api, account } = await setUp();
    const { body: created } = await api.create(account.id, { ...valuation, amount: '987654' });
    await api.update(account.id, created.id, { amount: '123456' });
    await api.remove(account.id, created.id);
    const rows = await db
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.workspaceId, user.workspaceId), eq(auditLogs.actorUserId, user.userId)),
      )
      .orderBy(desc(auditLogs.createdAt));
    const ids = { valuationId: created.id, accountId: account.id };
    expect(rows.filter((r) => r.action.startsWith('valuation.'))).toMatchObject([
      { action: 'valuation.delete', metadata: ids },
      { action: 'valuation.update', metadata: { ...ids, fields: ['amount'] } },
      { action: 'valuation.create', metadata: ids },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/987654|123456/);
  });
});
