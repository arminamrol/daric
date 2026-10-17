import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AccountDeletionController } from './account-deletion.controller';
import { AccountDeletionService } from './account-deletion.service';
import { MeController } from './me.controller';

@Module({
  imports: [WorkspacesModule],
  controllers: [MeController, AccountDeletionController],
  providers: [AccountDeletionService],
})
export class MeModule {}
