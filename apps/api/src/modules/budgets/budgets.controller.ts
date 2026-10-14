import {
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  budgetSchema,
  type CreateBudgetInput,
  createBudgetInputSchema,
  progressMonthQuerySchema,
  type UpdateBudgetInput,
  updateBudgetInputSchema,
} from '@daric/core';
import type { Response } from 'express';
import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { CurrentMembership, CurrentUserId, type Membership } from '../../common/request';
import { MinRole } from '../../common/workspace.guard';
import { WorkspaceController } from '../../common/workspace-route';
import { ZodBody } from '../../common/zod';
import { BUDGET_TAKEN, BudgetsService } from './budgets.service';

class BudgetDto extends createZodDto(budgetSchema) {}
class CreateBudgetDto extends createZodDto(createBudgetInputSchema) {}
class UpdateBudgetDto extends createZodDto(updateBudgetInputSchema) {}
class ProgressMonthQueryDto extends createZodDto(progressMonthQuerySchema) {}

const monthQuery = ApiQuery({
  name: 'month',
  required: false,
  description:
    'The month of the Workspace Calendar (`1405-07`) to show progress for; a yearly Budget shows the year holding it. Defaults to the current month.',
});

const invalidInput =
  'Invalid input, or a Category or Label that is missing or archived, or a Category that is not an Expense one';

@ApiTags('budgets')
@ApiNotFoundResponse({ description: 'No such Workspace or Budget, or the caller is not a Member' })
@ApiForbiddenResponse({ description: 'Changing Budgets needs Admin or above' })
@WorkspaceController('budgets')
export class BudgetsController {
  constructor(@Inject(BudgetsService) private readonly budgets: BudgetsService) {}

  @Get()
  @monthQuery
  @ApiOkResponse({ type: [BudgetDto], description: 'Oldest first' })
  @ApiBadRequestResponse({ description: 'A malformed month' })
  list(
    @CurrentMembership() membership: Membership,
    @Query(new ZodValidationPipe(ProgressMonthQueryDto)) query: ProgressMonthQueryDto,
  ) {
    return this.budgets.list(membership, query.month);
  }

  @Get(':budgetId')
  @monthQuery
  @ApiOkResponse({ type: BudgetDto })
  get(
    @CurrentMembership() membership: Membership,
    @Param('budgetId') budgetId: string,
    @Query(new ZodValidationPipe(ProgressMonthQueryDto)) query: ProgressMonthQueryDto,
  ) {
    return this.budgets.get(membership, budgetId, query.month);
  }

  @Post()
  @MinRole('ADMIN')
  @monthQuery
  @ApiCreatedResponse({ type: BudgetDto, description: 'In the Base Currency' })
  @ApiOkResponse({ type: BudgetDto, description: 'Already created under this id' })
  @ApiBadRequestResponse({ description: invalidInput })
  @ApiConflictResponse({ description: BUDGET_TAKEN })
  async create(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @ZodBody(CreateBudgetDto) body: CreateBudgetInput,
    @Query(new ZodValidationPipe(ProgressMonthQueryDto)) query: ProgressMonthQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { created, value } = await this.budgets.create(membership, userId, body, query.month);
    if (!created) res.status(HttpStatus.OK);
    return value;
  }

  @Patch(':budgetId')
  @MinRole('ADMIN')
  @monthQuery
  @ApiOkResponse({ type: BudgetDto })
  @ApiBadRequestResponse({ description: invalidInput })
  @ApiConflictResponse({ description: BUDGET_TAKEN })
  update(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @Param('budgetId') budgetId: string,
    @ZodBody(UpdateBudgetDto) body: UpdateBudgetInput,
    @Query(new ZodValidationPipe(ProgressMonthQueryDto)) query: ProgressMonthQueryDto,
  ) {
    return this.budgets.update(membership, userId, budgetId, body, query.month);
  }

  @Delete(':budgetId')
  @MinRole('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deleted' })
  remove(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @Param('budgetId') budgetId: string,
  ) {
    return this.budgets.remove(membership, userId, budgetId);
  }
}
