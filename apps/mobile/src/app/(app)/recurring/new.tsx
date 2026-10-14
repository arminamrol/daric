import { hasRole } from '@daric/core';
import { useAccounts } from '../../../accounts/accounts';
import { useSignedIn } from '../../../auth/session';
import { useCategories } from '../../../categories/categories';
import { useI18n } from '../../../i18n/locale';
import { RuleForm } from '../../../recurring/RuleForm';
import { ScreenHeader } from '../../../ui/HeaderButton';
import { Status } from '../../../ui/Screen';

/** Owner or Admin: a new Recurring Rule, on an active Account. */
export default function NewRuleScreen() {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  const accounts = useAccounts();
  const categories = useCategories();
  return (
    <>
      <ScreenHeader title={t('recurring.form.newTitle')} />
      {!hasRole(workspace.role, 'ADMIN') ? (
        <Status alert message={t('recurring.readOnly')} />
      ) : accounts.isPending || categories.isPending ? (
        <Status message={t('session.loading')} />
      ) : !accounts.data?.length ? (
        <Status alert message={t('transactions.noAccount')} />
      ) : (
        <RuleForm accounts={accounts.data} categories={categories.data ?? []} />
      )}
    </>
  );
}
