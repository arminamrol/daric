import { currencyByCode, money, periodParam } from '@daric/core';
import type { Period } from '@daric/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useApi } from '../api/api';
import { useSignedIn } from '../auth/session';
import { reportsKey } from '../data/keys';
import { useFormatters } from '../display/formatters';
import { useI18n } from '../i18n/locale';

/** The report of `period`, worked out by the API. */
export function useReport(period: Period) {
  const api = useApi();
  const { workspace } = useSignedIn();
  return useQuery({
    queryKey: [...reportsKey(workspace.id), workspace.baseCurrency, periodParam(period)],
    queryFn: () => api.getReport(workspace.id, { period }),
    placeholderData: keepPreviousData,
  });
}

/** An Amount in a report's Base Currency, as shown. */
export function useShownInBase(baseCurrency: string) {
  const format = useFormatters();
  const base = currencyByCode(baseCurrency);
  return (amount: bigint) => format.money(money(amount, base));
}

/** A whole percent, as shown. */
export function useShare() {
  const { t } = useI18n();
  const format = useFormatters();
  return (percent: number) => t('reports.share', { percent: format.count(percent) });
}
