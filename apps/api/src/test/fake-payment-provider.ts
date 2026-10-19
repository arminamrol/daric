import type { Money } from '@daric/core';
import type {
  PaymentCallback,
  PaymentProvider,
  PaymentRequest,
  PaymentVerification,
  StartedPayment,
} from '../modules/billing/payment-provider';

/**
 * A payment provider in memory. A payment counts as paid only after `pay`, and
 * only for the amount it was requested for. Its callback looks like
 * `?reference=…&status=OK|NOK`.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake';
  readonly requests: (PaymentRequest & { reference: string })[] = [];
  /** How many times `verify` was asked. */
  verifications = 0;
  /** Makes `request` (or `verify`) throw, as when the provider is down; an Error is thrown as is. */
  failRequests: boolean | Error = false;
  failVerify = false;
  private readonly paid = new Set<string>();
  private next = 0;

  request(payment: PaymentRequest): Promise<StartedPayment> {
    if (this.failRequests) {
      return Promise.reject(
        this.failRequests instanceof Error ? this.failRequests : new Error('provider is down'),
      );
    }
    const reference = `fake-${++this.next}-${Date.now()}`;
    this.requests.push({ ...payment, reference });
    return Promise.resolve({ reference, redirectUrl: `https://pay.example/start/${reference}` });
  }

  /** The payer pays at the provider. */
  pay(reference: string): void {
    this.paid.add(reference);
  }

  /** The newest request's reference; throws when there is none. */
  lastReference(): string {
    const last = this.requests.at(-1);
    if (!last) throw new Error('no payment was requested');
    return last.reference;
  }

  parseCallback(query: Record<string, unknown>): PaymentCallback | null {
    const { reference, status } = query;
    if (typeof reference !== 'string' || (status !== 'OK' && status !== 'NOK')) return null;
    return { reference, canceled: status === 'NOK' };
  }

  verify(payment: { reference: string; amount: Money }): Promise<PaymentVerification> {
    this.verifications++;
    if (this.failVerify) return Promise.reject(new Error('provider is down'));
    const requested = this.requests.find((r) => r.reference === payment.reference);
    const paid =
      this.paid.has(payment.reference) && requested?.amount.amount === payment.amount.amount;
    return Promise.resolve(
      paid ? { paid: true, receipt: `R-${payment.reference}` } : { paid: false },
    );
  }
}
