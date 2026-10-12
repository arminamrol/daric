import { Get, Inject, Param, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { netWorthHistorySchema, netWorthSchema, netWorthSnapshotSchema } from '@daric/core';
import { createZodDto } from 'nestjs-zod';
import { CurrentMembership, CurrentUserId, type Membership } from '../../common/request';
import { MinRole } from '../../common/workspace.guard';
import { WorkspaceController } from '../../common/workspace-route';
import { NetWorthService } from './net-worth.service';

class NetWorthDto extends createZodDto(netWorthSchema) {}
class NetWorthHistoryDto extends createZodDto(netWorthHistorySchema) {}
class NetWorthSnapshotDto extends createZodDto(netWorthSnapshotSchema) {}

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

  @Get('snapshots')
  @ApiOkResponse({
    type: NetWorthHistoryDto,
    description: 'Every Net Worth Snapshot, oldest first, with its totals',
  })
  history() {
    return this.netWorth.history();
  }

  @Post('snapshots')
  @MinRole('MEMBER')
  @ApiCreatedResponse({
    type: NetWorthSnapshotDto,
    description: "Today's Net Worth, as shown, stored as a MANUAL snapshot",
  })
  @ApiForbiddenResponse({ description: 'Viewers cannot take snapshots' })
  take(@CurrentMembership() membership: Membership, @CurrentUserId() userId: string) {
    return this.netWorth.takeSnapshot(membership, userId);
  }

  @Get('snapshots/:snapshotId')
  @ApiParam({ name: 'snapshotId', format: 'uuid' })
  @ApiOkResponse({ type: NetWorthSnapshotDto, description: 'A snapshot with its breakdown' })
  snapshot(@Param('snapshotId') snapshotId: string) {
    return this.netWorth.snapshot(snapshotId);
  }
}
