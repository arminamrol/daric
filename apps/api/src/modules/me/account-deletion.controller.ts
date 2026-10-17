import { Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { accountDeletionPreviewSchema, deleteAccountInputSchema } from '@daric/core';
import type { Request, Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { CurrentUserId } from '../../common/request';
import { ZodBody } from '../../common/zod';
import { ChecksPassword } from '../auth/checks-password';
import { clearSessionCookies, isMobileClient } from '../auth/cookies';
import { AccountDeletionService } from './account-deletion.service';

class AccountDeletionPreviewDto extends createZodDto(accountDeletionPreviewSchema) {}
class DeleteAccountDto extends createZodDto(deleteAccountInputSchema) {}

@ApiTags('me')
@ApiBearerAuth()
@Controller('v1/me/deletion')
export class AccountDeletionController {
  constructor(@Inject(AccountDeletionService) private readonly deletion: AccountDeletionService) {}

  @Get()
  @ApiOkResponse({ type: AccountDeletionPreviewDto, description: 'What deleting would do' })
  preview(@CurrentUserId() userId: string) {
    return this.deletion.preview(userId);
  }

  @Post()
  @HttpCode(204)
  @ChecksPassword()
  @ApiNoContentResponse({
    description: 'The User and their data are gone; the web app’s session cookies are cleared',
  })
  @ApiForbiddenResponse({ description: '`reason: WRONG_PASSWORD`' })
  @ApiConflictResponse({
    description:
      '`reason: OWNS_SHARED_WORKSPACE`, with `sharedWorkspaces`: ownership must be transferred first',
  })
  async delete(
    @CurrentUserId() userId: string,
    @ZodBody(DeleteAccountDto) body: DeleteAccountDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.deletion.delete(userId, body.password);
    if (!isMobileClient(req)) clearSessionCookies(res);
  }
}
