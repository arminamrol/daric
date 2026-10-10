import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps } from './columns';

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('users_email_key').on(sql`lower(${t.email})`)],
);

export const authProvider = pgEnum('auth_provider', ['PASSWORD']);

/** One way a User proves who they are: a password now, phone OTP later. */
export const authIdentities = pgTable(
  'auth_identities',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: authProvider('provider').notNull(),
    /** What the person types to log in with this provider (an email for PASSWORD). */
    identifier: text('identifier').notNull(),
    secretHash: text('secret_hash'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('auth_identities_provider_identifier_key').on(t.provider, t.identifier),
    index('auth_identities_user_id_idx').on(t.userId),
  ],
);

/** A refresh token; tokens rotated from one login share a family (one Signed-in Device). */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    /** SHA-256 of the token; the token itself is never stored. */
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('refresh_tokens_token_hash_key').on(t.tokenHash),
    index('refresh_tokens_user_id_idx').on(t.userId),
    index('refresh_tokens_family_id_idx').on(t.familyId),
  ],
);
