import { describe, expect, it } from 'vitest';
import { createValuationInputSchema, netWorthSchema, updateValuationInputSchema } from './index';

describe('createValuationInputSchema', () => {
  it('takes an Amount in the Account currency and the day it was worth that', () => {
    expect(createValuationInputSchema.parse({ amount: '950000', valuedOn: '2026-10-01' })).toEqual({
      amount: 950_000n,
      valuedOn: '2026-10-01',
    });
    expect(createValuationInputSchema.parse({ amount: '0', valuedOn: '2026-10-01' }).amount).toBe(
      0n,
    );
  });

  const valid = { amount: '950000', valuedOn: '2026-10-01' };
  it.each([
    ['a negative Amount', { ...valid, amount: '-1' }],
    ['an Amount as a number', { ...valid, amount: 5 }],
    ['a day that does not exist', { ...valid, valuedOn: '2026-02-30' }],
    ['no day', { amount: '5' }],
    ['an unknown field', { ...valid, currency: 'USD' }],
  ])('rejects %s', (_, input) => {
    expect(createValuationInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('updateValuationInputSchema', () => {
  it('takes the Amount or the day, and at least one', () => {
    expect(updateValuationInputSchema.parse({ valuedOn: '2026-10-02' })).toEqual({
      valuedOn: '2026-10-02',
    });
    expect(updateValuationInputSchema.safeParse({}).success).toBe(false);
    expect(
      updateValuationInputSchema.safeParse({ accountId: '01900000-0000-7000-8c00-000000000001' })
        .success,
    ).toBe(false);
  });
});

describe('netWorthSchema', () => {
  it('reads every Amount as a bigint', () => {
    const parsed = netWorthSchema.parse({
      day: '2026-10-11',
      baseCurrency: 'IRR',
      total: '-5',
      assets: '10',
      liabilities: '15',
      byCurrency: [{ currency: 'USD', assets: '1', liabilities: '0', net: '1' }],
      accounts: [
        {
          accountId: '01900000-0000-7000-8c00-000000000001',
          name: 'Gold',
          class: 'ASSET',
          currency: 'USD',
          archived: false,
          value: '1',
          valuedOn: '2026-10-01',
          inBase: null,
        },
      ],
      ratesUsed: [],
      missing: ['USD'],
    });
    expect(parsed.total).toBe(-5n);
    expect(parsed.byCurrency[0]?.net).toBe(1n);
    expect(parsed.accounts[0]).toMatchObject({ value: 1n, inBase: null });
  });
});
