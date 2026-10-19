import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DAY, HOUR, MINUTE } from '../../common/time';
import { auditLogs, subscriptions, userConsents, workspaceMembers } from '../../db/schema';
import { call, registerUser, startTestApp, testPassword, type TestApp } from '../../test/app';
import { testDatabase } from '../../test/db';
import { joined, membersPath, type TestUser } from '../../test/sharing';
import { GRACE_DAYS } from './billing-config';
import { ExpiryService } from './expiry.service';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

const APP_URL = 'http://localhost:5173';

async function setExpiry(user: { userId: string }, expiresAt: Date) {
  await db
    .update(subscriptions)
    .set({ expiresAt, trialEndsAt: expiresAt })
    .where(eq(subscriptions.userId, user.userId));
}

/** Mail about the User's Plus, leaving out the verification mail sent at sign-up. */
const plusMail = (t: TestApp, email: string) =>
  t.mail.to(email).filter((m) => !m.text.includes('token='));

const accounts = (t: TestApp, user: TestUser, workspaceId: string) =>
  call(t.url, 'GET', `/v1/workspaces/${workspaceId}/accounts`, { token: user.token });

async function logIn(t: TestApp, email: string) {
  const res = await call(t.url, 'POST', '/v1/auth/login', {
    body: { email, password: testPassword },
  });
  expect(res.status).toBe(200);
  return {
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
  };
}

const refresh = (t: TestApp, refreshToken: string) =>
  call(t.url, 'POST', '/v1/auth/refresh', { body: { refreshToken } });

/** Buys a month of Plus through the fake provider, as the web app does. */
async function buyPlus(t: TestApp, user: TestUser) {
  const res = await call(t.url, 'POST', '/v1/me/payments', {
    token: user.token,
    body: { months: 1 },
  });
  expect(res.status).toBe(201);
  const reference = t.payments.lastReference();
  t.payments.pay(reference);
  const back = await fetch(`${t.url}/v1/payments/callback?reference=${reference}&status=OK`, {
    redirect: 'manual',
  });
  expect(back.status).toBe(302);
}

const auditRows = (workspaceId: string, action: 'member.suspend' | 'member.restore') =>
  db
    .select({ actorUserId: auditLogs.actorUserId, metadata: auditLogs.metadata })
    .from(auditLogs)
    .where(and(eq(auditLogs.workspaceId, workspaceId), eq(auditLogs.action, action)));

describe('Plus expiry with billing enabled', () => {
  let t: TestApp;
  let expiry: ExpiryService;
  beforeAll(async () => {
    t = await startTestApp({
      env: { BILLING_ENABLED: 'true', FREE_DEVICE_LIMIT: '1', PLUS_DEVICE_LIMIT: '3' },
    });
    expiry = t.app.get(ExpiryService);
  });
  afterAll(() => t.close());

  /** Runs the job at `now`, for these Users only (other test files share the database). */
  const run = (now: Date, ...users: { userId: string }[]) =>
    expiry.runDue(now, { userIds: users.map((u) => u.userId) });

  describe('reminders', () => {
    it('mails a reminder 7 days and 1 day before the expiry, and when the Grace Period starts', async () => {
      const user = await registerUser(t.url);
      const expiresAt = new Date(Date.now() + 30 * DAY);
      await setExpiry(user, expiresAt);
      const at = (offset: number) => new Date(expiresAt.getTime() + offset);
      const mails = () => plusMail(t, user.email);

      await run(at(-7 * DAY - MINUTE), user);
      expect(mails()).toHaveLength(0);

      await run(at(-7 * DAY), user);
      expect(mails()).toHaveLength(1);
      expect(mails()[0]?.text).toContain('۷ روز');
      expect(mails()[0]?.text).toContain(`${APP_URL}/settings/subscription/checkout`);

      // Each one once, however often the job runs.
      await run(at(-6 * DAY), user);
      await run(at(-2 * DAY), user);
      expect(mails()).toHaveLength(1);

      await run(at(-DAY), user);
      await run(at(-HOUR), user);
      expect(mails()).toHaveLength(2);
      expect(mails()[1]?.text).toContain('فردا');

      await run(at(0), user);
      await run(at(3 * DAY), user);
      expect(mails()).toHaveLength(3);
      expect(mails()[2]?.subject).toContain('مهلت');
    });

    it('skips a reminder whose time passed while the job was not running', async () => {
      const user = await registerUser(t.url);
      const expiresAt = new Date(Date.now() + 30 * DAY);
      await setExpiry(user, expiresAt);
      await run(new Date(expiresAt.getTime() - 12 * HOUR), user);
      expect(plusMail(t, user.email)).toHaveLength(1);
      expect(plusMail(t, user.email)[0]?.text).toContain('فردا');
    });

    it('starts the reminders afresh for a renewed expiry', async () => {
      const user = await registerUser(t.url);
      const first = new Date(Date.now() + 30 * DAY);
      await setExpiry(user, first);
      await run(new Date(first.getTime() - 3 * DAY), user);
      expect(plusMail(t, user.email)).toHaveLength(1);

      const renewed = new Date(first.getTime() + 30 * DAY);
      await setExpiry(user, renewed);
      await run(new Date(first.getTime() - 2 * DAY), user);
      expect(plusMail(t, user.email)).toHaveLength(1);
      await run(new Date(renewed.getTime() - 3 * DAY), user);
      expect(plusMail(t, user.email)).toHaveLength(2);
    });

    it('warns an Owner with Members that they will lose access after the Grace Period', async () => {
      const owner = await registerUser(t.url);
      await joined(t, owner, 'MEMBER');
      const loner = await registerUser(t.url);
      const expiresAt = new Date(Date.now() + 30 * DAY);
      await setExpiry(owner, expiresAt);
      await setExpiry(loner, expiresAt);

      await run(expiresAt, owner, loner);
      expect(plusMail(t, owner.email).at(-1)?.text).toContain('اعضای');
      expect(plusMail(t, loner.email).at(-1)?.text).not.toContain('اعضای');
    });
  });

  describe('the end of the Grace Period', () => {
    /** An Owner whose Workspace has a Member, with Plus ended `ago` before now. */
    async function sharedWorkspace(ago: number) {
      const owner = await registerUser(t.url);
      const member = await joined(t, owner, 'MEMBER');
      await setExpiry(owner, new Date(Date.now() - ago));
      return { owner, member };
    }

    it('changes nothing while the Grace Period runs', async () => {
      const { owner, member } = await sharedWorkspace(GRACE_DAYS * DAY - 5 * MINUTE);
      await run(new Date(), owner, member);
      expect((await accounts(t, member, owner.workspaceId)).status).toBe(200);
      const me = await call(t.url, 'GET', '/v1/me/subscription', { token: owner.token });
      expect(me.body).toMatchObject({ plan: 'PLUS', inGracePeriod: true });
    });

    it('suspends the Members of Workspaces the Owner owns, without removing them', async () => {
      const { owner, member } = await sharedWorkspace(GRACE_DAYS * DAY + MINUTE);
      await run(new Date(), owner, member);

      const refused = await accounts(t, member, owner.workspaceId);
      expect(refused.status).toBe(403);
      expect(refused.body.reason).toBe('MEMBERSHIP_SUSPENDED');
      // The Owner keeps their own Workspace.
      expect((await accounts(t, owner, owner.workspaceId)).status).toBe(200);

      const me = await call(t.url, 'GET', '/v1/me', { token: member.token });
      expect(me.body.workspaces).toContainEqual(
        expect.objectContaining({ id: owner.workspaceId, suspended: true, role: 'MEMBER' }),
      );
      expect(me.body.workspaces).toContainEqual(
        expect.objectContaining({ id: member.workspaceId, suspended: false }),
      );

      const members = await call(t.url, 'GET', membersPath(owner.workspaceId), {
        token: owner.token,
      });
      expect(members.body).toEqual([
        expect.objectContaining({ userId: owner.userId, suspended: false }),
        expect.objectContaining({ userId: member.userId, role: 'MEMBER', suspended: true }),
      ]);
      // Their sharing Consent stays: they are paused, not gone.
      const consents = await db
        .select({ revokedAt: userConsents.revokedAt })
        .from(userConsents)
        .where(eq(userConsents.userId, member.userId));
      expect(consents).toEqual([{ revokedAt: null }]);

      expect(await auditRows(owner.workspaceId, 'member.suspend')).toEqual([
        { actorUserId: null, metadata: { memberUserId: member.userId, role: 'MEMBER' } },
      ]);
      // Once.
      await run(new Date(), owner, member);
      expect(await auditRows(owner.workspaceId, 'member.suspend')).toHaveLength(1);
    });

    it('keeps only the most recently used Signed-in Device', async () => {
      const owner = await registerUser(t.url);
      const older = await logIn(t, owner.email);
      const newest = await logIn(t, owner.email);
      await setExpiry(owner, new Date(Date.now() - GRACE_DAYS * DAY - MINUTE));

      await run(new Date(), owner);

      const refused = await refresh(t, older.refreshToken);
      expect(refused.status).toBe(401);
      expect(refused.body.reason).toBe('PLUS_ENDED');
      expect((await refresh(t, newest.refreshToken)).status).toBe(200);
      const [audit] = await db
        .select({ actorUserId: auditLogs.actorUserId, metadata: auditLogs.metadata })
        .from(auditLogs)
        .where(
          and(eq(auditLogs.actorUserId, owner.userId), eq(auditLogs.action, 'auth.plus_ended')),
        );
      expect(audit?.metadata).toMatchObject({ deviceIds: expect.any(Array) });
      expect((audit?.metadata as { deviceIds: string[] }).deviceIds).toHaveLength(2);
    });

    it('restores the Members at once when the Owner buys Plus, with their data untouched', async () => {
      const { owner, member } = await sharedWorkspace(GRACE_DAYS * DAY + MINUTE);
      const created = await call(t.url, 'POST', `/v1/workspaces/${owner.workspaceId}/accounts`, {
        token: owner.token,
        body: {
          name: 'Cash',
          type: 'CASH',
          class: 'ASSET',
          currency: 'IRR',
          openingBalance: '5000',
        },
      });
      expect(created.status).toBe(201);
      const before = (await accounts(t, owner, owner.workspaceId)).body;

      await run(new Date(), owner, member);
      expect((await accounts(t, member, owner.workspaceId)).status).toBe(403);
      // Nothing financial changes while suspended.
      expect((await accounts(t, owner, owner.workspaceId)).body).toEqual(before);

      await buyPlus(t, owner);

      const back = await accounts(t, member, owner.workspaceId);
      expect(back.status).toBe(200);
      expect(back.body).toEqual(before);
      const me = await call(t.url, 'GET', '/v1/me', { token: member.token });
      expect(me.body.workspaces).toContainEqual(
        expect.objectContaining({ id: owner.workspaceId, suspended: false }),
      );
      expect(await auditRows(owner.workspaceId, 'member.restore')).toEqual([
        { actorUserId: owner.userId, metadata: { memberUserId: member.userId, role: 'MEMBER' } },
      ]);
    });

    it('lets a suspended Member be removed by the Owner', async () => {
      const { owner, member } = await sharedWorkspace(GRACE_DAYS * DAY + MINUTE);
      await run(new Date(), owner, member);
      const [row] = await db
        .select({ id: workspaceMembers.id })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, owner.workspaceId),
            eq(workspaceMembers.userId, member.userId),
          ),
        );
      const res = await call(t.url, 'DELETE', `${membersPath(owner.workspaceId)}/${row?.id}`, {
        token: owner.token,
      });
      expect(res.status).toBe(204);
    });
  });
});

describe('Plus expiry with billing disabled', () => {
  let t: TestApp;
  let expiry: ExpiryService;
  beforeAll(async () => {
    t = await startTestApp();
    expiry = t.app.get(ExpiryService);
  });
  afterAll(() => t.close());

  it('mails nothing and suspends nobody', async () => {
    const owner = await registerUser(t.url);
    const member = await joined(t, owner, 'MEMBER');
    await setExpiry(owner, new Date(Date.now() - 30 * DAY));
    await expiry.runDue(new Date(), { userIds: [owner.userId, member.userId] });
    expect((await accounts(t, member, owner.workspaceId)).status).toBe(200);
    expect(plusMail(t, owner.email)).toHaveLength(0);
  });

  it('restores Members suspended while billing was enabled', async () => {
    const owner = await registerUser(t.url);
    const member = await joined(t, owner, 'MEMBER');
    await db
      .update(workspaceMembers)
      .set({ suspendedAt: new Date() })
      .where(
        and(
          eq(workspaceMembers.workspaceId, owner.workspaceId),
          inArray(workspaceMembers.userId, [member.userId]),
        ),
      );
    expect((await accounts(t, member, owner.workspaceId)).status).toBe(403);
    await expiry.runDue(new Date(), { userIds: [owner.userId] });
    expect((await accounts(t, member, owner.workspaceId)).status).toBe(200);
  });
});
