import { describe, expect, it } from 'vitest';
import { amountSchema, amountToWire } from './index';

describe('wire format', () => {
  it('serialises an Amount as a decimal integer string', () => {
    expect(amountToWire(1299n)).toBe('1299');
    expect(amountToWire(-5n)).toBe('-5');
    expect(amountToWire(0n)).toBe('0');
    expect(amountToWire(9007199254740993n)).toBe('9007199254740993');
  });

  it('parses a decimal integer string into a bigint', () => {
    expect(amountSchema.parse('1299')).toBe(1299n);
    expect(amountSchema.parse('-5')).toBe(-5n);
    expect(amountSchema.parse('0')).toBe(0n);
    expect(amountSchema.parse('9007199254740993')).toBe(9007199254740993n);
    expect(amountSchema.parse('9223372036854775807')).toBe(9223372036854775807n);
    expect(amountSchema.parse('-9223372036854775808')).toBe(-9223372036854775808n);
  });

  it('round-trips', () => {
    for (const amount of [0n, 1n, -1n, 2n ** 62n, -(2n ** 63n)]) {
      expect(amountSchema.parse(amountToWire(amount))).toBe(amount);
    }
  });

  it('rejects anything that is not a canonical integer string', () => {
    for (const input of [
      1299,
      1299n,
      '',
      ' 1',
      '1.0',
      '1e3',
      '+1',
      '01',
      '-0',
      '1,000',
      '۱۲',
      '0x10',
      null,
    ]) {
      expect(amountSchema.safeParse(input).success, String(input)).toBe(false);
    }
  });

  it('rejects amounts outside a 64-bit integer', () => {
    expect(amountSchema.safeParse('9223372036854775808').success).toBe(false);
    expect(amountSchema.safeParse('-9223372036854775809').success).toBe(false);
  });
});
