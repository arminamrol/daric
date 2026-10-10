import { isolate } from '@daric/i18n';
import { useI18n } from '../i18n/locale';
import { useFormatters } from '../settings/settings';
import { Logo } from '../shell/Logo';

export function HomePage() {
  const { t } = useI18n();
  const format = useFormatters();
  const now = new Date();

  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-surface px-6 py-12 text-center">
      <Logo className="size-16 opacity-90" />
      <h1 className="text-2xl font-bold">{t('home.title')}</h1>
      <div className="text-sm text-foreground-muted">
        <p>{t('home.today', { date: isolate(format.date(now, { style: 'long' })) })}</p>
        <p>
          {t('home.currentPeriod', {
            period: isolate(format.period(format.currentPeriod(now))),
          })}
        </p>
      </div>
      <p className="text-foreground-muted">{t('home.empty')}</p>
    </section>
  );
}
