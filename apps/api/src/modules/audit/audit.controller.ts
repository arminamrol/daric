import { Get, Inject, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { auditPageSchema, auditQuerySchema } from '@daric/core';
import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { MinRole } from '../../common/workspace.guard';
import { WorkspaceController } from '../../common/workspace-route';
import { AuditLogService } from './audit-log.service';

class AuditPageDto extends createZodDto(auditPageSchema) {}
class AuditQueryDto extends createZodDto(auditQuerySchema) {}

@ApiTags('audit')
@ApiNotFoundResponse({ description: 'No such Workspace, or the caller is not a Member' })
@ApiForbiddenResponse({ description: 'Only the Owner sees the audit log' })
@WorkspaceController('audit')
export class AuditController {
  constructor(@Inject(AuditLogService) private readonly log: AuditLogService) {}

  @Get()
  @MinRole('OWNER')
  @ApiOkResponse({ type: AuditPageDto, description: 'Newest first' })
  @ApiBadRequestResponse({ description: 'A malformed `before` or `limit`' })
  list(@Query(new ZodValidationPipe(AuditQueryDto)) query: AuditQueryDto) {
    return this.log.page(query);
  }
}
