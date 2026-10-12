import { describe, expect, it } from 'vitest';
import { dueAutoSnapshotDays } from './snapshots';

const tehran = { calendar: 'jalali', timeZone: 'Asia/Tehran' } as const;
const gregorianUtc = { calendar: 'gregorian', timeZone: 'UTC' } as const;
// Created in Shahrivar 1405 (2026-08-23 – 2026-09-22).
const createdAt = new Date('2026-09-01T08:00:00Z');

describe('dueAutoSnapshotDays', () => {
  it('is nothing while the month the Workspace was created in still runs', () => {
    expect(dueAutoSnapshotDays(tehran, new Date('2026-09-22T12:00:00Z'), { createdAt })).toEqual(
      [],
    );
  });

  it("is the month's last day once the month has ended in the Workspace's timezone", () => {
    // Shahrivar 31 ends at 2026-09-22T20:30Z in Tehran (UTC+3:30).
    expect(dueAutoSnapshotDays(tehran, new Date('2026-09-22T20:29:59Z'), { createdAt })).toEqual(
      [],
    );
    expect(dueAutoSnapshotDays(tehran, new Date('2026-09-22T20:30:00Z'), { createdAt })).toEqual([
      '2026-09-22',
    ]);
  });

  it('follows the Workspace Calendar: a Gregorian month ends on its own last day', () => {
    const since = { createdAt: new Date('2026-02-10T00:00:00Z') };
    expect(dueAutoSnapshotDays(gregorianUtc, new Date('2026-02-28T23:59:59Z'), since)).toEqual([]);
    expect(dueAutoSnapshotDays(gregorianUtc, new Date('2026-03-01T00:00:00Z'), since)).toEqual([
      '2026-02-28',
    ]);
  });

  it('is nothing more once the last ended month has its snapshot', () => {
    const now = new Date('2026-10-01T00:00:00Z');
    expect(dueAutoSnapshotDays(tehran, now, { createdAt, lastAutoDay: '2026-09-22' })).toEqual([]);
  });

  it('catches up every ended month after the last snapshot, oldest first', () => {
    // Today is 2 Dey 1405; Mehr, Aban and Azar have ended since Shahrivar's snapshot.
    const now = new Date('2026-12-23T06:00:00Z');
    expect(dueAutoSnapshotDays(tehran, now, { createdAt, lastAutoDay: '2026-09-22' })).toEqual([
      '2026-10-22',
      '2026-11-21',
      '2026-12-21',
    ]);
  });

  it('starts from the month the Workspace was created in, in its timezone', () => {
    // 2026-09-22T21:00Z is already 1 Mehr in Tehran, so Shahrivar is not due.
    const late = new Date('2026-09-22T21:00:00Z');
    expect(
      dueAutoSnapshotDays(tehran, new Date('2026-11-01T00:00:00Z'), { createdAt: late }),
    ).toEqual(['2026-10-22']);
  });

  it('after a calendar change, starts with the first month ending after the last snapshot', () => {
    // The last snapshot was taken on 31 Shahrivar (2026-09-22) before switching to Gregorian:
    // September 2026 ends after it, so it is due, but not August.
    const now = new Date('2026-10-05T00:00:00Z');
    expect(
      dueAutoSnapshotDays(gregorianUtc, now, { createdAt, lastAutoDay: '2026-09-22' }),
    ).toEqual(['2026-09-30']);
    expect(
      dueAutoSnapshotDays(gregorianUtc, now, { createdAt, lastAutoDay: '2026-09-30' }),
    ).toEqual([]);
  });

  it('handles Esfand at the end of the Jalali year', () => {
    // Esfand 1404 has 29 days and ends on 2026-03-20; 1 Farvardin 1405 is 2026-03-21.
    const since = { createdAt: new Date('2026-03-01T00:00:00Z') };
    expect(dueAutoSnapshotDays(tehran, new Date('2026-03-21T00:00:00Z'), since)).toEqual([
      '2026-03-20',
    ]);
  });
});
