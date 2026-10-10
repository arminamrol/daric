import { IRR, findCurrency, money } from '@daric/core';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { useFormatters } from './settings';

/** Today's date and a sample amount in the Base Currency, as this User sees them here. */
export function DisplayPreview() {
  const { t } = useI18n();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const sample = money(12_345_000n, findCurrency(workspace.baseCurrency) ?? IRR);

  return (
    <section
      data-testid="display-preview"
      aria-label={t('settings.preview.title')}
      className="rounded-xl border border-border bg-surface-muted px-6 py-4"
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-foreground-muted">{t('settings.preview.date')}</dt>
        <dd>{format.date(new Date())}</dd>
        <dt className="text-foreground-muted">{t('settings.preview.money')}</dt>
        <dd>{format.money(sample)}</dd>
      </dl>
    </section>
  );
}
