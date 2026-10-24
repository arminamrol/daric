import { calendarSystems, digitSystems } from '@daric/core';
import type { CalendarSystem, Digits, UserPreferences } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { useId } from 'react';
import { LanguageToggle } from '../i18n/LanguageToggle';
import { useI18n } from '../i18n/locale';
import { ThemeToggle } from '../theme/ThemeToggle';
import { Card, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { FormMessage } from '../ui/Field';
import { SegmentedControl } from '../ui/SegmentedControl';
import { CALENDAR_LABELS } from './labels';
import { useUpdatePreferences } from './settings';

const DIGIT_LABELS: Record<Digits, PlainMessageKey> = {
  persian: 'settings.preferences.digits.persian',
  latin: 'settings.preferences.digits.latin',
};

/** The User's own language, display calendar, digits and theme; each choice is saved as it is made. */
export function PreferencesForm({ preferences }: { preferences: UserPreferences }) {
  const { t } = useI18n();
  const id = useId();
  const update = useUpdatePreferences();

  return (
    <Card>
      <CardHeader>
        <CardTitle id={`${id}-title`}>{t('settings.preferences.title')}</CardTitle>
        <CardDescription id={`${id}-hint`}>{t('settings.preferences.hint')}</CardDescription>
      </CardHeader>
      <form
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-hint`}
        onSubmit={(e) => e.preventDefault()}
        className="flex flex-col gap-section"
      >
        <LanguageToggle hideLegend={false} />
        <SegmentedControl<CalendarSystem>
          legend={t('settings.preferences.calendar')}
          choices={calendarSystems.map((value) => ({
            value,
            label: t(CALENDAR_LABELS[value]),
          }))}
          value={preferences.displayCalendar}
          onChange={(displayCalendar) => update.mutate({ displayCalendar })}
        />
        <SegmentedControl<Digits>
          legend={t('settings.preferences.digits')}
          choices={digitSystems.map((value) => ({ value, label: t(DIGIT_LABELS[value]) }))}
          value={preferences.digits}
          onChange={(digits) => update.mutate({ digits })}
        />
        <ThemeToggle hideLegend={false} />
        {update.isError && <FormMessage tone="alert">{t('settings.saveFailed')}</FormMessage>}
      </form>
    </Card>
  );
}
