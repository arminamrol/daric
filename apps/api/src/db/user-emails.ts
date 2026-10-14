import { inArray } from 'drizzle-orm';
import type { Database } from './client';
import { users } from './schema';

/**
 * Looks up the emails of Users by id: null for no User or one who is gone.
 * Identity tables are out of reach of Workspace scope, so this reads on the
 * owner connection, and only ids the caller already found in the Workspace.
 */
export async function emailsOf(
  db: Database,
  userIds: (string | null)[],
): Promise<(userId: string | null) => string | null> {
  const ids = [...new Set(userIds.filter((id): id is string => id !== null))];
  const rows =
    ids.length === 0
      ? []
      : await db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(inArray(users.id, ids));
  const emails = new Map(rows.map((r) => [r.id, r.email]));
  return (userId) => (userId ? (emails.get(userId) ?? null) : null);
}
