import { Delete, Get, HttpCode, HttpStatus, Inject, Param, Patch } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { memberSchema, type UpdateMemberInput, updateMemberInputSchema } from '@daric/core';
import { createZodDto } from 'nestjs-zod';
import {
  Client,
  type ClientInfo,
  CurrentMembership,
  CurrentUserId,
  type Membership,
} from '../../common/request';
import { MinRole } from '../../common/workspace.guard';
import { WorkspaceController } from '../../common/workspace-route';
import { ZodBody } from '../../common/zod';
import { MembersService } from './members.service';

class MemberDto extends createZodDto(memberSchema) {}
class UpdateMemberDto extends createZodDto(updateMemberInputSchema) {}

@ApiTags('members')
@ApiNotFoundResponse({ description: 'No such Workspace or Member, or the caller is not a Member' })
@WorkspaceController('members')
export class MembersController {
  constructor(@Inject(MembersService) private readonly members: MembersService) {}

  @Get()
  @ApiOkResponse({ type: [MemberDto], description: 'In the order they joined' })
  list() {
    return this.members.list();
  }

  @Patch(':memberId')
  @MinRole('ADMIN')
  @ApiOkResponse({ type: MemberDto })
  @ApiForbiddenResponse({
    description: 'The Owner may change anyone else; an Admin only Members and Viewers, to those',
  })
  update(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @Param('memberId') memberId: string,
    @ZodBody(UpdateMemberDto) body: UpdateMemberInput,
    @Client() client: ClientInfo,
  ) {
    return this.members.changeRole(membership, userId, memberId, body, client);
  }

  /** Removes a Member, or, on one's own membership, leaves the Workspace. */
  @Delete(':memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Removed or left; their sharing Consent is revoked' })
  @ApiForbiddenResponse({
    description:
      'The Owner cannot leave; the Owner may remove anyone else, an Admin only Members and Viewers',
  })
  remove(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @Param('memberId') memberId: string,
    @Client() client: ClientInfo,
  ) {
    return this.members.remove(membership, userId, memberId, client);
  }
}
