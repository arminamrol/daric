import { Get, Inject, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  categorySchema,
  createCategoryInputSchema,
  reorderCategoriesInputSchema,
  updateCategoryInputSchema,
} from '@daric/core';
import { createZodDto } from 'nestjs-zod';
import { CurrentMembership, CurrentUserId, type Membership } from '../../common/request';
import { MinRole } from '../../common/workspace.guard';
import { WorkspaceController } from '../../common/workspace-route';
import { ZodBody } from '../../common/zod';
import { CategoriesService } from './categories.service';

class CategoryDto extends createZodDto(categorySchema) {}
class CreateCategoryDto extends createZodDto(createCategoryInputSchema) {}
class UpdateCategoryDto extends createZodDto(updateCategoryInputSchema) {}
class ReorderCategoriesDto extends createZodDto(reorderCategoriesInputSchema) {}

const parentRules =
  'Invalid input, or a parent that is missing, not top-level or of the other kind';
const archiveRules = 'An active Category would sit under an archived parent';

@ApiTags('categories')
@ApiNotFoundResponse({
  description: 'No such Workspace or Category, or the caller is not a Member',
})
@WorkspaceController('categories')
export class CategoriesController {
  constructor(@Inject(CategoriesService) private readonly categories: CategoriesService) {}

  @Get()
  @ApiQuery({ name: 'includeArchived', required: false, enum: ['true', 'false'] })
  @ApiOkResponse({
    type: [CategoryDto],
    description: "Each kind's top-level Categories in order, each followed by its children",
  })
  list(@Query('includeArchived') includeArchived?: string) {
    return this.categories.list({ includeArchived: includeArchived === 'true' });
  }

  @Put('order')
  @MinRole('ADMIN')
  @ApiOkResponse({ type: [CategoryDto], description: 'The reordered siblings' })
  @ApiBadRequestResponse({ description: 'The ids are not exactly the Categories under one parent' })
  reorder(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @ZodBody(ReorderCategoriesDto) body: ReorderCategoriesDto,
  ) {
    return this.categories.reorder(membership, userId, body);
  }

  @Get(':categoryId')
  @ApiOkResponse({ type: CategoryDto })
  get(@Param('categoryId') categoryId: string) {
    return this.categories.get(categoryId);
  }

  @Post()
  @MinRole('ADMIN')
  @ApiCreatedResponse({ type: CategoryDto })
  @ApiBadRequestResponse({ description: parentRules })
  @ApiConflictResponse({ description: archiveRules })
  create(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @ZodBody(CreateCategoryDto) body: CreateCategoryDto,
  ) {
    return this.categories.create(membership, userId, body);
  }

  @Patch(':categoryId')
  @MinRole('ADMIN')
  @ApiOkResponse({ type: CategoryDto })
  @ApiBadRequestResponse({
    description: `${parentRules}, or a parent for a Category with children`,
  })
  @ApiConflictResponse({ description: `${archiveRules}, or archiving one with active children` })
  update(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @Param('categoryId') categoryId: string,
    @ZodBody(UpdateCategoryDto) body: UpdateCategoryDto,
  ) {
    return this.categories.update(membership, userId, categoryId, body);
  }
}
