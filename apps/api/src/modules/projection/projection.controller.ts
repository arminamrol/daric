import { Get, Inject, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  projectionSchema,
  projectionSettingsSchema,
  type UpdateProjectionSettingsInput,
  updateProjectionSettingsInputSchema,
} from '@daric/core';
import { createZodDto } from 'nestjs-zod';
import { CurrentMembership, CurrentUserId, type Membership } from '../../common/request';
import { MinRole } from '../../common/workspace.guard';
import { WorkspaceController } from '../../common/workspace-route';
import { ZodBody } from '../../common/zod';
import { ProjectionService } from './projection.service';

class ProjectionDto extends createZodDto(projectionSchema) {}
class ProjectionSettingsDto extends createZodDto(projectionSettingsSchema) {}
class UpdateProjectionSettingsDto extends createZodDto(updateProjectionSettingsInputSchema) {}

@ApiTags('projection')
@ApiNotFoundResponse({ description: 'No such Workspace, or the caller is not a Member' })
@WorkspaceController('projection')
export class ProjectionController {
  constructor(@Inject(ProjectionService) private readonly projection: ProjectionService) {}

  @Get()
  @ApiOkResponse({
    type: ProjectionDto,
    description:
      'The Automatic Projection of the current Workspace-Calendar year, in the Base Currency, with its assumptions',
  })
  get(@CurrentMembership() membership: Membership) {
    return this.projection.get(membership);
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
  @ApiBadRequestResponse({ description: 'Trailing months outside 1–12' })
  @ApiForbiddenResponse({ description: 'Changing the settings needs Admin or above' })
  updateSettings(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @ZodBody(UpdateProjectionSettingsDto) body: UpdateProjectionSettingsInput,
  ) {
    return this.projection.updateSettings(membership, userId, body);
  }
}
