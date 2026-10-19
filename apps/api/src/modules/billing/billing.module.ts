import { Global, Module } from '@nestjs/common';
import { CONFIG } from '../../common/di-tokens';
import type { Config } from '../../config';
import { EntitlementsService } from './entitlements.service';
import { PAYMENT_PROVIDER } from './payment-provider';
import { PaymentCallbackController, PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { SubscriptionController } from './subscription.controller';
import { ZarinpalProvider } from './zarinpal';

/** Global: anything a Plan limits asks EntitlementsService. */
@Global()
@Module({
  controllers: [SubscriptionController, PaymentsController, PaymentCallbackController],
  providers: [
    EntitlementsService,
    PaymentsService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [CONFIG],
      useFactory: (config: Config) =>
        new ZarinpalProvider({
          merchantId: config.ZARINPAL_MERCHANT_ID ?? null,
          sandbox: config.ZARINPAL_SANDBOX,
        }),
    },
  ],
  exports: [EntitlementsService],
})
export class BillingModule {}
