import { describe, expect, it } from 'vitest';
import { dayOf } from '../calendar';
import type { IsoDay } from '../calendar';
import { dueOccurrences, isOccurrence, nextOccurrence, occurrencesBetween } from './recurring';
import type { RecurrenceSchedule } from './recurring';

const j = (year: number, month: number, day: number): IsoDay =>
  dayOf('jalali', { year, month, day });
const g = (year: number, month: number, day: number): IsoDay =>
  dayOf('gregorian', { year, month, day });

function schedule(fields: Partial<RecurrenceSchedule> & Pick<RecurrenceSchedule, 'startOn'>) {
  return { frequency: 'MONTHLY', interval: 1, endOn: null, ...fields } as RecurrenceSchedule;
}

describe('occurrencesBetween', () => {
  it('repeats a weekly rule every seven days, or every interval of weeks', () => {
    const weekly = schedule({ frequency: 'WEEKLY', startOn: '2026-10-01' });
    expect(occurrencesBetween(weekly, 'jalali', '2026-10-01', '2026-10-29')).toEqual([
      '2026-10-01',
      '2026-10-08',
      '2026-10-15',
      '2026-10-22',
    ]);
    const fortnightly = { ...weekly, interval: 2 };
    expect(occurrencesBetween(fortnightly, 'jalali', '2026-10-02', '2026-11-13')).toEqual([
      '2026-10-15',
      '2026-10-29',
      '2026-11-12',
    ]);
  });

  it('keeps a monthly rule on its day of the Workspace Calendar month', () => {
    const rent = schedule({ startOn: j(1405, 7, 1) });
    expect(occurrencesBetween(rent, 'jalali', j(1405, 7, 1), j(1405, 10, 1))).toEqual([
      j(1405, 7, 1),
      j(1405, 8, 1),
      j(1405, 9, 1),
    ]);
    // The same day read on the Gregorian calendar is the 23rd of each month.
    const gregorian = schedule({ startOn: '2026-09-23' });
    expect(occurrencesBetween(gregorian, 'gregorian', '2026-09-01', '2026-12-01')).toEqual([
      '2026-09-23',
      '2026-10-23',
      '2026-11-23',
    ]);
  });

  it('moves day 31 to the last day of shorter months and back to 31 after', () => {
    const rule = schedule({ startOn: j(1405, 6, 31) });
    expect(occurrencesBetween(rule, 'jalali', j(1405, 6, 1), j(1406, 2, 1))).toEqual([
      j(1405, 6, 31),
      j(1405, 7, 30),
      j(1405, 8, 30),
      j(1405, 9, 30),
      j(1405, 10, 30),
      j(1405, 11, 30),
      // 1405 is not a leap year: Esfand has 29 days.
      j(1405, 12, 29),
      j(1406, 1, 31),
    ]);
    const gregorian = schedule({ startOn: '2027-01-31' });
    expect(occurrencesBetween(gregorian, 'gregorian', '2027-01-01', '2027-04-01')).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
    ]);
    expect(occurrencesBetween(gregorian, 'gregorian', '2028-02-01', '2028-03-01')).toEqual([
      '2028-02-29',
    ]);
  });

  it('repeats every interval of months', () => {
    const quarterly = schedule({ startOn: j(1405, 1, 15), interval: 3 });
    expect(occurrencesBetween(quarterly, 'jalali', j(1405, 1, 1), j(1406, 1, 1))).toEqual([
      j(1405, 1, 15),
      j(1405, 4, 15),
      j(1405, 7, 15),
      j(1405, 10, 15),
    ]);
  });

  it('keeps a yearly rule on Esfand 30 only in leap years, else on Esfand 29', () => {
    // 1403 and 1408 are leap years.
    const rule = schedule({ frequency: 'YEARLY', startOn: j(1403, 12, 30) });
    expect(occurrencesBetween(rule, 'jalali', j(1403, 1, 1), j(1409, 1, 1))).toEqual([
      j(1403, 12, 30),
      j(1404, 12, 29),
      j(1405, 12, 29),
      j(1406, 12, 29),
      j(1407, 12, 29),
      j(1408, 12, 30),
    ]);
    const biennial = schedule({ frequency: 'YEARLY', startOn: '2024-02-29', interval: 2 });
    expect(occurrencesBetween(biennial, 'gregorian', '2024-01-01', '2029-01-01')).toEqual([
      '2024-02-29',
      '2026-02-28',
      '2028-02-29',
    ]);
  });

  it('starts on the start day and stops after the end day, which may be one', () => {
    const rule = schedule({ startOn: j(1405, 7, 10), endOn: j(1405, 9, 10) });
    expect(occurrencesBetween(rule, 'jalali', j(1405, 1, 1), j(1406, 1, 1))).toEqual([
      j(1405, 7, 10),
      j(1405, 8, 10),
      j(1405, 9, 10),
    ]);
    // `until` is exclusive.
    expect(occurrencesBetween(rule, 'jalali', j(1405, 7, 11), j(1405, 9, 10))).toEqual([
      j(1405, 8, 10),
    ]);
  });
});

describe('isOccurrence', () => {
  it('is whether the rule falls on the day', () => {
    const rule = schedule({ startOn: j(1405, 6, 31), endOn: j(1406, 6, 31) });
    expect(isOccurrence(rule, 'jalali', j(1405, 7, 30))).toBe(true);
    expect(isOccurrence(rule, 'jalali', j(1405, 7, 29))).toBe(false);
    expect(isOccurrence(rule, 'jalali', j(1405, 6, 30))).toBe(false);
    expect(isOccurrence(rule, 'jalali', j(1406, 7, 30))).toBe(false);
  });
});

describe('nextOccurrence', () => {
  it('is the first occurrence on or after the day, or null once the rule ended', () => {
    const rule = schedule({ startOn: j(1405, 7, 5), endOn: j(1405, 9, 5) });
    expect(nextOccurrence(rule, 'jalali', j(1405, 1, 1))).toBe(j(1405, 7, 5));
    expect(nextOccurrence(rule, 'jalali', j(1405, 7, 5))).toBe(j(1405, 7, 5));
    expect(nextOccurrence(rule, 'jalali', j(1405, 7, 6))).toBe(j(1405, 8, 5));
    expect(nextOccurrence(rule, 'jalali', j(1405, 9, 6))).toBeNull();
    const open = schedule({ frequency: 'WEEKLY', startOn: '2020-01-01' });
    expect(nextOccurrence(open, 'gregorian', '2026-10-12')).toBe('2026-10-14');
  });
});

describe('dueOccurrences', () => {
  const rent = schedule({ startOn: j(1405, 5, 1) });

  it('lists every missed occurrence up to today, oldest first', () => {
    expect(dueOccurrences(rent, 'jalali', j(1405, 7, 19), [])).toEqual([
      j(1405, 5, 1),
      j(1405, 6, 1),
      j(1405, 7, 1),
    ]);
  });

  it('includes one falling today, and none before the start', () => {
    expect(dueOccurrences(rent, 'jalali', j(1405, 7, 1), [])).toEqual([
      j(1405, 5, 1),
      j(1405, 6, 1),
      j(1405, 7, 1),
    ]);
    expect(dueOccurrences(rent, 'jalali', j(1405, 4, 31), [])).toEqual([]);
  });

  it('leaves out occurrences already confirmed or skipped, in any order', () => {
    expect(dueOccurrences(rent, 'jalali', j(1405, 7, 19), [j(1405, 6, 1)])).toEqual([
      j(1405, 5, 1),
      j(1405, 7, 1),
    ]);
  });

  it('stops at the end day', () => {
    const ended = { ...rent, endOn: j(1405, 5, 20) };
    expect(dueOccurrences(ended, 'jalali', g(2027, 1, 1), [])).toEqual([j(1405, 5, 1)]);
  });
});
