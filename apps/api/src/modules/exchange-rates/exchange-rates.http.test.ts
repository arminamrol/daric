import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLogs, exchangeRates, workspaceMembers } from '../../db/schema';
import { call, registerUser, startTestApp, type TestApp } from '../../test/app';
import { testDatabase } from '../../test/db';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

type User = Awaited<ReturnType<typeof registerUser>>;

const usd = { currency: 'USD', rate: '1050000', effectiveOn: '2026-10-01' };

function client(t: TestApp, user: User, workspaceId = user.workspaceId) {
  const base = `/v1/workspaces/${workspaceId}`;
  const as = (method: string, path: string, body?: unknown) =>
    call(t.url, method, `${base}${path}`, { token: user.token, body });
  return {
    create: (body: unknown) => as('POST', '/exchange-rates', body),
    list: () => as('GET', '/exchange-rates'),
    update: (id: string, body: unknown) => as('PATCH', `/exchange-rates/${id}`, body),
    remove: (id: string) => as('DELETE', `/exchange-rates/${id}`),
    settings: (body: unknown) => as('PATCH', '', body),
  };
}

describe('Exchange Rates', () => {
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

  it('start with none in a new Workspace', async () => {
    const { api } = await setUp();
    expect((await api.list()).body).toEqual([]);
  });

  it('record a rate into the Base Currency from a day, without needless zeros', async () => {
    const { api } = await setUp();
    const res = await api.create({ ...usd, rate: '1050000.50' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      currency: 'USD',
      rate: '1050000.5',
      effectiveOn: '2026-10-01',
      version: 1,
    });
    expect((await api.list()).body).toEqual([res.body]);
  });

  it('keep tiny rates exact', async () => {
    const { api } = await setUp();
    await api.settings({ baseCurrency: 'USD' });
    const res = await api.create({
      currency: 'IRR',
      rate: '0.000000952381',
      effectiveOn: '2026-10-01',
    });
    expect(res.status).toBe(201);
    expect((await api.list()).body[0].rate).toBe('0.000000952381');
  });

  it('list by currency, newest first within each', async () => {
    const { api } = await setUp();
    await api.create(usd);
    await api.create({ currency: 'EUR', rate: '1200000', effectiveOn: '2026-09-01' });
    await api.create({ ...usd, rate: '900000', effectiveOn: '2026-09-01' });
    await api.create({ ...usd, rate: '1100000', effectiveOn: '2026-10-05' });
    const { body } = await api.list();
    expect(body.map((r: typeof usd) => [r.currency, r.effectiveOn])).toEqual([
      ['EUR', '2026-09-01'],
      ['USD', '2026-10-05'],
      ['USD', '2026-10-01'],
      ['USD', '2026-09-01'],
    ]);
  });

  it('allow one rate per currency and day', async () => {
    const { api } = await setUp();
    expect((await api.create(usd)).status).toBe(201);
    const again = await api.create({ ...usd, rate: '1' });
    expect(again.status).toBe(409);
    const { body: other } = await api.create({ ...usd, effectiveOn: '2026-10-02' });
    expect((await api.update(other.id, { effectiveOn: '2026-10-01' })).status).toBe(409);
  });

  it('refuse a rate of the Base Currency into itself, and malformed input', async () => {
    const { api } = await setUp();
    expect((await api.create({ ...usd, currency: 'IRR' })).status).toBe(400);
    expect((await api.create({ ...usd, rate: '0' })).status).toBe(400);
    expect((await api.create({ ...usd, rate: 1050000 })).status).toBe(400);
    expect((await api.create({ ...usd, currency: 'XYZ' })).status).toBe(400);
    expect((await api.create({ ...usd, effectiveOn: '2026-13-01' })).status).toBe(400);
    const { body: rate } = await api.create(usd);
    expect((await api.update(rate.id, { currency: 'EUR' })).status).toBe(400);
    expect((await api.update(rate.id, {})).status).toBe(400);
  });

  it('change the rate and day, and delete a rate', async () => {
    const { api } = await setUp();
    const { body: rate } = await api.create(usd);
    const res = await api.update(rate.id, { rate: '1060000', effectiveOn: '2026-10-03' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...rate, rate: '1060000', effectiveOn: '2026-10-03', version: 2 });
    expect((await api.remove(rate.id)).status).toBe(204);
    expect((await api.list()).body).toEqual([]);
  });

  it('leave out rates into a former Base Currency', async () => {
    const { user, api } = await setUp();
    const { body: rate } = await api.create(usd);
    await api.settings({ baseCurrency: 'EUR' });
    expect((await api.list()).body).toEqual([]);
    expect((await api.update(rate.id, { rate: '1' })).status).toBe(404);
    // A rate of the old Base Currency is a rate into the new one.
    expect((await api.create({ ...usd, currency: 'IRR', rate: '0.0000008' })).status).toBe(201);
    await api.settings({ baseCurrency: 'IRR' });
    expect((await api.list()).body).toEqual([rate]);
    expect(
      await db.select().from(exchangeRates).where(eq(exchangeRates.workspaceId, user.workspaceId)),
    ).toHaveLength(2);
  });

  it('let only Owners and Admins change rates; every Member sees them', async () => {
    const { user: owner, api } = await setUp();
    const { body: rate } = await api.create(usd);
    const admin = client(t, await addMember(owner.workspaceId, 'ADMIN'), owner.workspaceId);
    expect((await admin.create({ ...usd, effectiveOn: '2026-10-02' })).status).toBe(201);
    for (const role of ['MEMBER', 'VIEWER'] as const) {
      const other = client(t, await addMember(owner.workspaceId, role), owner.workspaceId);
      expect((await other.create({ ...usd, effectiveOn: '2026-10-03' })).status).toBe(403);
      expect((await other.update(rate.id, { rate: '1' })).status).toBe(403);
      expect((await other.remove(rate.id)).status).toBe(403);
      expect((await other.list()).body).toHaveLength(2);
    }
  });

  it("answer 404 for another Workspace's rates", async () => {
    const a = await setUp();
    const b = await setUp();
    const { body: bRate } = await b.api.create(usd);
    const aInB = client(t, a.user, b.user.workspaceId);
    expect((await aInB.list()).status).toBe(404);
    expect((await aInB.create(usd)).status).toBe(404);
    expect((await a.api.update(bRate.id, { rate: '1' })).status).toBe(404);
    expect((await a.api.remove(bRate.id)).status).toBe(404);
    expect((await a.api.list()).body).toEqual([]);
    expect((await b.api.list()).body).toEqual([bRate]);
  });

  it('answer 404 for rates that do not exist or ids that are not uuids', async () => {
    const { api } = await setUp();
    for (const id of [randomUUID(), 'not-a-uuid']) {
      expect((await api.update(id, { rate: '1' })).status).toBe(404);
      expect((await api.remove(id)).status).toBe(404);
    }
  });

  it('write ids and field names to the audit log, never rates', async () => {
    const { user, api } = await setUp();
    const { body: rate } = await api.create({ ...usd, rate: '987654' });
    await api.update(rate.id, { rate: '123456' });
    await api.remove(rate.id);
    const rows = await db
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.workspaceId, user.workspaceId), eq(auditLogs.actorUserId, user.userId)),
      )
      .orderBy(desc(auditLogs.createdAt));
    expect(rows.filter((r) => r.action.startsWith('exchange_rate.'))).toMatchObject([
      { action: 'exchange_rate.delete', metadata: { exchangeRateId: rate.id } },
      { action: 'exchange_rate.update', metadata: { exchangeRateId: rate.id, fields: ['rate'] } },
      { action: 'exchange_rate.create', metadata: { exchangeRateId: rate.id } },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/987654|123456/);
  });
});
