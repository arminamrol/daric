import { Get, Inject, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { auditPageSchema, auditQuerySchema, type AuditPage } from '@daric/core';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { DATABASE } from '../../common/di-tokens';
import { MinRole } from '../../common/workspace.guard';
import { WorkspaceController } from '../../common/workspace-route';
import type { Database } from '../../db/client';
import { auditLogs } from '../../db/schema';
import { scopedTx } from '../../db/scope';
import { emailsOf } from '../members/sharing';

class AuditPageDto extends createZodDto(auditPageSchema) {}
class AuditQueryDto extends createZodDto(auditQuerySchema) {}

/**
 * The Workspace's audit log for its Owner. Row-level security limits it to
 * the Workspace; IP addresses and user agents are left out, since they are
 * other Members' details.
 */
@ApiTags('audit')
@ApiNotFoundResponse({ description: 'No such Workspace, or the caller is not a Member' })
@ApiForbiddenResponse({ description: 'Only the Owner sees the audit log' })
@WorkspaceController('audit')
export class AuditController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get()
  @MinRole('OWNER')
  @ApiOkResponse({ type: AuditPageDto, description: 'Newest first' })
  @ApiBadRequestResponse({ description: 'A malformed `before` or `limit`' })
  async list(
    @Query(new ZodValidationPipe(AuditQueryDto)) { before, limit }: AuditQueryDto,
  ): Promise<AuditPage> {
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
        and(eq(auditLogs.createdAt, cursor.createdAt), sql`${auditLogs.id} < ${before}`),
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
    const emails = await emailsOf(
      this.db,
      page.map((r) => r.actorUserId),
    );
    return {
      entries: page.map(({ actorUserId, createdAt, metadata, ...row }) => ({
        ...row,
        actorEmail: actorUserId ? (emails.get(actorUserId) ?? null) : null,
        metadata: metadata as AuditPage['entries'][number]['metadata'],
        createdAt: createdAt.toISOString(),
      })),
      next: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    };
  }
}
