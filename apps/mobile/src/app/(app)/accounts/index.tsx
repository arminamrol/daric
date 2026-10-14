import { accountClasses, hasRole, money } from '@daric/core';
import type { Account } from '@daric/core';
import { isolate } from '@daric/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { currencyOf, useAccounts } from '../../../accounts/accounts';
import { useSignedIn } from '../../../auth/session';
import { useFormatters } from '../../../display/formatters';
import { useI18n } from '../../../i18n/locale';
import { ScreenHeader } from '../../../ui/HeaderButton';
import { ListRow } from '../../../ui/ListRow';
import { ListScreen } from '../../../ui/ListScreen';
import { Status } from '../../../ui/Screen';
import { Toggle } from '../../../ui/Toggle';

/** The Accounts by Asset and Liability with their balances; archived ones when asked. */
export default function AccountsScreen() {
  const { t } = useI18n();
  const format = useFormatters();
  const router = useRouter();
  const { workspace } = useSignedIn();
  const [showArchived, setShowArchived] = useState(false);
  const accounts = useAccounts({ includeArchived: showArchived });
  const canManage = hasRole(workspace.role, 'ADMIN');

  const title = (
    <ScreenHeader
      title={t('accounts.title')}
      action={
        canManage && { label: t('accounts.new'), onPress: () => router.push('/accounts/new') }
      }
    />
  );
  if (accounts.isPending)
    return (
      <>
        {title}
        <Status message={t('session.loading')} />
      </>
    );
  if (!accounts.data)
    return (
      <>
        {title}
        <Status alert message={t('accounts.loadFailed')} />
      </>
    );

  const list = accounts.data;
  return (
    <>
      {title}
      <ListScreen<Account>
        sections={accountClasses.map((accountClass) => ({
          key: accountClass,
          title: t(`accounts.group.${accountClass}`),
          data: list.filter((a) => a.class === accountClass),
        }))}
        keyOf={(a) => a.id}
        header={
          <Toggle
            label={t('accounts.showArchived')}
            value={showArchived}
            onChange={setShowArchived}
          />
        }
        renderItem={(account) => (
          <ListRow
            title={account.name}
            lines={[t(`accounts.type.${account.type}`), account.archived && t('accounts.archived')]}
            trailing={format.money(money(account.balance, currencyOf(account)))}
            state={accounts.states?.get(account.id)}
            actionLabel={
              canManage ? t('accounts.edit', { name: isolate(account.name) }) : undefined
            }
            onPress={canManage ? () => router.push(`/accounts/${account.id}`) : undefined}
          />
        )}
        empty={t('accounts.empty')}
        refreshing={accounts.isRefetching}
        onRefresh={() => void accounts.refetch()}
      />
    </>
  );
}
