import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { calendarSystems, digitSystems, locales, themePreferences } from '@daric/core';
import { id, timestamps } from './columns';

export const userLocale = pgEnum('locale', locales);
export const displayCalendar = pgEnum('display_calendar', calendarSystems);
export const digitSystem = pgEnum('digit_system', digitSystems);
export const themePreference = pgEnum('theme_preference', themePreferences);

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    /** Preferences: how this User likes things drawn, in every Workspace. */
    locale: userLocale('locale').notNull().default('fa'),
    displayCalendar: displayCalendar('display_calendar').notNull().default('jalali'),
    digits: digitSystem('digits').notNull().default('persian'),
    theme: themePreference('theme').notNull().default('system'),
    /** When the User followed a link mailed to `email`; null until then. */
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    /** When the User finished or skipped the first-run wizard; null until then. */
    onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
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

export const deviceEndReason = pgEnum('device_end_reason', [
  'LOGOUT',
  'REFRESH_REUSE',
  'PASSWORD_RESET',
  'DEVICE_LIMIT',
  'SIGNED_OUT_REMOTELY',
  'PLUS_ENDED',
]);

/**
 * A Signed-in Device: one login and the refresh tokens rotated from it (its
 * family, whose id is this row's). Counted against the User's device
 * Entitlement while it has a live refresh token.
 */
export const signedInDevices = pgTable(
  'signed_in_devices',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Browser and OS, or phone model; null when the client did not say. */
    name: text('name'),
    /** The login, then each refresh. */
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    /** When its tokens were revoked, and why; null while it may still refresh. */
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endReason: deviceEndReason('end_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('signed_in_devices_user_id_idx').on(t.userId)],
);

/** A refresh token; tokens rotated from one login share a family (one Signed-in Device). */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id')
      .notNull()
      .references(() => signedInDevices.id, { onDelete: 'cascade' }),
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

export const emailTokenPurpose = pgEnum('email_token_purpose', ['VERIFY_EMAIL', 'RESET_PASSWORD']);

/** A single-use token mailed to a User in a verification or password-reset link. */
export const emailTokens = pgTable(
  'email_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: emailTokenPurpose('purpose').notNull(),
    /** The address the link went to; the token is void once the User's email differs. */
    email: text('email').notNull(),
    /** SHA-256 of the token; the token itself is never stored. */
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Set when the token is used or a newer one for the same purpose replaces it. */
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('email_tokens_token_hash_key').on(t.tokenHash),
    index('email_tokens_user_id_purpose_idx').on(t.userId, t.purpose),
  ],
);
