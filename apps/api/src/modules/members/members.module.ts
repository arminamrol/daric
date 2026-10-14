import { Module } from '@nestjs/common';
import { ConsentsController } from './consents.controller';
import { ConsentsService } from './consents.service';
import { InvitationLinksController, InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

/** Sharing a Workspace: Members, Invitations and the Consents they rest on. */
@Module({
  controllers: [
    MembersController,
    InvitationsController,
    InvitationLinksController,
    ConsentsController,
  ],
  providers: [MembersService, InvitationsService, ConsentsService],
})
export class MembersModule {}
