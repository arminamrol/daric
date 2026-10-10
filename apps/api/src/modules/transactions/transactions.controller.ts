import { Get, HttpStatus, Inject, Param, Post, Query, Res } from '@nestjs/common';
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
  createTransactionInputSchema,
  listTransactionsQuerySchema,
  transactionSchema,
} from '@daric/core';
import type { Response } from 'express';
import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { CurrentMembership, CurrentUserId, type Membership } from '../../common/request';
import { MinRole } from '../../common/workspace.guard';
import { WorkspaceController } from '../../common/workspace-route';
import { ZodBody } from '../../common/zod';
import { TransactionsService } from './transactions.service';

class TransactionDto extends createZodDto(transactionSchema) {}
class CreateTransactionDto extends createZodDto(createTransactionInputSchema) {}
class ListTransactionsQueryDto extends createZodDto(listTransactionsQuerySchema) {}

@ApiTags('transactions')
@ApiNotFoundResponse({
  description: 'No such Workspace or Transaction, or the caller is not a Member',
})
@WorkspaceController('transactions')
export class TransactionsController {
  constructor(@Inject(TransactionsService) private readonly transactions: TransactionsService) {}

  @Get()
  @ApiQuery({
    name: 'period',
    required: false,
    description: 'A month (`1405-07`) or year (`1405`) of the Workspace Calendar',
  })
  @ApiQuery({ name: 'accountId', required: false, schema: { format: 'uuid' } })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    schema: { format: 'uuid' },
    description: 'A parent Category includes its children',
  })
  @ApiOkResponse({ type: [TransactionDto], description: 'Newest first' })
  @ApiBadRequestResponse({ description: 'A malformed filter' })
  list(
    @CurrentMembership() membership: Membership,
    @Query(new ZodValidationPipe(ListTransactionsQueryDto)) query: ListTransactionsQueryDto,
  ) {
    return this.transactions.list(membership, query);
  }

  @Get(':transactionId')
  @ApiOkResponse({ type: TransactionDto })
  get(@Param('transactionId') transactionId: string) {
    return this.transactions.get(transactionId);
  }

  @Post()
  @MinRole('MEMBER')
  @ApiCreatedResponse({ type: TransactionDto })
  @ApiOkResponse({ type: TransactionDto, description: 'Already recorded under this id' })
  @ApiBadRequestResponse({
    description:
      'Invalid input, or an Account or Category that is missing, archived or of the other kind',
  })
  @ApiConflictResponse({ description: 'The id is already used by a different Transaction' })
  async create(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @ZodBody(CreateTransactionDto) body: CreateTransactionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { created, transaction } = await this.transactions.create(membership, userId, body);
    if (!created) res.status(HttpStatus.OK);
    return transaction;
  }
}
