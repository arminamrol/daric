import { IRR } from '@daric/core';
import { nativeTheme } from '@daric/design-tokens';
import { isolate } from '@daric/i18n';
import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';
import type { TextInput } from 'react-native';
import { useSignedIn } from '../../auth/session';
import { useFormatters } from '../../display/formatters';
import { CALENDAR_LABELS } from '../../display/labels';
import { useI18n } from '../../i18n/locale';
import { readDraft } from '../../transactions/draft';
import type { Draft, DraftErrors } from '../../transactions/draft';
import { readLastPicks, writeLastPicks } from '../../transactions/last-picks';
import { currencyOf, useAccounts } from '../../accounts/accounts';
import { useCategories } from '../../categories/categories';
import { newId, useWrite } from '../../data/writes';
import { deviceSettings } from '../../storage/device-settings';
import { Button } from '../../ui/Button';
import { Choices } from '../../ui/Choices';
import { Field } from '../../ui/Field';
import { Status } from '../../ui/Screen';
import { Text } from '../../ui/Text';

/** Expense first: it is what people record most. */
const TYPES: readonly Draft['type'][] = ['EXPENSE', 'INCOME'];

/**
 * Fast entry of an Income or Expense: the amount is focused and the keyboard's
 * done key records it. The Account and Category last used on this phone are
 * picked to start with, the day is today, and after each one the amount and
 * note are cleared for the next. It is shown at once and sent now, or once
 * the phone is back online.
 */
export default function NewTransactionScreen() {
  const { t } = useI18n();
  const format = useFormatters();
  const { me, workspace } = useSignedIn();
  const accounts = useAccounts();
  const categories = useCategories();
  const record = useWrite();
  const amountRef = useRef<TextInput>(null);

  const [draft, setDraft] = useState((): Draft => {
    const last = readLastPicks(deviceSettings, workspace.id);
    return {
      id: newId(),
      type: 'EXPENSE',
      amount: '',
      accountId: last.accountId,
      categoryId: last.categoryIds?.EXPENSE,
      day: format.day(format.today(new Date())),
      note: '',
    };
  });
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saved, setSaved] = useState<'synced' | 'queued'>();

  const active = useMemo(() => accounts.data ?? [], [accounts.data]);
  const account = active.find((a) => a.id === draft.accountId) ?? active[0];
  const typeChoices = useMemo(
    () =>
      (categories.data ?? [])
        .filter((c) => c.kind === draft.type && !c.archived)
        .map((c) => {
          const parent = categories.data?.find((p) => p.id === c.parentId);
          return {
            id: c.id,
            label: parent
              ? t('transactions.categoryPath', {
                  parent: isolate(parent.name),
                  child: isolate(c.name),
                })
              : c.name,
          };
        }),
    [categories.data, draft.type, t],
  );
  const categoryId = typeChoices.some((c) => c.id === draft.categoryId)
    ? draft.categoryId
    : typeChoices[0]?.id;
  const currency = currencyOf(account);
  const unit =
    currency.code === IRR.code
      ? t(`settings.workspace.moneyDisplay.${workspace.moneyDisplay}`)
      : currency.code;

  if (accounts.isPending || categories.isPending) {
    return <Status message={t('session.loading')} />;
  }
  if (workspace.role === 'VIEWER') return <Status alert message={t('transactions.readOnly')} />;
  if (!account) return <Status alert message={t('transactions.noAccount')} />;

  function change(fields: Partial<Draft>) {
    // A changed draft is a new Transaction: sending it cannot clash with one sent before.
    setDraft((current) => ({ ...current, ...fields, id: newId() }));
    setSaved(undefined);
  }

  function submit() {
    if (record.isPending) return;
    const read = readDraft(
      { ...draft, accountId: account?.id, categoryId },
      {
        currency,
        moneyDisplay: workspace.moneyDisplay,
        displayCalendar: me.preferences.displayCalendar,
      },
    );
    if (!read.ok) {
      setErrors(read.errors);
      if (read.errors.amount) amountRef.current?.focus();
      return;
    }
    setErrors({});
    const { input } = read;
    record.mutate(
      { kind: 'create', entityId: draft.id, payload: { ...input, id: draft.id } },
      {
        onSuccess: (outcome) => {
          // Read again: an earlier save on this screen may have picked for the other type.
          const { categoryIds } = readLastPicks(deviceSettings, workspace.id);
          writeLastPicks(deviceSettings, workspace.id, {
            accountId: input.accountId,
            categoryIds: { ...categoryIds, [input.type]: input.categoryId },
          });
          setDraft((current) => ({ ...current, id: newId(), amount: '', note: '' }));
          setSaved(outcome);
          amountRef.current?.focus();
        },
      },
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.fill}>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Choices
          label={t('transactions.form.type')}
          choices={TYPES.map((type) => ({ id: type, label: t(`transactions.type.${type}`) }))}
          selected={draft.type}
          onSelect={(id) => {
            const type = id as Draft['type'];
            const { categoryIds } = readLastPicks(deviceSettings, workspace.id);
            change({ type, categoryId: categoryIds?.[type] });
          }}
        />
        <Field
          ref={amountRef}
          autoFocus
          label={t('transactions.form.amount')}
          hint={t('transactions.form.amountHint', { unit })}
          error={errors.amount && t(errors.amount)}
          value={draft.amount}
          onChangeText={(amount) => change({ amount })}
          keyboardType="decimal-pad"
          returnKeyType="done"
          onSubmitEditing={submit}
          style={styles.amount}
        />
        <Choices
          label={t('transactions.form.account')}
          choices={active.map((a) => ({ id: a.id, label: a.name }))}
          selected={account.id}
          onSelect={(accountId) => change({ accountId })}
        />
        {typeChoices.length > 0 ? (
          <Choices
            label={t('transactions.form.category')}
            choices={typeChoices}
            selected={categoryId}
            onSelect={(id) => change({ categoryId: id })}
            error={errors.category && t(errors.category)}
          />
        ) : (
          <Text tone="foregroundMuted">{t('transactions.form.noCategory')}</Text>
        )}
        <Field
          label={t('transactions.form.day')}
          hint={t('transactions.form.dayHint', {
            calendar: t(CALENDAR_LABELS[me.preferences.displayCalendar]),
          })}
          error={errors.day && t(errors.day)}
          value={draft.day}
          onChangeText={(day) => change({ day })}
          keyboardType="numbers-and-punctuation"
        />
        <Field
          label={t('transactions.form.note')}
          value={draft.note}
          onChangeText={(note) => change({ note })}
          maxLength={1000}
          returnKeyType="done"
          onSubmitEditing={submit}
        />
        {saved && (
          <Text tone="success" accessibilityRole="alert" accessibilityLiveRegion="polite">
            {t(saved === 'synced' ? 'transactions.form.saved' : 'transactions.form.queued')}
          </Text>
        )}
        {record.isError && (
          <Text tone="danger" accessibilityRole="alert" accessibilityLiveRegion="assertive">
            {t('transactions.form.failed')}
          </Text>
        )}
        <Button
          primary
          label={t('transactions.form.submit')}
          onPress={submit}
          disabled={record.isPending}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  form: { gap: nativeTheme.space(4), padding: nativeTheme.space(4) },
  amount: { ...nativeTheme.text['2xl'] },
});
