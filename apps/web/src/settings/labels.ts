import type { CalendarSystem } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';

export const CALENDAR_LABELS: Record<CalendarSystem, PlainMessageKey> = {
  jalali: 'settings.calendar.jalali',
  gregorian: 'settings.calendar.gregorian',
};

export const CURRENCY_NAMES: Readonly<Record<string, PlainMessageKey>> = {
  IRR: 'currency.IRR',
  USD: 'currency.USD',
  EUR: 'currency.EUR',
};
