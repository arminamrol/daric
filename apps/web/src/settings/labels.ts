import type { CalendarSystem, MoneyDisplay } from '@daric/core';
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

/** What IRR is typed in. */
export const MONEY_DISPLAY_UNITS: Record<MoneyDisplay, PlainMessageKey> = {
  rial: 'settings.workspace.moneyDisplay.rial',
  toman: 'settings.workspace.moneyDisplay.toman',
};
