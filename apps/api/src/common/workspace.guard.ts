import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasRole, type WorkspaceRole } from '@daric/core';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { workspaceMembers } from '../db/schema';
import { type AppRequest, isUuid } from './request';
import { DATABASE } from './tokens';

/**
 * Resolves the caller's membership in `:wsId`. A Workspace the caller is not a
 * Member of answers 404, the same as one that does not exist.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    const workspaceId = req.params['wsId'];
    if (!req.user || !isUuid(workspaceId)) {
      throw new NotFoundException();
    }
    const [member] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, req.user.id),
        ),
      );
    if (!member) throw new NotFoundException();
    req.membership = { workspaceId, role: member.role };
    return true;
  }
}

const MIN_ROLE = 'daric:min-role';
/** The least powerful Role allowed to call the route (default Viewer). */
export const MinRole = (role: WorkspaceRole) => SetMetadata(MIN_ROLE, role);

/** Rejects Members whose Role is below the route's @MinRole. Runs after WorkspaceGuard. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const minimum = this.reflector.getAllAndOverride<WorkspaceRole | undefined>(MIN_ROLE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!minimum) return true;
    const membership = context.switchToHttp().getRequest<AppRequest>().membership;
    if (!membership || !hasRole(membership.role, minimum)) throw new ForbiddenException();
    return true;
  }
}
