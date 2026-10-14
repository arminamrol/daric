import { Controller, Get, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiPaymentRequiredResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  acceptedInvitationSchema,
  type CreateInvitationInput,
  createdInvitationSchema,
  createInvitationInputSchema,
  invitationListSchema,
  invitationPreviewSchema,
  type InvitationTokenInput,
  invitationTokenInputSchema,
} from '@daric/core';
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
import { SendsMail } from '../mailer/sends-mail';
import { InvitationsService } from './invitations.service';

class InvitationListDto extends createZodDto(invitationListSchema) {}
class CreatedInvitationDto extends createZodDto(createdInvitationSchema) {}
class CreateInvitationDto extends createZodDto(createInvitationInputSchema) {}
class InvitationTokenDto extends createZodDto(invitationTokenInputSchema) {}
class InvitationPreviewDto extends createZodDto(invitationPreviewSchema) {}
class AcceptedInvitationDto extends createZodDto(acceptedInvitationSchema) {}

const notEntitled = ApiPaymentRequiredResponse({
  description: "The Workspace's Owner is not entitled to share it (Daric Plus)",
});

@ApiTags('invitations')
@ApiNotFoundResponse({
  description: 'No such Workspace or Invitation, or the caller is not a Member',
})
@ApiForbiddenResponse({
  description: 'Needs Admin or above; an Admin only for Members and Viewers',
})
@WorkspaceController('invitations')
export class InvitationsController {
  constructor(@Inject(InvitationsService) private readonly invitations: InvitationsService) {}

  @Get()
  @MinRole('ADMIN')
  @ApiOkResponse({ type: InvitationListDto, description: 'Newest first' })
  list(@CurrentMembership() membership: Membership) {
    return this.invitations.list(membership);
  }

  /** Mails the link when an email is given; the link itself is in the answer, this once. */
  @Post()
  @MinRole('ADMIN')
  @SendsMail()
  @ApiCreatedResponse({ type: CreatedInvitationDto })
  @ApiConflictResponse({ description: 'The email is already a Member or has a pending Invitation' })
  @notEntitled
  create(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @ZodBody(CreateInvitationDto) body: CreateInvitationInput,
    @Client() client: ClientInfo,
  ) {
    return this.invitations.create(membership, userId, body, client);
  }

  @Post(':invitationId/revoke')
  @MinRole('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Revoked; its link stops working' })
  @ApiConflictResponse({ description: 'Already accepted, revoked or expired' })
  revoke(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @Param('invitationId') invitationId: string,
    @Client() client: ClientInfo,
  ) {
    return this.invitations.revoke(membership, userId, invitationId, client);
  }
}

/** The person holding an Invitation link: not a Member yet, so not Workspace-scoped. */
@ApiTags('invitations')
@ApiBearerAuth()
@ApiBadRequestResponse({ description: 'The invitation is invalid, used, revoked or expired' })
@Controller('v1/invitations')
export class InvitationLinksController {
  constructor(@Inject(InvitationsService) private readonly invitations: InvitationsService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: InvitationPreviewDto })
  preview(@ZodBody(InvitationTokenDto) body: InvitationTokenInput) {
    return this.invitations.preview(body.token);
  }

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AcceptedInvitationDto, description: 'The Workspace joined' })
  @ApiForbiddenResponse({
    description:
      '`reason` EMAIL_NOT_VERIFIED: verify the email first; EMAIL_MISMATCH: the Invitation is for another email',
  })
  @ApiConflictResponse({ description: 'Already a Member of the Workspace' })
  @notEntitled
  accept(
    @CurrentUserId() userId: string,
    @ZodBody(InvitationTokenDto) body: InvitationTokenInput,
    @Client() client: ClientInfo,
  ) {
    return this.invitations.accept(userId, body.token, client);
  }
}
