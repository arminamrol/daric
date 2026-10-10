import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthResult, LoginInput, RegisterInput } from '@daric/core';
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

function toResult(user: { id: string; email: string }, tokens: IssuedTokens): AuthResult {
  return {
    user: { id: user.id, email: user.email },
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
    refreshToken: tokens.refreshToken,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt.toISOString(),
  };
}

/**
 * Registration and login. These run before any Workspace scope exists, so
 * they use the owner connection directly; they only touch the new or
 * authenticated User's own rows.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Creates the User, their Personal Workspace and Owner membership in one transaction. */
  async register(input: RegisterInput, client: ClientInfo): Promise<AuthResult> {
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
        return toResult(user, await this.tokens.issue(tx, user.id));
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Email is already registered');
      throw error;
    }
  }

  async login(input: LoginInput, client: ClientInfo): Promise<AuthResult> {
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
      return toResult(found, await this.tokens.issue(tx, found.id));
    });
  }
}
