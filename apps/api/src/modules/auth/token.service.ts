import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { type SignedOutReason, signedOutReasons } from '@daric/core';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { errors, jwtVerify, SignJWT } from 'jose';
import { v7 as uuidv7 } from 'uuid';
import type { Config } from '../../config';
import type { Executor, Transaction } from '../../db/client';
import { refreshTokens, signedInDevices } from '../../db/schema';
import { CONFIG } from '../../common/di-tokens';

const ISSUER = 'daric';

export interface IssuedTokens {
  /** The Signed-in Device (refresh-token family) the tokens belong to. */
  deviceId: string;
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
  /** Unknown, revoked or expired; `reason` when the User should be told why it was revoked. */
  | { outcome: 'invalid'; reason?: SignedOutReason };

/** Why a Signed-in Device ended. */
export type DeviceEndReason = NonNullable<(typeof signedInDevices.$inferSelect)['endReason']>;

/** Whether a refused refresh explains this end reason to the User. */
const isExplained = (reason: DeviceEndReason | null | undefined): reason is SignedOutReason =>
  (signedOutReasons as readonly string[]).includes(reason ?? '');

/** Who an access token was issued to. */
export interface AccessTokenSubject {
  userId: string;
  /** Null for tokens issued before Signed-in Devices were named in them. */
  deviceId: string | null;
}

/** SHA-256 of an opaque token (refresh or email); only this is stored. */
export function hashToken(token: string): string {
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
  async issue(
    db: Executor,
    userId: string,
    device: { name: string | null },
    now = new Date(),
  ): Promise<IssuedTokens> {
    const familyId = uuidv7();
    await db
      .insert(signedInDevices)
      .values({ id: familyId, userId, name: device.name, lastUsedAt: now, createdAt: now });
    return this.issueInFamily(db, userId, familyId, now);
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
    if (!row) return { outcome: 'invalid' };
    if (row.revokedAt) {
      const [device] = await tx
        .select({ endReason: signedInDevices.endReason })
        .from(signedInDevices)
        .where(eq(signedInDevices.id, row.familyId));
      const reason = device?.endReason;
      return isExplained(reason) ? { outcome: 'invalid', reason } : { outcome: 'invalid' };
    }
    // Reuse is checked before expiry: a replayed token's descendants may still be alive.
    if (row.usedAt) {
      await this.endDevices(tx, [row.familyId], 'REFRESH_REUSE', now);
      return { outcome: 'reused', userId: row.userId };
    }
    if (row.expiresAt <= now) return { outcome: 'invalid' };
    await tx.update(refreshTokens).set({ usedAt: now }).where(eq(refreshTokens.id, row.id));
    await tx
      .update(signedInDevices)
      .set({ lastUsedAt: now })
      .where(eq(signedInDevices.id, row.familyId));
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
    await this.endDevices(tx, [row.familyId], 'LOGOUT', now);
    return row.userId;
  }

  /** Ends every Signed-in Device of the User, e.g. after their password changed. */
  async revokeAllForUser(
    db: Executor,
    userId: string,
    reason: DeviceEndReason,
    now = new Date(),
  ): Promise<void> {
    await db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
    await db
      .update(signedInDevices)
      .set({ endedAt: now, endReason: reason })
      .where(and(eq(signedInDevices.userId, userId), isNull(signedInDevices.endedAt)));
  }

  /** Revokes every refresh token of the Signed-in Devices and records why they ended. */
  async endDevices(
    db: Executor,
    deviceIds: string[],
    reason: DeviceEndReason,
    now = new Date(),
  ): Promise<void> {
    if (deviceIds.length === 0) return;
    await db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(inArray(refreshTokens.familyId, deviceIds), isNull(refreshTokens.revokedAt)));
    await db
      .update(signedInDevices)
      .set({ endedAt: now, endReason: reason })
      .where(and(inArray(signedInDevices.id, deviceIds), isNull(signedInDevices.endedAt)));
  }

  private async lockByToken(tx: Transaction, refreshToken: string) {
    const [row] = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashToken(refreshToken)))
      .for('update');
    return row;
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
    const accessToken = await new SignJWT({ sid: familyId })
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
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshTokenExpiresAt,
    });
    return {
      deviceId: familyId,
      accessToken,
      accessTokenExpiresAt,
      refreshToken,
      refreshTokenExpiresAt,
    };
  }

  /** Who a valid access token was issued to, or null. */
  async verifyAccessToken(token: string): Promise<AccessTokenSubject | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        algorithms: ['HS256'],
      });
      if (!payload.sub) return null;
      return {
        userId: payload.sub,
        deviceId: typeof payload['sid'] === 'string' ? payload['sid'] : null,
      };
    } catch (error) {
      if (error instanceof errors.JOSEError) return null;
      throw error;
    }
  }
}
