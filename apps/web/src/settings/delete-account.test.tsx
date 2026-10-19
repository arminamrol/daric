import type { Subscription } from '@daric/core';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fakeApi, testPassword } from '../test/fake-api';
import { renderApp } from '../test/render';

const boughtPlus: Subscription = {
  billingEnabled: true,
  plan: 'PLUS',
  onTrial: false,
  trialEndsAt: '2026-10-01T06:30:00.000Z',
  expiresAt: '2027-01-01T06:30:00.000Z',
  graceEndsAt: '2027-01-08T06:30:00.000Z',
  inGracePeriod: false,
  entitlements: {
    signedInDevices: 3,
    shareWorkspace: true,
    aiAnalysesPerMonth: 30,
    aiAnalysesLeftThisMonth: 30,
  },
};

const passwordField = () => screen.findByLabelText('رمز عبور شما');
const submit = () => screen.getByRole('button', { name: 'حساب کاربری‌ام برای همیشه حذف شود' });

describe('Delete account page', () => {
  it('opens from Settings and lists the Workspaces deleted with the account', async () => {
    const server = fakeApi({ signedInAs: 'sara@example.com' });
    renderApp({ path: '/settings', api: server.api });
    await userEvent.click(await screen.findByRole('link', { name: 'حذف حساب کاربری' }));

    expect(await screen.findByText('این فضاهای کاری با همهٔ محتوایشان حذف می‌شوند:')).toBeTruthy();
    expect(screen.getByText(server.workspace().name)).toBeTruthy();
    expect(screen.queryByText(/دریک پلاس/)).toBeNull();
  });

  it('deletes the account after the password is given again and signs out', async () => {
    const server = fakeApi({ signedInAs: 'sara@example.com' });
    renderApp({ path: '/settings/delete-account', api: server.api });
    await userEvent.type(await passwordField(), testPassword);
    await userEvent.click(submit());

    expect(await screen.findByRole('heading', { name: 'ورود به دریک' })).toBeTruthy();
    expect(server.hasUser('sara@example.com')).toBe(false);
  });

  it('says so when the password is wrong, and keeps the account', async () => {
    const server = fakeApi({ signedInAs: 'sara@example.com' });
    renderApp({ path: '/settings/delete-account', api: server.api });
    await userEvent.type(await passwordField(), 'not my password');
    await userEvent.click(submit());

    expect((await screen.findByRole('alert')).textContent).toBe('رمز عبور درست نیست.');
    expect(server.hasUser('sara@example.com')).toBe(true);
  });

  it('warns that bought Plus time is lost', async () => {
    const server = fakeApi({ signedInAs: 'sara@example.com' });
    server.setSubscription(boughtPlus);
    renderApp({ path: '/settings/delete-account', api: server.api });
    expect(
      await screen.findByText(/زمان باقی‌ماندهٔ دریک پلاس شما تا .* از دست می‌رود/),
    ).toBeTruthy();
  });

  it('asks for a new owner first while others share the Workspace, and leads to the Members page', async () => {
    const server = fakeApi({ signedInAs: 'sara@example.com' });
    const reza = server.addMember('reza@example.com', 'MEMBER');
    renderApp({ path: '/settings/delete-account', api: server.api });

    expect(await screen.findByText(/اول یکی از آن‌ها را مالک کنید/)).toBeTruthy();
    expect(screen.queryByLabelText('رمز عبور شما')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'انتخاب مالک تازه' }));

    const list = within(await screen.findByRole('list', { name: 'اعضا' }));
    await userEvent.click(list.getByRole('button', { name: 'مالک کردن reza@example.com' }));
    await userEvent.click(list.getByRole('button', { name: 'بله، مالک شود' }));
    // The User stays on as an Admin.
    expect(await list.findByText('مدیر')).toBeTruthy();
    expect(server.members().find((m) => m.id === reza.id)?.role).toBe('OWNER');
  });
});
