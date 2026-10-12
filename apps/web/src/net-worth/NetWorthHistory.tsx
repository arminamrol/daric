import { currencyByCode, hasRole, money } from '@daric/core';
import type { NetWorthSnapshotSummary } from '@daric/core';
import { lazy, Suspense, useId, useState } from 'react';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { useFormatters } from '../settings/settings';
import { useNetWorthHistory, useTakeSnapshot } from './net-worth';

const HistoryChart = lazy(() => import('./HistoryChart'));

function HistoryTable({ snapshots }: { snapshots: NetWorthSnapshotSummary[] }) {
  const { t } = useI18n();
  const format = useFormatters();
  return (
    <table className="w-full text-sm tabular-nums">
      <caption className="sr-only">{t('netWorth.historyTable')}</caption>
      <thead>
        <tr className="border-b border-border text-start text-foreground-muted">
          <th scope="col" className="py-2 text-start font-medium">
            {t('netWorth.day')}
          </th>
          <th scope="col" className="py-2 text-start font-medium">
            {t('netWorth.kind')}
          </th>
          <th scope="col" className="py-2 text-end font-medium">
            {t('netWorth.total')}
          </th>
          <th scope="col" className="py-2 text-end font-medium">
            {t('netWorth.assets')}
          </th>
          <th scope="col" className="py-2 text-end font-medium">
            {t('netWorth.liabilities')}
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {/* Newest first, like the app's other lists. */}
        {[...snapshots].reverse().map((s) => {
          const base = currencyByCode(s.baseCurrency);
          const shown = (amount: bigint) => format.money(money(amount, base));
          return (
            <tr key={s.id}>
              <th scope="row" className="py-2 text-start font-normal">
                {format.day(s.day)}
              </th>
              <td className="py-2">{t(`netWorth.kind.${s.kind}`)}</td>
              <td className="py-2 text-end font-medium">
                {shown(s.total)}
                {s.missing.length > 0 && (
                  <span className="block text-xs font-normal text-foreground-muted">
                    {t('netWorth.incomplete', {
                      currencies: s.missing
                        .map((code) => format.currency(currencyByCode(code)))
                        .join(t('totals.separator')),
                    })}
                  </span>
                )}
              </td>
              <td className="py-2 text-end">{shown(s.assets)}</td>
              <td className="py-2 text-end">{shown(s.liabilities)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * The Net Worth Snapshots in the current Base Currency, as a chart with the
 * same numbers in a table; Members and above can take one of today.
 */
export function NetWorthHistory() {
  const { t } = useI18n();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const history = useNetWorthHistory();
  const take = useTakeSnapshot();
  const [outcome, setOutcome] = useState<'taken' | 'failed' | null>(null);
  const titleId = useId();
  const canTake = hasRole(workspace.role, 'MEMBER');

  // A total in another Base Currency cannot sit on the same scale.
  const all = history.data ?? [];
  const snapshots = all.filter((s) => s.baseCurrency === workspace.baseCurrency);
  const otherBase = all.length - snapshots.length;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id={titleId} className="me-auto text-lg font-bold">
          {t('netWorth.history')}
        </h2>
        {canTake && (
          <button
            type="button"
            disabled={take.isPending}
            onClick={() => {
              setOutcome(null);
              take.mutate(undefined, {
                onSuccess: () => setOutcome('taken'),
                onError: () => setOutcome('failed'),
              });
            }}
            className="rounded-md border border-border px-4 py-1.5 font-medium disabled:opacity-60"
          >
            {take.isPending ? t('netWorth.taking') : t('netWorth.takeSnapshot')}
          </button>
        )}
      </div>
      <p className="text-sm text-foreground-muted">{t('netWorth.historyIntro')}</p>
      {outcome === 'taken' && (
        <p role="status" className="text-sm text-success">
          {t('netWorth.snapshotTaken')}
        </p>
      )}
      {outcome === 'failed' && (
        <p role="alert" className="text-sm text-danger">
          {t('netWorth.snapshotFailed')}
        </p>
      )}
      {history.isPending ? (
        <p role="status" className="text-foreground-muted">
          {t('session.loading')}
        </p>
      ) : history.isError ? (
        <p role="alert" className="text-danger">
          {t('netWorth.historyLoadFailed')}
        </p>
      ) : snapshots.length === 0 ? (
        <p className="text-foreground-muted">{t('netWorth.historyEmpty')}</p>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-4">
          <Suspense fallback={<div className="h-64 w-full" />}>
            <HistoryChart snapshots={snapshots} baseCurrency={workspace.baseCurrency} />
          </Suspense>
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              {t('netWorth.showTable')}
            </summary>
            <div className="mt-2 overflow-x-auto">
              <HistoryTable snapshots={snapshots} />
            </div>
          </details>
        </div>
      )}
      {otherBase > 0 && (
        <p className="text-sm text-foreground-muted">
          {t('netWorth.otherBase', { count: format.count(otherBase) })}
        </p>
      )}
    </section>
  );
}
