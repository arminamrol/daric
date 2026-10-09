import {
  EPOCH_JDN,
  gregorianToJdn,
  isJalaliLeapYear,
  jalaliToJdn,
  jdnToGregorian,
  jdnToJalali,
} from './jalali';

/** The calendars a Workspace Calendar or a display calendar can use (ADR-0002). */
export type CalendarSystem = 'jalali' | 'gregorian';

/** A day in some calendar; months and days count from 1. */
export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export function isLeapYear(calendar: CalendarSystem, year: number): boolean {
  if (calendar === 'jalali') return isJalaliLeapYear(year);
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const GREGORIAN_MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Days in `month` of `year`; Esfand has 30 in a Jalali leap year, else 29. */
export function daysInMonth(calendar: CalendarSystem, year: number, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Invalid month ${month}`);
  }
  if (calendar === 'jalali') {
    if (month <= 6) return 31;
    if (month <= 11) return 30;
    return isJalaliLeapYear(year) ? 30 : 29;
  }
  if (month === 2 && isLeapYear('gregorian', year)) return 29;
  return GREGORIAN_MONTH_DAYS[month - 1] as number;
}

function assertValidDate(calendar: CalendarSystem, date: CalendarDate): void {
  const { year, month, day } = date;
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(day) ||
    day < 1 ||
    day > daysInMonth(calendar, year, month)
  ) {
    throw new RangeError(`Invalid ${calendar} date ${year}-${month}-${day}`);
  }
}

/** Days since 1970-01-01 of a valid `date`. */
export function toEpochDay(calendar: CalendarSystem, date: CalendarDate): number {
  assertValidDate(calendar, date);
  const { year, month, day } = date;
  const jdn =
    calendar === 'jalali' ? jalaliToJdn(year, month, day) : gregorianToJdn(year, month, day);
  return jdn - EPOCH_JDN;
}

/** The date in `calendar` that is `epochDay` days after 1970-01-01. */
export function fromEpochDay(calendar: CalendarSystem, epochDay: number): CalendarDate {
  const jdn = epochDay + EPOCH_JDN;
  const [year, month, day] = calendar === 'jalali' ? jdnToJalali(jdn) : jdnToGregorian(jdn);
  return { year, month, day };
}

export function jalaliToGregorian(date: CalendarDate): CalendarDate {
  return fromEpochDay('gregorian', toEpochDay('jalali', date));
}

export function gregorianToJalali(date: CalendarDate): CalendarDate {
  return fromEpochDay('jalali', toEpochDay('gregorian', date));
}
