import { isolate } from '@daric/i18n';
import { Link, useLocation } from 'react-router';
import { useI18n } from '../i18n/locale';

export function NotFoundPage() {
  const { t } = useI18n();
  const { pathname } = useLocation();

  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
      <h1 className="text-2xl font-bold">{t('notFound.title')}</h1>
      <p className="text-foreground-muted">
        {t('notFound.description', { path: isolate(pathname) })}
      </p>
      <Link to="/" className="rounded-md font-medium text-accent underline underline-offset-4">
        {t('notFound.home')}
      </Link>
    </section>
  );
}
