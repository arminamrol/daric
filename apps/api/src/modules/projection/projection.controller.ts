import { Get, Inject, Patch, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  projectionModes,
  projectionQuerySchema,
  projectionSchema,
  projectionSettingsSchema,
  type UpdateProjectionSettingsInput,
  updateProjectionSettingsInputSchema,
} from '@daric/core';
import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { CurrentMembership, CurrentUserId, type Membership } from '../../common/request';
import { MinRole } from '../../common/workspace.guard';
import { WorkspaceController } from '../../common/workspace-route';
import { ZodBody } from '../../common/zod';
import { ProjectionService } from './projection.service';

class ProjectionDto extends createZodDto(projectionSchema) {}
class ProjectionSettingsDto extends createZodDto(projectionSettingsSchema) {}
class ProjectionQueryDto extends createZodDto(projectionQuerySchema) {}
class UpdateProjectionSettingsDto extends createZodDto(updateProjectionSettingsInputSchema) {}

@ApiTags('projection')
@ApiNotFoundResponse({ description: 'No such Workspace, or the caller is not a Member' })
@WorkspaceController('projection')
export class ProjectionController {
  constructor(@Inject(ProjectionService) private readonly projection: ProjectionService) {}

  @Get()
  @ApiQuery({
    name: 'mode',
    required: false,
    enum: projectionModes,
    description: 'The mode to work it out in; the Workspace’s setting by default',
  })
  @ApiOkResponse({
    type: ProjectionDto,
    description:
      'The Projection of the current Workspace-Calendar year, in the Base Currency, with its assumptions',
  })
  @ApiBadRequestResponse({ description: 'An unknown mode' })
  get(
    @CurrentMembership() membership: Membership,
    @Query(new ZodValidationPipe(ProjectionQueryDto)) query: ProjectionQueryDto,
  ) {
    return this.projection.get(membership, query.mode);
  }

  @Get('settings')
  @ApiOkResponse({
    type: ProjectionSettingsDto,
    description: 'The defaults, with version 0, until an Admin changes them',
  })
  settings() {
    return this.projection.settings();
  }

  @Patch('settings')
  @MinRole('ADMIN')
  @ApiOkResponse({ type: ProjectionSettingsDto })
  @ApiBadRequestResponse({
    description: 'Nothing to change, trailing months outside 1–12, or an unknown mode',
  })
  @ApiForbiddenResponse({ description: 'Changing the settings needs Admin or above' })
  updateSettings(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @ZodBody(UpdateProjectionSettingsDto) body: UpdateProjectionSettingsInput,
  ) {
    return this.projection.updateSettings(membership, userId, body);
  }
}
