import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { errors, jwtVerify, SignJWT } from 'jose';
import { v7 as uuidv7 } from 'uuid';
import type { Config } from '../../config';
import type { Executor, Transaction } from '../../db/client';
import { refreshTokens } from '../../db/schema';
import { CONFIG } from '../../common/di-tokens';

const ISSUER = 'daric';

export interface IssuedTokens {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

/** What presenting a refresh token led to. */
export type Rotation =
  | { outcome: 'rotated'; userId: string; tokens: IssuedTokens }
  /** The token was already rotated: someone replayed it, so its family is now revoked. */
  | { outcome: 'reused'; userId: string }
  | { outcome: 'invalid' };

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Short-lived JWT access tokens and opaque, stored refresh tokens. */
@Injectable()
export class TokenService {
  private readonly key: Uint8Array;

  constructor(@Inject(CONFIG) private readonly config: Config) {
    this.key = new TextEncoder().encode(config.JWT_SECRET);
  }

  /** Starts a new refresh-token family (one Signed-in Device) for the User. */
  issue(db: Executor, userId: string, now = new Date()): Promise<IssuedTokens> {
    return this.issueInFamily(db, userId, uuidv7(), now);
  }

  /**
   * Trades a refresh token for new tokens in the same family. Each refresh
   * token works once; presenting a used one revokes the whole family, since
   * either the holder or a thief now has a token that should not exist.
   * Takes a transaction because the token row is locked until it commits,
   * so two concurrent refreshes with one token cannot both succeed.
   */
  async rotate(tx: Transaction, refreshToken: string, now = new Date()): Promise<Rotation> {
    const row = await this.lockByToken(tx, refreshToken);
    if (!row || row.revokedAt) return { outcome: 'invalid' };
    // Reuse is checked before expiry: a replayed token's descendants may still be alive.
    if (row.usedAt) {
      await this.revokeFamily(tx, row.familyId, now);
      return { outcome: 'reused', userId: row.userId };
    }
    if (row.expiresAt <= now) return { outcome: 'invalid' };
    await tx.update(refreshTokens).set({ usedAt: now }).where(eq(refreshTokens.id, row.id));
    const tokens = await this.issueInFamily(tx, row.userId, row.familyId, now);
    return { outcome: 'rotated', userId: row.userId, tokens };
  }

  /**
   * Revokes the family `refreshToken` belongs to; returns its User, or null for
   * an unknown token. The row lock makes a concurrent rotation of the same token
   * finish first, so the token it issues is revoked too.
   */
  async revoke(tx: Transaction, refreshToken: string, now = new Date()): Promise<string | null> {
    const row = await this.lockByToken(tx, refreshToken);
    if (!row) return null;
    await this.revokeFamily(tx, row.familyId, now);
    return row.userId;
  }

  private async lockByToken(tx: Transaction, refreshToken: string) {
    const [row] = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashRefreshToken(refreshToken)))
      .for('update');
    return row;
  }

  private async revokeFamily(db: Executor, familyId: string, now: Date): Promise<void> {
    await db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }

  private async issueInFamily(
    db: Executor,
    userId: string,
    familyId: string,
    now: Date,
  ): Promise<IssuedTokens> {
    const accessTokenExpiresAt = new Date(
      now.getTime() + this.config.ACCESS_TOKEN_TTL_SECONDS * 1000,
    );
    const refreshTokenExpiresAt = new Date(
      now.getTime() + this.config.REFRESH_TOKEN_TTL_SECONDS * 1000,
    );
    const accessToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setJti(uuidv7())
      .setIssuer(ISSUER)
      .setIssuedAt(now)
      .setExpirationTime(accessTokenExpiresAt)
      .sign(this.key);
    const refreshToken = randomBytes(32).toString('base64url');
    await db.insert(refreshTokens).values({
      userId,
      familyId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiresAt,
    });
    return { accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt };
  }

  /** The User id of a valid access token, or null. */
  async verifyAccessToken(token: string): Promise<string | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        algorithms: ['HS256'],
      });
      return payload.sub ?? null;
    } catch (error) {
      if (error instanceof errors.JOSEError) return null;
      throw error;
    }
  }
}
