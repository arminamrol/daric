import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { id } from './columns';
import { users } from './identity';
import { workspaces } from './tenancy';

/**
 * Append-only record of who did what. Never holds Amounts, notes or tokens.
 * `workspace_id` is null for events outside any Workspace (login).
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_workspace_id_created_at_idx').on(t.workspaceId, t.createdAt),
    index('audit_logs_actor_user_id_idx').on(t.actorUserId),
  ],
);
