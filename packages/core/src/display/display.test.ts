import { describe, expect, it } from 'vitest';
import { IRR, USD, displayFormatters, money } from '../index';
import type { DisplaySettings } from '../index';

// 2026-10-09 10:00 in Tehran is 17 Mehr 1405.
const today = new Date('2026-10-09T06:30:00Z');

const settings: DisplaySettings = {
  locale: 'fa',
  workspace: { calendar: 'jalali', timezone: 'Asia/Tehran', moneyDisplay: 'rial' },
  preferences: { displayCalendar: 'jalali', digits: 'persian' },
};

describe('displayFormatters', () => {
  it("shows IRR the way the Workspace shows money, in the User's digits", () => {
    const rial = displayFormatters(settings);
    expect(rial.money(money(12345000n, IRR))).toBe('۱۲٬۳۴۵٬۰۰۰ ریال');

    const toman = displayFormatters({
      ...settings,
      workspace: { ...settings.workspace, moneyDisplay: 'toman' },
      preferences: { ...settings.preferences, digits: 'latin' },
    });
    expect(toman.money(money(12345000n, IRR))).toBe('1,234,500 تومان');
    expect(toman.money(money(123456n, USD))).toBe('1,234.56 دلار');
  });

  it("shows dates in the User's display calendar, on the Workspace's day", () => {
    const gregorian = displayFormatters({
      ...settings,
      preferences: { ...settings.preferences, displayCalendar: 'gregorian' },
    });
    expect(gregorian.date(today)).toBe('۲۰۲۶/۱۰/۰۹');
    expect(gregorian.date(today, { style: 'long' })).toBe('۹ اکتبر ۲۰۲۶');

    // Still Esfand 29 1404 in UTC, already Farvardin 1 1405 in Tehran.
    const nowruz = new Date('2026-03-20T21:00:00Z');
    expect(displayFormatters(settings).date(nowruz)).toBe('۱۴۰۵/۰۱/۰۱');
    const utc = displayFormatters({
      ...settings,
      workspace: { ...settings.workspace, timezone: 'UTC' },
    });
    expect(utc.date(nowruz)).toBe('۱۴۰۴/۱۲/۲۹');
  });

  it('buckets Periods by the Workspace Calendar, whatever the display calendar', () => {
    const jalaliWorkspace = displayFormatters({
      ...settings,
      preferences: { ...settings.preferences, displayCalendar: 'gregorian' },
    });
    const current = jalaliWorkspace.currentPeriod(today);
    expect(current).toEqual({ kind: 'month', year: 1405, month: 7 });
    expect(jalaliWorkspace.period(current)).toBe('مهر ۱۴۰۵');
    expect(jalaliWorkspace.period({ kind: 'year', year: 1405 })).toBe('۱۴۰۵');

    const gregorianWorkspace = displayFormatters({
      ...settings,
      workspace: { ...settings.workspace, calendar: 'gregorian' },
    });
    const regrouped = gregorianWorkspace.currentPeriod(today);
    expect(regrouped).toEqual({ kind: 'month', year: 2026, month: 10 });
    expect(gregorianWorkspace.period(regrouped)).toBe('اکتبر ۲۰۲۶');
  });
});
