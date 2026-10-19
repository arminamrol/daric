import { Inject, Injectable } from '@nestjs/common';
import type { SignedInDevice } from '@daric/core';
import { and, desc, eq, exists, gt, inArray, isNull, ne } from 'drizzle-orm';
import { DATABASE } from '../../common/di-tokens';
import type { ClientInfo } from '../../common/request';
import type { Database, Executor, Transaction } from '../../db/client';
import { refreshTokens, signedInDevices, users } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { TokenService } from './token.service';

/**
 * A User's Signed-in Devices: those still holding a refresh token that works,
 * i.e. not ended and not left to expire. Owner connection, like the rest of auth.
 */
@Injectable()
export class SignedInDevicesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Most recently used first; `currentDeviceId` is the one asking. */
  async list(
    userId: string,
    currentDeviceId: string | null,
    now = new Date(),
  ): Promise<SignedInDevice[]> {
    const rows = await this.live(this.db, userId, now);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      signedInAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt.toISOString(),
      current: row.id === currentDeviceId,
    }));
  }

  /**
   * Ends one of the User's Signed-in Devices from another; its next refresh
   * is refused as SIGNED_OUT_REMOTELY. False when it is not theirs or already over.
   */
  async signOut(
    userId: string,
    deviceId: string,
    client: ClientInfo,
    now = new Date(),
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const locked = await this.tokens.lockDevices(
        tx,
        and(
          eq(signedInDevices.id, deviceId),
          eq(signedInDevices.userId, userId),
          isNull(signedInDevices.endedAt),
        ),
      );
      if (locked.length === 0) return false;
      await this.tokens.endDevices(tx, locked, 'SIGNED_OUT_REMOTELY', now);
      await this.audit.record(tx, {
        action: 'auth.device_sign_out',
        actorUserId: userId,
        client,
        metadata: { deviceId },
      });
      return true;
    });
  }

  /**
   * After a login: ends the least recently used Signed-in Devices beyond the
   * User's device Entitlement, never `keepDeviceId` (the new login), so a
   * login is never refused. Run in the login transaction with the User row
   * locked, so concurrent logins count each other.
   */
  async enforceLimit(
    tx: Transaction,
    userId: string,
    keepDeviceId: string,
    client: ClientInfo,
    now = new Date(),
  ): Promise<void> {
    const limit = (await this.entitlements.entitlementsOf(userId, now, tx)).signedInDevices;
    if (limit === null) return;
    const ended = await this.keepMostRecent(
      tx,
      userId,
      limit - 1,
      'DEVICE_LIMIT',
      now,
      keepDeviceId,
    );
    if (ended.length === 0) return;
    await this.audit.record(tx, {
      action: 'auth.device_limit',
      actorUserId: userId,
      client,
      metadata: { deviceIds: ended },
    });
  }

  /**
   * Once the User's Plus and its Grace Period have ended (ADR-0008): ends all
   * but their most recently used Signed-in Devices, as many as their device
   * Entitlement now allows, as PLUS_ENDED. Locks the User row like a login,
   * so a login at the same time counts these. Returns the ended devices.
   */
  async downgrade(tx: Transaction, userId: string, now = new Date()): Promise<string[]> {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
    const limit = (await this.entitlements.entitlementsOf(userId, now, tx)).signedInDevices;
    if (limit === null) return [];
    const ended = await this.keepMostRecent(tx, userId, limit, 'PLUS_ENDED', now);
    if (ended.length > 0) {
      await this.audit.record(tx, {
        action: 'auth.plus_ended',
        actorUserId: userId,
        metadata: { deviceIds: ended },
      });
    }
    return ended;
  }

  /**
   * Ends the User's live devices beyond the `keep` most recently used ones
   * (never `except`) for `reason`; returns those it ended.
   */
  private async keepMostRecent(
    tx: Transaction,
    userId: string,
    keep: number,
    reason: 'DEVICE_LIMIT' | 'PLUS_ENDED',
    now: Date,
    except?: string,
  ): Promise<string[]> {
    const others = await this.live(tx, userId, now, except);
    const beyond = others.slice(Math.max(0, keep)).map((d) => d.id);
    if (beyond.length === 0) return [];
    // Locked before ending, so a refresh of one of them under way is ended with it.
    const ended = await this.tokens.lockDevices(
      tx,
      and(inArray(signedInDevices.id, beyond), isNull(signedInDevices.endedAt)),
    );
    if (ended.length > 0) await this.tokens.endDevices(tx, ended, reason, now);
    return ended;
  }

  /** The User's devices with a refresh token that still works, most recently used first. */
  private live(db: Executor, userId: string, now: Date, except?: string) {
    return db
      .select({
        id: signedInDevices.id,
        name: signedInDevices.name,
        createdAt: signedInDevices.createdAt,
        lastUsedAt: signedInDevices.lastUsedAt,
      })
      .from(signedInDevices)
      .where(
        and(
          eq(signedInDevices.userId, userId),
          isNull(signedInDevices.endedAt),
          except ? ne(signedInDevices.id, except) : undefined,
          exists(
            db
              .select({ id: refreshTokens.id })
              .from(refreshTokens)
              .where(
                and(
                  eq(refreshTokens.familyId, signedInDevices.id),
                  isNull(refreshTokens.usedAt),
                  isNull(refreshTokens.revokedAt),
                  gt(refreshTokens.expiresAt, now),
                ),
              ),
          ),
        ),
      )
      .orderBy(desc(signedInDevices.lastUsedAt), desc(signedInDevices.id));
  }
}
