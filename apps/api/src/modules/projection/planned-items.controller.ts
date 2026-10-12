import { Delete, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  type CreatePlannedItemInput,
  createPlannedItemInputSchema,
  plannedItemSchema,
  type UpdatePlannedItemInput,
  updatePlannedItemInputSchema,
} from '@daric/core';
import { createZodDto } from 'nestjs-zod';
import { CurrentMembership, CurrentUserId, type Membership } from '../../common/request';
import { MinRole } from '../../common/workspace.guard';
import { WorkspaceController } from '../../common/workspace-route';
import { ZodBody } from '../../common/zod';
import { PlannedItemsService } from './planned-items.service';

class PlannedItemDto extends createZodDto(plannedItemSchema) {}
class CreatePlannedItemDto extends createZodDto(createPlannedItemInputSchema) {}
class UpdatePlannedItemDto extends createZodDto(updatePlannedItemInputSchema) {}

const invalidInput =
  'Invalid input: a Fixed Monthly item with no Category, a One-Off with an end, an end before the start, or a Category that is missing, archived or of another type';

@ApiTags('projection')
@ApiNotFoundResponse({
  description: 'No such Workspace or Planned Item, or the caller is not a Member',
})
@ApiForbiddenResponse({ description: 'Changing Planned Items needs Admin or above' })
@WorkspaceController('projection/planned-items')
export class PlannedItemsController {
  constructor(@Inject(PlannedItemsService) private readonly items: PlannedItemsService) {}

  @Get()
  @ApiOkResponse({ type: [PlannedItemDto], description: 'Oldest first' })
  list() {
    return this.items.list();
  }

  @Get(':itemId')
  @ApiOkResponse({ type: PlannedItemDto })
  get(@Param('itemId') itemId: string) {
    return this.items.get(itemId);
  }

  @Post()
  @MinRole('ADMIN')
  @ApiCreatedResponse({ type: PlannedItemDto, description: 'In the Base Currency' })
  @ApiBadRequestResponse({ description: invalidInput })
  create(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @ZodBody(CreatePlannedItemDto) body: CreatePlannedItemInput,
  ) {
    return this.items.create(membership, userId, body);
  }

  @Patch(':itemId')
  @MinRole('ADMIN')
  @ApiOkResponse({ type: PlannedItemDto })
  @ApiBadRequestResponse({ description: invalidInput })
  update(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @Param('itemId') itemId: string,
    @ZodBody(UpdatePlannedItemDto) body: UpdatePlannedItemInput,
  ) {
    return this.items.update(membership, userId, itemId, body);
  }

  @Delete(':itemId')
  @MinRole('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deleted' })
  remove(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.items.remove(membership, userId, itemId);
  }
}
