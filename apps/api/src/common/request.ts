import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { WorkspaceRole } from '@daric/core';
import type { Request } from 'express';
import { z } from 'zod';

export interface Membership {
  workspaceId: string;
  role: WorkspaceRole;
}

/** What the guards attach to a request. */
export interface AppRequest extends Request {
  user?: { id: string };
  membership?: Membership;
}

/** Client details recorded in audit logs. */
export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

export function clientInfo(req: Request): ClientInfo {
  return { ip: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 512) ?? null };
}

/** The authenticated User's id. */
export const CurrentUserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const user = ctx.switchToHttp().getRequest<AppRequest>().user;
  if (!user) throw new Error('CurrentUserId used on a public route');
  return user.id;
});

/** The caller's membership in `:wsId`, resolved by WorkspaceGuard. */
export const CurrentMembership = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Membership => {
    const membership = ctx.switchToHttp().getRequest<AppRequest>().membership;
    if (!membership) throw new Error('CurrentMembership used outside a Workspace route');
    return membership;
  },
);

export const Client = createParamDecorator((_: unknown, ctx: ExecutionContext): ClientInfo =>
  clientInfo(ctx.switchToHttp().getRequest<Request>()),
);

const uuid = z.uuid();
export function isUuid(value: unknown): value is string {
  return uuid.safeParse(value).success;
}
