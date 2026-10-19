import { Controller, Get, Inject, Param, Post, Query, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  checkoutInputSchema,
  checkoutSchema,
  paymentListSchema,
  paymentSchema,
  plusPriceListSchema,
  type PaymentWire,
  type PlusPriceWire,
} from '@daric/core';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { CONFIG } from '../../common/di-tokens';
import { CurrentUserId } from '../../common/request';
import { namedZodDto, ZodBody } from '../../common/zod';
import type { Config } from '../../config';
import { Public } from '../auth/auth.guard';
import { PaymentsService } from './payments.service';

class CheckoutInputDto extends createZodDto(checkoutInputSchema) {}
class CheckoutDto extends createZodDto(checkoutSchema) {}
class PaymentDto extends createZodDto(paymentSchema) {}
const PaymentListDto = namedZodDto('PaymentListDto', paymentListSchema);
const PlusPriceListDto = namedZodDto('PlusPriceListDto', plusPriceListSchema);

@ApiTags('me')
@ApiBearerAuth()
@Controller('v1/me')
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  /** What 1 to 12 months of Plus cost; 404 when billing is disabled. */
  @Get('subscription/prices')
  @ApiOkResponse({ type: PlusPriceListDto })
  prices(): PlusPriceWire[] {
    return this.payments.prices();
  }

  /**
   * Starts buying Plus: a Pending Payment at the server's price, and the
   * provider's page to send the browser to. 404 when billing is disabled,
   * 502 when the provider refuses, 503 when no provider is configured.
   */
  @Post('payments')
  @ApiCreatedResponse({ type: CheckoutDto })
  checkout(
    @CurrentUserId() userId: string,
    @ZodBody(CheckoutInputDto) body: CheckoutInputDto,
  ): Promise<{ payment: PaymentWire; redirectUrl: string }> {
    return this.payments.checkout(userId, body.months);
  }

  /** The User's Paid, Failed and Canceled Payments, newest first. */
  @Get('payments')
  @ApiOkResponse({ type: PaymentListDto })
  history(@CurrentUserId() userId: string): Promise<PaymentWire[]> {
    return this.payments.history(userId);
  }

  /** One of the User's Payments, Pending included. */
  @Get('payments/:paymentId')
  @ApiOkResponse({ type: PaymentDto })
  get(
    @CurrentUserId() userId: string,
    @Param('paymentId') paymentId: string,
  ): Promise<PaymentWire> {
    return this.payments.get(userId, paymentId);
  }
}

/**
 * Where the payment provider sends the payer's browser back to. Public: the
 * browser arrives from the provider's site, and nothing it brings is trusted
 * until the provider verifies the Payment. Answers with a redirect to the
 * Subscription page, which shows how the Payment ended.
 */
@Controller('v1/payments')
export class PaymentCallbackController {
  constructor(
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  @Public()
  @Get('callback')
  @ApiExcludeEndpoint()
  async callback(@Query() query: Record<string, unknown>, @Res() res: Response): Promise<void> {
    const paymentId = await this.payments.handleCallback(query);
    const page = `${this.config.APP_URL}/settings/subscription`;
    res.redirect(302, paymentId ? `${page}?payment=${encodeURIComponent(paymentId)}` : page);
  }
}
