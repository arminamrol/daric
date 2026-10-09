import { describe, expect, it } from 'vitest';
import {
  daysInPeriod,
  fullMonthsRemainingInYear,
  localDateOf,
  monthPeriodOf,
  monthsOfYear,
  nextPeriod,
  periodEnd,
  periodStart,
  previousPeriod,
  remainingDaysInMonth,
  yearPeriodOf,
} from './index';
import type { WorkspaceCalendar } from './index';

const tehranJalali: WorkspaceCalendar = { calendar: 'jalali', timeZone: 'Asia/Tehran' };
const tehranGregorian: WorkspaceCalendar = { calendar: 'gregorian', timeZone: 'Asia/Tehran' };
const utcGregorian: WorkspaceCalendar = { calendar: 'gregorian', timeZone: 'UTC' };
const at = (iso: string) => new Date(iso);

describe('the Period of an instant', () => {
  it('buckets by the Workspace timezone, not UTC (Tehran Nowruz 1405 midnight)', () => {
    // 1405-01-01 00:00 in Tehran (+03:30) is 2026-03-20T20:30Z.
    expect(monthPeriodOf(at('2026-03-20T20:29:59.999Z'), tehranJalali)).toEqual({
      kind: 'month',
      year: 1404,
      month: 12,
    });
    expect(monthPeriodOf(at('2026-03-20T20:30:00Z'), tehranJalali)).toEqual({
      kind: 'month',
      year: 1405,
      month: 1,
    });
    expect(yearPeriodOf(at('2026-03-20T20:29:59.999Z'), tehranJalali)).toEqual({
      kind: 'year',
      year: 1404,
    });
    expect(yearPeriodOf(at('2026-03-20T20:30:00Z'), tehranJalali)).toEqual({
      kind: 'year',
      year: 1405,
    });
  });

  it('puts Esfand 30 of a leap year in Esfand', () => {
    // 1403-12-30 is 2025-03-20; its Tehran noon is 08:30Z.
    expect(localDateOf(at('2025-03-20T08:30:00Z'), tehranJalali)).toEqual({
      year: 1403,
      month: 12,
      day: 30,
    });
    expect(monthPeriodOf(at('2025-03-20T20:29:59Z'), tehranJalali)).toEqual({
      kind: 'month',
      year: 1403,
      month: 12,
    });
    expect(monthPeriodOf(at('2025-03-20T20:30:00Z'), tehranJalali)).toEqual({
      kind: 'month',
      year: 1404,
      month: 1,
    });
  });

  it('buckets Gregorian months and years at Tehran midnight', () => {
    expect(yearPeriodOf(at('2025-12-31T20:29:59Z'), tehranGregorian)).toEqual({
      kind: 'year',
      year: 2025,
    });
    // Already 2026 in Tehran while it is still 2025 in UTC.
    expect(monthPeriodOf(at('2025-12-31T20:30:00Z'), tehranGregorian)).toEqual({
      kind: 'month',
      year: 2026,
      month: 1,
    });
    expect(monthPeriodOf(at('2025-12-31T20:30:00Z'), utcGregorian)).toEqual({
      kind: 'month',
      year: 2025,
      month: 12,
    });
  });

  it('rejects an unknown timezone', () => {
    expect(() =>
      monthPeriodOf(at('2026-01-01T00:00:00Z'), { calendar: 'jalali', timeZone: 'Mars/Base' }),
    ).toThrow(RangeError);
  });
});

describe('Period boundaries', () => {
  it('starts and ends a Jalali month at Tehran midnight, end exclusive', () => {
    const esfand1404 = { kind: 'month', year: 1404, month: 12 } as const;
    expect(periodStart(esfand1404, tehranJalali)).toEqual(at('2026-02-19T20:30:00Z'));
    expect(periodEnd(esfand1404, tehranJalali)).toEqual(at('2026-03-20T20:30:00Z'));
    expect(daysInPeriod(esfand1404, tehranJalali)).toBe(29);
    expect(daysInPeriod({ kind: 'month', year: 1403, month: 12 }, tehranJalali)).toBe(30);
  });

  it('starts and ends a Jalali year', () => {
    const y1405 = { kind: 'year', year: 1405 } as const;
    expect(periodStart(y1405, tehranJalali)).toEqual(at('2026-03-20T20:30:00Z'));
    expect(periodEnd(y1405, tehranJalali)).toEqual(at('2027-03-20T20:30:00Z'));
    expect(daysInPeriod(y1405, tehranJalali)).toBe(365);
    expect(daysInPeriod({ kind: 'year', year: 1403 }, tehranJalali)).toBe(366);
  });

  it('starts a Gregorian month in UTC and in Tehran', () => {
    const feb2024 = { kind: 'month', year: 2024, month: 2 } as const;
    expect(periodStart(feb2024, utcGregorian)).toEqual(at('2024-02-01T00:00:00Z'));
    expect(periodEnd(feb2024, utcGregorian)).toEqual(at('2024-03-01T00:00:00Z'));
    expect(periodStart(feb2024, tehranGregorian)).toEqual(at('2024-01-31T20:30:00Z'));
    expect(daysInPeriod(feb2024, tehranGregorian)).toBe(29);
  });

  it('follows Tehran daylight saving when it was observed (1399)', () => {
    // +03:30 until 2020-03-21 (Farvardin 2), +04:30 until 2020-09-21 (Shahrivar 31).
    expect(periodStart({ kind: 'year', year: 1399 }, tehranJalali)).toEqual(
      at('2020-03-19T20:30:00Z'),
    );
    const mar2020 = { kind: 'month', year: 2020, month: 3 } as const;
    expect(periodEnd(mar2020, tehranGregorian)).toEqual(at('2020-03-31T19:30:00Z'));
    expect(periodStart({ kind: 'month', year: 1399, month: 7 }, tehranJalali)).toEqual(
      at('2020-09-21T20:30:00Z'),
    );
    expect(periodEnd({ kind: 'month', year: 2020, month: 9 }, tehranGregorian)).toEqual(
      at('2020-09-30T20:30:00Z'),
    );
  });

  it('starts a month at the clock jump when daylight saving skips its midnight', () => {
    // Asunción jumped from 2023-10-01 00:00 (-04:00) to 01:00 (-03:00).
    const asuncion: WorkspaceCalendar = { calendar: 'gregorian', timeZone: 'America/Asuncion' };
    expect(periodStart({ kind: 'month', year: 2023, month: 10 }, asuncion)).toEqual(
      at('2023-10-01T04:00:00Z'),
    );
  });

  it('starts a month at the first midnight when daylight saving repeats it', () => {
    // Havana fell back from 2020-11-01 01:00 (-04:00) to 00:00 (-05:00).
    const havana: WorkspaceCalendar = { calendar: 'gregorian', timeZone: 'America/Havana' };
    expect(periodStart({ kind: 'month', year: 2020, month: 11 }, havana)).toEqual(
      at('2020-11-01T04:00:00Z'),
    );
  });

  it('places every instant of a month inside its own Period', () => {
    const mehr = { kind: 'month', year: 1405, month: 7 } as const;
    const start = periodStart(mehr, tehranJalali);
    const end = periodEnd(mehr, tehranJalali);
    expect(monthPeriodOf(start, tehranJalali)).toEqual(mehr);
    expect(monthPeriodOf(new Date(end.getTime() - 1), tehranJalali)).toEqual(mehr);
    expect(monthPeriodOf(end, tehranJalali)).toEqual({ kind: 'month', year: 1405, month: 8 });
  });
});

describe('Period navigation', () => {
  it('steps months across year boundaries', () => {
    expect(nextPeriod({ kind: 'month', year: 1404, month: 12 })).toEqual({
      kind: 'month',
      year: 1405,
      month: 1,
    });
    expect(previousPeriod({ kind: 'month', year: 1405, month: 1 })).toEqual({
      kind: 'month',
      year: 1404,
      month: 12,
    });
    expect(nextPeriod({ kind: 'month', year: 1405, month: 7 })).toEqual({
      kind: 'month',
      year: 1405,
      month: 8,
    });
  });

  it('steps years', () => {
    expect(nextPeriod({ kind: 'year', year: 1405 })).toEqual({ kind: 'year', year: 1406 });
    expect(previousPeriod({ kind: 'year', year: 2026 })).toEqual({ kind: 'year', year: 2025 });
  });

  it('lists the twelve months of a year', () => {
    const months = monthsOfYear({ kind: 'year', year: 1405 });
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ kind: 'month', year: 1405, month: 1 });
    expect(months[11]).toEqual({ kind: 'month', year: 1405, month: 12 });
  });
});

describe('Projection inputs', () => {
  it('matches the plan worked example: 17 Mehr 1405 leaves 13 of 30 days and 5 months', () => {
    // 2026-10-09 10:00 in Tehran.
    const today = at('2026-10-09T06:30:00Z');
    expect(remainingDaysInMonth(today, tehranJalali)).toBe(13);
    expect(daysInPeriod(monthPeriodOf(today, tehranJalali), tehranJalali)).toBe(30);
    expect(fullMonthsRemainingInYear(today, tehranJalali)).toBe(5);
  });

  it('counts nothing left on the last day of the year', () => {
    // Esfand 29 1404 just before Tehran midnight.
    const lastDay = at('2026-03-20T20:29:59Z');
    expect(remainingDaysInMonth(lastDay, tehranJalali)).toBe(0);
    expect(fullMonthsRemainingInYear(lastDay, tehranJalali)).toBe(0);
  });

  it('counts the whole year left on its first day', () => {
    const firstDay = at('2026-03-20T20:30:00Z');
    expect(remainingDaysInMonth(firstDay, tehranJalali)).toBe(30);
    expect(fullMonthsRemainingInYear(firstDay, tehranJalali)).toBe(11);
  });

  it('works in the Gregorian calendar', () => {
    const today = at('2024-02-10T12:00:00Z');
    expect(remainingDaysInMonth(today, utcGregorian)).toBe(19);
    expect(fullMonthsRemainingInYear(today, utcGregorian)).toBe(10);
  });
});
