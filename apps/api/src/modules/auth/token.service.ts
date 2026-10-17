import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { type SignedOutReason, signedOutReasons } from '@daric/core';
import { and, eq, inArray, isNull, type SQL } from 'drizzle-orm';
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
  /** The token was already rotated: someone replayed it, so its family is now revoked (if it was not already). */
  | { outcome: 'reused'; userId: string }
  /** Unknown, revoked or expired; `reason` when the User should be told why it was revoked. */
  | { outcome: 'invalid'; reason?: SignedOutReason };

/** Why a Signed-in Device ended. */
export type DeviceEndReason = NonNullable<(typeof signedInDevices.$inferSelect)['endReason']>;

/**
 * Whether a refused refresh explains this end reason to the User. Core's
 * `signedOutReasons` is the subset of the database's end reasons a client is told.
 */
const isExplained = (reason: DeviceEndReason | null | undefined): reason is SignedOutReason =>
  (signedOutReasons as readonly string[]).includes(reason ?? '');

/** What a login tells of the Signed-in Device it starts. */
export interface NewDevice {
  /** Browser and OS, or phone model; null when the client did not say. */
  name: string | null;
}

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

/**
 * Short-lived JWT access tokens and opaque, stored refresh tokens. A token
 * family is a Signed-in Device, so this also starts, rotates and ends the
 * `signed_in_devices` rows, keeping each change in step with the tokens and
 * under the same locks; SignedInDevicesService lists them and applies the limit.
 */
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
    device: NewDevice,
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
   * Takes a transaction because the device and token rows are locked until
   * it commits, so two concurrent refreshes with one token cannot both
   * succeed, and a device ended meanwhile (another login past the limit)
   * gets no new token.
   */
  async rotate(tx: Transaction, refreshToken: string, now = new Date()): Promise<Rotation> {
    const locked = await this.lockByToken(tx, refreshToken);
    if (!locked) return { outcome: 'invalid' };
    const { row, device } = locked;
    // Reuse is checked first: a replayed token's descendants may still be alive,
    // and a replay is audited even once its device has ended or expired.
    if (row.usedAt) {
      if (!device.endedAt) await this.endDevices(tx, [row.familyId], 'REFRESH_REUSE', now);
      return { outcome: 'reused', userId: row.userId };
    }
    if (row.revokedAt || device.endedAt) {
      return isExplained(device.endReason)
        ? { outcome: 'invalid', reason: device.endReason }
        : { outcome: 'invalid' };
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
   * an unknown token. The device lock makes a concurrent rotation in the family
   * finish first, so the token it issues is revoked too.
   */
  async revoke(tx: Transaction, refreshToken: string, now = new Date()): Promise<string | null> {
    const locked = await this.lockByToken(tx, refreshToken);
    if (!locked) return null;
    await this.endDevices(tx, [locked.row.familyId], 'LOGOUT', now);
    return locked.row.userId;
  }

  /** Ends every Signed-in Device of the User, e.g. after their password changed. */
  async revokeAllForUser(
    tx: Transaction,
    userId: string,
    reason: DeviceEndReason,
    now = new Date(),
  ): Promise<void> {
    const open = await this.lockDevices(
      tx,
      and(eq(signedInDevices.userId, userId), isNull(signedInDevices.endedAt)),
    );
    await this.endDevices(tx, open, reason, now);
  }

  /**
   * Locks Signed-in Device rows (and so their families) and returns their ids.
   * Every path that ends a device or rotates a token locks the device before
   * its tokens: a rotation waits for an ending to commit and then sees it, and
   * an ending sees every token a rotation issued before it.
   */
  async lockDevices(tx: Transaction, where: SQL | undefined): Promise<string[]> {
    const rows = await tx
      .select({ id: signedInDevices.id })
      .from(signedInDevices)
      .where(where)
      .orderBy(signedInDevices.id)
      .for('update');
    return rows.map((r) => r.id);
  }

  /**
   * Revokes every refresh token of the Signed-in Devices and records why they
   * ended. The caller has locked the device rows (`lockDevices`).
   */
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

  /** Locks the token's device, then the token row itself (see `lockDevices` for the order). */
  private async lockByToken(tx: Transaction, refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    const [found] = await tx
      .select({ familyId: refreshTokens.familyId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash));
    if (!found) return undefined;
    const [device] = await tx
      .select({ endedAt: signedInDevices.endedAt, endReason: signedInDevices.endReason })
      .from(signedInDevices)
      .where(eq(signedInDevices.id, found.familyId))
      .for('update');
    const [row] = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .for('update');
    return row && device ? { row, device } : undefined;
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
    // `sid` (session id, RFC 9068 style) names the Signed-in Device, so a request knows which one it is.
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
