import { Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Query, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  type ConfirmOccurrenceInput,
  confirmOccurrenceInputSchema,
  createRecurringRuleInputSchema,
  dueOccurrencesSchema,
  type ParsedCreateRecurringRuleInput,
  recurringRuleSchema,
  transactionSchema,
  type UpdateRecurringRuleInput,
  updateRecurringRuleInputSchema,
} from '@daric/core';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { CurrentMembership, CurrentUserId, type Membership } from '../../common/request';
import { MinRole } from '../../common/workspace.guard';
import { WorkspaceController } from '../../common/workspace-route';
import { namedZodDto, ZodBody } from '../../common/zod';
import {
  NOT_DUE,
  OCCURRENCE_CONFIRMED,
  OCCURRENCE_SKIPPED,
  RecurringService,
} from './recurring.service';

class RecurringRuleDto extends createZodDto(recurringRuleSchema) {}
class DueOccurrencesDto extends createZodDto(dueOccurrencesSchema) {}
const CreateRecurringRuleDto = namedZodDto(
  'CreateRecurringRuleDto',
  createRecurringRuleInputSchema,
);
const UpdateRecurringRuleDto = namedZodDto(
  'UpdateRecurringRuleDto',
  updateRecurringRuleInputSchema,
);
class ConfirmOccurrenceDto extends createZodDto(confirmOccurrenceInputSchema) {}
const TransactionDto = namedZodDto('TransactionDto', transactionSchema);

const invalidRule =
  'Invalid input, an end before the start, or an Account or Category that is missing or archived, or a Category of the other type';
const occurrence = (path: string) => `:ruleId/occurrences/:dueOn/${path}`;
const dueOnParam = ApiParam({
  name: 'dueOn',
  description: 'The day the occurrence fell due, `YYYY-MM-DD`',
});

@ApiTags('recurring')
@ApiNotFoundResponse({
  description: 'No such Workspace or Recurring Rule, or the caller is not a Member',
})
@ApiForbiddenResponse({
  description:
    'Changing rules needs Admin or above; confirming and skipping occurrences needs Member or above',
})
@WorkspaceController('recurring')
export class RecurringController {
  constructor(@Inject(RecurringService) private readonly recurring: RecurringService) {}

  @Get()
  @ApiQuery({ name: 'includeArchived', required: false, enum: ['true', 'false'] })
  @ApiOkResponse({ type: [RecurringRuleDto], description: 'Oldest first' })
  list(
    @CurrentMembership() membership: Membership,
    @Query('includeArchived') includeArchived?: string,
  ) {
    return this.recurring.list(membership, { includeArchived: includeArchived === 'true' });
  }

  // Before `:ruleId`, which would otherwise take `due` for an id.
  @Get('due')
  @ApiOkResponse({
    type: DueOccurrencesDto,
    description:
      'Every occurrence up to today not yet confirmed or skipped, oldest first. Those of auto-posting rules are recorded as Transactions first, whoever asks.',
  })
  due(@CurrentMembership() membership: Membership, @CurrentUserId() userId: string) {
    return this.recurring.due(membership, userId);
  }

  @Get(':ruleId')
  @ApiOkResponse({ type: RecurringRuleDto })
  get(@CurrentMembership() membership: Membership, @Param('ruleId') ruleId: string) {
    return this.recurring.get(membership, ruleId);
  }

  @Post()
  @MinRole('ADMIN')
  @ApiCreatedResponse({ type: RecurringRuleDto })
  @ApiBadRequestResponse({ description: invalidRule })
  create(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @ZodBody(CreateRecurringRuleDto) body: ParsedCreateRecurringRuleInput,
  ) {
    return this.recurring.create(membership, userId, body);
  }

  @Patch(':ruleId')
  @MinRole('ADMIN')
  @ApiOkResponse({ type: RecurringRuleDto })
  @ApiBadRequestResponse({ description: invalidRule })
  update(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @Param('ruleId') ruleId: string,
    @ZodBody(UpdateRecurringRuleDto) body: UpdateRecurringRuleInput,
  ) {
    return this.recurring.update(membership, userId, ruleId, body);
  }

  @Post(occurrence('confirm'))
  @MinRole('MEMBER')
  @dueOnParam
  @ApiCreatedResponse({ type: TransactionDto, description: 'The Transaction it recorded' })
  @ApiOkResponse({ type: TransactionDto, description: 'Already confirmed with this Transaction' })
  @ApiBadRequestResponse({
    description: `${NOT_DUE}, an invalid Amount, or the rule's Account or Category is archived`,
  })
  @ApiConflictResponse({ description: OCCURRENCE_SKIPPED })
  async confirm(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @Param('ruleId') ruleId: string,
    @Param('dueOn') dueOn: string,
    @ZodBody(ConfirmOccurrenceDto) body: ConfirmOccurrenceInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { created, transaction } = await this.recurring.confirm(
      membership,
      userId,
      ruleId,
      dueOn,
      body,
    );
    if (!created) res.status(HttpStatus.OK);
    return transaction;
  }

  @Post(occurrence('skip'))
  @MinRole('MEMBER')
  @dueOnParam
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Skipped, also if it was already' })
  @ApiBadRequestResponse({ description: NOT_DUE })
  @ApiConflictResponse({ description: OCCURRENCE_CONFIRMED })
  skip(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @Param('ruleId') ruleId: string,
    @Param('dueOn') dueOn: string,
  ) {
    return this.recurring.skip(membership, userId, ruleId, dueOn);
  }
}
