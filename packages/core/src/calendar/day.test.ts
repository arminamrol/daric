import { describe, expect, it } from 'vitest';
import {
  dayOf,
  formatDay,
  isIsoDay,
  monthPeriodOfDay,
  parseDisplayDay,
  periodDays,
  todayIn,
} from './index';

describe('isIsoDay', () => {
  it.each(['2026-10-10', '2024-02-29', '1979-02-11'])('accepts %s', (day) => {
    expect(isIsoDay(day)).toBe(true);
  });

  it.each(['2026-02-29', '2026-13-01', '2026-00-10', '2026-10-32', '2026-1-01', '20261010', ''])(
    'rejects %s',
    (day) => {
      expect(isIsoDay(day)).toBe(false);
    },
  );
});

describe('todayIn', () => {
  it('is the day in the Workspace timezone, not in UTC', () => {
    // 2026-10-09 21:00 UTC is already 10 October in Tehran (+03:30).
    expect(todayIn(new Date('2026-10-09T21:00:00Z'), 'Asia/Tehran')).toBe('2026-10-10');
    expect(todayIn(new Date('2026-10-09T21:00:00Z'), 'UTC')).toBe('2026-10-09');
  });
});

describe('dayOf', () => {
  it('turns a day of either calendar into its ISO day', () => {
    expect(dayOf('jalali', { year: 1405, month: 7, day: 18 })).toBe('2026-10-10');
    expect(dayOf('gregorian', { year: 2026, month: 3, day: 1 })).toBe('2026-03-01');
  });
});

describe('monthPeriodOfDay', () => {
  it('buckets a day into a month of the Workspace Calendar', () => {
    expect(monthPeriodOfDay('2026-03-20', 'jalali')).toEqual({
      kind: 'month',
      year: 1404,
      month: 12,
    });
    expect(monthPeriodOfDay('2026-03-21', 'jalali')).toEqual({
      kind: 'month',
      year: 1405,
      month: 1,
    });
    expect(monthPeriodOfDay('2026-03-21', 'gregorian')).toEqual({
      kind: 'month',
      year: 2026,
      month: 3,
    });
  });
});

describe('periodDays', () => {
  it('gives the first day of a Period and the first day after it', () => {
    expect(periodDays({ kind: 'month', year: 1405, month: 7 }, 'jalali')).toEqual({
      from: '2026-09-23',
      until: '2026-10-23',
    });
    expect(periodDays({ kind: 'month', year: 1404, month: 12 }, 'jalali')).toEqual({
      from: '2026-02-20',
      until: '2026-03-21',
    });
    expect(periodDays({ kind: 'year', year: 2026 }, 'gregorian')).toEqual({
      from: '2026-01-01',
      until: '2027-01-01',
    });
  });
});

describe('formatDay', () => {
  it('shows a day in the display calendar', () => {
    const options = { locale: 'fa', digits: 'persian' } as const;
    expect(formatDay('2026-10-10', { ...options, calendar: 'jalali' })).toBe('۱۴۰۵/۰۷/۱۸');
    expect(formatDay('2026-10-10', { ...options, calendar: 'jalali', style: 'long' })).toBe(
      '۱۸ مهر ۱۴۰۵',
    );
    expect(formatDay('2026-10-10', { calendar: 'gregorian', locale: 'en', digits: 'latin' })).toBe(
      '2026/10/10',
    );
  });
});

describe('parseDisplayDay', () => {
  it('reads a day typed in the display calendar, in any digits and separators', () => {
    expect(parseDisplayDay('۱۴۰۵/۰۷/۱۸', 'jalali')).toBe('2026-10-10');
    expect(parseDisplayDay(' 1405-7-18 ', 'jalali')).toBe('2026-10-10');
    expect(parseDisplayDay('2026/10/10', 'gregorian')).toBe('2026-10-10');
    expect(parseDisplayDay('1403/12/30', 'jalali')).toBe('2025-03-20');
  });

  it.each(['', '1405/07', '1405/13/01', '1404/12/30', '18/07/1405', 'today', '1405/07/18/1'])(
    'refuses %j',
    (text) => {
      expect(parseDisplayDay(text, 'jalali')).toBeUndefined();
    },
  );
});
