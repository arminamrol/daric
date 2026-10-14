import { pgEnum, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { plans } from '@daric/core';
import { id, timestamps } from './columns';
import { users } from './identity';

export const plan = pgEnum('plan', plans);

/**
 * A User's prepaid Plus time (ADR-0008). Belongs to the User, never to a
 * Workspace, so it has no `workspace_id` and no row-level security.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The Plan the time was bought for; it applies until `expires_at`, Free after. */
    plan: plan('plan').notNull(),
    /** When the Trial given at sign-up ends; null for a User who never had one. */
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    /** When the Plus time ends; null for a User who never had any. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [uniqueIndex('subscriptions_user_id_key').on(t.userId)],
);
