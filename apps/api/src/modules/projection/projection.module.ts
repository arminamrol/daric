import { Module } from '@nestjs/common';
import { PlannedItemsController } from './planned-items.controller';
import { PlannedItemsService } from './planned-items.service';
import { ProjectionController } from './projection.controller';
import { ProjectionService } from './projection.service';

@Module({
  controllers: [ProjectionController, PlannedItemsController],
  providers: [ProjectionService, PlannedItemsService],
})
export class ProjectionModule {}
