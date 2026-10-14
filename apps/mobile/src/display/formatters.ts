import { currencyByCode, displayFormatters, money } from '@daric/core';
import type { DisplayFormatters } from '@daric/core';
import { useMemo } from 'react';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';

/** Formatters for the signed-in User looking at their Workspace. */
export function useFormatters(): DisplayFormatters {
  const { locale } = useI18n();
  const { me, workspace } = useSignedIn();
  const { preferences } = me;
  return useMemo(
    () => displayFormatters({ locale, workspace, preferences }),
    [locale, workspace, preferences],
  );
}

/** An Amount in `baseCurrency` (a report's own, which may lag the Workspace's), as shown. */
export function useShownInBase(baseCurrency: string) {
  const format = useFormatters();
  const base = currencyByCode(baseCurrency);
  return (amount: bigint) => format.money(money(amount, base));
}

/** Currencies left out of a total for want of a rate, named in a list. */
export function useCurrencyList() {
  const { t } = useI18n();
  const format = useFormatters();
  return (codes: readonly string[]) =>
    codes.map((code) => format.currency(currencyByCode(code))).join(t('totals.separator'));
}
