import { money, recurrenceFrequencies } from '@daric/core';
import type { Account, Category, RecurrenceFrequency, RecurringRule } from '@daric/core';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { TextInput } from 'react-native';
import { currencyOf } from '../accounts/accounts';
import { useSignedIn } from '../auth/session';
import { categoryChoices } from '../categories/categories';
import { created, edited, newId, useWrite } from '../data/writes';
import { useFormatters } from '../display/formatters';
import { CALENDAR_LABELS } from '../display/labels';
import { changedFields } from '../forms/changes';
import { useI18n } from '../i18n/locale';
import { Button } from '../ui/Button';
import { Choices } from '../ui/Choices';
import { Field } from '../ui/Field';
import { FormMessage, FormScroll, FormSection } from '../ui/Form';
import { Text } from '../ui/Text';
import { Toggle } from '../ui/Toggle';
import { readRuleDraft } from './form';
import type { RuleDraft, RuleErrors, RuleField } from './form';

const TYPES: readonly RuleDraft['type'][] = ['EXPENSE', 'INCOME'];
const FIELD_ORDER: readonly RuleField[] = [
  'name',
  'category',
  'amount',
  'interval',
  'start',
  'end',
];

/**
 * Makes a Recurring Rule, or changes and archives `rule`. The Amount is in
 * the Account's currency, typed as shown; days are typed in the display
 * calendar, while the rule repeats on the Workspace Calendar.
 */
export function RuleForm({
  rule,
  accounts,
  categories,
}: {
  rule?: RecurringRule;
  /** Archived ones are offered only when `rule` is on them; the same goes for Categories. */
  accounts: readonly Account[];
  categories: readonly Category[];
}) {
  const { t } = useI18n();
  const format = useFormatters();
  const router = useRouter();
  const { me, workspace } = useSignedIn();
  const { displayCalendar } = me.preferences;
  const nameRef = useRef<TextInput>(null);
  const amountRef = useRef<TextInput>(null);
  const intervalRef = useRef<TextInput>(null);
  const startRef = useRef<TextInput>(null);
  const endRef = useRef<TextInput>(null);
  const offeredAccounts = accounts.filter((a) => !a.archived || a.id === rule?.accountId);
  const [draft, setDraft] = useState<RuleDraft>(() => {
    const account = offeredAccounts.find((a) => a.id === rule?.accountId) ?? offeredAccounts[0];
    return {
      name: rule?.name ?? '',
      type: rule?.type === 'INCOME' ? 'INCOME' : 'EXPENSE',
      accountId: account?.id,
      categoryId: rule?.categoryId,
      amount: rule
        ? format.money(money(rule.amount, currencyOf(account)), { label: false, grouping: false })
        : '',
      frequency: rule?.frequency ?? 'MONTHLY',
      interval: format.count(rule?.interval ?? 1),
      start: format.day(rule?.startOn ?? format.today(new Date())),
      end: rule?.endOn ? format.day(rule.endOn) : '',
      autoPost: rule?.autoPost ?? false,
    };
  });
  const [errors, setErrors] = useState<RuleErrors>({});
  const save = useWrite();
  const account = offeredAccounts.find((a) => a.id === draft.accountId);
  const currency = currencyOf(account);

  const categoryOptions = useMemo(
    () =>
      categoryChoices(
        categories.filter(
          (c) => c.kind === draft.type && (!c.archived || c.id === rule?.categoryId),
        ),
        t,
      ),
    [categories, draft.type, rule, t],
  );

  function change(next: Partial<RuleDraft>) {
    save.reset();
    setDraft((current) => ({ ...current, ...next }));
  }

  function submit() {
    if (save.isPending) return;
    const categoryId = categoryOptions.some((c) => c.id === draft.categoryId)
      ? draft.categoryId
      : undefined;
    const read = readRuleDraft(
      { ...draft, categoryId },
      { currency, moneyDisplay: workspace.moneyDisplay, displayCalendar },
    );
    if (!read.ok) {
      setErrors(read.errors);
      // The Category is picked, not typed: there is no field to focus.
      const refs: Partial<Record<RuleField, RefObject<TextInput | null>>> = {
        name: nameRef,
        amount: amountRef,
        interval: intervalRef,
        start: startRef,
        end: endRef,
      };
      const first = FIELD_ORDER.find((field) => read.errors[field]);
      if (first) refs[first]?.current?.focus();
      return;
    }
    setErrors({});
    const done = { onSuccess: () => router.back() };
    if (!rule) {
      save.mutate(created(newId(), { entity: 'recurringRule', fields: read.fields }), done);
      return;
    }
    const changes = changedFields(rule, read.fields);
    if (Object.keys(changes).length === 0) return router.back();
    save.mutate(edited(rule.id, { entity: 'recurringRule', fields: changes }), done);
  }

  return (
    <FormScroll>
      <Field
        ref={nameRef}
        autoFocus={!rule}
        label={t('recurring.form.name')}
        hint={t('recurring.form.nameHint')}
        error={errors.name && t(errors.name)}
        value={draft.name}
        onChangeText={(name) => change({ name })}
        maxLength={100}
      />
      <Choices
        label={t('recurring.form.type')}
        choices={TYPES.map((type) => ({ id: type, label: t(`transactions.type.${type}`) }))}
        selected={draft.type}
        onSelect={(id) => change({ type: id as RuleDraft['type'], categoryId: undefined })}
      />
      <Choices
        label={t('transactions.form.account')}
        choices={offeredAccounts.map((a) => ({ id: a.id, label: a.name }))}
        selected={draft.accountId}
        onSelect={(accountId) => change({ accountId })}
      />
      {categoryOptions.length > 0 ? (
        <Choices
          label={t('transactions.form.category')}
          choices={categoryOptions}
          selected={draft.categoryId}
          onSelect={(categoryId) => change({ categoryId })}
          error={errors.category && t(errors.category)}
        />
      ) : (
        <Text tone="foregroundMuted">{t('transactions.form.noCategory')}</Text>
      )}
      <Field
        ref={amountRef}
        label={t('transactions.form.amount')}
        hint={t('recurring.form.amountHint', { unit: format.currency(currency) })}
        error={errors.amount && t(errors.amount)}
        value={draft.amount}
        onChangeText={(amount) => change({ amount })}
        keyboardType="decimal-pad"
      />
      <Choices
        label={t('recurring.form.frequency')}
        choices={recurrenceFrequencies.map((f) => ({
          id: f,
          label: t(`recurring.frequency.${f}`),
        }))}
        selected={draft.frequency}
        onSelect={(id) => change({ frequency: id as RecurrenceFrequency })}
      />
      <Field
        ref={intervalRef}
        label={t('recurring.form.interval')}
        hint={t('recurring.form.intervalHint')}
        error={errors.interval && t(errors.interval)}
        value={draft.interval}
        onChangeText={(interval) => change({ interval })}
        keyboardType="number-pad"
      />
      <Field
        ref={startRef}
        label={t('recurring.form.start')}
        hint={t('transactions.form.dayHint', {
          calendar: t(CALENDAR_LABELS[displayCalendar]),
        })}
        error={errors.start && t(errors.start)}
        value={draft.start}
        onChangeText={(start) => change({ start })}
        keyboardType="numbers-and-punctuation"
      />
      <Field
        ref={endRef}
        label={t('recurring.form.end')}
        hint={t('recurring.form.endHint')}
        error={errors.end && t(errors.end)}
        value={draft.end}
        onChangeText={(end) => change({ end })}
        keyboardType="numbers-and-punctuation"
      />
      <Toggle
        label={t('recurring.form.autoPost')}
        hint={t('recurring.form.autoPostHint')}
        value={draft.autoPost}
        onChange={(autoPost) => change({ autoPost })}
      />
      <FormMessage message={save.isError ? t('settings.saveFailed') : undefined} />
      <Button
        primary
        label={t(rule ? 'recurring.form.save' : 'recurring.form.create')}
        onPress={submit}
        disabled={save.isPending || !account}
      />
      {rule && (
        <FormSection>
          <Toggle
            label={t('recurring.form.archive')}
            hint={t('recurring.form.archiveHint')}
            value={rule.archived}
            disabled={save.isPending}
            onChange={(archived) =>
              save.mutate(edited(rule.id, { entity: 'recurringRule', fields: { archived } }), {
                onSuccess: () => router.back(),
              })
            }
          />
        </FormSection>
      )}
    </FormScroll>
  );
}
