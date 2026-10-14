import { accountClasses, currencyByCode, money } from '@daric/core';
import type { NetWorthReport } from '@daric/core';
import { nativeTheme } from '@daric/design-tokens';
import { isolate } from '@daric/i18n';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSignedIn } from '../../../auth/session';
import { useFormatters } from '../../../display/formatters';
import { useI18n } from '../../../i18n/locale';
import { NetWorthHistory } from '../../../net-worth/NetWorthHistory';
import { useNetWorth, useNetWorthHistory } from '../../../net-worth/net-worth';
import { Card, Figure, Heading, Rows } from '../../../ui/Card';
import { ScreenHeader } from '../../../ui/HeaderButton';
import { ListRow } from '../../../ui/ListRow';
import { RateNotes } from '../../../ui/RateNotes';
import { ScrollScreen } from '../../../ui/ScrollScreen';
import { Text } from '../../../ui/Text';

function Breakdown({ netWorth }: { netWorth: NetWorthReport }) {
  const { t } = useI18n();
  const format = useFormatters();
  const router = useRouter();
  const base = currencyByCode(netWorth.baseCurrency);
  const inBase = (amount: bigint) => format.money(money(amount, base));
  // An archived Account with nothing in it adds nothing worth showing.
  const shown = netWorth.accounts.filter((a) => !a.archived || a.value !== 0n);

  return (
    <>
      <Card>
        <Figure large label={t('netWorth.total')} value={inBase(netWorth.total)} />
        <Figure inline label={t('netWorth.assets')} value={inBase(netWorth.assets)} />
        <Figure inline label={t('netWorth.liabilities')} value={inBase(netWorth.liabilities)} />
        <RateNotes ratesUsed={netWorth.ratesUsed} missing={netWorth.missing} day={netWorth.day} />
      </Card>
      {netWorth.byCurrency.length > 1 && (
        <View style={styles.section}>
          <Heading>{t('totals.byCurrency')}</Heading>
          <Rows>
            {netWorth.byCurrency.map((c) => {
              const currency = currencyByCode(c.currency);
              const amount = (value: bigint) => isolate(format.money(money(value, currency)));
              return (
                <ListRow
                  key={c.currency}
                  title={t('netWorth.currencyLine', {
                    currency: format.currency(currency),
                    net: amount(c.net),
                  })}
                  lines={[
                    t('netWorth.currencyDetail', {
                      assets: amount(c.assets),
                      liabilities: amount(c.liabilities),
                    }),
                  ]}
                />
              );
            })}
          </Rows>
        </View>
      )}
      {accountClasses.map((accountClass) => {
        const inClass = shown.filter((a) => a.class === accountClass);
        if (inClass.length === 0) return null;
        return (
          <View key={accountClass} style={styles.section}>
            <Heading>{t(`accounts.group.${accountClass}`)}</Heading>
            <Rows>
              {inClass.map((account) => {
                const currency = currencyByCode(account.currency);
                return (
                  <ListRow
                    key={account.accountId}
                    title={account.name}
                    trailing={format.money(money(account.value, currency))}
                    lines={[
                      account.valuedOn
                        ? t('netWorth.valuedOn', { day: isolate(format.day(account.valuedOn)) })
                        : t('netWorth.balance'),
                      account.archived && t('accounts.archived'),
                      currency.code !== base.code &&
                        (account.inBase === null
                          ? t('netWorth.noRate')
                          : t('netWorth.inBase', { amount: isolate(inBase(account.inBase)) })),
                    ]}
                    actionLabel={t('valuations.title', { name: isolate(account.name) })}
                    onPress={() => router.push(`/net-worth/${account.accountId}`)}
                  />
                );
              })}
            </Rows>
          </View>
        );
      })}
    </>
  );
}

/** Net Worth today by Account, and its history; each Account opens its Valuations. */
export default function NetWorthScreen() {
  const { t } = useI18n();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const netWorth = useNetWorth();
  const history = useNetWorthHistory();

  return (
    <>
      <ScreenHeader title={t('netWorth.title')} />
      <ScrollScreen
        refreshing={netWorth.isRefetching || history.isRefetching}
        onRefresh={() => void Promise.all([netWorth.refetch(), history.refetch()])}
      >
        <Text size="sm" tone="foregroundMuted">
          {t('netWorth.intro', {
            day: isolate(format.day(netWorth.data?.day ?? format.today(new Date()))),
            base: format.currency(currencyByCode(workspace.baseCurrency)),
          })}
        </Text>
        {netWorth.isPending ? (
          <Text tone="foregroundMuted">{t('session.loading')}</Text>
        ) : !netWorth.data ? (
          <Text tone="danger" accessibilityRole="alert">
            {t('netWorth.loadFailed')}
          </Text>
        ) : netWorth.data.accounts.length === 0 ? (
          <Text tone="foregroundMuted">{t('accounts.empty')}</Text>
        ) : (
          <Breakdown netWorth={netWorth.data} />
        )}
        <NetWorthHistory />
      </ScrollScreen>
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: nativeTheme.space(2) },
});
