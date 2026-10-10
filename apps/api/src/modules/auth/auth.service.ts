import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { LoginInput, RegisterInput, User } from '@daric/core';
import { and, eq } from 'drizzle-orm';
import type { ClientInfo } from '../../common/request';
import { DATABASE } from '../../common/di-tokens';
import { type Database, one } from '../../db/client';
import { authIdentities, users, workspaceMembers, workspaces } from '../../db/schema';
import { AuditService } from '../audit/audit.service';
import { hashPassword, verifyAgainstDummy, verifyPassword } from './passwords';
import { type IssuedTokens, TokenService } from './token.service';

function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } }).cause ?? error;
  return (cause as { code?: string }).code === '23505';
}

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
  ) {}

  /** Rotates a refresh token (see TokenService.rotate); a replayed token is audited and refused. */
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

  /** Creates the User, their Personal Workspace and Owner membership in one transaction. */
  async register(input: RegisterInput, client: ClientInfo): Promise<SignedIn> {
    const secretHash = await hashPassword(input.password);
    try {
      return await this.db.transaction(async (tx) => {
        const user = one(await tx.insert(users).values({ email: input.email }).returning());
        await tx.insert(authIdentities).values({
          userId: user.id,
          provider: 'PASSWORD',
          identifier: input.email,
          secretHash,
        });
        const workspace = one(
          await tx
            .insert(workspaces)
            .values({ type: 'PERSONAL', name: 'Personal' })
            .returning({ id: workspaces.id }),
        );
        await tx
          .insert(workspaceMembers)
          .values({ workspaceId: workspace.id, userId: user.id, role: 'OWNER' });
        await this.audit.record(tx, {
          action: 'auth.register',
          actorUserId: user.id,
          workspaceId: workspace.id,
          client,
        });
        return signedIn(user, await this.tokens.issue(tx, user.id));
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Email is already registered');
      throw error;
    }
  }

  async login(input: LoginInput, client: ClientInfo): Promise<SignedIn> {
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
      await this.audit.record(tx, { action: 'auth.login', actorUserId: found.id, client });
      return signedIn(found, await this.tokens.issue(tx, found.id));
    });
  }
}
