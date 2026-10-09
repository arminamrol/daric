import { describe, expect, it } from 'vitest';
import { formatDate } from './index';

// 2026-10-09 10:00 in Tehran is 17 Mehr 1405.
const today = new Date('2026-10-09T06:30:00Z');
const tehran = 'Asia/Tehran';

describe('formatDate', () => {
  it('formats numerically in the display calendar with Persian or Latin digits', () => {
    const jalali = { calendar: 'jalali', timeZone: tehran } as const;
    expect(formatDate(today, { ...jalali, locale: 'fa', digits: 'persian' })).toBe('۱۴۰۵/۰۷/۱۷');
    expect(formatDate(today, { ...jalali, locale: 'fa', digits: 'latin' })).toBe('1405/07/17');
    const gregorian = { calendar: 'gregorian', timeZone: tehran } as const;
    expect(formatDate(today, { ...gregorian, locale: 'en', digits: 'latin' })).toBe('2026/10/09');
    expect(formatDate(today, { ...gregorian, locale: 'fa', digits: 'persian' })).toBe('۲۰۲۶/۱۰/۰۹');
  });

  it('formats with month names per locale', () => {
    const long = { timeZone: tehran, style: 'long' } as const;
    expect(
      formatDate(today, { ...long, calendar: 'jalali', locale: 'fa', digits: 'persian' }),
    ).toBe('۱۷ مهر ۱۴۰۵');
    expect(formatDate(today, { ...long, calendar: 'jalali', locale: 'en', digits: 'latin' })).toBe(
      '17 Mehr 1405',
    );
    expect(
      formatDate(today, { ...long, calendar: 'gregorian', locale: 'fa', digits: 'persian' }),
    ).toBe('۹ اکتبر ۲۰۲۶');
    expect(
      formatDate(today, { ...long, calendar: 'gregorian', locale: 'en', digits: 'latin' }),
    ).toBe('9 October 2026');
  });

  it('formats the day in the given timezone', () => {
    // Still Esfand 29 1404 in UTC, already Farvardin 1 1405 in Tehran.
    const nowruz = new Date('2026-03-20T21:00:00Z');
    const options = { calendar: 'jalali', locale: 'fa', digits: 'latin' } as const;
    expect(formatDate(nowruz, { ...options, timeZone: tehran })).toBe('1405/01/01');
    expect(formatDate(nowruz, { ...options, timeZone: 'UTC' })).toBe('1404/12/29');
  });

  it('formats Esfand 30 of a leap year', () => {
    const esfand30 = new Date('2025-03-20T08:30:00Z');
    expect(
      formatDate(esfand30, {
        calendar: 'jalali',
        timeZone: tehran,
        locale: 'fa',
        digits: 'persian',
        style: 'long',
      }),
    ).toBe('۳۰ اسفند ۱۴۰۳');
  });
});
