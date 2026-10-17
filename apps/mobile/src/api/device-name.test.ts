import { describe, expect, it } from 'vitest';
import { phoneName } from './device-name';

describe('phoneName', () => {
  it('names an Android phone by maker and model', () => {
    expect(
      phoneName({ OS: 'android', constants: { Manufacturer: 'samsung', Model: 'SM-S918B' } }),
    ).toBe('Samsung SM-S918B');
  });

  it('does not repeat a maker the model already names', () => {
    expect(
      phoneName({ OS: 'android', constants: { Manufacturer: 'Google', Model: 'Pixel 9' } }),
    ).toBe('Google Pixel 9');
    expect(
      phoneName({ OS: 'android', constants: { Manufacturer: 'Xiaomi', Model: 'Xiaomi 14' } }),
    ).toBe('Xiaomi 14');
  });

  it('tells an iPad from an iPhone', () => {
    expect(phoneName({ OS: 'ios', constants: { interfaceIdiom: 'pad' } })).toBe('iPad');
    expect(phoneName({ OS: 'ios', constants: { interfaceIdiom: 'phone' } })).toBe('iPhone');
  });

  it('gives nothing it cannot tell', () => {
    expect(phoneName({ OS: 'android', constants: {} })).toBeUndefined();
    expect(phoneName({ OS: 'web', constants: {} })).toBeUndefined();
  });
});
