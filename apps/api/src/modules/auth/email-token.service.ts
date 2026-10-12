import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { and, count, eq, gt, isNull } from 'drizzle-orm';
import type { Executor, Transaction } from '../../db/client';
import { emailTokens, users } from '../../db/schema';
import { hashToken } from './token.service';

export type EmailTokenPurpose = (typeof emailTokens.purpose.enumValues)[number];

/** How long a mailed link works. */
export const EMAIL_TOKEN_TTL_HOURS: Readonly<Record<EmailTokenPurpose, number>> = {
  VERIFY_EMAIL: 24,
  RESET_PASSWORD: 1,
};

/** Mails of one purpose a User can be sent per hour, whoever asks for them. */
export const EMAIL_TOKENS_PER_HOUR = 3;

const HOUR = 60 * 60 * 1000;

/**
 * Single-use, expiring tokens for links mailed to a User. Only a token's hash
 * is stored, and a token is bound to the address it was mailed to.
 */
@Injectable()
export class EmailTokenService {
  /**
   * Issues a token for the User's current email and voids their earlier
   * unused ones of the same purpose, so only the newest link works. Returns
   * null when the User has had `EMAIL_TOKENS_PER_HOUR` of them in the last hour.
   */
  async issue(
    tx: Transaction,
    user: { id: string; email: string },
    purpose: EmailTokenPurpose,
    now = new Date(),
  ): Promise<string | null> {
    // Serialises concurrent requests for one User, so the hourly cap holds.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for('update');
    const [recent] = await tx
      .select({ n: count() })
      .from(emailTokens)
      .where(
        and(
          eq(emailTokens.userId, user.id),
          eq(emailTokens.purpose, purpose),
          gt(emailTokens.createdAt, new Date(now.getTime() - HOUR)),
        ),
      );
    if ((recent?.n ?? 0) >= EMAIL_TOKENS_PER_HOUR) return null;

    await this.voidOutstanding(tx, user.id, purpose, now);
    const token = randomBytes(32).toString('base64url');
    await tx.insert(emailTokens).values({
      userId: user.id,
      purpose,
      email: user.email,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + EMAIL_TOKEN_TTL_HOURS[purpose] * HOUR),
      createdAt: now,
    });
    return token;
  }

  /**
   * Uses up a token: returns its User's id, or null when the token is unknown,
   * of another purpose, used, expired, or mailed to an address the User no
   * longer has. The row stays locked until `tx` ends, so a token works once
   * even under concurrent requests.
   */
  async consume(
    tx: Transaction,
    token: string,
    purpose: EmailTokenPurpose,
    now = new Date(),
  ): Promise<string | null> {
    const [row] = await tx
      .select({
        id: emailTokens.id,
        userId: emailTokens.userId,
        email: emailTokens.email,
        usedAt: emailTokens.usedAt,
        expiresAt: emailTokens.expiresAt,
        currentEmail: users.email,
      })
      .from(emailTokens)
      .innerJoin(users, eq(users.id, emailTokens.userId))
      .where(and(eq(emailTokens.tokenHash, hashToken(token)), eq(emailTokens.purpose, purpose)))
      .for('update', { of: emailTokens });
    if (!row || row.usedAt || row.expiresAt <= now || row.email !== row.currentEmail) return null;
    await tx.update(emailTokens).set({ usedAt: now }).where(eq(emailTokens.id, row.id));
    return row.userId;
  }

  /** Voids the User's unused tokens of `purpose`. */
  async voidOutstanding(
    db: Executor,
    userId: string,
    purpose: EmailTokenPurpose,
    now = new Date(),
  ): Promise<void> {
    await db
      .update(emailTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(emailTokens.userId, userId),
          eq(emailTokens.purpose, purpose),
          isNull(emailTokens.usedAt),
        ),
      );
  }
}
