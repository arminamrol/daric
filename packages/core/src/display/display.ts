import { formatDate, formatPeriod, monthPeriodOf } from '../calendar';
import type {
  CalendarSystem,
  FormatDateOptions,
  MonthPeriod,
  Period,
  WorkspaceCalendar,
} from '../calendar';
import type { Digits, Locale } from '../locale';
import { formatMoney } from '../money';
import type { FormatMoneyOptions, Money, MoneyDisplay } from '../money';

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
  date(instant: Date, options?: Pick<FormatDateOptions, 'style'>): string;
  /** The month Period of the Workspace Calendar that `instant` falls in. */
  currentPeriod(instant: Date): MonthPeriod;
  /** Names a Period of the Workspace Calendar, whatever the display calendar is. */
  period(period: Period): string;
}

/** Formatters for one User looking at one Workspace; every screen should go through these. */
export function displayFormatters(settings: DisplaySettings): DisplayFormatters {
  const { locale, workspace, preferences } = settings;
  const { digits } = preferences;
  const workspaceCalendar: WorkspaceCalendar = {
    calendar: workspace.calendar,
    timeZone: workspace.timezone,
  };

  return {
    money: (m, options) =>
      formatMoney(m, { ...options, locale, digits, display: workspace.moneyDisplay }),
    date: (instant, options) =>
      formatDate(instant, {
        ...options,
        calendar: preferences.displayCalendar,
        timeZone: workspace.timezone,
        locale,
        digits,
      }),
    currentPeriod: (instant) => monthPeriodOf(instant, workspaceCalendar),
    period: (period) => formatPeriod(period, { calendar: workspace.calendar, locale, digits }),
  };
}
