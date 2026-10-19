import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  amountToWire,
  currencyByCode,
  type PaymentStatus,
  type PaymentWire,
  type PlusPriceWire,
} from '@daric/core';
import { and, desc, eq, ne, type SQL } from 'drizzle-orm';
import { isUuid } from '../../common/request';
import { CONFIG, DATABASE } from '../../common/di-tokens';
import type { Config } from '../../config';
import { one, type Database, type Executor } from '../../db/client';
import { payments, subscriptions } from '../../db/schema';
import { billingConfig, type BillingConfig } from './billing-config';
import {
  PAYMENT_PROVIDER,
  PaymentsNotConfiguredError,
  type PaymentProvider,
} from './payment-provider';
import {
  extendedExpiry,
  MAX_PLUS_MONTHS,
  MIN_PLUS_MONTHS,
  plusPrice,
  type PlusPrice,
} from './pricing';

const paymentColumns = {
  id: payments.id,
  months: payments.months,
  amount: payments.amount,
  currency: payments.currency,
  status: payments.status,
  receipt: payments.receipt,
  plusUntil: payments.plusUntil,
  createdAt: payments.createdAt,
  completedAt: payments.completedAt,
};

interface PaymentRow {
  id: string;
  months: number;
  amount: bigint;
  currency: string;
  status: PaymentStatus;
  receipt: string | null;
  plusUntil: Date | null;
  createdAt: Date;
  completedAt: Date | null;
}

function toWire(row: PaymentRow): PaymentWire {
  return {
    ...row,
    amount: amountToWire(row.amount),
    plusUntil: row.plusUntil?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function priceToWire(price: PlusPrice): PlusPriceWire {
  return {
    months: price.months,
    fullAmount: amountToWire(price.fullAmount.amount),
    amount: amountToWire(price.amount.amount),
    currency: price.amount.currency.code,
    discountPercent: price.discountPercent,
  };
}

/**
 * Sells Plus (ADR-0008): prices it, starts a Payment at the provider, and on
 * the provider's callback verifies it and extends the Subscription, exactly
 * once per Payment. Payments belong to the User, so this runs on the owner
 * connection, never Workspace-scoped.
 */
@Injectable()
export class PaymentsService {
  private readonly billing: BillingConfig;
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {
    this.billing = billingConfig(config);
  }

  /** Nothing is sold on a server with billing disabled. */
  private assertBillingEnabled(): void {
    if (!this.billing.enabled) throw new NotFoundException('Billing is disabled on this server');
  }

  prices(): PlusPriceWire[] {
    this.assertBillingEnabled();
    const prices: PlusPriceWire[] = [];
    for (let months = MIN_PLUS_MONTHS; months <= MAX_PLUS_MONTHS; months++) {
      prices.push(priceToWire(plusPrice(this.billing, months)));
    }
    return prices;
  }

  /**
   * Records a Pending Payment at the server's price and asks the provider to
   * start it. The Payment exists before the provider is asked, so a payment
   * the provider started can always be matched to one.
   */
  async checkout(
    userId: string,
    months: number,
  ): Promise<{ payment: PaymentWire; redirectUrl: string }> {
    this.assertBillingEnabled();
    const price = plusPrice(this.billing, months);
    const created = one(
      await this.db
        .insert(payments)
        .values({
          userId,
          months,
          amount: price.amount.amount,
          currency: price.amount.currency.code,
          provider: this.provider.name,
        })
        .returning(paymentColumns),
    );

    let started;
    try {
      started = await this.provider.request({
        amount: price.amount,
        // Shown to the payer on Zarinpal's page, which is in Persian.
        description: `دریک پلاس، ${months} ماه`,
        // The API shares the web app's origin (ADR-0006).
        callbackUrl: `${this.config.APP_URL}/v1/payments/callback`,
      });
    } catch (error) {
      await this.closeUnpaid(this.db, created.id, 'FAILED');
      if (error instanceof PaymentsNotConfiguredError) {
        throw new ServiceUnavailableException('Payments are not configured on this server');
      }
      this.logger.error({ err: error, paymentId: created.id }, 'payment provider refused');
      throw new BadGatewayException('The payment provider could not start the payment');
    }

    await this.db
      .update(payments)
      .set({ reference: started.reference })
      .where(eq(payments.id, created.id));
    return { payment: toWire(created), redirectUrl: started.redirectUrl };
  }

  /** The User's finished Payments, newest first. */
  async history(userId: string): Promise<PaymentWire[]> {
    const rows = await this.db
      .select(paymentColumns)
      .from(payments)
      .where(and(eq(payments.userId, userId), ne(payments.status, 'PENDING')))
      .orderBy(desc(payments.createdAt), desc(payments.id));
    return rows.map(toWire);
  }

  /**
   * One of the User's Payments, Pending included; 404 for anyone else's. A
   * Pending one is verified with the provider first, so a Payment whose
   * callback could not reach the provider settles once the User looks again.
   */
  async get(userId: string, paymentId: string): Promise<PaymentWire> {
    if (!isUuid(paymentId)) throw new NotFoundException();
    const mine = and(eq(payments.id, paymentId), eq(payments.userId, userId));
    const read = async () => (await this.db.select(paymentColumns).from(payments).where(mine))[0];
    const row = await read();
    if (!row) throw new NotFoundException();
    if (row.status !== 'PENDING') return toWire(row);
    // The User may still be at the provider: only a confirmed payment changes anything here.
    await this.settle(mine, { unpaid: null });
    const settled = await read();
    if (!settled) throw new NotFoundException();
    return toWire(settled);
  }

  /**
   * Handles the provider's redirect back: verifies the Payment and settles it.
   * Returns the Payment's id, or null for a redirect that matches none.
   */
  async handleCallback(query: Record<string, unknown>, now = new Date()): Promise<string | null> {
    const callback = this.provider.parseCallback(query);
    if (!callback) return null;
    return this.settle(
      and(eq(payments.provider, this.provider.name), eq(payments.reference, callback.reference)),
      { unpaid: callback.canceled ? 'CANCELED' : 'FAILED' },
      now,
    );
  }

  /**
   * Verifies the Payment matching `where` with the provider and, when paid,
   * marks it Paid and extends the Subscription. The Payment's row is locked
   * meanwhile, so a second settle of it (a reload, a race) waits and then
   * finds it Paid: one Payment extends once. A Failed or Canceled one is
   * verified again too, since a callback anyone can send may have closed it
   * before the User paid. When the provider says it is unpaid, a Pending one
   * becomes `unpaid`, or stays Pending when that is null; when the provider
   * cannot tell, nothing changes and a later look tries again.
   */
  private settle(
    where: SQL | undefined,
    { unpaid }: { unpaid: 'FAILED' | 'CANCELED' | null },
    now = new Date(),
  ): Promise<string | null> {
    return this.db.transaction(async (tx) => {
      const [payment] = await tx
        .select({
          id: payments.id,
          userId: payments.userId,
          months: payments.months,
          amount: payments.amount,
          currency: payments.currency,
          status: payments.status,
          reference: payments.reference,
        })
        .from(payments)
        .where(where)
        .for('update');
      if (!payment) return null;
      // No reference: the provider never started it, so there is nothing to verify.
      if (payment.status === 'PAID' || payment.reference === null) return payment.id;

      let verification;
      try {
        verification = await this.provider.verify({
          reference: payment.reference,
          amount: { amount: payment.amount, currency: currencyByCode(payment.currency) },
        });
      } catch (error) {
        this.logger.error({ err: error, paymentId: payment.id }, 'payment was not verified');
        return payment.id;
      }

      if (!verification.paid) {
        if (payment.status === 'PENDING' && unpaid !== null) {
          await this.closeUnpaid(tx, payment.id, unpaid, now);
        }
        return payment.id;
      }

      const plusUntil = await this.extend(tx, payment.userId, payment.months, now);
      await tx
        .update(payments)
        .set({ status: 'PAID', receipt: verification.receipt, plusUntil, completedAt: now })
        .where(eq(payments.id, payment.id));
      return payment.id;
    });
  }

  /** Ends a Payment that brought no money. */
  private async closeUnpaid(
    db: Executor,
    paymentId: string,
    status: 'FAILED' | 'CANCELED',
    now = new Date(),
  ): Promise<void> {
    await db.update(payments).set({ status, completedAt: now }).where(eq(payments.id, paymentId));
  }

  /** Moves the User's expiry on by `months` (see `extendedExpiry`); returns the new expiry. */
  private async extend(tx: Executor, userId: string, months: number, now: Date): Promise<Date> {
    // A User without a row gets an empty one first, so there is always a row to lock:
    // two Payments settling at once then extend one after the other.
    await tx
      .insert(subscriptions)
      .values({ userId, plan: 'PLUS' })
      .onConflictDoNothing({ target: subscriptions.userId });
    const [current] = await tx
      .select({ expiresAt: subscriptions.expiresAt })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .for('update');
    const expiresAt = extendedExpiry({
      expiresAt: current?.expiresAt ?? null,
      months,
      now,
      graceDays: this.billing.graceDays,
    });
    await tx
      .update(subscriptions)
      .set({ plan: 'PLUS', expiresAt })
      .where(eq(subscriptions.userId, userId));
    return expiresAt;
  }
}
