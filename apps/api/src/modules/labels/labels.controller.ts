import { Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { createLabelInputSchema, labelSchema, updateLabelInputSchema } from '@daric/core';
import { createZodDto } from 'nestjs-zod';
import { CurrentMembership, CurrentUserId, type Membership } from '../../common/request';
import { MinRole } from '../../common/workspace.guard';
import { WorkspaceController } from '../../common/workspace-route';
import { ZodBody } from '../../common/zod';
import { LabelsService, NAME_TAKEN } from './labels.service';

class LabelDto extends createZodDto(labelSchema) {}
class CreateLabelDto extends createZodDto(createLabelInputSchema) {}
class UpdateLabelDto extends createZodDto(updateLabelInputSchema) {}

@ApiTags('labels')
@ApiNotFoundResponse({ description: 'No such Workspace or Label, or the caller is not a Member' })
@WorkspaceController('labels')
export class LabelsController {
  constructor(@Inject(LabelsService) private readonly labels: LabelsService) {}

  @Get()
  @ApiQuery({ name: 'includeArchived', required: false, enum: ['true', 'false'] })
  @ApiOkResponse({ type: [LabelDto], description: 'By name' })
  list(@Query('includeArchived') includeArchived?: string) {
    return this.labels.list({ includeArchived: includeArchived === 'true' });
  }

  @Get(':labelId')
  @ApiOkResponse({ type: LabelDto })
  get(@Param('labelId') labelId: string) {
    return this.labels.get(labelId);
  }

  @Post()
  @MinRole('ADMIN')
  @ApiCreatedResponse({ type: LabelDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiConflictResponse({ description: NAME_TAKEN })
  create(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @ZodBody(CreateLabelDto) body: CreateLabelDto,
  ) {
    return this.labels.create(membership, userId, body);
  }

  @Patch(':labelId')
  @MinRole('ADMIN')
  @ApiOkResponse({ type: LabelDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiConflictResponse({ description: NAME_TAKEN })
  update(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @Param('labelId') labelId: string,
    @ZodBody(UpdateLabelDto) body: UpdateLabelDto,
  ) {
    return this.labels.update(membership, userId, labelId, body);
  }
}
