import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLogs, workspaceMembers } from '../../db/schema';
import { call, registerUser, startTestApp, type TestApp } from '../../test/app';
import { testDatabase } from '../../test/db';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

describe('Workspace settings', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.close());

  const patch = (token: string, workspaceId: string, body: unknown) =>
    call(t.url, 'PATCH', `/v1/workspaces/${workspaceId}`, { token, body });

  it('start as IRR, Jalali, Tehran time, shown in rials', async () => {
    const a = await registerUser(t.url);
    const res = await call(t.url, 'GET', `/v1/workspaces/${a.workspaceId}`, { token: a.token });
    expect(res.body).toMatchObject({
      baseCurrency: 'IRR',
      calendar: 'jalali',
      timezone: 'Asia/Tehran',
      moneyDisplay: 'rial',
    });
  });

  it('let the Owner change the Base Currency, calendar, timezone and Rial/Toman display', async () => {
    const a = await registerUser(t.url);
    const settings = {
      baseCurrency: 'USD',
      calendar: 'gregorian',
      timezone: 'Europe/Berlin',
      moneyDisplay: 'toman',
    };
    const res = await patch(a.token, a.workspaceId, settings);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ...settings, name: 'Personal' });

    const read = await call(t.url, 'GET', `/v1/workspaces/${a.workspaceId}`, { token: a.token });
    expect(read.body).toMatchObject(settings);
    const me = await call(t.url, 'GET', '/v1/me', { token: a.token });
    expect(me.body.workspaces[0]).toMatchObject(settings);
  });

  it('change only the fields sent', async () => {
    const a = await registerUser(t.url);
    await patch(a.token, a.workspaceId, { moneyDisplay: 'toman' });
    const res = await patch(a.token, a.workspaceId, { calendar: 'gregorian' });
    expect(res.body).toMatchObject({
      calendar: 'gregorian',
      moneyDisplay: 'toman',
      timezone: 'Asia/Tehran',
      baseCurrency: 'IRR',
    });
  });

  it('store timezones by their canonical IANA name', async () => {
    const a = await registerUser(t.url);
    const res = await patch(a.token, a.workspaceId, { timezone: 'asia/tehran' });
    expect(res.status).toBe(200);
    expect(res.body.timezone).toBe('Asia/Tehran');
  });

  it.each([
    ['an unknown timezone', { timezone: 'Mars/Olympus_Mons' }],
    ['a fixed offset instead of a timezone', { timezone: '+03:30' }],
    ['an unknown currency', { baseCurrency: 'XYZ' }],
    ['an unknown calendar', { calendar: 'hijri' }],
    ['an unknown money display', { moneyDisplay: 'dinar' }],
    ['an empty body', {}],
  ])('reject %s', async (_, body) => {
    const a = await registerUser(t.url);
    const res = await patch(a.token, a.workspaceId, body);
    expect(res.status).toBe(400);
    const read = await call(t.url, 'GET', `/v1/workspaces/${a.workspaceId}`, { token: a.token });
    expect(read.body).toMatchObject({ timezone: 'Asia/Tehran', baseCurrency: 'IRR' });
  });

  it('let an Admin change them but not a Member', async () => {
    const owner = await registerUser(t.url);
    const admin = await registerUser(t.url);
    const member = await registerUser(t.url);
    await db.insert(workspaceMembers).values([
      { workspaceId: owner.workspaceId, userId: admin.userId, role: 'ADMIN' },
      { workspaceId: owner.workspaceId, userId: member.userId, role: 'MEMBER' },
    ]);

    expect((await patch(admin.token, owner.workspaceId, { calendar: 'gregorian' })).status).toBe(
      200,
    );
    expect((await patch(member.token, owner.workspaceId, { calendar: 'jalali' })).status).toBe(403);
    const read = await call(t.url, 'GET', `/v1/workspaces/${owner.workspaceId}`, {
      token: member.token,
    });
    expect(read.body.calendar).toBe('gregorian');
  });

  it('write the changed field names to the audit log', async () => {
    const a = await registerUser(t.url);
    await patch(a.token, a.workspaceId, { calendar: 'gregorian', timezone: 'UTC' });
    const [row] = await db
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.workspaceId, a.workspaceId), eq(auditLogs.action, 'workspace.update')),
      )
      .orderBy(desc(auditLogs.createdAt));
    expect(row?.actorUserId).toBe(a.userId);
    expect(row?.metadata).toEqual({ fields: ['calendar', 'timezone'] });
  });
});
