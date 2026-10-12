import type { RouteObject } from 'react-router';
import { GuestOnly, RequireSession } from '../auth/session';
import { AccountFormPage } from '../pages/AccountFormPage';
import { AccountsPage } from '../pages/AccountsPage';
import { BudgetFormPage } from '../pages/BudgetFormPage';
import { BudgetsPage } from '../pages/BudgetsPage';
import { CategoriesPage } from '../pages/CategoriesPage';
import { CategoryFormPage } from '../pages/CategoryFormPage';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { HomePage } from '../pages/HomePage';
import { LabelFormPage } from '../pages/LabelFormPage';
import { LabelsPage } from '../pages/LabelsPage';
import { LoginPage } from '../pages/LoginPage';
import { NetWorthPage } from '../pages/NetWorthPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PlannedItemFormPage } from '../pages/PlannedItemFormPage';
import { ProjectionPage } from '../pages/ProjectionPage';
import { RateFormPage } from '../pages/RateFormPage';
import { RatesPage } from '../pages/RatesPage';
import { RecurringFormPage } from '../pages/RecurringFormPage';
import { RecurringPage } from '../pages/RecurringPage';
import { ReportsPage } from '../pages/ReportsPage';
import { ResetPasswordPage } from '../pages/ResetPasswordPage';
import { SettingsPage } from '../pages/SettingsPage';
import { SignupPage } from '../pages/SignupPage';
import { TransactionEditPage } from '../pages/TransactionEditPage';
import { TransactionsPage } from '../pages/TransactionsPage';
import { ValuationsPage } from '../pages/ValuationsPage';
import { VerifyEmailPage } from '../pages/VerifyEmailPage';
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
          { path: 'projection', element: <ProjectionPage /> },
          { path: 'projection/planned/new', element: <PlannedItemFormPage /> },
          { path: 'projection/planned/:itemId', element: <PlannedItemFormPage /> },
          { path: 'reports', element: <ReportsPage /> },
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
          { path: 'forgot-password', element: <ForgotPasswordPage /> },
          { path: 'reset-password', element: <ResetPasswordPage /> },
        ],
      },
      // Mailed links open here whether or not the browser is signed in.
      { path: 'verify-email', element: <VerifyEmailPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
