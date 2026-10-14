import { currencyByCode, money, plannedItemKinds } from '@daric/core';
import type { PlannedItem, PlannedItemKind } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { TextInput } from 'react-native';
import { useSignedIn } from '../auth/session';
import { categoryChoices, useCategories } from '../categories/categories';
import { useFormatters } from '../display/formatters';
import { CALENDAR_LABELS } from '../display/labels';
import { changedFields } from '../forms/changes';
import { useI18n } from '../i18n/locale';
import { Button } from '../ui/Button';
import { Choices } from '../ui/Choices';
import { Field } from '../ui/Field';
import { FormMessage, FormScroll, FormSection } from '../ui/Form';
import { Text } from '../ui/Text';
import { readPlannedItemDraft } from './form';
import type { PlannedItemDraft, PlannedItemErrors, PlannedItemField } from './form';
import { useCreatePlannedItem, useDeletePlannedItem, useUpdatePlannedItem } from './projection';

/** Expense first: it is what people plan most. */
const TYPES: readonly PlannedItemDraft['type'][] = ['EXPENSE', 'INCOME'];
const NO_CATEGORY = '';

/**
 * Makes a Planned Item, or changes and deletes `item`. Its kind and type stay
 * as made. The Amount is in the Base Currency (the item's own once made),
 * typed as shown; days are typed in the display calendar. Sent at once: the
 * Projection it changes is worked out by the API.
 */
export function PlannedItemForm({ item }: { item?: PlannedItem }) {
  const { t } = useI18n();
  const format = useFormatters();
  const router = useRouter();
  const { me, workspace } = useSignedIn();
  const { displayCalendar } = me.preferences;
  const categories = useCategories();
  const currency = currencyByCode(item?.currency ?? workspace.baseCurrency);
  const nameRef = useRef<TextInput>(null);
  const amountRef = useRef<TextInput>(null);
  const startRef = useRef<TextInput>(null);
  const endRef = useRef<TextInput>(null);
  const [draft, setDraft] = useState<PlannedItemDraft>(() => ({
    name: item?.name ?? '',
    kind: item?.kind ?? 'FIXED_MONTHLY',
    type: item?.type ?? 'EXPENSE',
    categoryId: item?.categoryId ?? null,
    amount: item
      ? format.money(money(item.amount, currency), { label: false, grouping: false })
      : '',
    start: format.day(item?.startOn ?? format.today(new Date())),
    end: item?.endOn ? format.day(item.endOn) : '',
  }));
  const [errors, setErrors] = useState<PlannedItemErrors>({});
  const [problem, setProblem] = useState<PlainMessageKey>();
  const create = useCreatePlannedItem();
  const update = useUpdatePlannedItem(item?.id ?? '');
  const remove = useDeletePlannedItem(item?.id ?? '');
  const busy = create.isPending || update.isPending || remove.isPending;
  const monthly = draft.kind === 'FIXED_MONTHLY';

  // Archived ones only when the item is already in one.
  const categoryOptions = useMemo(
    () =>
      categoryChoices(
        (categories.data ?? []).filter(
          (c) => c.kind === draft.type && (!c.archived || c.id === item?.categoryId),
        ),
        t,
      ),
    [categories.data, draft.type, item, t],
  );

  function change(next: Partial<PlannedItemDraft>) {
    setProblem(undefined);
    setDraft((current) => ({ ...current, ...next }));
  }

  const options = {
    onSuccess: () => router.back(),
    onError: () => setProblem('settings.saveFailed'),
  };

  function submit() {
    if (busy) return;
    const read = readPlannedItemDraft(draft, {
      currency,
      moneyDisplay: workspace.moneyDisplay,
      displayCalendar,
      categoryIds: categoryOptions.map((c) => c.id),
    });
    if (!read.ok) {
      setErrors(read.errors);
      const refs: Partial<Record<PlannedItemField, RefObject<TextInput | null>>> = {
        name: nameRef,
        amount: amountRef,
        start: startRef,
        end: endRef,
      };
      const first = (['name', 'amount', 'start', 'end'] as const).find((f) => read.errors[f]);
      if (first) refs[first]?.current?.focus();
      return;
    }
    setErrors({});
    if (!item) {
      create.mutate({ ...read.fields, kind: draft.kind, type: draft.type }, options);
      return;
    }
    // Only real changes, so the audit log names them.
    const changes = changedFields(item, read.fields);
    if (Object.keys(changes).length === 0) return router.back();
    update.mutate(changes, options);
  }

  return (
    <FormScroll>
      <Field
        ref={nameRef}
        label={t('plannedItems.form.name')}
        hint={t('plannedItems.form.nameHint')}
        error={errors.name && t(errors.name)}
        value={draft.name}
        onChangeText={(name) => change({ name })}
        returnKeyType="next"
      />
      {!item && (
        <>
          <Choices
            label={t('plannedItems.form.kind')}
            choices={plannedItemKinds.map((id) => ({ id, label: t(`plannedItems.kind.${id}`) }))}
            selected={draft.kind}
            onSelect={(id) => change({ kind: id as PlannedItemKind })}
          />
          <Choices
            label={t('plannedItems.form.type')}
            choices={TYPES.map((id) => ({ id, label: t(`transactions.type.${id}`) }))}
            selected={draft.type}
            onSelect={(id) => change({ type: id as PlannedItemDraft['type'], categoryId: null })}
          />
        </>
      )}
      {categoryOptions.length > 0 || !monthly ? (
        <Choices
          label={t('transactions.form.category')}
          choices={[
            ...(monthly ? [] : [{ id: NO_CATEGORY, label: t('plannedItems.form.noCategory') }]),
            ...categoryOptions,
          ]}
          selected={draft.categoryId ?? (monthly ? undefined : NO_CATEGORY)}
          onSelect={(id) => change({ categoryId: id === NO_CATEGORY ? null : id })}
          error={errors.category && t(errors.category)}
        />
      ) : (
        <Text tone="foregroundMuted">{t('transactions.form.noCategory')}</Text>
      )}
      <Field
        ref={amountRef}
        label={t('transactions.form.amount')}
        hint={t('plannedItems.form.amountHint', { unit: format.currency(currency) })}
        error={errors.amount && t(errors.amount)}
        value={draft.amount}
        onChangeText={(amount) => change({ amount })}
        keyboardType="decimal-pad"
      />
      <Field
        ref={startRef}
        label={t(monthly ? 'plannedItems.form.start' : 'plannedItems.form.day')}
        hint={t('plannedItems.form.startHint', {
          calendar: t(CALENDAR_LABELS[displayCalendar]),
        })}
        error={errors.start && t(errors.start)}
        value={draft.start}
        onChangeText={(start) => change({ start })}
        keyboardType="numbers-and-punctuation"
      />
      {monthly && (
        <Field
          ref={endRef}
          label={t('plannedItems.form.end')}
          hint={t('plannedItems.form.endHint')}
          error={errors.end && t(errors.end)}
          value={draft.end}
          onChangeText={(end) => change({ end })}
          keyboardType="numbers-and-punctuation"
          returnKeyType="done"
          onSubmitEditing={submit}
        />
      )}
      <FormMessage message={problem && t(problem)} />
      <Button
        primary
        label={t(item ? 'plannedItems.form.save' : 'plannedItems.form.create')}
        onPress={submit}
        disabled={busy}
      />
      {item && (
        <FormSection>
          <Button
            label={t('plannedItems.form.delete')}
            disabled={busy}
            onPress={() => remove.mutate(undefined, options)}
          />
          <Text size="sm" tone="foregroundMuted">
            {t('plannedItems.form.deleteHint')}
          </Text>
        </FormSection>
      )}
    </FormScroll>
  );
}
