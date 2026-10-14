import { hasRole, money } from '@daric/core';
import type { Account, AccountValuation } from '@daric/core';
import { isolate } from '@daric/i18n';
import { useLocalSearchParams } from 'expo-router';
import { currencyOf, useAccounts } from '../../../accounts/accounts';
import { useSignedIn } from '../../../auth/session';
import { useFormatters } from '../../../display/formatters';
import { useI18n } from '../../../i18n/locale';
import { useDeleteValuation, useValuations } from '../../../net-worth/net-worth';
import { ValuationForm } from '../../../net-worth/ValuationForm';
import { Button } from '../../../ui/Button';
import { Card, Heading, Rows } from '../../../ui/Card';
import { FormMessage } from '../../../ui/Form';
import { ScreenHeader } from '../../../ui/HeaderButton';
import { ListRow } from '../../../ui/ListRow';
import { Status } from '../../../ui/Screen';
import { ScrollScreen } from '../../../ui/ScrollScreen';
import { Text } from '../../../ui/Text';

function ValuationList({
  account,
  valuations,
  canManage,
}: {
  account: Account;
  /** Newest first. */
  valuations: readonly AccountValuation[];
  canManage: boolean;
}) {
  const { t } = useI18n();
  const format = useFormatters();
  const remove = useDeleteValuation(account.id);
  if (valuations.length === 0) {
    return <Text tone="foregroundMuted">{t('valuations.empty')}</Text>;
  }
  return (
    <>
      <FormMessage message={remove.isError ? t('settings.saveFailed') : undefined} />
      <Rows>
        {valuations.map((valuation) => {
          const day = isolate(format.day(valuation.valuedOn));
          return (
            <ListRow
              key={valuation.id}
              title={format.money(money(valuation.amount, currencyOf(account)))}
              lines={[t('valuations.from', { day })]}
            >
              {canManage && (
                <Button
                  label={t('valuations.deleteButton')}
                  accessibilityLabel={t('valuations.delete', { day })}
                  disabled={remove.isPending}
                  onPress={() => remove.mutate(valuation.id)}
                />
              )}
            </ListRow>
          );
        })}
      </Rows>
    </>
  );
}

/** An Account's Valuations: every Member sees them, Owners and Admins add and delete them. */
export default function ValuationsScreen() {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  const { accountId } = useLocalSearchParams<{ accountId: string }>();
  const accounts = useAccounts({ includeArchived: true });
  const valuations = useValuations(accountId);
  const canManage = hasRole(workspace.role, 'ADMIN');
  const account = accounts.data?.find((a) => a.id === accountId);

  const header = (
    <ScreenHeader
      title={
        account ? t('valuations.title', { name: isolate(account.name) }) : t('valuations.list')
      }
    />
  );
  if (!account) {
    return (
      <>
        {header}
        {accounts.isPending ? (
          <Status message={t('session.loading')} />
        ) : (
          <Status
            alert
            message={accounts.data ? t('accounts.notFound') : t('accounts.loadFailed')}
          />
        )}
      </>
    );
  }
  return (
    <>
      {header}
      <ScrollScreen
        refreshing={valuations.isRefetching}
        onRefresh={() => void valuations.refetch()}
      >
        <Text size="sm" tone="foregroundMuted">
          {t('valuations.intro')}
        </Text>
        {!canManage ? (
          <Text size="sm" tone="foregroundMuted">
            {t('valuations.readOnly')}
          </Text>
        ) : account.archived ? (
          <Text size="sm" tone="foregroundMuted">
            {t('valuations.archived')}
          </Text>
        ) : (
          <Card>
            <ValuationForm account={account} />
          </Card>
        )}
        <Heading>{t('valuations.list')}</Heading>
        {valuations.isPending ? (
          <Text tone="foregroundMuted">{t('session.loading')}</Text>
        ) : !valuations.data ? (
          <Text tone="danger" accessibilityRole="alert">
            {t('valuations.loadFailed')}
          </Text>
        ) : (
          <ValuationList account={account} valuations={valuations.data} canManage={canManage} />
        )}
      </ScrollScreen>
    </>
  );
}
