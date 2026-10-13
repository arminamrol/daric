import { describe, expect, it } from 'vitest';
import { decode, encode } from './codec';

describe('codec', () => {
  it('round-trips bigint Amounts, which JSON cannot hold', () => {
    const value = { amount: 900_719_925_474_099_312n, list: [1n, -2n, 0n], text: 'x', none: null };
    expect(decode(encode(value))).toEqual(value);
  });

  it('round-trips plain JSON as it is', () => {
    const value = { a: [1, 'b', true, null, { c: 1.5 }] };
    expect(decode(encode(value))).toEqual(value);
  });
});
