import { Get, Inject, Patch } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { updateWorkspaceInputSchema, workspaceSchema } from '@daric/core';
import { createZodDto } from 'nestjs-zod';
import { CurrentMembership, CurrentUserId, type Membership } from '../../common/request';
import { MinRole } from '../../common/workspace.guard';
import { WorkspaceController } from '../../common/workspace-route';
import { ZodBody } from '../../common/zod';
import { WorkspacesService } from './workspaces.service';

class WorkspaceDto extends createZodDto(workspaceSchema) {}
class UpdateWorkspaceDto extends createZodDto(updateWorkspaceInputSchema) {}

@ApiTags('workspaces')
@ApiNotFoundResponse({ description: 'No such Workspace, or the caller is not a Member' })
@WorkspaceController()
export class WorkspacesController {
  constructor(@Inject(WorkspacesService) private readonly workspaces: WorkspacesService) {}

  @Get()
  @ApiOkResponse({ type: WorkspaceDto })
  get(@CurrentMembership() membership: Membership) {
    return this.workspaces.get(membership);
  }

  @Patch()
  @MinRole('ADMIN')
  @ApiOkResponse({ type: WorkspaceDto })
  update(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @ZodBody(UpdateWorkspaceDto) body: UpdateWorkspaceDto,
  ) {
    return this.workspaces.update(membership, userId, body);
  }
}
