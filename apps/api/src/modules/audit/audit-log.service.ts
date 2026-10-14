import { Inject, Injectable } from '@nestjs/common';
import type { AuditPage, AuditQuery } from '@daric/core';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { DATABASE } from '../../common/di-tokens';
import type { Database } from '../../db/client';
import { auditLogs } from '../../db/schema';
import { scopedTx } from '../../db/scope';
import { emailsOf } from '../../db/user-emails';

/**
 * Reads a Workspace's audit log for its Owner. Row-level security limits it
 * to the Workspace; IP addresses and user agents are left out, since they are
 * other Members' details.
 */
@Injectable()
export class AuditLogService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** A page, newest first by (created_at, id): rows of one transaction share created_at. */
  async page({ before, limit }: AuditQuery): Promise<AuditPage> {
    const tx = scopedTx();
    let older;
    if (before) {
      const [cursor] = await tx
        .select({ createdAt: auditLogs.createdAt })
        .from(auditLogs)
        .where(eq(auditLogs.id, before));
      if (!cursor) return { entries: [], next: null };
      older = or(
        lt(auditLogs.createdAt, cursor.createdAt),
        and(eq(auditLogs.createdAt, cursor.createdAt), lt(auditLogs.id, before)),
      );
    }
    const rows = await tx
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        actorUserId: auditLogs.actorUserId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(older)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const emailOf = await emailsOf(
      this.db,
      page.map((r) => r.actorUserId),
    );
    return {
      entries: page.map(({ actorUserId, createdAt, metadata, ...row }) => ({
        ...row,
        actorEmail: emailOf(actorUserId),
        metadata: metadata as AuditPage['entries'][number]['metadata'],
        createdAt: createdAt.toISOString(),
      })),
      next: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    };
  }
}
