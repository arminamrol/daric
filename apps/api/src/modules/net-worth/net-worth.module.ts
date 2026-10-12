import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { NetWorthController } from './net-worth.controller';
import { NetWorthService } from './net-worth.service';
import { SnapshotJob } from './snapshot-job';

@Module({
  imports: [AccountsModule],
  controllers: [NetWorthController],
  providers: [NetWorthService, SnapshotJob],
  exports: [NetWorthService],
})
export class NetWorthModule {}
