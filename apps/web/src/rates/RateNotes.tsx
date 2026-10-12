import { hasRole } from '@daric/core';
import type { Currency, ExchangeRate, IsoDay } from '@daric/core';
import { isolate } from '@daric/i18n';
import { TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { useFormatters } from '../settings/settings';
import { useRateEquation } from './rates';

/**
 * Beneath a total in the Base Currency: the rate each currency was converted
 * at, and a warning for each currency left out for want of a rate on `day`.
 */
export function RateNotes({
  ratesUsed,
  missing,
  day,
}: {
  ratesUsed: readonly ExchangeRate[];
  missing: readonly Currency[];
  day: IsoDay;
}) {
  const { t } = useI18n();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const equation = useRateEquation();
  if (ratesUsed.length === 0 && missing.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 text-sm">
      {ratesUsed.map((rate) => (
        <p key={rate.currency} className="text-foreground-muted tabular-nums">
          {t('totals.rateUsed', {
            equation: isolate(t('rates.equation', equation(rate))),
            day: isolate(format.day(rate.effectiveOn)),
          })}
        </p>
      ))}
      {missing.map((currency) => (
        <p key={currency.code} className="flex flex-wrap items-center gap-x-2 text-accent">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
          <span>
            {t('totals.missingRate', {
              currency: format.currency(currency),
              day: isolate(format.day(day)),
            })}
          </span>
          {hasRole(workspace.role, 'ADMIN') && (
            <Link to="/rates/new" className="font-medium underline underline-offset-4">
              {t('totals.addRate')}
            </Link>
          )}
        </p>
      ))}
    </div>
  );
}
