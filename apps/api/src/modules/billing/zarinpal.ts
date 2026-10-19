import type { Money } from '@daric/core';
import {
  PaymentsNotConfiguredError,
  type PaymentCallback,
  type PaymentProvider,
  type PaymentRequest,
  type PaymentVerification,
  type StartedPayment,
} from './payment-provider';

/** How long one call to Zarinpal may take; a verify runs while the Payment's row is locked. */
const TIMEOUT_MS = 15_000;

/** Verify codes that mean paid: 100 verified now, 101 verified before. */
const PAID_CODES = new Set([100, 101]);

interface ZarinpalAnswer {
  data?: { code?: number; authority?: string; ref_id?: number | string } | unknown[];
  errors?: { code?: number; message?: string } | unknown[];
}

/**
 * Zarinpal's v4 payment gateway (https://www.zarinpal.com/docs/paymentGateway/).
 * Amounts go in rials (IRR). Without a merchant id every call throws
 * PaymentsNotConfiguredError, so a server can boot before it has one.
 */
export class ZarinpalProvider implements PaymentProvider {
  readonly name = 'zarinpal';
  private readonly origin: string;
  private readonly merchantId: string | null;
  private readonly fetch: typeof globalThis.fetch;

  constructor(options: {
    merchantId: string | null;
    sandbox: boolean;
    fetch?: typeof globalThis.fetch;
  }) {
    this.merchantId = options.merchantId;
    this.origin = options.sandbox ? 'https://sandbox.zarinpal.com' : 'https://payment.zarinpal.com';
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async request(payment: PaymentRequest): Promise<StartedPayment> {
    const answer = await this.post('request', {
      amount: rials(payment.amount),
      currency: 'IRR',
      description: payment.description,
      callback_url: payment.callbackUrl,
    });
    const data = fields(answer.data);
    if (data?.code !== 100 || typeof data.authority !== 'string') {
      throw new Error(`Zarinpal refused the payment: ${describeErrors(answer)}`);
    }
    return {
      reference: data.authority,
      redirectUrl: `${this.origin}/pg/StartPay/${encodeURIComponent(data.authority)}`,
    };
  }

  parseCallback(query: Record<string, unknown>): PaymentCallback | null {
    const { Authority, Status } = query;
    if (typeof Authority !== 'string' || Authority === '') return null;
    if (Status !== 'OK' && Status !== 'NOK') return null;
    return { reference: Authority, canceled: Status === 'NOK' };
  }

  async verify(payment: { reference: string; amount: Money }): Promise<PaymentVerification> {
    const answer = await this.post('verify', {
      amount: rials(payment.amount),
      authority: payment.reference,
    });
    const data = fields(answer.data);
    if (data?.code !== undefined && PAID_CODES.has(data.code) && data.ref_id !== undefined) {
      return { paid: true, receipt: String(data.ref_id) };
    }
    return { paid: false };
  }

  /**
   * POSTs to a v4 endpoint. Zarinpal answers a refusal with a 4xx and an
   * `errors` object, which is returned for the caller to read; anything else
   * that is not a JSON answer (a 5xx, no connection, a timeout) throws.
   */
  private async post(endpoint: 'request' | 'verify', body: object): Promise<ZarinpalAnswer> {
    if (!this.merchantId) throw new PaymentsNotConfiguredError();
    const res = await this.fetch(`${this.origin}/pg/v4/payment/${endpoint}.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ merchant_id: this.merchantId, ...body }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status >= 500) throw new Error(`Zarinpal answered ${res.status}`);
    return (await res.json()) as ZarinpalAnswer;
  }
}

/** Zarinpal sends an empty array instead of an object when there is nothing. */
function fields<T>(value: T | unknown[] | undefined): T | undefined {
  return Array.isArray(value) ? undefined : value;
}

function describeErrors(answer: ZarinpalAnswer): string {
  const errors = fields(answer.errors);
  return errors ? `${errors.code ?? '?'} ${errors.message ?? ''}`.trim() : 'no authority';
}

/** Zarinpal takes a JSON number; every IRR Amount we charge is far below 2^53. */
function rials(amount: Money): number {
  if (amount.currency.code !== 'IRR') throw new RangeError('Zarinpal charges only IRR');
  const value = Number(amount.amount);
  if (!Number.isSafeInteger(value)) throw new RangeError('Amount is too large for Zarinpal');
  return value;
}
