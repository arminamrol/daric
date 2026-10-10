import { Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { accountSchema, createAccountInputSchema, updateAccountInputSchema } from '@daric/core';
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
  create(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @ZodBody(CreateAccountDto) body: CreateAccountDto,
  ) {
    return this.accounts.create(membership, userId, body);
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
