import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { consentPurposes } from '@daric/core';
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

export const consentPurpose = pgEnum('consent_purpose', consentPurposes);

/**
 * A User's recorded, revocable permission for a purpose, under a policy
 * version. Revoking sets `revoked_at`; a later Consent is a new row, so the
 * history stays. At most one live Consent per User, Workspace and purpose.
 */
export const userConsents = pgTable(
  'user_consents',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The Workspace it is about; null for a purpose that is not about one. */
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    purpose: consentPurpose('purpose').notNull(),
    policyVersion: text('policy_version').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('user_consents_live_key')
      .on(t.userId, t.workspaceId, t.purpose)
      .where(sql`${t.revokedAt} IS NULL`),
    index('user_consents_workspace_id_idx').on(t.workspaceId),
  ],
);
