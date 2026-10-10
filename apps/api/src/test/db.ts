import { randomUUID } from 'node:crypto';
import { inject } from 'vitest';
import { createDatabase, type Database, one } from '../db/client';
import { users, workspaceMembers, workspaces } from '../db/schema';

export function testDatabase() {
  return createDatabase(inject('databaseUrl'));
}

export function uniqueEmail(label = 'user'): string {
  return `${label}-${randomUUID()}@example.com`;
}

/** Inserts a User with a Personal Workspace they own, bypassing the API. */
export async function seedUserWithWorkspace(db: Database, name = 'Personal') {
  const user = one(await db.insert(users).values({ email: uniqueEmail() }).returning());
  const workspace = one(await db.insert(workspaces).values({ type: 'PERSONAL', name }).returning());
  await db
    .insert(workspaceMembers)
    .values({ workspaceId: workspace.id, userId: user.id, role: 'OWNER' });
  return { userId: user.id, workspaceId: workspace.id };
}
