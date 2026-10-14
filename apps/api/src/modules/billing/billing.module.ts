import { Global, Module } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service';
import { SubscriptionController } from './subscription.controller';

/** Global: anything a Plan limits asks EntitlementsService. */
@Global()
@Module({
  controllers: [SubscriptionController],
  providers: [EntitlementsService],
  exports: [EntitlementsService],
})
export class BillingModule {}
