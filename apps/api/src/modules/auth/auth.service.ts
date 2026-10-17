import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CalendarSystem, Digits, Locale, LoginInput, RegisterInput, User } from '@daric/core';
import { and, eq } from 'drizzle-orm';
import { isUniqueViolation } from '../../common/db-errors';
import type { ClientInfo } from '../../common/request';
import { DATABASE } from '../../common/di-tokens';
import { type Database, one } from '../../db/client';
import { authIdentities, users, workspaceMembers, workspaces } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { EmailLinksService } from './email-links.service';
import { seedDefaultCategories } from '../categories/defaults';
import { hashPassword, verifyAgainstDummy, verifyPassword } from './passwords';
import { SignedInDevicesService } from './signed-in-devices.service';
import { type IssuedTokens, TokenService } from './token.service';

/** A signed-in User and their new tokens; the controller decides how the tokens travel. */
export interface SignedIn {
  user: User;
  tokens: IssuedTokens;
}

function signedIn(user: User, tokens: IssuedTokens): SignedIn {
  return { user: { id: user.id, email: user.email }, tokens };
}

/**
 * Registration, login, refresh and logout. These run before any Workspace
 * scope exists, so they use the owner connection directly; they only touch the
 * new or authenticated User's own rows.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EmailLinksService) private readonly emailLinks: EmailLinksService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(SignedInDevicesService) private readonly devices: SignedInDevicesService,
  ) {}

  /**
   * Rotates a refresh token (see TokenService.rotate); a replayed token is
   * audited and refused. A refusal says why when the User should be told:
   * `reason` DEVICE_LIMIT or SIGNED_OUT_REMOTELY.
   */
  async refresh(refreshToken: string, client: ClientInfo): Promise<SignedIn> {
    const rotation = await this.db.transaction(async (tx) => {
      const result = await this.tokens.rotate(tx, refreshToken);
      if (result.outcome === 'reused') {
        await this.audit.record(tx, {
          action: 'auth.refresh_reuse',
          actorUserId: result.userId,
          client,
        });
      }
      return result;
    });
    // Outside the transaction, so a reuse still commits its revocation.
    if (rotation.outcome === 'invalid' && rotation.reason) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'This Signed-in Device was signed out',
        reason: rotation.reason,
      });
    }
    if (rotation.outcome !== 'rotated') throw new UnauthorizedException();
    const user = one(
      await this.db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, rotation.userId)),
    );
    return signedIn(user, rotation.tokens);
  }

  /** Ends the Signed-in Device the refresh token belongs to. Unknown tokens are ignored. */
  async logout(refreshToken: string, client: ClientInfo): Promise<void> {
    await this.db.transaction(async (tx) => {
      const userId = await this.tokens.revoke(tx, refreshToken);
      if (userId)
        await this.audit.record(tx, { action: 'auth.logout', actorUserId: userId, client });
    });
  }

  /**
   * Creates the User, their Personal Workspace with its default Categories (in
   * the User's language), Owner membership and Trial in one transaction, then
   * mails them a verification link.
   */
  async register(
    input: RegisterInput,
    client: ClientInfo,
    device: { name: string | null },
  ): Promise<SignedIn> {
    const secretHash = await hashPassword(input.password);
    const { locale = 'fa' } = input;
    const { displayCalendar, digits, workspaceCalendar } = SIGN_UP_DEFAULTS[locale];
    try {
      const { result, mail } = await this.db.transaction(async (tx) => {
        const user = one(
          await tx
            .insert(users)
            .values({ email: input.email, locale, displayCalendar, digits })
            .returning(),
        );
        await tx.insert(authIdentities).values({
          userId: user.id,
          provider: 'PASSWORD',
          identifier: input.email,
          secretHash,
        });
        const workspace = one(
          await tx
            .insert(workspaces)
            .values({ type: 'PERSONAL', name: 'Personal', calendar: workspaceCalendar })
            .returning({ id: workspaces.id }),
        );
        await tx
          .insert(workspaceMembers)
          .values({ workspaceId: workspace.id, userId: user.id, role: 'OWNER' });
        await seedDefaultCategories(tx, workspace.id, user.locale);
        await this.entitlements.startTrial(tx, user.id);
        await this.audit.record(tx, {
          action: 'auth.register',
          actorUserId: user.id,
          workspaceId: workspace.id,
          client,
        });
        return {
          result: signedIn(user, await this.tokens.issue(tx, user.id, device)),
          mail: await this.emailLinks.verificationMail(tx, user),
        };
      });
      this.emailLinks.deliver(mail);
      return result;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Email is already registered');
      throw error;
    }
  }

  /**
   * Signs the User in on a new Signed-in Device. One beyond their device
   * Entitlement ends the least recently used others; a login is never refused for it.
   */
  async login(
    input: LoginInput,
    client: ClientInfo,
    device: { name: string | null },
  ): Promise<SignedIn> {
    const [found] = await this.db
      .select({ id: users.id, email: users.email, secretHash: authIdentities.secretHash })
      .from(authIdentities)
      .innerJoin(users, eq(users.id, authIdentities.userId))
      .where(
        and(eq(authIdentities.provider, 'PASSWORD'), eq(authIdentities.identifier, input.email)),
      );

    const ok = found?.secretHash
      ? await verifyPassword(found.secretHash, input.password)
      : await verifyAgainstDummy(input.password);
    if (!found || !ok) {
      await this.audit.record(this.db, {
        action: 'auth.login_failed',
        actorUserId: found?.id ?? null,
        client,
      });
      throw new UnauthorizedException('Email or password is incorrect');
    }

    return this.db.transaction(async (tx) => {
      // Concurrent logins wait here, so each counts the devices the other made.
      await tx.select({ id: users.id }).from(users).where(eq(users.id, found.id)).for('update');
      await this.audit.record(tx, { action: 'auth.login', actorUserId: found.id, client });
      const tokens = await this.tokens.issue(tx, found.id, device);
      await this.devices.enforceLimit(tx, found.id, tokens.deviceId, client);
      return signedIn(found, tokens);
    });
  }
}

/**
 * How a new User and their Personal Workspace start, by the language they sign
 * up in: Persian with Jalali dates and Persian digits, or English with
 * Gregorian dates and Latin digits. The Workspace Calendar is set alongside,
 * not taken from the display calendar (ADR-0002).
 */
const SIGN_UP_DEFAULTS = {
  fa: { displayCalendar: 'jalali', digits: 'persian', workspaceCalendar: 'jalali' },
  en: { displayCalendar: 'gregorian', digits: 'latin', workspaceCalendar: 'gregorian' },
} as const satisfies Record<
  Locale,
  { displayCalendar: CalendarSystem; digits: Digits; workspaceCalendar: CalendarSystem }
>;
