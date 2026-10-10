import { describe, expect, it } from 'vitest';
import { accountSchema, createAccountInputSchema, updateAccountInputSchema } from './index';

const valid = {
  name: ' Melli ',
  type: 'BANK',
  class: 'ASSET',
  currency: 'IRR',
  openingBalance: '12000000',
};

describe('createAccountInputSchema', () => {
  it('trims the name and reads the opening balance as a bigint', () => {
    expect(createAccountInputSchema.parse(valid)).toEqual({
      ...valid,
      name: 'Melli',
      openingBalance: 12000000n,
    });
  });

  it('allows a negative opening balance (an overdrawn account)', () => {
    expect(createAccountInputSchema.parse({ ...valid, openingBalance: '-5' }).openingBalance).toBe(
      -5n,
    );
  });

  it.each([
    ['an empty name', { name: '  ' }],
    ['an unknown type', { type: 'CRYPTO' }],
    ['an unknown class', { class: 'EQUITY' }],
    ['an unknown currency', { currency: 'XYZ' }],
    ['a fractional opening balance', { openingBalance: '1.5' }],
    ['an opening balance as a JSON number', { openingBalance: 100 }],
  ])('rejects %s', (_, change) => {
    expect(createAccountInputSchema.safeParse({ ...valid, ...change }).success).toBe(false);
  });
});

describe('updateAccountInputSchema', () => {
  it('takes any non-empty subset, including archiving', () => {
    expect(updateAccountInputSchema.parse({ archived: true })).toEqual({ archived: true });
    expect(updateAccountInputSchema.parse({ openingBalance: '7' })).toEqual({ openingBalance: 7n });
    expect(updateAccountInputSchema.safeParse({}).success).toBe(false);
  });

  it('does not change the currency', () => {
    expect(updateAccountInputSchema.safeParse({ currency: 'USD' }).success).toBe(false);
  });
});

describe('accountSchema', () => {
  it('reads Amounts from the wire as bigints', () => {
    const account = accountSchema.parse({
      id: '01900000-0000-7000-8000-000000000001',
      ...valid,
      name: 'Melli',
      balance: '12000000',
      archived: false,
    });
    expect(account.balance).toBe(12000000n);
    expect(account.openingBalance).toBe(12000000n);
  });
});
