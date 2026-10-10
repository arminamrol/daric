import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  NotFoundException,
} from '@nestjs/common';
import { from, lastValueFrom, type Observable } from 'rxjs';
import type { Database } from '../db/client';
import { runInWorkspace } from '../db/scope';
import { type AppRequest, isUuid } from './request';
import { DATABASE } from './tokens';

/**
 * Runs the handler in one transaction scoped by row-level security to the
 * Workspace in the URL and the authenticated User (ADR-0001). The scope comes
 * from the URL and the token, not from the guards, so it holds even if a guard
 * is missing or wrong. Handlers reach the transaction through `scopedTx()`.
 */
@Injectable()
export class WorkspaceScopeInterceptor implements NestInterceptor {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    const workspaceId = req.params['wsId'];
    if (!req.user || !isUuid(workspaceId)) throw new NotFoundException();
    const scope = { userId: req.user.id, workspaceId };
    return from(
      runInWorkspace(this.db, scope, () =>
        lastValueFrom(next.handle(), { defaultValue: undefined }),
      ),
    );
  }
}
