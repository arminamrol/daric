import type { RouteObject } from 'react-router';
import { GuestOnly, RequireSession } from '../auth/session';
import { AccountFormPage } from '../pages/AccountFormPage';
import { AccountsPage } from '../pages/AccountsPage';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { SettingsPage } from '../pages/SettingsPage';
import { SignupPage } from '../pages/SignupPage';
import { Shell } from '../shell/Shell';

export const routes: RouteObject[] = [
  {
    element: <Shell />,
    children: [
      {
        element: <RequireSession />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'accounts', element: <AccountsPage /> },
          { path: 'accounts/new', element: <AccountFormPage /> },
          { path: 'accounts/:accountId', element: <AccountFormPage /> },
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
