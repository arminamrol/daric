import type { RouteObject } from 'react-router';
import { GuestOnly, RequireSession } from '../auth/session';
import { AccountFormPage } from '../pages/AccountFormPage';
import { AccountsPage } from '../pages/AccountsPage';
import { BudgetFormPage } from '../pages/BudgetFormPage';
import { BudgetsPage } from '../pages/BudgetsPage';
import { CategoriesPage } from '../pages/CategoriesPage';
import { CategoryFormPage } from '../pages/CategoryFormPage';
import { HomePage } from '../pages/HomePage';
import { LabelFormPage } from '../pages/LabelFormPage';
import { LabelsPage } from '../pages/LabelsPage';
import { LoginPage } from '../pages/LoginPage';
import { NetWorthPage } from '../pages/NetWorthPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { RateFormPage } from '../pages/RateFormPage';
import { RatesPage } from '../pages/RatesPage';
import { RecurringFormPage } from '../pages/RecurringFormPage';
import { RecurringPage } from '../pages/RecurringPage';
import { SettingsPage } from '../pages/SettingsPage';
import { SignupPage } from '../pages/SignupPage';
import { TransactionEditPage } from '../pages/TransactionEditPage';
import { TransactionsPage } from '../pages/TransactionsPage';
import { ValuationsPage } from '../pages/ValuationsPage';
import { Shell } from '../shell/Shell';

export const routes: RouteObject[] = [
  {
    element: <Shell />,
    children: [
      {
        element: <RequireSession />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'transactions', element: <TransactionsPage /> },
          { path: 'transactions/:transactionId', element: <TransactionEditPage /> },
          { path: 'accounts', element: <AccountsPage /> },
          { path: 'accounts/new', element: <AccountFormPage /> },
          { path: 'accounts/:accountId', element: <AccountFormPage /> },
          { path: 'accounts/:accountId/valuations', element: <ValuationsPage /> },
          { path: 'net-worth', element: <NetWorthPage /> },
          { path: 'categories', element: <CategoriesPage /> },
          { path: 'categories/new', element: <CategoryFormPage /> },
          { path: 'categories/:categoryId', element: <CategoryFormPage /> },
          { path: 'labels', element: <LabelsPage /> },
          { path: 'labels/new', element: <LabelFormPage /> },
          { path: 'labels/:labelId', element: <LabelFormPage /> },
          { path: 'budgets', element: <BudgetsPage /> },
          { path: 'budgets/new', element: <BudgetFormPage /> },
          { path: 'budgets/:budgetId', element: <BudgetFormPage /> },
          { path: 'recurring', element: <RecurringPage /> },
          { path: 'recurring/new', element: <RecurringFormPage /> },
          { path: 'recurring/:ruleId', element: <RecurringFormPage /> },
          { path: 'rates', element: <RatesPage /> },
          { path: 'rates/new', element: <RateFormPage /> },
          { path: 'rates/:rateId', element: <RateFormPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
      {
        element: <GuestOnly />,
        children: [
          { path: 'login', element: <LoginPage /> },
          { path: 'signup', element: <SignupPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
