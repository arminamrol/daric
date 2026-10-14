import { Get, HttpStatus, Inject, Param, Patch, Post, Query, Res } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { accountSchema, createAccountInputSchema, updateAccountInputSchema } from '@daric/core';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { CurrentMembership, CurrentUserId, type Membership } from '../../common/request';
import { MinRole } from '../../common/workspace.guard';
import { WorkspaceController } from '../../common/workspace-route';
import { ZodBody } from '../../common/zod';
import { AccountsService } from './accounts.service';

class AccountDto extends createZodDto(accountSchema) {}
class CreateAccountDto extends createZodDto(createAccountInputSchema) {}
class UpdateAccountDto extends createZodDto(updateAccountInputSchema) {}

@ApiTags('accounts')
@ApiNotFoundResponse({ description: 'No such Workspace or Account, or the caller is not a Member' })
@WorkspaceController('accounts')
export class AccountsController {
  constructor(@Inject(AccountsService) private readonly accounts: AccountsService) {}

  @Get()
  @ApiQuery({ name: 'includeArchived', required: false, enum: ['true', 'false'] })
  @ApiOkResponse({ type: [AccountDto] })
  list(@Query('includeArchived') includeArchived?: string) {
    return this.accounts.list({ includeArchived: includeArchived === 'true' });
  }

  @Get(':accountId')
  @ApiOkResponse({ type: AccountDto })
  get(@Param('accountId') accountId: string) {
    return this.accounts.get(accountId);
  }

  @Post()
  @MinRole('ADMIN')
  @ApiCreatedResponse({ type: AccountDto })
  @ApiOkResponse({ type: AccountDto, description: 'Already created under this id' })
  @ApiConflictResponse({ description: 'The id is already used in another Workspace' })
  async create(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @ZodBody(CreateAccountDto) body: CreateAccountDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { created, value } = await this.accounts.create(membership, userId, body);
    if (!created) res.status(HttpStatus.OK);
    return value;
  }

  @Patch(':accountId')
  @MinRole('ADMIN')
  @ApiOkResponse({ type: AccountDto })
  update(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @Param('accountId') accountId: string,
    @ZodBody(UpdateAccountDto) body: UpdateAccountDto,
  ) {
    return this.accounts.update(membership, userId, accountId, body);
  }
}
