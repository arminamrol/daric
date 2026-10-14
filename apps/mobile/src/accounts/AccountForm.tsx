import { accountClasses, accountTypes, currencies, defaultAccountClass, money } from '@daric/core';
import type { Account } from '@daric/core';
import { nativeTheme } from '@daric/design-tokens';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { TextInput } from 'react-native';
import { useSignedIn } from '../auth/session';
import { created, edited, newId, useWrite } from '../data/writes';
import { useFormatters } from '../display/formatters';
import { changedFields } from '../forms/changes';
import { useI18n } from '../i18n/locale';
import { Button } from '../ui/Button';
import { Choices } from '../ui/Choices';
import { Field } from '../ui/Field';
import { FormMessage, FormScroll, FormSection } from '../ui/Form';
import { Text } from '../ui/Text';
import { currencyOf } from './accounts';
import { readAccountDraft } from './form';
import type { AccountDraft, AccountErrors } from './form';

/**
 * Creates an Account, or edits and archives `account`. The opening balance is
 * typed as shown: in tomans when the Workspace shows IRR in tomans. Saved at
 * once on the phone and sent now, or once it is back online.
 */
export function AccountForm({ account }: { account?: Account }) {
  const { t } = useI18n();
  const format = useFormatters();
  const router = useRouter();
  const { workspace } = useSignedIn();
  const nameRef = useRef<TextInput>(null);
  const balanceRef = useRef<TextInput>(null);
  const [draft, setDraft] = useState<AccountDraft>(() =>
    account
      ? {
          name: account.name,
          type: account.type,
          class: account.class,
          currency: account.currency,
          openingBalance: format.money(money(account.openingBalance, currencyOf(account)), {
            label: false,
            grouping: false,
          }),
        }
      : {
          name: '',
          type: 'BANK',
          class: defaultAccountClass('BANK'),
          currency: currencies.some((c) => c.code === workspace.baseCurrency)
            ? workspace.baseCurrency
            : 'IRR',
          openingBalance: '',
        },
  );
  // Until the user picks a class, it follows the type (a loan is a Liability).
  const [classPicked, setClassPicked] = useState(Boolean(account));
  const [errors, setErrors] = useState<AccountErrors>({});
  const save = useWrite();
  const currency = currencyOf(draft);

  function change(next: Partial<AccountDraft>) {
    save.reset();
    setDraft((current) => ({ ...current, ...next }));
  }

  function submit() {
    if (save.isPending) return;
    const read = readAccountDraft(draft, workspace.moneyDisplay);
    if (!read.ok) {
      setErrors(read.errors);
      if (read.errors.name) nameRef.current?.focus();
      else balanceRef.current?.focus();
      return;
    }
    setErrors({});
    const done = { onSuccess: () => router.back() };
    if (!account) {
      save.mutate(created(newId(), { entity: 'account', fields: read.fields }), done);
      return;
    }
    const { currency: _, ...fields } = read.fields;
    const changes = changedFields(account, fields);
    if (Object.keys(changes).length === 0) return router.back();
    save.mutate(edited(account.id, { entity: 'account', fields: changes }), done);
  }

  return (
    <FormScroll>
      <Field
        ref={nameRef}
        autoFocus={!account}
        label={t('accounts.form.name')}
        error={errors.name && t(errors.name)}
        value={draft.name}
        onChangeText={(name) => change({ name })}
        maxLength={100}
      />
      <Choices
        label={t('accounts.form.type')}
        choices={accountTypes.map((type) => ({ id: type, label: t(`accounts.type.${type}`) }))}
        selected={draft.type}
        onSelect={(id) => {
          const type = id as AccountDraft['type'];
          change(classPicked ? { type } : { type, class: defaultAccountClass(type) });
        }}
      />
      <Choices
        label={t('accounts.form.class')}
        choices={accountClasses.map((c) => ({ id: c, label: t(`accounts.class.${c}`) }))}
        selected={draft.class}
        onSelect={(id) => {
          setClassPicked(true);
          change({ class: id as AccountDraft['class'] });
        }}
      />
      <Text size="sm" tone="foregroundMuted">
        {t('accounts.form.classHint')}
      </Text>
      {account ? (
        <View accessible style={styles.fixed}>
          <Text bold size="sm">
            {t('accounts.form.currency')}
          </Text>
          <Text>{format.currency(currency)}</Text>
          <Text size="sm" tone="foregroundMuted">
            {t('accounts.form.currencyFixed')}
          </Text>
        </View>
      ) : (
        <Choices
          label={t('accounts.form.currency')}
          choices={currencies.map((c) => ({ id: c.code, label: format.currency(c) }))}
          selected={draft.currency}
          onSelect={(code) => change({ currency: code })}
        />
      )}
      <Field
        ref={balanceRef}
        label={t('accounts.form.openingBalance')}
        hint={t('accounts.form.openingBalanceHint', { unit: format.currency(currency) })}
        error={errors.openingBalance && t(errors.openingBalance)}
        value={draft.openingBalance}
        onChangeText={(openingBalance) => change({ openingBalance })}
        keyboardType="numbers-and-punctuation"
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <FormMessage message={save.isError ? t('settings.saveFailed') : undefined} />
      <Button
        primary
        label={t(account ? 'accounts.form.save' : 'accounts.form.create')}
        onPress={submit}
        disabled={save.isPending}
      />
      {account && (
        <FormSection>
          <Button
            label={t(account.archived ? 'accounts.form.unarchive' : 'accounts.form.archive')}
            disabled={save.isPending}
            onPress={() =>
              save.mutate(
                edited(account.id, { entity: 'account', fields: { archived: !account.archived } }),
                { onSuccess: () => router.back() },
              )
            }
          />
          <Text size="sm" tone="foregroundMuted">
            {t('accounts.form.archiveHint')}
          </Text>
        </FormSection>
      )}
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  fixed: { gap: nativeTheme.space(1) },
});
