import { locales } from '@daric/core';
import { useState } from 'react';
import { Choices } from '../ui/Choices';
import { useI18n } from './locale';

/**
 * The language choice. Each language is named in itself, so it can be found
 * whichever one is showing. Choosing one written the other way restarts the app.
 */
export function LanguageChoices() {
  const { t, locale, setLocale } = useI18n();
  const [failed, setFailed] = useState(false);
  return (
    <Choices
      label={t('language.title')}
      choices={locales.map((id) => ({ id, label: t(`language.${id}`) }))}
      selected={locale}
      onSelect={(id) => {
        const next = locales.find((l) => l === id);
        if (!next || next === locale) return;
        setFailed(false);
        setLocale(next).catch(() => setFailed(true));
      }}
      error={failed ? t('settings.saveFailed') : undefined}
    />
  );
}
