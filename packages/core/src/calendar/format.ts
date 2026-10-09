import { toPersianDigits } from '../locale';
import type { Digits, Locale } from '../locale';
import { fromEpochDay } from './calendar';
import type { CalendarSystem } from './calendar';
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
  const { calendar, timeZone, locale, digits, style = 'numeric' } = options;
  const { year, month, day } = fromEpochDay(calendar, localEpochDay(instantMs(instant), timeZone));
  const text =
    style === 'long'
      ? `${day} ${MONTH_NAMES[calendar][locale][month - 1]} ${year}`
      : `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
  return digits === 'persian' ? toPersianDigits(text) : text;
}
