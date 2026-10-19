import { IRR } from '@daric/core';
import { describe, expect, it } from 'vitest';
import { PaymentsNotConfiguredError } from './payment-provider';
import { ZarinpalProvider } from './zarinpal';

const merchantId = '00000000-0000-0000-0000-000000000000';
const rials = (amount: bigint) => ({ amount, currency: IRR });

/** A `fetch` that answers every call with `body` (and `status`) and keeps what was sent. */
function stubFetch(body: unknown, status = 200) {
  const sent: { url: string; body: unknown }[] = [];
  const fetch = (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
  return { fetch: fetch as typeof globalThis.fetch, sent };
}

describe('ZarinpalProvider', () => {
  it('starts a payment in rials and sends the payer to StartPay', async () => {
    const { fetch, sent } = stubFetch({
      data: { code: 100, message: 'Success', authority: 'A0000000000000000000000000000wwOGYpd' },
      errors: [],
    });
    const zarinpal = new ZarinpalProvider({ merchantId, sandbox: false, fetch });

    const started = await zarinpal.request({
      amount: rials(5_700_000n),
      description: 'Daric Plus, 3 months',
      callbackUrl: 'https://daric.example/v1/payments/callback',
    });

    expect(sent).toEqual([
      {
        url: 'https://payment.zarinpal.com/pg/v4/payment/request.json',
        body: {
          merchant_id: merchantId,
          amount: 5_700_000,
          currency: 'IRR',
          description: 'Daric Plus, 3 months',
          callback_url: 'https://daric.example/v1/payments/callback',
        },
      },
    ]);
    expect(started).toEqual({
      reference: 'A0000000000000000000000000000wwOGYpd',
      redirectUrl: 'https://payment.zarinpal.com/pg/StartPay/A0000000000000000000000000000wwOGYpd',
    });
  });

  it('uses the sandbox when told to', async () => {
    const { fetch, sent } = stubFetch({ data: { code: 100, authority: 'S1' }, errors: [] });
    const zarinpal = new ZarinpalProvider({ merchantId, sandbox: true, fetch });
    const started = await zarinpal.request({
      amount: rials(1n),
      description: 'x',
      callbackUrl: 'https://daric.example/cb',
    });
    expect(sent[0]?.url).toBe('https://sandbox.zarinpal.com/pg/v4/payment/request.json');
    expect(started.redirectUrl).toBe('https://sandbox.zarinpal.com/pg/StartPay/S1');
  });

  it('throws when Zarinpal refuses to start a payment', async () => {
    const { fetch } = stubFetch(
      { data: [], errors: { code: -9, message: 'The input params invalid' } },
      422,
    );
    const zarinpal = new ZarinpalProvider({ merchantId, sandbox: false, fetch });
    await expect(
      zarinpal.request({ amount: rials(1n), description: 'x', callbackUrl: 'https://d.example' }),
    ).rejects.toThrow(/-9/);
  });

  it('refuses to work without a merchant id', async () => {
    const zarinpal = new ZarinpalProvider({ merchantId: null, sandbox: false });
    await expect(
      zarinpal.request({ amount: rials(1n), description: 'x', callbackUrl: 'https://d.example' }),
    ).rejects.toBeInstanceOf(PaymentsNotConfiguredError);
  });

  it('reads the Authority and Status Zarinpal sends the payer back with', () => {
    const zarinpal = new ZarinpalProvider({ merchantId, sandbox: false });
    expect(zarinpal.parseCallback({ Authority: 'A1', Status: 'OK' })).toEqual({
      reference: 'A1',
      canceled: false,
    });
    expect(zarinpal.parseCallback({ Authority: 'A1', Status: 'NOK' })).toEqual({
      reference: 'A1',
      canceled: true,
    });
    expect(zarinpal.parseCallback({ Status: 'OK' })).toBeNull();
    expect(zarinpal.parseCallback({ Authority: ['A1', 'A2'], Status: 'OK' })).toBeNull();
  });

  it.each([100, 101])('counts verify code %i as paid, with the ref_id as receipt', async (code) => {
    const { fetch, sent } = stubFetch({
      data: { code, message: 'Verified', ref_id: 201, card_pan: '502229******5995' },
      errors: [],
    });
    const zarinpal = new ZarinpalProvider({ merchantId, sandbox: false, fetch });
    expect(await zarinpal.verify({ reference: 'A1', amount: rials(5_700_000n) })).toEqual({
      paid: true,
      receipt: '201',
    });
    expect(sent).toEqual([
      {
        url: 'https://payment.zarinpal.com/pg/v4/payment/verify.json',
        body: { merchant_id: merchantId, amount: 5_700_000, authority: 'A1' },
      },
    ]);
  });

  it('counts an error answer to verify as not paid', async () => {
    const { fetch } = stubFetch(
      {
        data: [],
        errors: { code: -51, message: 'Session is not valid, session is not active paid try.' },
      },
      422,
    );
    const zarinpal = new ZarinpalProvider({ merchantId, sandbox: false, fetch });
    expect(await zarinpal.verify({ reference: 'A1', amount: rials(1n) })).toEqual({ paid: false });
  });

  it.each([
    [{ data: [], errors: { code: -9, message: 'The input params invalid' } }, 422],
    [{ data: [], errors: { code: -12, message: 'Too many attempts' } }, 429],
    [{ data: { code: -50 }, errors: [] }, 200],
  ])('throws on any other refusal, so it is not taken for unpaid: %j', async (body, status) => {
    const { fetch } = stubFetch(body, status);
    const zarinpal = new ZarinpalProvider({ merchantId, sandbox: false, fetch });
    await expect(zarinpal.verify({ reference: 'A1', amount: rials(1n) })).rejects.toThrow();
  });

  it('throws when Zarinpal cannot be reached, so the Payment stays Pending', async () => {
    const fetch = (() => Promise.reject(new TypeError('fetch failed'))) as typeof globalThis.fetch;
    const zarinpal = new ZarinpalProvider({ merchantId, sandbox: false, fetch });
    await expect(zarinpal.verify({ reference: 'A1', amount: rials(1n) })).rejects.toThrow();
  });

  it('throws on a server error rather than calling the payment unpaid', async () => {
    const { fetch } = stubFetch({ message: 'Bad Gateway' }, 502);
    const zarinpal = new ZarinpalProvider({ merchantId, sandbox: false, fetch });
    await expect(zarinpal.verify({ reference: 'A1', amount: rials(1n) })).rejects.toThrow();
  });
});
