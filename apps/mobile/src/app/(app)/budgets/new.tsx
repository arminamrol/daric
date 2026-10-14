import { hasRole } from '@daric/core';
import { useSignedIn } from '../../../auth/session';
import { BudgetForm } from '../../../budgets/BudgetForm';
import { useI18n } from '../../../i18n/locale';
import { ScreenHeader } from '../../../ui/HeaderButton';
import { Status } from '../../../ui/Screen';

/** Owner or Admin: a new Budget. */
export default function NewBudgetScreen() {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  return (
    <>
      <ScreenHeader title={t('budgets.form.newTitle')} />
      {hasRole(workspace.role, 'ADMIN') ? (
        <BudgetForm />
      ) : (
        <Status alert message={t('budgets.readOnly')} />
      )}
    </>
  );
}
