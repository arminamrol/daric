import { describe, expect, it } from 'vitest';
import { EUR, IRR, USD, displayFormatters, money } from '../index';
import type { DisplaySettings } from '../index';

// 2026-10-09 10:00 in Tehran is 17 Mehr 1405.
const today = new Date('2026-10-09T06:30:00Z');

const settings: DisplaySettings = {
  locale: 'fa',
  workspace: { calendar: 'jalali', timezone: 'Asia/Tehran', moneyDisplay: 'rial' },
  preferences: { displayCalendar: 'jalali', digits: 'persian' },
};

describe('displayFormatters', () => {
  it("shows the time of day on a 24-hour clock in the Workspace's timezone and the User's digits", () => {
    expect(displayFormatters(settings).time(today)).toBe('۱۰:۰۰');
    const evening = new Date('2026-10-09T17:05:00Z');
    expect(displayFormatters(settings).time(evening)).toBe('۲۰:۳۵');
    const latinUtc = displayFormatters({
      ...settings,
      workspace: { ...settings.workspace, timezone: 'UTC' },
      preferences: { ...settings.preferences, digits: 'latin' },
    });
    expect(latinUtc.time(today)).toBe('06:30');
  });

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

  it("shows a Transaction's day in the display calendar, and knows the Workspace's today", () => {
    const format = displayFormatters(settings);
    expect(format.day('2026-10-09')).toBe('۱۴۰۵/۰۷/۱۷');
    expect(format.day('2026-10-09', { style: 'long' })).toBe('۱۷ مهر ۱۴۰۵');
    const gregorian = displayFormatters({
      ...settings,
      preferences: { displayCalendar: 'gregorian', digits: 'latin' },
    });
    expect(gregorian.day('2026-10-09')).toBe('2026/10/09');
    expect(format.today(new Date('2026-03-20T21:00:00Z'))).toBe('2026-03-21');
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

  it("counts in the User's digits", () => {
    expect(displayFormatters(settings).count(12)).toBe('۱۲');
    const latin = {
      ...settings,
      preferences: { ...settings.preferences, digits: 'latin' as const },
    };
    expect(displayFormatters(latin).count(12)).toBe('12');
  });

  it('names a currency as money shows it, IRR by the Rial/Toman display', () => {
    const rial = displayFormatters(settings);
    expect(rial.currency(IRR)).toBe('ریال');
    expect(rial.currency(USD)).toBe('دلار');
    const toman = displayFormatters({
      ...settings,
      locale: 'en',
      workspace: { ...settings.workspace, moneyDisplay: 'toman' },
    });
    expect(toman.currency(IRR)).toBe('Toman');
    expect(toman.currency(EUR)).toBe('EUR');
  });

  it("shows a rate into the Base Currency in tomans in Toman display, in the User's digits", () => {
    const toman = displayFormatters({
      ...settings,
      workspace: { ...settings.workspace, moneyDisplay: 'toman' },
    });
    expect(toman.rate('1050000', USD, IRR)).toBe('۱۰۵٬۰۰۰');
    expect(displayFormatters(settings).rate('1050000', USD, IRR)).toBe('۱٬۰۵۰٬۰۰۰');
  });
});
