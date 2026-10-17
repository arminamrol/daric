import { keyValueStore } from '@daric/offline-queue';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fakeApi, testPassword } from '../test/fake-api';
import { renderApp } from '../test/render';
import { reportSignedOut } from './signedOut';

const loginHeading = () => screen.findByRole('heading', { name: 'ورود به دریک' });
const kept = (key: string) => keyValueStore('daric').get<unknown>(key);

async function logIn({ keepData = false } = {}) {
  await userEvent.type(await screen.findByLabelText('ایمیل'), 'sara@example.com');
  await userEvent.type(screen.getByLabelText(/^رمز عبور/), testPassword);
  if (keepData)
    await userEvent.click(screen.getByRole('checkbox', { name: 'داده‌ها روی این دستگاه بماند' }));
  await userEvent.click(screen.getByRole('button', { name: 'ورود' }));
}

describe('signed out by the server', () => {
  it('wipes the device and explains a login elsewhere past the device limit, with a way to Plus', async () => {
    const fake = fakeApi();
    fake.addUser('sara@example.com');
    const view = renderApp({ path: '/login', api: fake.api });
    await logIn({ keepData: true });
    await screen.findByRole('heading', { name: 'به دریک خوش آمدید' });
    await vi.waitFor(async () => expect(await kept('queryCache')).toBeDefined());
    // Signed in, a 401 from now on is worth a refresh.
    expect(localStorage.getItem('daric.signedIn')).toBe('yes');

    // Sara logs in on her phone; this browser's next refresh is refused.
    fake.signOutThisDevice();
    act(() => reportSignedOut('DEVICE_LIMIT'));

    expect(await loginHeading()).toBeTruthy();
    expect(view.router.state.location.pathname).toBe('/login');
    expect((await screen.findByRole('status')).textContent).toContain(
      'از این دستگاه خارج شدید، چون با دستگاه دیگری وارد شدید',
    );
    await vi.waitFor(async () => expect(await kept('queryCache')).toBeUndefined());
    expect(localStorage.getItem('daric.keepData')).toBeNull();
    expect(localStorage.getItem('daric.signedIn')).toBeNull();

    // The link leads to Plus once she is signed in again.
    await userEvent.click(
      screen.getByRole('link', { name: 'با دریک پلاس روی دستگاه‌های بیشتری وارد بمانید' }),
    );
    expect(await loginHeading()).toBeTruthy();
    await logIn();
    expect(await screen.findByRole('heading', { name: 'اشتراک', level: 1 })).toBeTruthy();
    expect(localStorage.getItem('daric.signedOut')).toBeNull();
  });

  it('says so when signed out from another device, without the way to Plus', async () => {
    const fake = fakeApi({ signedInAs: 'sara@example.com' });
    renderApp({ path: '/settings', api: fake.api });
    await screen.findByRole('heading', { name: 'تنظیمات', level: 1 });

    fake.signOutThisDevice();
    act(() => reportSignedOut('SIGNED_OUT_REMOTELY'));

    expect(await loginHeading()).toBeTruthy();
    expect((await screen.findByRole('status')).textContent).toBe(
      'این دستگاه از یکی دیگر از دستگاه‌هایتان خارج شد.',
    );
    expect(screen.queryByRole('link', { name: /دریک پلاس/ })).toBeNull();
  });

  it('keeps the reason given when another tab is refused without one', async () => {
    const fake = fakeApi({ signedInAs: 'sara@example.com' });
    renderApp({ path: '/', api: fake.api });
    await screen.findByRole('heading', { name: 'به دریک خوش آمدید' });

    fake.signOutThisDevice();
    act(() => {
      reportSignedOut('DEVICE_LIMIT');
      reportSignedOut(undefined);
    });
    expect(await loginHeading()).toBeTruthy();
    expect((await screen.findByRole('status')).textContent).toContain('با دستگاه دیگری وارد شدید');
  });

  it('shows nothing on a plain visit to the login page', async () => {
    renderApp({ path: '/login', api: fakeApi().api });
    expect(await loginHeading()).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
