import { accountClasses, currencyByCode, money } from '@daric/core';
import type { AccountClass, NetWorthReport } from '@daric/core';
import { isolate } from '@daric/i18n';
import { useId } from 'react';
import { Link } from 'react-router';
import { ACCOUNT_GROUP_LABELS } from '../accounts/labels';
import { useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import { NetWorthHistory } from '../net-worth/NetWorthHistory';
import { useNetWorth } from '../net-worth/net-worth';
import { RateNotes } from '../rates/RateNotes';
import { useFormatters } from '../settings/settings';

type NetWorthAccount = NetWorthReport['accounts'][number];

function AccountRow({ account }: { account: NetWorthAccount }) {
  const { t } = useI18n();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const nameId = useId();
  const currency = currencyByCode(account.currency);
  const base = currencyByCode(workspace.baseCurrency);

  return (
    <li aria-labelledby={nameId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
      <div className="me-auto flex flex-col">
        <Link
          id={nameId}
          to={`/accounts/${account.accountId}/valuations`}
          className="font-medium underline-offset-4 hover:underline"
        >
          {account.name}
        </Link>
        <span className="text-sm text-foreground-muted">
          {account.valuedOn
            ? t('netWorth.valuedOn', { day: isolate(format.day(account.valuedOn)) })
            : t('netWorth.balance')}
          {account.archived && ` · ${t('accounts.archived')}`}
        </span>
      </div>
      <div className="flex flex-col items-end tabular-nums">
        <span className="font-medium">{format.money(money(account.value, currency))}</span>
        {currency.code !== base.code && (
          <span className="text-sm text-foreground-muted">
            {account.inBase === null
              ? t('netWorth.noRate')
              : t('netWorth.inBase', {
                  amount: isolate(format.money(money(account.inBase, base))),
                })}
          </span>
        )}
      </div>
    </li>
  );
}

function AccountGroup({
  accountClass,
  accounts,
}: {
  accountClass: AccountClass;
  accounts: NetWorthAccount[];
}) {
  const { t } = useI18n();
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-lg font-bold">
        {t(ACCOUNT_GROUP_LABELS[accountClass])}
      </h2>
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
        {accounts.map((account) => (
          <AccountRow key={account.accountId} account={account} />
        ))}
      </ul>
    </section>
  );
}

function Breakdown({ netWorth }: { netWorth: NetWorthReport }) {
  const { t } = useI18n();
  const format = useFormatters();
  const base = currencyByCode(netWorth.baseCurrency);
  const totalsId = useId();
  const byCurrencyId = useId();
  // An archived Account with nothing in it adds nothing worth showing.
  const shown = netWorth.accounts.filter((a) => !a.archived || a.value !== 0n);

  return (
    <>
      <section
        aria-labelledby={totalsId}
        className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-6 py-5"
      >
        <h2 id={totalsId} className="sr-only">
          {t('netWorth.totals')}
        </h2>
        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1 tabular-nums">
          <dt className="font-medium">{t('netWorth.total')}</dt>
          <dd className="text-2xl font-bold">{format.money(money(netWorth.total, base))}</dd>
          <dt className="text-foreground-muted">{t('netWorth.assets')}</dt>
          <dd>{format.money(money(netWorth.assets, base))}</dd>
          <dt className="text-foreground-muted">{t('netWorth.liabilities')}</dt>
          <dd>{format.money(money(netWorth.liabilities, base))}</dd>
        </dl>
        <RateNotes
          ratesUsed={netWorth.ratesUsed}
          missing={netWorth.missing.map(currencyByCode)}
          day={netWorth.day}
        />
      </section>
      {netWorth.byCurrency.length > 1 && (
        <section aria-labelledby={byCurrencyId} className="flex flex-col gap-2">
          <h2 id={byCurrencyId} className="text-lg font-bold">
            {t('totals.byCurrency')}
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
            {netWorth.byCurrency.map((c) => {
              const currency = currencyByCode(c.currency);
              const shownMoney = (amount: bigint) => isolate(format.money(money(amount, currency)));
              return (
                <li key={c.currency} className="flex flex-col px-4 py-3 tabular-nums">
                  <span className="font-medium">
                    {t('netWorth.currencyLine', {
                      currency: format.currency(currency),
                      net: shownMoney(c.net),
                    })}
                  </span>
                  <span className="text-sm text-foreground-muted">
                    {t('netWorth.currencyDetail', {
                      assets: shownMoney(c.assets),
                      liabilities: shownMoney(c.liabilities),
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {accountClasses.map((accountClass) => {
        const inClass = shown.filter((a) => a.class === accountClass);
        return inClass.length === 0 ? null : (
          <AccountGroup key={accountClass} accountClass={accountClass} accounts={inClass} />
        );
      })}
    </>
  );
}

/** `/net-worth`: every Member sees it; each Account links to its Valuations. */
export function NetWorthPage() {
  const { t } = useI18n();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const netWorth = useNetWorth();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold">{t('netWorth.title')}</h1>
      <p className="text-sm text-foreground-muted">
        {t('netWorth.intro', {
          day: isolate(format.day(netWorth.data?.day ?? format.today(new Date()))),
          base: format.currency(currencyByCode(workspace.baseCurrency)),
        })}
      </p>
      {netWorth.isPending ? (
        <p role="status" className="text-foreground-muted">
          {t('session.loading')}
        </p>
      ) : netWorth.isError ? (
        <p role="alert" className="text-danger">
          {t('netWorth.loadFailed')}
        </p>
      ) : netWorth.data.accounts.length === 0 ? (
        <p className="text-foreground-muted">{t('accounts.empty')}</p>
      ) : (
        <Breakdown netWorth={netWorth.data} />
      )}
      <NetWorthHistory />
    </div>
  );
}
