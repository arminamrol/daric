import { DAY } from '../../common/time';
import type { ExpiryStep } from '../../db/schema';
import { graceEnd } from './entitlements';

/** Days before the expiry the reminder mails go out. */
export const REMINDER_DAYS = { REMINDER_7_DAYS: 7, REMINDER_1_DAY: 1 } as const;

/**
 * Which step is due for Plus time ending at `expiresAt` (ADR-0008): a reminder
 * 7 days and 1 day before, a Grace Period notice from the expiry, and the
 * downgrade once the Grace Period has ended. Each is due only until the next
 * one is, so a job that was down skips the stale mails rather than sending
 * them late; the downgrade stays due however late it comes.
 */
export function dueExpiryStep(input: {
  expiresAt: Date;
  now: Date;
  graceDays: number;
}): ExpiryStep | null {
  const { expiresAt, now, graceDays } = input;
  const before = (days: number) => new Date(expiresAt.getTime() - days * DAY);
  if (now >= graceEnd(expiresAt, graceDays)) return 'DOWNGRADED';
  if (now >= expiresAt) return 'GRACE_STARTED';
  if (now >= before(REMINDER_DAYS.REMINDER_1_DAY)) return 'REMINDER_1_DAY';
  if (now >= before(REMINDER_DAYS.REMINDER_7_DAYS)) return 'REMINDER_7_DAYS';
  return null;
}
