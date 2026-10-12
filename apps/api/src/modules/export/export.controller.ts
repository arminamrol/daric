import { Get, Inject, Query, StreamableFile } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { exportFormats, exportQuerySchema } from '@daric/core';
import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import {
  Client,
  type ClientInfo,
  CurrentMembership,
  CurrentUserId,
  type Membership,
} from '../../common/request';
import { MinRole } from '../../common/workspace.guard';
import { WorkspaceController } from '../../common/workspace-route';
import { ExportService } from './export.service';

class ExportQueryDto extends createZodDto(exportQuerySchema) {}

@ApiTags('export')
@ApiNotFoundResponse({ description: 'No such Workspace, or the caller is not a Member' })
@WorkspaceController('export')
export class ExportController {
  constructor(@Inject(ExportService) private readonly exports: ExportService) {}

  @Get()
  @MinRole('ADMIN')
  @ApiQuery({ name: 'format', required: false, enum: exportFormats })
  @ApiProduces('application/json', 'application/zip')
  @ApiOkResponse({
    description:
      'Every entity of the Workspace with every column, Amounts as strings: one JSON file, or a zip of one CSV file per entity',
  })
  @ApiBadRequestResponse({ description: 'A format other than json or csv' })
  @ApiForbiddenResponse({ description: 'Exporting needs Admin or above' })
  async export(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @Client() client: ClientInfo,
    @Query(new ZodValidationPipe(ExportQueryDto)) query: ExportQueryDto,
  ): Promise<StreamableFile> {
    const file = await this.exports.export(membership.workspaceId, userId, query.format, client);
    return new StreamableFile(file.body, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
    });
  }
}
