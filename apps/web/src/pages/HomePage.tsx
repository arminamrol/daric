import { useI18n } from '../i18n/locale';
import { Logo } from '../shell/Logo';

export function HomePage() {
  const { t } = useI18n();

  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-border bg-surface px-6 py-12 text-center">
      <Logo className="size-16 opacity-90" />
      <h1 className="text-2xl font-bold">{t('home.title')}</h1>
      <p className="text-foreground-muted">{t('home.empty')}</p>
    </section>
  );
}
