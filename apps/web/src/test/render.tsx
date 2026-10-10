import type { ApiClient } from '@daric/api-client';
import type { Locale } from '@daric/core';
import { render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { AppProviders } from '../app/providers';
import { routes } from '../app/routes';
import { fakeApi } from './fake-api';

/**
 * Renders the whole app at `path`, as a browser would after navigation.
 * Without an `api`, a signed-in User is talking to an in-memory API.
 */
export function renderApp({
  path = '/',
  locale,
  api = fakeApi({ signedInAs: 'sara@example.com' }).api,
}: { path?: string; locale?: Locale; api?: ApiClient } = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <AppProviders locale={locale} api={api}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...view, router };
}
