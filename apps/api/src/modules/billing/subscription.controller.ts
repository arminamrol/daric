import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { subscriptionSchema, type Subscription } from '@daric/core';
import { createZodDto } from 'nestjs-zod';
import { CurrentUserId } from '../../common/request';
import { EntitlementsService } from './entitlements.service';

class SubscriptionDto extends createZodDto(subscriptionSchema) {}

@ApiTags('me')
@ApiBearerAuth()
@Controller('v1/me/subscription')
export class SubscriptionController {
  constructor(@Inject(EntitlementsService) private readonly entitlements: EntitlementsService) {}

  /** The User's Plan, its expiry and their Entitlements. */
  @Get()
  @ApiOkResponse({ type: SubscriptionDto })
  get(@CurrentUserId() userId: string): Promise<Subscription> {
    return this.entitlements.subscriptionOf(userId);
  }
}
