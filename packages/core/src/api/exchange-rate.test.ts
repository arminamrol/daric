import { describe, expect, it } from 'vitest';
import { createExchangeRateInputSchema, updateExchangeRateInputSchema } from './index';

describe('createExchangeRateInputSchema', () => {
  it('takes a currency, a rate and the day it is effective from, without needless zeros', () => {
    expect(
      createExchangeRateInputSchema.parse({
        currency: 'USD',
        rate: '01050000.50',
        effectiveOn: '2026-10-01',
      }),
    ).toEqual({ currency: 'USD', rate: '1050000.5', effectiveOn: '2026-10-01' });
    expect(
      createExchangeRateInputSchema.parse({
        currency: 'IRR',
        rate: '0.000001',
        effectiveOn: '2026-10-01',
      }).rate,
    ).toBe('0.000001');
  });

  const valid = { currency: 'USD', rate: '1050000', effectiveOn: '2026-10-01' };
  it.each([
    ['an unknown currency', { ...valid, currency: 'XYZ' }],
    ['a zero rate', { ...valid, rate: '0.00' }],
    ['a negative rate', { ...valid, rate: '-5' }],
    ['a rate as a number', { ...valid, rate: 5 }],
    ['an exponent', { ...valid, rate: '1e6' }],
    ['grouping', { ...valid, rate: '1,050,000' }],
    ['more than 12 decimals', { ...valid, rate: '0.0000000000001' }],
    ['more than 18 whole digits', { ...valid, rate: '1234567890123456789' }],
    ['a day that does not exist', { ...valid, effectiveOn: '2026-02-30' }],
    ['an unknown field', { ...valid, note: 'x' }],
  ])('rejects %s', (_, input) => {
    expect(createExchangeRateInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('updateExchangeRateInputSchema', () => {
  it('takes the rate or the day, never the currency', () => {
    expect(updateExchangeRateInputSchema.parse({ rate: '2.50' })).toEqual({ rate: '2.5' });
    expect(updateExchangeRateInputSchema.parse({ effectiveOn: '2026-10-02' })).toEqual({
      effectiveOn: '2026-10-02',
    });
    expect(updateExchangeRateInputSchema.safeParse({ currency: 'EUR' }).success).toBe(false);
    expect(updateExchangeRateInputSchema.safeParse({}).success).toBe(false);
  });
});
