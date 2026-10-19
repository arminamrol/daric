import { describe, expect, it } from 'vitest';
import { DAY, HOUR } from '../../common/time';
import { dueExpiryStep } from './expiry';

const expiresAt = new Date('2026-11-01T08:00:00Z');
const at = (offset: number) => new Date(expiresAt.getTime() + offset);
const due = (offset: number) => dueExpiryStep({ expiresAt, now: at(offset), graceDays: 7 });

describe('dueExpiryStep', () => {
  it('has nothing to do more than 7 days before the expiry', () => {
    expect(due(-7 * DAY - 1)).toBeNull();
    expect(due(-30 * DAY)).toBeNull();
  });

  it('reminds from 7 days before the expiry until the 1-day reminder is due', () => {
    expect(due(-7 * DAY)).toBe('REMINDER_7_DAYS');
    expect(due(-DAY - 1)).toBe('REMINDER_7_DAYS');
  });

  it('reminds again from 1 day before the expiry until it', () => {
    expect(due(-DAY)).toBe('REMINDER_1_DAY');
    expect(due(-1)).toBe('REMINDER_1_DAY');
  });

  it('announces the Grace Period from the expiry until it ends', () => {
    expect(due(0)).toBe('GRACE_STARTED');
    expect(due(7 * DAY - 1)).toBe('GRACE_STARTED');
  });

  it('downgrades from the end of the Grace Period on, however late', () => {
    expect(due(7 * DAY)).toBe('DOWNGRADED');
    expect(due(400 * DAY)).toBe('DOWNGRADED');
  });

  it('takes the Grace Period from config', () => {
    expect(dueExpiryStep({ expiresAt, now: at(2 * DAY + HOUR), graceDays: 2 })).toBe('DOWNGRADED');
  });
});
