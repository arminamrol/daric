import { Module } from '@nestjs/common';
import { MeController } from '../me/me.controller';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';

@Module({
  controllers: [MeController, WorkspacesController],
  providers: [WorkspacesService],
})
export class WorkspacesModule {}
