import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { MeController } from './me.controller';

@Module({ imports: [WorkspacesModule], controllers: [MeController] })
export class MeModule {}
