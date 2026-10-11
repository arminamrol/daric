import type { BudgetPeriod } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';

export const BUDGET_PERIOD_LABELS: Record<BudgetPeriod, PlainMessageKey> = {
  MONTHLY: 'budgets.period.MONTHLY',
  YEARLY: 'budgets.period.YEARLY',
};
