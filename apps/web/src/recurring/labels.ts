import type { RecurrenceFrequency } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';

export const FREQUENCY_LABELS: Record<RecurrenceFrequency, PlainMessageKey> = {
  WEEKLY: 'recurring.frequency.WEEKLY',
  MONTHLY: 'recurring.frequency.MONTHLY',
  YEARLY: 'recurring.frequency.YEARLY',
};

/** "Every week", "every month", "every year". */
export const EVERY_LABELS: Record<RecurrenceFrequency, PlainMessageKey> = {
  WEEKLY: 'recurring.every.WEEKLY',
  MONTHLY: 'recurring.every.MONTHLY',
  YEARLY: 'recurring.every.YEARLY',
};

/** "Every {count} weeks", and so on. */
export const EVERY_N_LABELS = {
  WEEKLY: 'recurring.everyN.WEEKLY',
  MONTHLY: 'recurring.everyN.MONTHLY',
  YEARLY: 'recurring.everyN.YEARLY',
} as const satisfies Record<RecurrenceFrequency, string>;
