import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { NetWorthController } from './net-worth.controller';
import { NetWorthService } from './net-worth.service';

@Module({
  imports: [AccountsModule],
  controllers: [NetWorthController],
  providers: [NetWorthService],
})
export class NetWorthModule {}
