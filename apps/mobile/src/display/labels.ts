import type { CalendarSystem } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';

/** Each calendar's name, for hints saying how to type a day. */
export const CALENDAR_LABELS = {
  jalali: 'settings.calendar.jalali',
  gregorian: 'settings.calendar.gregorian',
} as const satisfies Record<CalendarSystem, PlainMessageKey>;
