import { hasRole } from '@daric/core';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { useSignedIn } from '../../../auth/session';
import { BudgetForm } from '../../../budgets/BudgetForm';
import { useBudgets } from '../../../budgets/budgets';
import { useFormatters } from '../../../display/formatters';
import { useI18n } from '../../../i18n/locale';
import { ScreenHeader } from '../../../ui/HeaderButton';
import { Status } from '../../../ui/Screen';

/** Owner or Admin: changes or deletes a Budget. */
export default function EditBudgetScreen() {
  const { t } = useI18n();
  const format = useFormatters();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { workspace } = useSignedIn();
  // Every month lists every Budget; this month's list is the one most likely kept.
  const month = useMemo(() => format.currentPeriod(new Date()), [format]);
  const budgets = useBudgets(month);
  const budget = budgets.data?.find((b) => b.id === id);
  return (
    <>
      <ScreenHeader title={t('budgets.form.editTitle')} />
      {!hasRole(workspace.role, 'ADMIN') ? (
        <Status alert message={t('budgets.readOnly')} />
      ) : budgets.isPending ? (
        <Status message={t('session.loading')} />
      ) : budget ? (
        <BudgetForm key={budget.id} budget={budget} />
      ) : (
        <Status alert message={t('budgets.notFound')} />
      )}
    </>
  );
}
