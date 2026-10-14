import { ApiError } from '@daric/api-client';
import type { Account } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { currencyOf } from '../accounts/accounts';
import { useSignedIn } from '../auth/session';
import { useFormatters } from '../display/formatters';
import { CALENDAR_LABELS } from '../display/labels';
import { useI18n } from '../i18n/locale';
import { Button } from '../ui/Button';
import { Heading } from '../ui/Card';
import { Field } from '../ui/Field';
import { FormMessage } from '../ui/Form';
import { readValuationDraft } from './form';
import type { ValuationDraft, ValuationErrors } from './form';
import { useCreateValuation } from './net-worth';

/**
 * Enters what `account` is worth on a day, in its currency, typed as money is
 * shown. Today by default. Sent at once: it needs the API.
 */
export function ValuationForm({ account }: { account: Account }) {
  const { t } = useI18n();
  const format = useFormatters();
  const { me, workspace } = useSignedIn();
  const { displayCalendar } = me.preferences;
  const currency = currencyOf(account);
  const amountRef = useRef<TextInput>(null);
  const dayRef = useRef<TextInput>(null);
  const [draft, setDraft] = useState<ValuationDraft>(() => ({
    amount: '',
    day: format.day(format.today(new Date())),
  }));
  const [errors, setErrors] = useState<ValuationErrors>({});
  const [problem, setProblem] = useState<PlainMessageKey>();
  const create = useCreateValuation(account.id);

  function change(next: Partial<ValuationDraft>) {
    create.reset();
    setProblem(undefined);
    setDraft((current) => ({ ...current, ...next }));
  }

  function submit() {
    if (create.isPending) return;
    const read = readValuationDraft(draft, {
      currency,
      moneyDisplay: workspace.moneyDisplay,
      displayCalendar,
    });
    if (!read.ok) {
      setErrors(read.errors);
      (read.errors.amount ? amountRef : dayRef).current?.focus();
      return;
    }
    setErrors({});
    create.mutate(read.fields, {
      onSuccess: () => change({ amount: '' }),
      // A 409 means the Account already has a Valuation that day.
      onError: (error) =>
        setProblem(
          error instanceof ApiError && error.status === 409
            ? 'valuations.error.dayTaken'
            : 'settings.saveFailed',
        ),
    });
  }

  return (
    <>
      <Heading>{t('valuations.form.title')}</Heading>
      <Field
        ref={amountRef}
        label={t('valuations.form.amount')}
        hint={t('valuations.form.amountHint', { unit: format.currency(currency) })}
        error={errors.amount && t(errors.amount)}
        value={draft.amount}
        onChangeText={(amount) => change({ amount })}
        keyboardType="decimal-pad"
        returnKeyType="next"
        onSubmitEditing={() => dayRef.current?.focus()}
      />
      <Field
        ref={dayRef}
        label={t('valuations.form.day')}
        hint={t('valuations.form.dayHint', { calendar: t(CALENDAR_LABELS[displayCalendar]) })}
        error={errors.day && t(errors.day)}
        value={draft.day}
        onChangeText={(day) => change({ day })}
        keyboardType="numbers-and-punctuation"
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <FormMessage message={problem && t(problem)} />
      <Button
        primary
        label={t('valuations.form.create')}
        onPress={submit}
        disabled={create.isPending}
      />
    </>
  );
}
