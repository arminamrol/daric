import { toPersianDigits } from '../locale';
import type { Digits, Locale } from '../locale';
import { fromEpochDay } from './calendar';
import type { CalendarDate, CalendarSystem } from './calendar';
import { calendarDateOf } from './day';
import type { IsoDay } from './day';
import type { Period } from './period';
import { instantMs, localEpochDay } from './zone';

export interface FormatDateOptions {
  /** The User's display calendar; it may differ from the Workspace Calendar (ADR-0002). */
  readonly calendar: CalendarSystem;
  /** The Workspace timezone, which decides which day an instant falls on. */
  readonly timeZone: string;
  readonly locale: Locale;
  readonly digits: Digits;
  /** `numeric` is year/month/day (1405/07/17); `long` names the month (17 Mehr 1405). Defaults to numeric. */
  readonly style?: 'numeric' | 'long';
}

const MONTH_NAMES: Record<CalendarSystem, Record<Locale, readonly string[]>> = {
  jalali: {
    fa: [
      'فروردین',
      'اردیبهشت',
      'خرداد',
      'تیر',
      'مرداد',
      'شهریور',
      'مهر',
      'آبان',
      'آذر',
      'دی',
      'بهمن',
      'اسفند',
    ],
    en: [
      'Farvardin',
      'Ordibehesht',
      'Khordad',
      'Tir',
      'Mordad',
      'Shahrivar',
      'Mehr',
      'Aban',
      'Azar',
      'Dey',
      'Bahman',
      'Esfand',
    ],
  },
  gregorian: {
    fa: [
      'ژانویه',
      'فوریه',
      'مارس',
      'آوریل',
      'مه',
      'ژوئن',
      'ژوئیه',
      'اوت',
      'سپتامبر',
      'اکتبر',
      'نوامبر',
      'دسامبر',
    ],
    en: [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ],
  },
};

/** Formats the day `instant` falls on in `timeZone`, shown in the display calendar. */
export function formatDate(instant: Date, options: FormatDateOptions): string {
  const epochDay = localEpochDay(instantMs(instant), options.timeZone);
  return formatCalendarDate(fromEpochDay(options.calendar, epochDay), options);
}

export type FormatDayOptions = Omit<FormatDateOptions, 'timeZone'>;

/** Formats a day with no time of day (a Transaction's day), shown in the display calendar. */
export function formatDay(day: IsoDay, options: FormatDayOptions): string {
  return formatCalendarDate(calendarDateOf(day, options.calendar), options);
}

function formatCalendarDate(date: CalendarDate, options: FormatDayOptions): string {
  const { calendar, locale, digits, style = 'numeric' } = options;
  const { year, month, day } = date;
  const text =
    style === 'long'
      ? `${day} ${MONTH_NAMES[calendar][locale][month - 1]} ${year}`
      : `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
  return digits === 'persian' ? toPersianDigits(text) : text;
}

export interface FormatPeriodOptions {
  /** The Workspace Calendar the Period belongs to; a Period has no other calendar. */
  readonly calendar: CalendarSystem;
  readonly locale: Locale;
  readonly digits: Digits;
}

/** Names a Period: a month with its year (Mehr 1405), or a year alone (1405). */
export function formatPeriod(period: Period, options: FormatPeriodOptions): string {
  const { calendar, locale, digits } = options;
  const text =
    period.kind === 'month'
      ? `${MONTH_NAMES[calendar][locale][period.month - 1]} ${period.year}`
      : String(period.year);
  return digits === 'persian' ? toPersianDigits(text) : text;
}
