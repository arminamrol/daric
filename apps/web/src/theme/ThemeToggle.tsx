import type { PlainMessageKey } from '@daric/i18n';
import { useId } from 'react';
import { useI18n } from '../i18n/locale';
import { useThemePreference } from './theme';
import type { ThemePreference } from './theme';

const OPTIONS: readonly { value: ThemePreference; label: PlainMessageKey }[] = [
  { value: 'system', label: 'theme.system' },
  { value: 'light', label: 'theme.light' },
  { value: 'dark', label: 'theme.dark' },
];

/** A segmented radio group: native radios keep arrow-key navigation and screen-reader roles. */
export function ThemeToggle() {
  const { t } = useI18n();
  const [preference, setPreference] = useThemePreference();
  const name = useId();

  return (
    <fieldset className="flex rounded-lg bg-surface-muted p-1 text-sm">
      <legend className="sr-only">{t('theme.label')}</legend>
      {OPTIONS.map(({ value, label }) => (
        <label
          key={value}
          className="cursor-pointer rounded-md px-3 py-1 text-foreground-muted transition-colors select-none hover:text-foreground has-checked:bg-primary has-checked:font-medium has-checked:text-on-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus"
        >
          <input
            type="radio"
            name={name}
            value={value}
            checked={preference === value}
            onChange={() => setPreference(value)}
            className="sr-only"
          />
          {t(label)}
        </label>
      ))}
    </fieldset>
  );
}
