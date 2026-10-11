import type {
  CreateExchangeRateInput,
  ExchangeRateWire,
  UpdateExchangeRateInput,
} from '@daric/core';
import { currencyByCode } from '@daric/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../api/api';
import { useSignedIn } from '../auth/session';
import { budgetsKey } from '../budgets/budgets';
import { useFormatters } from '../settings/settings';

/** The query key every Exchange Rate query of a Workspace starts with. */
export const ratesKey = (workspaceId: string) => ['exchange-rates', workspaceId] as const;

/**
 * The Workspace's rates into its current Base Currency, by currency, newest
 * first. Keyed by the Base Currency, so changing it refetches them.
 */
export function useExchangeRates() {
  const api = useApi();
  const { workspace } = useSignedIn();
  return useQuery({
    queryKey: [...ratesKey(workspace.id), workspace.baseCurrency],
    queryFn: () => api.listExchangeRates(workspace.id),
  });
}

/** Budgets convert with rates, so a changed rate refetches them too. */
function useRefreshRates() {
  const queryClient = useQueryClient();
  const { workspace } = useSignedIn();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ratesKey(workspace.id), refetchType: 'all' }),
      queryClient.invalidateQueries({ queryKey: budgetsKey(workspace.id) }),
    ]);
}

/** Owner or Admin only. */
export function useCreateExchangeRate() {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshRates();
  return useMutation({
    mutationFn: (input: CreateExchangeRateInput) => api.createExchangeRate(workspace.id, input),
    onSuccess: refresh,
  });
}

/** Owner or Admin only. */
export function useUpdateExchangeRate(rateId: string) {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshRates();
  return useMutation({
    mutationFn: (input: UpdateExchangeRateInput) =>
      api.updateExchangeRate(workspace.id, rateId, input),
    onSuccess: refresh,
  });
}

/** Owner or Admin only. */
export function useDeleteExchangeRate(rateId: string) {
  const api = useApi();
  const { workspace } = useSignedIn();
  const refresh = useRefreshRates();
  return useMutation({
    mutationFn: () => api.deleteExchangeRate(workspace.id, rateId),
    onSuccess: refresh,
  });
}

/** Writes "1 دلار = ۱۰۵٬۰۰۰ تومان" for a rate into the Workspace's Base Currency. */
export function useRateEquation() {
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const base = currencyByCode(workspace.baseCurrency);
  return (rate: Pick<ExchangeRateWire, 'currency' | 'rate'>) => {
    const currency = currencyByCode(rate.currency);
    return {
      one: format.count(1),
      currency: format.currency(currency),
      rate: format.rate(rate.rate, currency, base),
      base: format.currency(base),
    };
  };
}
