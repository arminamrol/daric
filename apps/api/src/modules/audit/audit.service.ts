import { Injectable } from '@nestjs/common';
import type { ClientInfo } from '../../common/request';
import type { Executor } from '../../db/client';
import { auditLogs } from '../../db/schema';

export type AuditAction =
  | 'auth.register'
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.refresh_reuse'
  | 'workspace.update'
  | 'account.create'
  | 'account.update'
  | 'category.create'
  | 'category.update'
  | 'category.reorder'
  | 'label.create'
  | 'label.update'
  | 'transaction.create'
  | 'transaction.label_attach'
  | 'transaction.label_detach';

export interface AuditEntry {
  action: AuditAction;
  actorUserId: string | null;
  workspaceId?: string | null;
  client?: ClientInfo;
  /** Ids and field names only: never Amounts, notes or tokens. */
  metadata?: Record<string, string | number | boolean | string[]>;
}

/** Writes append-only audit rows on the caller's executor, inside its transaction. */
@Injectable()
export class AuditService {
  async record(db: Executor, entry: AuditEntry): Promise<void> {
    await db.insert(auditLogs).values({
      action: entry.action,
      actorUserId: entry.actorUserId,
      workspaceId: entry.workspaceId ?? null,
      ip: entry.client?.ip ?? null,
      userAgent: entry.client?.userAgent ?? null,
      metadata: entry.metadata ?? {},
    });
  }
}
