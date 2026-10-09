import type { RouteObject } from 'react-router';
import { HomePage } from '../pages/HomePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { Shell } from '../shell/Shell';

export const routes: RouteObject[] = [
  {
    element: <Shell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
