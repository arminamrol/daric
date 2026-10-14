import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLogs, workspaces } from '../../db/schema';
import { call, registerUser, startTestApp, type TestApp } from '../../test/app';
import { testDatabase } from '../../test/db';
import { joined } from '../../test/sharing';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

describe('Consents', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.close());

  const consents = (user: { token: string }) =>
    call(t.url, 'GET', '/v1/me/consents', { token: user.token });
  const revoke = (user: { token: string }, id: string) =>
    call(t.url, 'POST', `/v1/me/consents/${id}/revoke`, { token: user.token });

  it('list the sharing Consent given by accepting an Invitation', async () => {
    const owner = await registerUser(t.url);
    const member = await joined(t, owner, 'MEMBER');
    const res = await consents(member);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: expect.any(String),
        purpose: 'WORKSPACE_SHARING',
        workspace: { id: owner.workspaceId, name: 'Personal' },
        policyVersion: expect.any(String),
        grantedAt: expect.any(String),
        revokedAt: null,
      },
    ]);
    expect((await consents(owner)).body).toEqual([]);
  });

  it('end the membership at once when the sharing Consent is revoked', async () => {
    const owner = await registerUser(t.url);
    const member = await joined(t, owner, 'MEMBER');
    const [consent] = (await consents(member)).body;

    expect((await revoke(member, consent.id)).status).toBe(204);
    const read = await call(t.url, 'GET', `/v1/workspaces/${owner.workspaceId}`, {
      token: member.token,
    });
    expect(read.status).toBe(404);
    const [after] = (await consents(member)).body;
    expect(after.revokedAt).toEqual(expect.any(String));
    // Revoking again changes nothing.
    expect((await revoke(member, consent.id)).status).toBe(204);

    const audited = await db
      .select({ action: auditLogs.action, actor: auditLogs.actorUserId })
      .from(auditLogs)
      .where(
        and(eq(auditLogs.workspaceId, owner.workspaceId), eq(auditLogs.actorUserId, member.userId)),
      )
      .orderBy(auditLogs.createdAt, auditLogs.id);
    expect(audited.map((r) => r.action)).toEqual([
      'invitation.accept',
      'consent.grant',
      'consent.revoke',
      'member.leave',
    ]);
  });

  it('give a new Consent on joining again, keeping the revoked one', async () => {
    const owner = await registerUser(t.url);
    const member = await joined(t, owner, 'MEMBER');
    const [first] = (await consents(member)).body;
    await revoke(member, first.id);

    const again = await call(t.url, 'POST', `/v1/workspaces/${owner.workspaceId}/invitations`, {
      token: owner.token,
      body: { email: member.email, role: 'VIEWER' },
    });
    const token = new URL(again.body.link).searchParams.get('token');
    expect(
      (
        await call(t.url, 'POST', '/v1/invitations/accept', {
          token: member.token,
          body: { token },
        })
      ).status,
    ).toBe(200);
    const list = (await consents(member)).body;
    expect(list).toHaveLength(2);
    expect(list[0].revokedAt).toBeNull();
    expect(list[1]).toMatchObject({ id: first.id, revokedAt: expect.any(String) });
  });

  it('can still be revoked once its Workspace is gone', async () => {
    const owner = await registerUser(t.url);
    const member = await joined(t, owner, 'MEMBER');
    const [consent] = (await consents(member)).body;
    await db.delete(workspaces).where(eq(workspaces.id, owner.workspaceId));
    expect((await consents(member)).body[0].workspace).toBeNull();
    expect((await revoke(member, consent.id)).status).toBe(204);
    expect((await consents(member)).body[0].revokedAt).toEqual(expect.any(String));
  });

  it("answer 404 for another User's Consent", async () => {
    const owner = await registerUser(t.url);
    const member = await joined(t, owner, 'MEMBER');
    const [consent] = (await consents(member)).body;
    expect((await revoke(owner, consent.id)).status).toBe(404);
    expect((await revoke(owner, 'not-an-id')).status).toBe(404);
    const read = await call(t.url, 'GET', `/v1/workspaces/${owner.workspaceId}`, {
      token: member.token,
    });
    expect(read.status).toBe(200);
  });
});
