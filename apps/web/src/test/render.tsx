import type { Locale } from '@daric/core';
import { render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { AppProviders } from '../app/providers';
import { routes } from '../app/routes';

/** Renders the whole app at `path`, as a browser would after navigation. */
export function renderApp({ path = '/', locale }: { path?: string; locale?: Locale } = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <AppProviders {...(locale && { locale })}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
}
