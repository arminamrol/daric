import { calendarSystems, digitSystems } from '@daric/core';
import type { CalendarSystem, Digits, UserPreferences } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { useId } from 'react';
import { useI18n } from '../i18n/locale';
import { ThemeToggle } from '../theme/ThemeToggle';
import { ChoiceGroup } from '../ui/ChoiceGroup';
import { CALENDAR_LABELS } from './labels';
import { useUpdatePreferences } from './settings';

const DIGIT_LABELS: Record<Digits, PlainMessageKey> = {
  persian: 'settings.preferences.digits.persian',
  latin: 'settings.preferences.digits.latin',
};

/** The User's own display calendar, digits and theme; each choice is saved as it is made. */
export function PreferencesForm({ preferences }: { preferences: UserPreferences }) {
  const { t } = useI18n();
  const id = useId();
  const update = useUpdatePreferences();

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface px-6 py-6">
      <div>
        <h2 id={`${id}-title`} className="text-xl font-bold">
          {t('settings.preferences.title')}
        </h2>
        <p id={`${id}-hint`} className="text-sm text-foreground-muted">
          {t('settings.preferences.hint')}
        </p>
      </div>
      <form
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-hint`}
        onSubmit={(e) => e.preventDefault()}
        className="flex flex-col gap-5"
      >
        <ChoiceGroup<CalendarSystem>
          legend={t('settings.preferences.calendar')}
          choices={calendarSystems.map((value) => ({
            value,
            label: t(CALENDAR_LABELS[value]),
          }))}
          value={preferences.displayCalendar}
          onChange={(displayCalendar) => update.mutate({ displayCalendar })}
        />
        <ChoiceGroup<Digits>
          legend={t('settings.preferences.digits')}
          choices={digitSystems.map((value) => ({ value, label: t(DIGIT_LABELS[value]) }))}
          value={preferences.digits}
          onChange={(digits) => update.mutate({ digits })}
        />
        <ThemeToggle hideLegend={false} />
        {update.isError && (
          <p role="alert" className="rounded-md bg-surface-muted px-3 py-2 text-sm text-danger">
            {t('settings.saveFailed')}
          </p>
        )}
      </form>
    </section>
  );
}
