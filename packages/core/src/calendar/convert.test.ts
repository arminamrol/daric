import { describe, expect, it } from 'vitest';
import { daysInMonth, gregorianToJalali, isLeapYear, jalaliToGregorian } from './index';

// Known pairs from the official Iranian calendar.
const PAIRS = [
  { jalali: { year: 1405, month: 1, day: 1 }, gregorian: { year: 2026, month: 3, day: 21 } },
  { jalali: { year: 1404, month: 12, day: 29 }, gregorian: { year: 2026, month: 3, day: 20 } },
  { jalali: { year: 1403, month: 12, day: 30 }, gregorian: { year: 2025, month: 3, day: 20 } },
  { jalali: { year: 1404, month: 1, day: 1 }, gregorian: { year: 2025, month: 3, day: 21 } },
  { jalali: { year: 1399, month: 12, day: 30 }, gregorian: { year: 2021, month: 3, day: 20 } },
  { jalali: { year: 1405, month: 7, day: 17 }, gregorian: { year: 2026, month: 10, day: 9 } },
  { jalali: { year: 1405, month: 6, day: 31 }, gregorian: { year: 2026, month: 9, day: 22 } },
  { jalali: { year: 1405, month: 7, day: 1 }, gregorian: { year: 2026, month: 9, day: 23 } },
  { jalali: { year: 1357, month: 11, day: 22 }, gregorian: { year: 1979, month: 2, day: 11 } },
  { jalali: { year: 1408, month: 12, day: 30 }, gregorian: { year: 2030, month: 3, day: 20 } },
];

describe('Gregorian and Jalali conversion', () => {
  it.each(PAIRS)(
    'converts $jalali.year/$jalali.month/$jalali.day both ways',
    ({ jalali, gregorian }) => {
      expect(jalaliToGregorian(jalali)).toEqual(gregorian);
      expect(gregorianToJalali(gregorian)).toEqual(jalali);
    },
  );

  it('round-trips every day for sixty years', () => {
    const start = Date.UTC(1990, 0, 1);
    for (let t = start; t < Date.UTC(2050, 0, 1); t += 86_400_000) {
      const d = new Date(t);
      const g = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
      expect(jalaliToGregorian(gregorianToJalali(g))).toEqual(g);
    }
  });

  it('rejects dates that do not exist', () => {
    expect(() => jalaliToGregorian({ year: 1404, month: 12, day: 30 })).toThrow(RangeError);
    expect(() => jalaliToGregorian({ year: 1405, month: 7, day: 31 })).toThrow(RangeError);
    expect(() => jalaliToGregorian({ year: 1405, month: 13, day: 1 })).toThrow(RangeError);
    expect(() => gregorianToJalali({ year: 2025, month: 2, day: 29 })).toThrow(RangeError);
  });
});

describe('leap years and month lengths', () => {
  it('knows Jalali leap years (Esfand 30)', () => {
    const leap = [1395, 1399, 1403, 1408, 1412];
    for (let y = 1395; y <= 1412; y++) {
      expect(isLeapYear('jalali', y), String(y)).toBe(leap.includes(y));
      expect(daysInMonth('jalali', y, 12)).toBe(leap.includes(y) ? 30 : 29);
    }
  });

  it('gives Jalali month lengths', () => {
    expect([1, 6, 7, 11].map((m) => daysInMonth('jalali', 1405, m))).toEqual([31, 31, 30, 30]);
  });

  it('knows Gregorian leap years and month lengths', () => {
    expect(isLeapYear('gregorian', 2024)).toBe(true);
    expect(isLeapYear('gregorian', 1900)).toBe(false);
    expect(isLeapYear('gregorian', 2000)).toBe(true);
    expect(daysInMonth('gregorian', 2024, 2)).toBe(29);
    expect(daysInMonth('gregorian', 2026, 2)).toBe(28);
    expect(daysInMonth('gregorian', 2026, 4)).toBe(30);
  });
});
