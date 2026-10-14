import { currencyByCode, hasRole, money } from '@daric/core';
import { nativeTheme } from '@daric/design-tokens';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSignedIn } from '../auth/session';
import { useCurrencyList, useFormatters } from '../display/formatters';
import { useI18n } from '../i18n/locale';
import { Button } from '../ui/Button';
import { Card, Heading, Rows } from '../ui/Card';
import { FormMessage } from '../ui/Form';
import { ListRow } from '../ui/ListRow';
import { Text } from '../ui/Text';
import { Toggle } from '../ui/Toggle';
import { HistoryChart } from './HistoryChart';
import { useNetWorthHistory, useTakeSnapshot } from './net-worth';

/**
 * The Net Worth Snapshots in the current Base Currency, as a chart with the
 * same numbers in a list; Members and above can take one of today.
 */
export function NetWorthHistory() {
  const { t } = useI18n();
  const format = useFormatters();
  const currencyList = useCurrencyList();
  const { workspace } = useSignedIn();
  const history = useNetWorthHistory();
  const take = useTakeSnapshot();
  const [outcome, setOutcome] = useState<'taken' | 'failed'>();
  const [listed, setListed] = useState(false);
  const canTake = hasRole(workspace.role, 'MEMBER');

  // A total in another Base Currency cannot sit on the same scale.
  const all = history.data ?? [];
  const snapshots = all.filter((s) => s.baseCurrency === workspace.baseCurrency);
  const otherBase = all.length - snapshots.length;

  return (
    <View style={styles.section}>
      <Heading>{t('netWorth.history')}</Heading>
      <Text size="sm" tone="foregroundMuted">
        {t('netWorth.historyIntro')}
      </Text>
      {canTake && (
        <Button
          label={take.isPending ? t('netWorth.taking') : t('netWorth.takeSnapshot')}
          disabled={take.isPending}
          onPress={() => {
            setOutcome(undefined);
            take.mutate(undefined, {
              onSuccess: () => setOutcome('taken'),
              onError: () => setOutcome('failed'),
            });
          }}
        />
      )}
      <FormMessage
        tone="success"
        message={outcome === 'taken' ? t('netWorth.snapshotTaken') : undefined}
      />
      <FormMessage message={outcome === 'failed' ? t('netWorth.snapshotFailed') : undefined} />
      {history.isPending ? (
        <Text tone="foregroundMuted">{t('session.loading')}</Text>
      ) : !history.data ? (
        <Text tone="danger" accessibilityRole="alert">
          {t('netWorth.historyLoadFailed')}
        </Text>
      ) : snapshots.length === 0 ? (
        <Text tone="foregroundMuted">{t('netWorth.historyEmpty')}</Text>
      ) : (
        <Card>
          <HistoryChart snapshots={snapshots} baseCurrency={workspace.baseCurrency} />
          <Toggle label={t('netWorth.showTable')} value={listed} onChange={setListed} />
          {listed && (
            <Rows>
              {/* Newest first, like the app's other lists. */}
              {[...snapshots].reverse().map((s) => {
                const base = currencyByCode(s.baseCurrency);
                const shown = (amount: bigint) => format.money(money(amount, base));
                return (
                  <ListRow
                    key={s.id}
                    title={format.day(s.day)}
                    trailing={shown(s.total)}
                    lines={[
                      t(`netWorth.kind.${s.kind}`),
                      t('netWorth.currencyDetail', {
                        assets: shown(s.assets),
                        liabilities: shown(s.liabilities),
                      }),
                      s.missing.length > 0 &&
                        t('netWorth.incomplete', {
                          currencies: currencyList(s.missing),
                        }),
                    ]}
                  />
                );
              })}
            </Rows>
          )}
        </Card>
      )}
      {otherBase > 0 && (
        <Text size="sm" tone="foregroundMuted">
          {t('netWorth.otherBase', { count: format.count(otherBase) })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: nativeTheme.space(3) },
});
