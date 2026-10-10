import type { ThemePreference } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { useI18n } from '../i18n/locale';
import { ChoiceGroup } from '../ui/ChoiceGroup';
import { useThemePreference } from './theme';

const OPTIONS: readonly { value: ThemePreference; message: PlainMessageKey }[] = [
  { value: 'system', message: 'theme.system' },
  { value: 'light', message: 'theme.light' },
  { value: 'dark', message: 'theme.dark' },
];

/** The theme choice; for a signed-in User it is one of their preferences, kept on every device. */
export function ThemeToggle({ hideLegend = true }: { hideLegend?: boolean }) {
  const { t } = useI18n();
  const [preference, setPreference] = useThemePreference();

  return (
    <ChoiceGroup
      legend={t('theme.title')}
      hideLegend={hideLegend}
      choices={OPTIONS.map(({ value, message }) => ({ value, label: t(message) }))}
      value={preference}
      onChange={setPreference}
    />
  );
}
