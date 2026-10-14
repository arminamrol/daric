import { locales } from '@daric/core';
import { ChoiceGroup } from '../ui/ChoiceGroup';
import { useI18n } from './locale';

/**
 * The language choice. Each language is named in itself, so it can be found
 * whichever one is showing; for a signed-in User it is one of their preferences.
 */
export function LanguageToggle({ hideLegend = true }: { hideLegend?: boolean }) {
  const { t, locale, setLocale, saveFailed } = useI18n();
  return (
    <>
      <ChoiceGroup
        legend={t('language.title')}
        hideLegend={hideLegend}
        choices={locales.map((value) => ({ value, label: t(`language.${value}`) }))}
        value={locale}
        onChange={setLocale}
      />
      {saveFailed && (
        <p role="alert" className="rounded-md bg-surface-muted px-3 py-2 text-sm text-danger">
          {t('settings.saveFailed')}
        </p>
      )}
    </>
  );
}
