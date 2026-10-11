import { Delete, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  type CreateExchangeRateInput,
  createExchangeRateInputSchema,
  exchangeRateSchema,
  type UpdateExchangeRateInput,
  updateExchangeRateInputSchema,
} from '@daric/core';
import { createZodDto } from 'nestjs-zod';
import { CurrentMembership, CurrentUserId, type Membership } from '../../common/request';
import { MinRole } from '../../common/workspace.guard';
import { WorkspaceController } from '../../common/workspace-route';
import { ZodBody } from '../../common/zod';
import { ExchangeRatesService, RATE_TAKEN } from './exchange-rates.service';

class ExchangeRateDto extends createZodDto(exchangeRateSchema) {}
class CreateExchangeRateDto extends createZodDto(createExchangeRateInputSchema) {}
class UpdateExchangeRateDto extends createZodDto(updateExchangeRateInputSchema) {}

@ApiTags('exchange-rates')
@ApiNotFoundResponse({
  description:
    'No such Workspace or rate (or a rate into a former Base Currency), or the caller is not a Member',
})
@ApiForbiddenResponse({ description: 'Changing rates needs Admin or above' })
@WorkspaceController('exchange-rates')
export class ExchangeRatesController {
  constructor(@Inject(ExchangeRatesService) private readonly rates: ExchangeRatesService) {}

  @Get()
  @ApiOkResponse({
    type: [ExchangeRateDto],
    description: 'Rates into the current Base Currency, by currency, newest first',
  })
  list(@CurrentMembership() membership: Membership) {
    return this.rates.list(membership);
  }

  @Post()
  @MinRole('ADMIN')
  @ApiCreatedResponse({ type: ExchangeRateDto, description: 'Into the current Base Currency' })
  @ApiBadRequestResponse({ description: 'Invalid input, or a rate of the Base Currency itself' })
  @ApiConflictResponse({ description: RATE_TAKEN })
  create(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @ZodBody(CreateExchangeRateDto) body: CreateExchangeRateInput,
  ) {
    return this.rates.create(membership, userId, body);
  }

  @Patch(':rateId')
  @MinRole('ADMIN')
  @ApiOkResponse({ type: ExchangeRateDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiConflictResponse({ description: RATE_TAKEN })
  update(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @Param('rateId') rateId: string,
    @ZodBody(UpdateExchangeRateDto) body: UpdateExchangeRateInput,
  ) {
    return this.rates.update(membership, userId, rateId, body);
  }

  @Delete(':rateId')
  @MinRole('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deleted' })
  remove(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @Param('rateId') rateId: string,
  ) {
    return this.rates.remove(membership, userId, rateId);
  }
}
