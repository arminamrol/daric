import { formatDate, formatDay, formatPeriod, monthPeriodOf, todayIn } from '../calendar';
import type {
  CalendarSystem,
  FormatDateOptions,
  IsoDay,
  MonthPeriod,
  Period,
  WorkspaceCalendar,
} from '../calendar';
import { toPersianDigits } from '../locale';
import type { Digits, Locale } from '../locale';
import { currencyName, formatMoney } from '../money';
import type { Currency, FormatMoneyOptions, Money, MoneyDisplay } from '../money';
import { formatRate } from '../rates';

/**
 * Everything that decides how money and dates look. The Workspace owns the
 * calendar that defines Periods, its timezone and how IRR is shown; the User
 * owns only how things are drawn: their display calendar and digits (ADR-0002).
 */
export interface DisplaySettings {
  readonly locale: Locale;
  readonly workspace: {
    readonly calendar: CalendarSystem;
    readonly timezone: string;
    readonly moneyDisplay: MoneyDisplay;
  };
  readonly preferences: {
    readonly displayCalendar: CalendarSystem;
    readonly digits: Digits;
  };
}

export interface DisplayFormatters {
  money(m: Money, options?: Pick<FormatMoneyOptions, 'label' | 'grouping'>): string;
  /** A currency's name; IRR by the Workspace's Rial/Toman display. */
  currency(currency: Currency): string;
  /** A stored rate of `currency` into `base` as typed: in tomans where Toman display asks. */
  rate(rate: string, currency: Currency, base: Currency): string;
  date(instant: Date, options?: Pick<FormatDateOptions, 'style'>): string;
  /** The time of day of `instant` in the Workspace timezone, on a 24-hour clock (`20:35`). */
  time(instant: Date): string;
  /** A day with no time of day (a Transaction's), in the display calendar. */
  day(day: IsoDay, options?: Pick<FormatDateOptions, 'style'>): string;
  /** The day `instant` falls on in the Workspace timezone. */
  today(instant: Date): IsoDay;
  /** The month Period of the Workspace Calendar that `instant` falls in. */
  currentPeriod(instant: Date): MonthPeriod;
  /** Names a Period of the Workspace Calendar, whatever the display calendar is. */
  period(period: Period): string;
  /** A whole number, ungrouped, in the User's digits. */
  count(n: number): string;
}

/** Formatters for one User looking at one Workspace; every screen should go through these. */
export function displayFormatters(settings: DisplaySettings): DisplayFormatters {
  const { locale, workspace, preferences } = settings;
  const { digits } = preferences;
  const clock = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: workspace.timezone,
  });
  const inDigits = (s: string) => (digits === 'persian' ? toPersianDigits(s) : s);
  const workspaceCalendar: WorkspaceCalendar = {
    calendar: workspace.calendar,
    timeZone: workspace.timezone,
  };

  return {
    money: (m, options) =>
      formatMoney(m, { ...options, locale, digits, display: workspace.moneyDisplay }),
    currency: (currency) => currencyName(currency, { locale, display: workspace.moneyDisplay }),
    rate: (rate, currency, base) =>
      formatRate(rate, { currency, base, digits, display: workspace.moneyDisplay }),
    date: (instant, options) =>
      formatDate(instant, {
        ...options,
        calendar: preferences.displayCalendar,
        timeZone: workspace.timezone,
        locale,
        digits,
      }),
    time: (instant) => inDigits(clock.format(instant)),
    day: (day, options) =>
      formatDay(day, { ...options, calendar: preferences.displayCalendar, locale, digits }),
    today: (instant) => todayIn(instant, workspace.timezone),
    currentPeriod: (instant) => monthPeriodOf(instant, workspaceCalendar),
    period: (period) => formatPeriod(period, { calendar: workspace.calendar, locale, digits }),
    count: (n) => inDigits(String(n)),
  };
}
