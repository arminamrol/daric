import { hasRole } from '@daric/core';
import { useLocalSearchParams } from 'expo-router';
import { useAccounts } from '../../../accounts/accounts';
import { useSignedIn } from '../../../auth/session';
import { useCategories } from '../../../categories/categories';
import { useI18n } from '../../../i18n/locale';
import { useRecurringRules } from '../../../recurring/recurring';
import { RuleForm } from '../../../recurring/RuleForm';
import { ScreenHeader } from '../../../ui/HeaderButton';
import { Status } from '../../../ui/Screen';

/** Owner or Admin: changes or archives a Recurring Rule. */
export default function EditRuleScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { workspace } = useSignedIn();
  const rules = useRecurringRules();
  const accounts = useAccounts({ includeArchived: true });
  const categories = useCategories();
  const rule = rules.data?.find((r) => r.id === id);
  return (
    <>
      <ScreenHeader title={t('recurring.form.editTitle')} />
      {!hasRole(workspace.role, 'ADMIN') ? (
        <Status alert message={t('recurring.readOnly')} />
      ) : rules.isPending || accounts.isPending || categories.isPending ? (
        <Status message={t('session.loading')} />
      ) : rule ? (
        <RuleForm
          key={rule.id}
          rule={rule}
          accounts={accounts.data ?? []}
          categories={categories.data ?? []}
        />
      ) : (
        <Status alert message={t('recurring.notFound')} />
      )}
    </>
  );
}
