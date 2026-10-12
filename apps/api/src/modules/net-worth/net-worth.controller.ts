import { Get, Inject } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { netWorthSchema } from '@daric/core';
import { createZodDto } from 'nestjs-zod';
import { CurrentMembership, type Membership } from '../../common/request';
import { WorkspaceController } from '../../common/workspace-route';
import { NetWorthService } from './net-worth.service';

class NetWorthDto extends createZodDto(netWorthSchema) {}

@ApiTags('net-worth')
@ApiNotFoundResponse({ description: 'No such Workspace, or the caller is not a Member' })
@WorkspaceController('net-worth')
export class NetWorthController {
  constructor(@Inject(NetWorthService) private readonly netWorth: NetWorthService) {}

  @Get()
  @ApiOkResponse({
    type: NetWorthDto,
    description: 'Today, in the Base Currency, by currency and by Account',
  })
  get(@CurrentMembership() membership: Membership) {
    return this.netWorth.get(membership);
  }
}
