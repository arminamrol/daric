import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLogs, netWorthSnapshots, workspaceMembers, workspaces } from '../../db/schema';
import { call, registerUser, startTestApp, type TestApp } from '../../test/app';
import { testDatabase } from '../../test/db';
import { NetWorthService } from './net-worth.service';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

type User = Awaited<ReturnType<typeof registerUser>>;

function client(t: TestApp, user: User, workspaceId = user.workspaceId) {
  const base = `/v1/workspaces/${workspaceId}`;
  const as = (method: string, path: string, body?: unknown) =>
    call(t.url, method, `${base}${path}`, { token: user.token, body });
  return {
    netWorth: () => as('GET', '/net-worth'),
    history: () => as('GET', '/net-worth/snapshots'),
    take: () => as('POST', '/net-worth/snapshots'),
    snapshot: (id: string) => as('GET', `/net-worth/snapshots/${id}`),
    account: async (name: string, openingBalance: string, type = 'BANK') =>
      (
        await as('POST', '/accounts', {
          name,
          type,
          class: 'ASSET',
          currency: 'IRR',
          openingBalance,
        })
      ).body,
    value: (id: string, amount: string, valuedOn: string) =>
      as('POST', `/accounts/${id}/valuations`, { amount, valuedOn }),
    transfer: (accountId: string, toAccountId: string, amount: string, occurredOn: string) =>
      as('POST', '/transactions', { type: 'TRANSFER', accountId, toAccountId, amount, occurredOn }),
  };
}

// Farvardin 1405 runs 2026-03-21 – 2026-04-20, Ordibehesht 2026-04-21 – 2026-05-21,
// Khordad 2026-05-22 – 2026-06-21. Tehran is UTC+3:30.
const ORDIBEHESHT_LAST_MINUTE = new Date('2026-05-21T20:29:59Z');
const KHORDAD_FIRST_MINUTE = new Date('2026-05-21T20:30:00Z');

describe('Net Worth Snapshots', () => {
  let t: TestApp;
  let netWorth: NetWorthService;
  beforeAll(async () => {
    t = await startTestApp();
    netWorth = t.app.get(NetWorthService);
  });
  afterAll(() => t.close());

  /** A User whose Workspace was created on 12 Farvardin 1405. */
  async function setUp() {
    const user = await registerUser(t.url);
    await db
      .update(workspaces)
      .set({ createdAt: new Date('2026-04-01T08:00:00Z') })
      .where(eq(workspaces.id, user.workspaceId));
    return { user, api: client(t, user) };
  }

  const autoDays = async (workspaceId: string) =>
    (
      await db
        .select({ day: netWorthSnapshots.day })
        .from(netWorthSnapshots)
        .where(eq(netWorthSnapshots.workspaceId, workspaceId))
        .orderBy(netWorthSnapshots.day)
    ).map((r) => r.day);

  it('takes one AUTO snapshot per ended month, from local midnight after its last day', async () => {
    const { user } = await setUp();
    await netWorth.takeDueAutoSnapshots(ORDIBEHESHT_LAST_MINUTE);
    expect(await autoDays(user.workspaceId)).toEqual(['2026-04-20']);
    await netWorth.takeDueAutoSnapshots(KHORDAD_FIRST_MINUTE);
    expect(await autoDays(user.workspaceId)).toEqual(['2026-04-20', '2026-05-21']);
  });

  it('takes nothing again for a month that has its snapshot, even run twice at once', async () => {
    const { user } = await setUp();
    await Promise.all([
      netWorth.takeDueAutoSnapshots(KHORDAD_FIRST_MINUTE),
      netWorth.takeDueAutoSnapshots(KHORDAD_FIRST_MINUTE),
    ]);
    await netWorth.takeDueAutoSnapshots(new Date('2026-06-01T00:00:00Z'));
    expect(await autoDays(user.workspaceId)).toEqual(['2026-04-20', '2026-05-21']);
    await expect(
      db.insert(netWorthSnapshots).values({
        workspaceId: user.workspaceId,
        kind: 'AUTO',
        day: '2026-04-20',
        baseCurrency: 'IRR',
        total: 0n,
        assets: 0n,
        liabilities: 0n,
        breakdown: { byCurrency: [], accounts: [], ratesUsed: [], missing: [] },
      }),
    ).rejects.toThrow();
  });

  it('values each month as of its last day: Transactions and Valuations after it do not count', async () => {
    const { api } = await setUp();
    const bank = await api.account('Melli', '10000');
    const wallet = await api.account('Wallet', '0', 'WALLET');
    const car = await api.account('Car', '0', 'OTHER_ASSET');
    await api.transfer(bank.id, wallet.id, '3000', '2026-04-25');
    await api.value(car.id, '500000', '2026-04-05');
    await api.value(car.id, '450000', '2026-05-01');
    await netWorth.takeDueAutoSnapshots(KHORDAD_FIRST_MINUTE);

    const { body } = await api.history();
    expect(body).toMatchObject([
      { kind: 'AUTO', day: '2026-04-20', baseCurrency: 'IRR', total: '510000', missing: [] },
      { kind: 'AUTO', day: '2026-05-21', total: '460000', assets: '460000', liabilities: '0' },
    ]);
    const farvardin = await api.snapshot(body[0].id);
    expect(farvardin.status).toBe(200);
    expect(farvardin.body.accounts).toEqual([
      expect.objectContaining({ accountId: bank.id, value: '10000', valuedOn: null }),
      expect.objectContaining({ accountId: wallet.id, value: '0' }),
      expect.objectContaining({ accountId: car.id, value: '500000', valuedOn: '2026-04-05' }),
    ]);
    const ordibehesht = await api.snapshot(body[1].id);
    expect(ordibehesht.body.accounts).toEqual([
      expect.objectContaining({ accountId: bank.id, value: '7000' }),
      expect.objectContaining({ accountId: wallet.id, value: '3000' }),
      expect.objectContaining({ accountId: car.id, value: '450000', valuedOn: '2026-05-01' }),
    ]);
  });

  it('can be run for one Workspace only', async () => {
    const a = await setUp();
    const b = await setUp();
    await netWorth.takeDueAutoSnapshots(KHORDAD_FIRST_MINUTE, { workspaceId: a.user.workspaceId });
    expect(await autoDays(a.user.workspaceId)).toEqual(['2026-04-20', '2026-05-21']);
    expect(await autoDays(b.user.workspaceId)).toEqual([]);
  });

  it('takes nothing for a Workspace created after `now`', async () => {
    const user = await registerUser(t.url);
    await netWorth.takeDueAutoSnapshots(KHORDAD_FIRST_MINUTE);
    expect(await autoDays(user.workspaceId)).toEqual([]);
  });

  it("stores today's Net Worth, as shown, as a MANUAL snapshot on demand", async () => {
    const { user, api } = await setUp();
    await api.account('Melli', '42');
    const now = await api.netWorth();
    const res = await api.take();
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      ...now.body,
      id: expect.any(String),
      kind: 'MANUAL',
      takenAt: expect.any(String),
    });
    expect((await api.snapshot(res.body.id)).body).toEqual(res.body);
    // Another one the same day is another snapshot.
    expect((await api.take()).status).toBe(201);
    await netWorth.takeDueAutoSnapshots(KHORDAD_FIRST_MINUTE);

    const { body } = await api.history();
    expect(body.map((s: { kind: string }) => s.kind)).toEqual(['AUTO', 'AUTO', 'MANUAL', 'MANUAL']);
    expect(body[2]).toEqual({
      id: res.body.id,
      kind: 'MANUAL',
      day: now.body.day,
      takenAt: res.body.takenAt,
      baseCurrency: 'IRR',
      total: '42',
      assets: '42',
      liabilities: '0',
      missing: [],
    });
    const audit = await db
      .select({ action: auditLogs.action, metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(eq(auditLogs.workspaceId, user.workspaceId));
    expect(audit).toContainEqual({
      action: 'net_worth_snapshot.create',
      metadata: { snapshotId: res.body.id },
    });
  });

  it('lets Viewers see the history but not take a snapshot', async () => {
    const { user } = await setUp();
    const viewer = await registerUser(t.url);
    await db
      .insert(workspaceMembers)
      .values({ workspaceId: user.workspaceId, userId: viewer.userId, role: 'VIEWER' });
    const api = client(t, viewer, user.workspaceId);
    expect((await api.take()).status).toBe(403);
    expect((await api.history()).status).toBe(200);
  });

  it("answers 404 for another Workspace's snapshots", async () => {
    const a = await setUp();
    const b = await setUp();
    const { body } = await b.api.take();
    expect((await client(t, a.user, b.user.workspaceId).history()).status).toBe(404);
    expect((await a.api.snapshot(body.id)).status).toBe(404);
    expect((await a.api.snapshot('not-a-uuid')).status).toBe(404);
  });
});
