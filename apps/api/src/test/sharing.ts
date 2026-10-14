import type { WorkspaceRole } from '@daric/core';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { subscriptions, workspaceMembers } from '../db/schema';
import { DAY } from '../common/time';
import { call, registerUser, type TestApp } from './app';

export type TestUser = Awaited<ReturnType<typeof registerUser>>;

/** Registers a User and follows the verification link mailed to them. */
export async function verifiedUser(t: TestApp): Promise<TestUser> {
  const user = await registerUser(t.url);
  const res = await call(t.url, 'POST', '/v1/auth/email/verify', {
    body: { token: t.mail.lastToken(user.email) },
  });
  if (res.status !== 204) throw new Error(`verify failed: ${res.status}`);
  return user;
}

export const invitationsPath = (workspaceId: string) => `/v1/workspaces/${workspaceId}/invitations`;
export const membersPath = (workspaceId: string) => `/v1/workspaces/${workspaceId}/members`;

export function invite(
  t: TestApp,
  actor: { token: string },
  workspaceId: string,
  body: { email?: string; role: string },
) {
  return call(t.url, 'POST', invitationsPath(workspaceId), { token: actor.token, body });
}

/** The token in an Invitation link. */
export function tokenOf(link: string): string {
  const token = new URL(link).searchParams.get('token');
  if (!token) throw new Error(`no token in ${link}`);
  return token;
}

export function accept(t: TestApp, user: { token: string }, token: string) {
  return call(t.url, 'POST', '/v1/invitations/accept', { token: user.token, body: { token } });
}

/** A fresh verified User who joined `owner`'s Workspace through an Invitation with `role`. */
export async function joined(t: TestApp, owner: TestUser, role: string): Promise<TestUser> {
  const user = await verifiedUser(t);
  const created = await invite(t, owner, owner.workspaceId, { email: user.email, role });
  if (created.status !== 201) throw new Error(`invite failed: ${created.status}`);
  const res = await accept(t, user, tokenOf(created.body.link));
  if (res.status !== 200) throw new Error(`accept failed: ${res.status}`);
  return user;
}

/** Makes `user` a Member of `workspaceId` with `role` directly in the database. */
export async function addMember(
  db: Database,
  workspaceId: string,
  user: { userId: string },
  role: WorkspaceRole,
): Promise<string> {
  const [row] = await db
    .insert(workspaceMembers)
    .values({ workspaceId, userId: user.userId, role })
    .returning({ id: workspaceMembers.id });
  if (!row) throw new Error('insert failed');
  return row.id;
}

/** Ends the User's Plus time, leaving them on Free (with billing enabled). */
export async function makeFree(db: Database, user: { userId: string }): Promise<void> {
  const past = new Date(Date.now() - DAY);
  await db
    .update(subscriptions)
    .set({ trialEndsAt: past, expiresAt: past })
    .where(eq(subscriptions.userId, user.userId));
}
