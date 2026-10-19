import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { paymentStatuses, plans } from '@daric/core';
import { id, timestamps } from './columns';
import { users } from './identity';
import { currencies } from './money';

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

export const paymentStatus = pgEnum('payment_status', paymentStatuses);

/**
 * One purchase of Plus months through a payment provider (ADR-0008). Created
 * Pending before the payer leaves for the provider; completed once, by the
 * callback, after the provider verifies it. Belongs to the User, like
 * `subscriptions`: no `workspace_id` and no row-level security.
 */
export const payments = pgTable(
  'payments',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    months: smallint('months').notNull(),
    /** Worked out by the server when the Payment was created; never sent by a client. */
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    currency: text('currency')
      .notNull()
      .references(() => currencies.code),
    status: paymentStatus('status').notNull().default('PENDING'),
    /** Which PaymentProvider handled it, e.g. `zarinpal`. */
    provider: text('provider').notNull(),
    /** The provider's id for the payment (Zarinpal's Authority); null until it answers. */
    reference: text('reference'),
    /** The provider's reference number for a Paid one (Zarinpal's ref_id). */
    receipt: text('receipt'),
    /** The Subscription's new expiry, set when Paid. */
    plusUntil: timestamp('plus_until', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('payments_provider_reference_key').on(t.provider, t.reference),
    index('payments_user_id_idx').on(t.userId, t.createdAt),
    check('payments_months_check', sql`${t.months} BETWEEN 1 AND 12`),
    check('payments_amount_check', sql`${t.amount} > 0`),
  ],
);
