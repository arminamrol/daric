import type { Money } from '@daric/core';

/** What a provider needs to start a payment. */
export interface PaymentRequest {
  amount: Money;
  /** Shown to the payer on the provider's page. */
  description: string;
  /** Where the provider sends the payer's browser back to. */
  callbackUrl: string;
}

/** A started payment: the provider's reference for it and its page the payer goes to. */
export interface StartedPayment {
  reference: string;
  redirectUrl: string;
}

/** What the provider's redirect back says, before anything is verified. */
export interface PaymentCallback {
  reference: string;
  /** The payer turned back (or the provider says it failed) rather than paying. */
  canceled: boolean;
}

/** The provider's answer on whether a payment went through. */
export type PaymentVerification = { paid: true; receipt: string } | { paid: false };

/**
 * A payment gateway (ADR-0008): Zarinpal in production, a deterministic fake
 * in tests. Nothing the payer's browser brings back is trusted until
 * `verify` confirms it with the provider.
 */
export interface PaymentProvider {
  /** Stored with each Payment. */
  readonly name: string;
  /** Throws when the provider cannot start the payment. */
  request(payment: PaymentRequest): Promise<StartedPayment>;
  /** Reads the provider's redirect back; null when it is not one. */
  parseCallback(query: Record<string, unknown>): PaymentCallback | null;
  /** Asks the provider whether `reference` was paid in full; throws when it cannot tell. */
  verify(payment: { reference: string; amount: Money }): Promise<PaymentVerification>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/** Thrown by a provider that has no credentials to work with. */
export class PaymentsNotConfiguredError extends Error {
  constructor() {
    super('The payment provider is not configured');
    this.name = 'PaymentsNotConfiguredError';
  }
}
