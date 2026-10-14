import { hasRole, money } from '@daric/core';
import type { RecurringRule } from '@daric/core';
import { isolate } from '@daric/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { currencyOf, useAccounts } from '../../../accounts/accounts';
import { useSignedIn } from '../../../auth/session';
import { useFormatters } from '../../../display/formatters';
import { useI18n } from '../../../i18n/locale';
import { DueOccurrences } from '../../../recurring/DueOccurrences';
import { useDueOccurrences, useRecurringRules } from '../../../recurring/recurring';
import { FormMessage } from '../../../ui/Form';
import { ScreenHeader } from '../../../ui/HeaderButton';
import { ListRow } from '../../../ui/ListRow';
import { ListScreen } from '../../../ui/ListScreen';
import { Status } from '../../../ui/Screen';
import { Toggle } from '../../../ui/Toggle';

/** The Due Occurrences waiting for confirmation, then the Recurring Rules; archived ones when asked. */
export default function RecurringScreen() {
  const { t } = useI18n();
  const format = useFormatters();
  const router = useRouter();
  const { workspace } = useSignedIn();
  const [showArchived, setShowArchived] = useState(false);
  const rules = useRecurringRules();
  const due = useDueOccurrences();
  const accounts = useAccounts({ includeArchived: true });
  const canManage = hasRole(workspace.role, 'ADMIN');
  const canConfirm = hasRole(workspace.role, 'MEMBER');

  const header = (
    <ScreenHeader
      title={t('recurring.title')}
      action={
        canManage && { label: t('recurring.new'), onPress: () => router.push('/recurring/new') }
      }
    />
  );
  if (rules.isPending || accounts.isPending) {
    return (
      <>
        {header}
        <Status message={t('session.loading')} />
      </>
    );
  }
  if (!rules.data)
    return (
      <>
        {header}
        <Status alert message={t('recurring.loadFailed')} />
      </>
    );

  const accountList = accounts.data ?? [];
  const every = (rule: RecurringRule) =>
    rule.interval === 1
      ? t(`recurring.every.${rule.frequency}`)
      : t(`recurring.everyN.${rule.frequency}`, { count: format.count(rule.interval) });

  return (
    <>
      {header}
      <ListScreen<RecurringRule>
        sections={[
          {
            key: 'rules',
            title: t('nav.recurring'),
            data: rules.data.filter((r) => showArchived || !r.archived),
          },
        ]}
        keyOf={(r) => r.id}
        header={
          <>
            {due.data ? (
              <DueOccurrences
                occurrences={due.data}
                accounts={accountList}
                canConfirm={canConfirm}
              />
            ) : (
              <FormMessage message={due.isError ? t('recurring.loadFailed') : undefined} />
            )}
            <Toggle
              label={t('recurring.showArchived')}
              value={showArchived}
              onChange={setShowArchived}
            />
          </>
        }
        renderItem={(rule) => {
          const account = accountList.find((a) => a.id === rule.accountId);
          const state = rules.states?.get(rule.id);
          return (
            <ListRow
              title={rule.name}
              trailing={format.money(money(rule.amount, currencyOf(account)))}
              lines={[
                [every(rule), account?.name].filter(Boolean).join(' · '),
                // The API works out the next occurrence once it has the change.
                !state &&
                  (rule.nextDueOn
                    ? t('recurring.next', { date: isolate(format.day(rule.nextDueOn)) })
                    : t('recurring.ended')),
                rule.autoPost && t('recurring.autoPost'),
                rule.archived && t('recurring.archived'),
              ]}
              state={state}
              actionLabel={
                canManage ? t('recurring.edit', { name: isolate(rule.name) }) : undefined
              }
              onPress={canManage ? () => router.push(`/recurring/${rule.id}`) : undefined}
            />
          );
        }}
        empty={t('recurring.empty')}
        refreshing={rules.isRefetching || due.isRefetching}
        onRefresh={() => void Promise.all([rules.refetch(), due.refetch()])}
      />
    </>
  );
}
