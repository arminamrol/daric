import { Controller, Get, HttpCode, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { consentSchema } from '@daric/core';
import { createZodDto } from 'nestjs-zod';
import { Client, type ClientInfo, CurrentUserId } from '../../common/request';
import { ConsentsService } from './consents.service';

class ConsentDto extends createZodDto(consentSchema) {}

@ApiTags('me')
@ApiBearerAuth()
@Controller('v1/me/consents')
export class ConsentsController {
  constructor(@Inject(ConsentsService) private readonly consents: ConsentsService) {}

  @Get()
  @ApiOkResponse({ type: [ConsentDto], description: 'Newest first, revoked ones included' })
  list(@CurrentUserId() userId: string) {
    return this.consents.list(userId);
  }

  @Post(':consentId/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: 'Revoked at once; revoking workspace sharing leaves that Workspace',
  })
  @ApiNotFoundResponse({ description: "No such Consent of the User's" })
  revoke(
    @CurrentUserId() userId: string,
    @Param('consentId') consentId: string,
    @Client() client: ClientInfo,
  ) {
    return this.consents.revoke(userId, consentId, client);
  }
}
