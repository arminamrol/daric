import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DAY } from '../../common/time';
import { auditLogs, invitations, userConsents } from '../../db/schema';
import { call, registerUser, startTestApp, type TestApp } from '../../test/app';
import { testDatabase } from '../../test/db';
import {
  accept,
  addMember,
  invitationsPath,
  invite,
  joined,
  makeFree,
  tokenOf,
  verifiedUser,
} from '../../test/sharing';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

const list = (t: TestApp, user: { token: string }, workspaceId: string) =>
  call(t.url, 'GET', invitationsPath(workspaceId), { token: user.token });

const preview = (t: TestApp, user: { token: string }, token: string) =>
  call(t.url, 'POST', '/v1/invitations/preview', { token: user.token, body: { token } });

const revoke = (t: TestApp, user: { token: string }, workspaceId: string, id: string) =>
  call(t.url, 'POST', `${invitationsPath(workspaceId)}/${id}/revoke`, { token: user.token });

const actions = async (workspaceId: string) =>
  (
    await db
      .select({ action: auditLogs.action, metadata: auditLogs.metadata })
      .from(auditLogs)
      .where(eq(auditLogs.workspaceId, workspaceId))
      .orderBy(auditLogs.createdAt, auditLogs.id)
  ).map((r) => r.action);

describe('Invitations', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp({ env: { APP_URL: 'https://daric.example' } });
  });
  afterAll(() => t.close());

  it('mail a link to the invited email and show it once to the Owner', async () => {
    const owner = await registerUser(t.url);
    const res = await invite(t, owner, owner.workspaceId, {
      email: 'Reza@Example.com',
      role: 'MEMBER',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      email: 'reza@example.com',
      role: 'MEMBER',
      status: 'PENDING',
      invitedByEmail: owner.email,
    });
    expect(res.body.link).toMatch(/^https:\/\/daric\.example\/invitation\?token=[\w-]{40,}$/);
    expect(t.mail.lastToken('reza@example.com')).toBe(tokenOf(res.body.link));
    expect(t.mail.last('reza@example.com').subject).toContain('Personal');

    const listed = await list(t, owner, owner.workspaceId);
    expect(listed.status).toBe(200);
    expect(listed.body.sharingAllowed).toBe(true);
    expect(listed.body.invitations).toEqual([
      expect.objectContaining({ id: res.body.id, status: 'PENDING' }),
    ]);
    expect(listed.body.invitations[0].link).toBeUndefined();

    const [stored] = await db.select().from(invitations).where(eq(invitations.id, res.body.id));
    expect(stored?.tokenHash).not.toContain(tokenOf(res.body.link));
  });

  it('make a link without mailing anything when no email is given', async () => {
    const owner = await registerUser(t.url);
    const sentBefore = t.mail.sent.length;
    const res = await invite(t, owner, owner.workspaceId, { role: 'VIEWER' });
    expect(res.status).toBe(201);
    expect(res.body.email).toBeNull();
    expect(t.mail.sent.length).toBe(sentBefore);

    const anyone = await verifiedUser(t);
    const accepted = await accept(t, anyone, tokenOf(res.body.link));
    expect(accepted.status).toBe(200);
    expect(accepted.body.workspace).toMatchObject({ id: owner.workspaceId, role: 'VIEWER' });
  });

  it('show what an Invitation offers before it is accepted', async () => {
    const owner = await registerUser(t.url);
    const created = await invite(t, owner, owner.workspaceId, { role: 'ADMIN' });
    const someone = await registerUser(t.url);
    const res = await preview(t, someone, tokenOf(created.body.link));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      workspaceName: 'Personal',
      role: 'ADMIN',
      invitedByEmail: owner.email,
      email: null,
      expiresAt: created.body.expiresAt,
    });
    expect((await preview(t, someone, 'not-a-real-token')).status).toBe(400);
  });

  it('let the invited User join once their email is verified', async () => {
    const owner = await registerUser(t.url);
    const invitee = await registerUser(t.url);
    const created = await invite(t, owner, owner.workspaceId, {
      email: invitee.email,
      role: 'MEMBER',
    });
    const token = tokenOf(created.body.link);

    const unverified = await accept(t, invitee, token);
    expect(unverified.status).toBe(403);
    expect(unverified.body.reason).toBe('EMAIL_NOT_VERIFIED');

    // The first mail to them is the verification mailed at sign-up; the newest is the Invitation.
    const verifyLink = /\?token=([\w-]+)/.exec(t.mail.to(invitee.email)[0]?.text ?? '')?.[1];
    await call(t.url, 'POST', '/v1/auth/email/verify', { body: { token: verifyLink } });
    const res = await accept(t, invitee, token);
    expect(res.status).toBe(200);
    expect(res.body.workspace).toMatchObject({
      id: owner.workspaceId,
      name: 'Personal',
      role: 'MEMBER',
    });

    const me = await call(t.url, 'GET', '/v1/me', { token: invitee.token });
    expect(me.body.workspaces.map((w: { id: string }) => w.id)).toContain(owner.workspaceId);
    const read = await call(t.url, 'GET', `/v1/workspaces/${owner.workspaceId}`, {
      token: invitee.token,
    });
    expect(read.status).toBe(200);

    const listed = await list(t, owner, owner.workspaceId);
    expect(listed.body.invitations[0].status).toBe('ACCEPTED');
  });

  it('refuse a User with another email than the one invited', async () => {
    const owner = await registerUser(t.url);
    const created = await invite(t, owner, owner.workspaceId, {
      email: 'someone-else@example.com',
      role: 'MEMBER',
    });
    const other = await verifiedUser(t);
    const res = await accept(t, other, tokenOf(created.body.link));
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe('EMAIL_MISMATCH');
  });

  it('work only once', async () => {
    const owner = await registerUser(t.url);
    const created = await invite(t, owner, owner.workspaceId, { role: 'MEMBER' });
    const token = tokenOf(created.body.link);
    expect((await accept(t, await verifiedUser(t), token)).status).toBe(200);
    expect((await accept(t, await verifiedUser(t), token)).status).toBe(400);
  });

  it('stop working once revoked', async () => {
    const owner = await registerUser(t.url);
    const created = await invite(t, owner, owner.workspaceId, { role: 'MEMBER' });
    const res = await revoke(t, owner, owner.workspaceId, created.body.id);
    expect(res.status).toBe(204);
    expect((await accept(t, await verifiedUser(t), tokenOf(created.body.link))).status).toBe(400);
    expect((await list(t, owner, owner.workspaceId)).body.invitations[0].status).toBe('REVOKED');
    expect((await revoke(t, owner, owner.workspaceId, created.body.id)).status).toBe(409);
  });

  it('expire after 7 days', async () => {
    const owner = await registerUser(t.url);
    const created = await invite(t, owner, owner.workspaceId, { role: 'MEMBER' });
    const expiresIn = new Date(created.body.expiresAt).getTime() - Date.now();
    expect(Math.abs(expiresIn - 7 * DAY)).toBeLessThan(60_000);

    await db
      .update(invitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invitations.id, created.body.id));
    const someone = await verifiedUser(t);
    expect((await preview(t, someone, tokenOf(created.body.link))).status).toBe(400);
    expect((await accept(t, someone, tokenOf(created.body.link))).status).toBe(400);
    expect((await list(t, owner, owner.workspaceId)).body.invitations[0].status).toBe('EXPIRED');
    expect((await revoke(t, owner, owner.workspaceId, created.body.id)).status).toBe(409);
  });

  it('refuse a User who is already a Member', async () => {
    const owner = await registerUser(t.url);
    const created = await invite(t, owner, owner.workspaceId, { role: 'MEMBER' });
    const self = await verifiedUser(t);
    await addMember(db, owner.workspaceId, self, 'VIEWER');
    expect((await accept(t, self, tokenOf(created.body.link))).status).toBe(409);
  });

  it('refuse to invite an email twice, or one that is already a Member', async () => {
    const owner = await registerUser(t.url);
    const member = await joined(t, owner, 'MEMBER');
    expect(
      (await invite(t, owner, owner.workspaceId, { email: member.email, role: 'VIEWER' })).status,
    ).toBe(409);
    expect(
      (await invite(t, owner, owner.workspaceId, { email: 'x@example.com', role: 'VIEWER' }))
        .status,
    ).toBe(201);
    expect(
      (await invite(t, owner, owner.workspaceId, { email: 'X@example.com', role: 'MEMBER' }))
        .status,
    ).toBe(409);
  });

  it('make only one of several simultaneous Invitations to the same email', async () => {
    const owner = await registerUser(t.url);
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        invite(t, owner, owner.workspaceId, { email: 'twice@example.com', role: 'MEMBER' }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
  });

  it('record the sharing Consent and audit every step', async () => {
    const owner = await registerUser(t.url);
    const created = await invite(t, owner, owner.workspaceId, { role: 'MEMBER' });
    const member = await verifiedUser(t);
    await accept(t, member, tokenOf(created.body.link));

    const consents = await db
      .select()
      .from(userConsents)
      .where(
        and(
          eq(userConsents.userId, member.userId),
          eq(userConsents.workspaceId, owner.workspaceId),
        ),
      );
    expect(consents).toEqual([
      expect.objectContaining({ purpose: 'WORKSPACE_SHARING', revokedAt: null }),
    ]);
    expect(consents[0]?.policyVersion).toMatch(/\S/);

    const second = await invite(t, owner, owner.workspaceId, { role: 'VIEWER' });
    await revoke(t, owner, owner.workspaceId, second.body.id);
    expect(await actions(owner.workspaceId)).toEqual([
      'auth.register',
      'invitation.create',
      'invitation.accept',
      'consent.grant',
      'invitation.create',
      'invitation.revoke',
    ]);
  });
});

describe('Who may invite', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.close());

  it('let the Owner give Admin, Member and Viewer, never Owner', async () => {
    const owner = await registerUser(t.url);
    for (const role of ['ADMIN', 'MEMBER', 'VIEWER']) {
      expect((await invite(t, owner, owner.workspaceId, { role })).status).toBe(201);
    }
    expect((await invite(t, owner, owner.workspaceId, { role: 'OWNER' })).status).toBe(400);
  });

  it('let an Admin give only Member and Viewer, and revoke only those', async () => {
    const owner = await registerUser(t.url);
    const admin = await joined(t, owner, 'ADMIN');
    expect((await invite(t, admin, owner.workspaceId, { role: 'MEMBER' })).status).toBe(201);
    expect((await invite(t, admin, owner.workspaceId, { role: 'VIEWER' })).status).toBe(201);
    expect((await invite(t, admin, owner.workspaceId, { role: 'ADMIN' })).status).toBe(403);

    const forAdmin = await invite(t, owner, owner.workspaceId, { role: 'ADMIN' });
    const forViewer = await invite(t, owner, owner.workspaceId, { role: 'VIEWER' });
    expect((await revoke(t, admin, owner.workspaceId, forAdmin.body.id)).status).toBe(403);
    expect((await revoke(t, admin, owner.workspaceId, forViewer.body.id)).status).toBe(204);
  });

  it.each(['MEMBER', 'VIEWER'])('keep a %s from inviting or seeing Invitations', async (role) => {
    const owner = await registerUser(t.url);
    const user = await joined(t, owner, role);
    const pending = await invite(t, owner, owner.workspaceId, { role: 'VIEWER' });
    expect((await invite(t, user, owner.workspaceId, { role: 'VIEWER' })).status).toBe(403);
    expect((await list(t, user, owner.workspaceId)).status).toBe(403);
    expect((await revoke(t, user, owner.workspaceId, pending.body.id)).status).toBe(403);
  });

  it("answer 404 for another Workspace's Invitation", async () => {
    const a = await registerUser(t.url);
    const b = await registerUser(t.url);
    const theirs = await invite(t, b, b.workspaceId, { role: 'VIEWER' });
    expect((await revoke(t, a, a.workspaceId, theirs.body.id)).status).toBe(404);
    expect((await revoke(t, a, b.workspaceId, theirs.body.id)).status).toBe(404);
  });
});

describe('Invitations and Plans', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp({ env: { BILLING_ENABLED: 'true' } });
  });
  afterAll(() => t.close());

  it("need the Owner's sharing Entitlement to be created", async () => {
    const owner = await registerUser(t.url);
    await makeFree(db, owner);
    const res = await invite(t, owner, owner.workspaceId, { role: 'MEMBER' });
    expect(res.status).toBe(402);
    expect((await list(t, owner, owner.workspaceId)).body.sharingAllowed).toBe(false);
  });

  it("go by the Owner's Plan when an Admin invites, not the Admin's", async () => {
    const owner = await registerUser(t.url);
    const admin = await joined(t, owner, 'ADMIN');
    expect((await invite(t, admin, owner.workspaceId, { role: 'MEMBER' })).status).toBe(201);
    await makeFree(db, owner);
    expect((await invite(t, admin, owner.workspaceId, { role: 'MEMBER' })).status).toBe(402);
    expect((await list(t, admin, owner.workspaceId)).body.sharingAllowed).toBe(false);
  });

  it('need no Plan to be accepted', async () => {
    const owner = await registerUser(t.url);
    const created = await invite(t, owner, owner.workspaceId, { role: 'MEMBER' });
    const member = await verifiedUser(t);
    await makeFree(db, member);
    expect((await accept(t, member, tokenOf(created.body.link))).status).toBe(200);
  });

  it('cannot be accepted once the Owner has lost sharing', async () => {
    const owner = await registerUser(t.url);
    const created = await invite(t, owner, owner.workspaceId, { role: 'MEMBER' });
    await makeFree(db, owner);
    const member = await verifiedUser(t);
    expect((await accept(t, member, tokenOf(created.body.link))).status).toBe(402);
  });
});
