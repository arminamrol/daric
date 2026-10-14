import { budgetPeriods, findCurrency, IRR, money } from '@daric/core';
import type { Budget, BudgetPeriod } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { useSignedIn } from '../auth/session';
import { categoryChoices, useCategories } from '../categories/categories';
import { created, deleted, edited, newId, refusedWith, useWrite } from '../data/writes';
import { useFormatters } from '../display/formatters';
import { changedFields } from '../forms/changes';
import { useI18n } from '../i18n/locale';
import { useLabels } from '../labels/labels';
import { Button } from '../ui/Button';
import { Choices } from '../ui/Choices';
import { Field } from '../ui/Field';
import { FormMessage, FormScroll, FormSection } from '../ui/Form';
import { Text } from '../ui/Text';
import { readBudgetDraft } from './form';
import type { BudgetDraft, BudgetErrors } from './form';

const ANY_LABEL = '';

/**
 * Sets a limit on an active Expense Category (a parent includes its
 * children), optionally narrowed to an active Label, per month or year; or
 * changes or deletes `budget`. An archived Category or Label it already has
 * may stay. The limit is typed as shown, in the Budget's currency.
 */
export function BudgetForm({ budget }: { budget?: Budget }) {
  const { t } = useI18n();
  const format = useFormatters();
  const router = useRouter();
  const { workspace } = useSignedIn();
  const categories = useCategories();
  const labels = useLabels();
  const amountRef = useRef<TextInput>(null);
  const currency = findCurrency(budget?.currency ?? workspace.baseCurrency) ?? IRR;
  const [draft, setDraft] = useState<BudgetDraft>(() => ({
    categoryId: budget?.categoryId,
    labelId: budget?.labelId ?? null,
    period: budget?.period ?? 'MONTHLY',
    amount: budget
      ? format.money(money(budget.amount, currency), { label: false, grouping: false })
      : '',
  }));
  const [errors, setErrors] = useState<BudgetErrors>({});
  const [problem, setProblem] = useState<PlainMessageKey>();
  const save = useWrite();

  const categoryOptions = useMemo(
    () =>
      categoryChoices(
        (categories.data ?? []).filter(
          (c) => c.kind === 'EXPENSE' && (!c.archived || c.id === budget?.categoryId),
        ),
        t,
      ),
    [categories.data, budget, t],
  );
  const labelOptions = (labels.data ?? []).filter((l) => !l.archived || l.id === budget?.labelId);

  function change(next: Partial<BudgetDraft>) {
    save.reset();
    setProblem(undefined);
    setDraft((current) => ({ ...current, ...next }));
  }

  const options = {
    onSuccess: () => router.back(),
    // A 409 means this Category already has a Budget for the Label and Period.
    onError: (error: Error) =>
      setProblem(refusedWith(error, 409) ? 'budgets.error.taken' : 'settings.saveFailed'),
  };

  function submit() {
    if (save.isPending) return;
    const read = readBudgetDraft(draft, { currency, moneyDisplay: workspace.moneyDisplay });
    if (!read.ok) {
      setErrors(read.errors);
      if (read.errors.amount) amountRef.current?.focus();
      return;
    }
    setErrors({});
    if (!budget) {
      save.mutate(created(newId(), { entity: 'budget', fields: read.fields }), options);
      return;
    }
    const changes = changedFields(budget, read.fields);
    if (Object.keys(changes).length === 0) return router.back();
    save.mutate(edited(budget.id, { entity: 'budget', fields: changes }), options);
  }

  return (
    <FormScroll>
      {categoryOptions.length > 0 ? (
        <Choices
          label={t('budgets.form.category')}
          choices={categoryOptions}
          selected={draft.categoryId}
          onSelect={(categoryId) => change({ categoryId })}
          error={errors.category && t(errors.category)}
        />
      ) : (
        <Text tone="foregroundMuted">{t('transactions.form.noCategory')}</Text>
      )}
      <Text size="sm" tone="foregroundMuted">
        {t('budgets.form.categoryHint')}
      </Text>
      <Choices
        label={t('budgets.form.label')}
        choices={[
          { id: ANY_LABEL, label: t('budgets.form.anyLabel') },
          ...labelOptions.map((l) => ({ id: l.id, label: l.name })),
        ]}
        selected={draft.labelId ?? ANY_LABEL}
        onSelect={(id) => change({ labelId: id === ANY_LABEL ? null : id })}
      />
      <Text size="sm" tone="foregroundMuted">
        {t('budgets.form.labelHint')}
      </Text>
      <Choices
        label={t('budgets.form.period')}
        choices={budgetPeriods.map((p) => ({ id: p, label: t(`budgets.period.${p}`) }))}
        selected={draft.period}
        onSelect={(id) => change({ period: id as BudgetPeriod })}
      />
      <Field
        ref={amountRef}
        label={t('budgets.form.amount')}
        hint={t('budgets.form.amountHint', { unit: format.currency(currency) })}
        error={errors.amount && t(errors.amount)}
        value={draft.amount}
        onChangeText={(amount) => change({ amount })}
        keyboardType="decimal-pad"
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <FormMessage message={problem && t(problem)} />
      <Button
        primary
        label={t(budget ? 'budgets.form.save' : 'budgets.form.create')}
        onPress={submit}
        disabled={save.isPending}
      />
      {budget && (
        <FormSection>
          <Button
            label={t('budgets.form.delete')}
            disabled={save.isPending}
            onPress={() => save.mutate(deleted('budget', budget.id), options)}
          />
          <Text size="sm" tone="foregroundMuted">
            {t('budgets.form.deleteHint')}
          </Text>
        </FormSection>
      )}
    </FormScroll>
  );
}
