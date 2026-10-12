import { Delete, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  type CreateValuationInput,
  createValuationInputSchema,
  type UpdateValuationInput,
  updateValuationInputSchema,
  valuationSchema,
} from '@daric/core';
import { createZodDto } from 'nestjs-zod';
import { CurrentMembership, CurrentUserId, type Membership } from '../../common/request';
import { MinRole } from '../../common/workspace.guard';
import { WorkspaceController } from '../../common/workspace-route';
import { ZodBody } from '../../common/zod';
import { VALUATION_TAKEN, ValuationsService } from './valuations.service';

class ValuationDto extends createZodDto(valuationSchema) {}
class CreateValuationDto extends createZodDto(createValuationInputSchema) {}
class UpdateValuationDto extends createZodDto(updateValuationInputSchema) {}

@ApiTags('valuations')
@ApiParam({ name: 'accountId', format: 'uuid' })
@ApiNotFoundResponse({
  description: 'No such Workspace, Account or Valuation, or the caller is not a Member',
})
@ApiForbiddenResponse({ description: 'Changing Valuations needs Admin or above' })
@WorkspaceController('accounts/:accountId/valuations')
export class ValuationsController {
  constructor(@Inject(ValuationsService) private readonly valuations: ValuationsService) {}

  @Get()
  @ApiOkResponse({ type: [ValuationDto], description: 'Newest first' })
  list(@Param('accountId') accountId: string) {
    return this.valuations.list(accountId);
  }

  @Post()
  @MinRole('ADMIN')
  @ApiCreatedResponse({ type: ValuationDto })
  @ApiBadRequestResponse({ description: 'Invalid input, or the Account is archived' })
  @ApiConflictResponse({ description: VALUATION_TAKEN })
  create(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @Param('accountId') accountId: string,
    @ZodBody(CreateValuationDto) body: CreateValuationInput,
  ) {
    return this.valuations.create(membership, userId, accountId, body);
  }

  @Patch(':valuationId')
  @MinRole('ADMIN')
  @ApiOkResponse({ type: ValuationDto })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiConflictResponse({ description: VALUATION_TAKEN })
  update(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @Param('accountId') accountId: string,
    @Param('valuationId') valuationId: string,
    @ZodBody(UpdateValuationDto) body: UpdateValuationInput,
  ) {
    return this.valuations.update(membership, userId, accountId, valuationId, body);
  }

  @Delete(':valuationId')
  @MinRole('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deleted' })
  remove(
    @CurrentMembership() membership: Membership,
    @CurrentUserId() userId: string,
    @Param('accountId') accountId: string,
    @Param('valuationId') valuationId: string,
  ) {
    return this.valuations.remove(membership, userId, accountId, valuationId);
  }
}
