import { describe, expect, it } from 'vitest';
import { IRR, USD, CurrencyMismatchError, money } from '../money';
import { accountBalance, defaultAccountClass } from './index';

describe('accountBalance', () => {
  it('is the opening balance while the Account has no Transactions', () => {
    expect(accountBalance({ currency: USD, openingBalance: 1299n })).toEqual(money(1299n, USD));
  });

  it('adds the effect of each Transaction to the opening balance', () => {
    const balance = accountBalance({ currency: IRR, openingBalance: 2n ** 62n }, [
      money(2n ** 62n, IRR),
      money(-5n, IRR),
    ]);
    expect(balance).toEqual(money(2n ** 63n - 5n, IRR));
  });

  it('refuses effects in another currency', () => {
    expect(() => accountBalance({ currency: IRR, openingBalance: 0n }, [money(1n, USD)])).toThrow(
      CurrencyMismatchError,
    );
  });
});

describe('defaultAccountClass', () => {
  it('makes loans Liabilities and everything else Assets', () => {
    expect(defaultAccountClass('LOAN')).toBe('LIABILITY');
    for (const type of ['CASH', 'BANK', 'CARD', 'WALLET', 'ASSET'] as const) {
      expect(defaultAccountClass(type)).toBe('ASSET');
    }
  });
});
