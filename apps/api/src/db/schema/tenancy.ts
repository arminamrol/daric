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
import {
  assignableRoles,
  calendarSystems,
  moneyDisplays,
  workspaceRoles,
  workspaceTypes,
} from '@daric/core';
import { id, timestamps, version } from './columns';
import { users } from './identity';

export const workspaceType = pgEnum('workspace_type', workspaceTypes);
export const workspaceCalendar = pgEnum('workspace_calendar', calendarSystems);
export const workspaceRole = pgEnum('workspace_role', workspaceRoles);
export const moneyDisplay = pgEnum('money_display', moneyDisplays);

export const workspaces = pgTable('workspaces', {
  id: id(),
  type: workspaceType('type').notNull(),
  name: text('name').notNull(),
  baseCurrency: text('base_currency').notNull().default('IRR'),
  calendar: workspaceCalendar('calendar').notNull().default('jalali'),
  timezone: text('timezone').notNull().default('Asia/Tehran'),
  moneyDisplay: moneyDisplay('money_display').notNull().default('rial'),
  settings: jsonb('settings').notNull().default({}),
  ...timestamps(),
  version: version(),
});

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: workspaceRole('role').notNull(),
    /**
     * Set while the Owner's Plus and its Grace Period have ended (ADR-0008):
     * the membership is kept but gives no access until the Owner renews.
     * Never set on the Owner.
     */
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    ...timestamps(),
    version: version(),
  },
  (t) => [
    uniqueIndex('workspace_members_workspace_id_user_id_key').on(t.workspaceId, t.userId),
    index('workspace_members_user_id_idx').on(t.userId),
  ],
);

export const invitationRole = pgEnum('invitation_role', assignableRoles);

/**
 * An Owner- or Admin-issued offer to join a Workspace with a Role. Only the
 * link token's hash is stored. Accepted, revoked or past `expires_at`, it is
 * spent; rows are kept as the Workspace's history.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Only a User with this verified email may accept; null for a link anyone may accept once. */
    email: text('email'),
    role: invitationRole('role').notNull(),
    /** SHA-256 of the link token; the token itself is never stored. */
    tokenHash: text('token_hash').notNull(),
    invitedByUserId: uuid('invited_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('invitations_token_hash_key').on(t.tokenHash),
    index('invitations_workspace_id_created_at_idx').on(t.workspaceId, t.createdAt),
  ],
);
