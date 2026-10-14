import { money } from '@daric/core';
import type { Account, DueOccurrence } from '@daric/core';
import { nativeTheme } from '@daric/design-tokens';
import { isolate } from '@daric/i18n';
import type { PlainMessageKey } from '@daric/i18n';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { currencyOf } from '../accounts/accounts';
import { useSignedIn } from '../auth/session';
import { created, useWrite } from '../data/writes';
import { useFormatters } from '../display/formatters';
import { readAmount } from '../forms/amount';
import { useI18n } from '../i18n/locale';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { FormMessage } from '../ui/Form';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/theme';

/** What the last confirm or skip did, said once. */
type Outcome = { key: 'due.confirmed' | 'due.skipped'; name: string } | { key: 'due.failed' };

/**
 * The Due Occurrences, oldest first, each waiting for a one-tap confirmation
 * with an Amount that can be changed first, or to be skipped. A Viewer only
 * sees them. Confirming or skipping offline takes it off the list at once.
 */
export function DueOccurrences({
  occurrences,
  accounts,
  canConfirm,
}: {
  occurrences: readonly DueOccurrence[];
  /** Archived ones included, to name and price every occurrence. */
  accounts: readonly Account[];
  canConfirm: boolean;
}) {
  const { t } = useI18n();
  const [outcome, setOutcome] = useState<Outcome>();
  return (
    <View style={styles.section}>
      <Text size="lg" bold accessibilityRole="header">
        {t('due.title')}
      </Text>
      <FormMessage
        tone={outcome?.key === 'due.failed' ? 'danger' : 'success'}
        message={
          outcome &&
          (outcome.key === 'due.failed'
            ? t('due.failed')
            : t(outcome.key, { name: isolate(outcome.name) }))
        }
      />
      {occurrences.length === 0 ? (
        <Text tone="foregroundMuted">{t('due.empty')}</Text>
      ) : (
        occurrences.map((occurrence) => (
          <DueItem
            key={`${occurrence.ruleId}:${occurrence.dueOn}`}
            occurrence={occurrence}
            account={accounts.find((a) => a.id === occurrence.accountId)}
            canConfirm={canConfirm}
            onDone={setOutcome}
          />
        ))
      )}
    </View>
  );
}

function DueItem({
  occurrence,
  account,
  canConfirm,
  onDone,
}: {
  occurrence: DueOccurrence;
  account: Account | undefined;
  canConfirm: boolean;
  onDone: (outcome: Outcome) => void;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const currency = currencyOf(account);
  const shown = (amount: bigint, label = true) =>
    format.money(money(amount, currency), { label, grouping: label });
  const [amount, setAmount] = useState(() => shown(occurrence.amount, false));
  const [error, setError] = useState<PlainMessageKey>();
  const write = useWrite();
  const { ruleId, dueOn, name } = occurrence;
  const key = `${ruleId}:${dueOn}`;
  const day = format.day(dueOn);
  const failed = () => onDone({ key: 'due.failed' });

  function confirm() {
    const read = readAmount(
      amount,
      { currency, moneyDisplay: workspace.moneyDisplay },
      {
        required: 'transactions.error.amountRequired',
        positive: 'transactions.error.amountPositive',
      },
    );
    setError(read.ok ? undefined : read.error);
    if (!read.ok) return;
    write.mutate(
      created(key, {
        entity: 'occurrence',
        fields: { ruleId, dueOn, action: 'confirm', amount: read.amount },
      }),
      { onSuccess: () => onDone({ key: 'due.confirmed', name }), onError: failed },
    );
  }

  function skip() {
    write.mutate(
      created(key, { entity: 'occurrence', fields: { ruleId, dueOn, action: 'skip' } }),
      {
        onSuccess: () => onDone({ key: 'due.skipped', name }),
        onError: failed,
      },
    );
  }

  const label = t('due.item', { name: isolate(name), date: isolate(day) });
  return (
    <View
      accessibilityLabel={
        canConfirm ? undefined : [label, shown(occurrence.amount)].join(t('list.separator'))
      }
      accessible={!canConfirm}
      style={[styles.item, { borderColor: colors.border, backgroundColor: colors.surface }]}
    >
      <View style={styles.head}>
        <Text bold style={styles.grow}>
          {name}
        </Text>
        {!canConfirm && <Text bold>{shown(occurrence.amount)}</Text>}
      </View>
      <Text size="sm" tone="foregroundMuted">
        {[day, account?.name].filter(Boolean).join(' · ')}
      </Text>
      {canConfirm && (
        <>
          <Field
            label={t('transactions.form.amount')}
            hint={label}
            error={error && t(error)}
            value={amount}
            onChangeText={(text) => {
              setError(undefined);
              setAmount(text);
            }}
            keyboardType="decimal-pad"
            returnKeyType="done"
            onSubmitEditing={confirm}
          />
          <View style={styles.actions}>
            <View style={styles.grow}>
              <Button
                primary
                label={t('due.confirm')}
                accessibilityHint={label}
                onPress={confirm}
                disabled={write.isPending}
              />
            </View>
            <View style={styles.grow}>
              <Button
                label={t('due.skip')}
                accessibilityHint={label}
                onPress={skip}
                disabled={write.isPending}
              />
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: nativeTheme.space(3) },
  item: {
    gap: nativeTheme.space(2),
    padding: nativeTheme.space(3),
    borderRadius: nativeTheme.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: nativeTheme.space(2) },
  actions: { flexDirection: 'row', gap: nativeTheme.space(2) },
  grow: { flex: 1 },
});
