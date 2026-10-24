import { isolate } from '@daric/i18n';
import { House } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { useI18n } from '../i18n/locale';
import { Button } from '../ui/Button';
import { CoinMotif } from '../ui/CoinMotif';

/** A wrong link is not a dead end: says what was asked for and leads home. */
export function NotFoundPage() {
  const { t } = useI18n();
  const { pathname } = useLocation();

  return (
    <section className="mx-auto flex w-full max-w-md flex-col items-center gap-4 py-section text-center">
      <CoinMotif className="size-28" />
      <h1 className="text-2xl font-bold sm:text-3xl">{t('notFound.title')}</h1>
      <p className="text-foreground-muted [overflow-wrap:anywhere]">
        {t('notFound.description', { path: isolate(pathname) })}
      </p>
      <Button asChild className="mt-2">
        <Link to="/">
          <House aria-hidden />
          {t('notFound.home')}
        </Link>
      </Button>
    </section>
  );
}
