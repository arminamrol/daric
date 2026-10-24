import type { ApiClient } from '@daric/api-client';
import { isolate } from '@daric/i18n';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fakeApi, testPassword } from '../test/fake-api';
import { renderApp } from '../test/render';

const workspaceSelect = () => screen.findByRole('combobox', { name: 'فضای کاری' });

describe('Accepting an Invitation', () => {
  it('shows what it offers and the Consent, then joins and switches to the Workspace', async () => {
    const server = fakeApi({ signedInAs: 'sara@example.com' });
    const token = server.inviteElsewhere({ workspaceName: 'Home', role: 'MEMBER' });
    const { router } = renderApp({ path: `/invitation?token=${token}`, api: server.api });

    expect(await screen.findByText(/reza@example\.com.* شما را دعوت کرده است/)).toBeTruthy();
    expect(screen.getByText(/با پذیرفتن، رضایت می‌دهید/)).toBeTruthy();
    // The token leaves the address bar once read.
    expect(router.state.location.search).toBe('');
    await userEvent.click(screen.getByRole('button', { name: 'پذیرفتن و پیوستن' }));

    expect(await screen.findByText(/به .*Home.* پیوستید/)).toBeTruthy();
    expect(server.consents()).toHaveLength(1);
    const select = (await workspaceSelect()) as HTMLSelectElement;
    expect(select.selectedOptions[0]?.textContent).toBe('Home (عضو)');
  });

  it('asks a User whose email is not verified to verify it first', async () => {
    const server = fakeApi();
    server.addUser('sara@example.com', testPassword, { emailVerified: false });
    await server.api.login({ email: 'sara@example.com', password: testPassword });
    const token = server.inviteElsewhere({ workspaceName: 'Home', role: 'VIEWER' });
    renderApp({ path: `/invitation?token=${token}`, api: server.api });

    await userEvent.click(await screen.findByRole('button', { name: 'پذیرفتن و پیوستن' }));
    expect(await screen.findByText(/پیش از پذیرفتن، ایمیل خود را/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'فرستادن دوبارهٔ پیوند' })).toBeTruthy();
    expect(server.joinedWorkspaces()).toEqual([]);
  });

  it('refuses a User with another email than the one invited', async () => {
    const server = fakeApi({ signedInAs: 'sara@example.com' });
    const token = server.inviteElsewhere({
      workspaceName: 'Home',
      role: 'VIEWER',
      email: 'someone@example.com',
    });
    renderApp({ path: `/invitation?token=${token}`, api: server.api });
    expect(await screen.findByText(/این دعوت برای .*someone@example\.com.* است/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'پذیرفتن و پیوستن' }));
    expect(await screen.findByText(/این دعوت برای ایمیل دیگری است/)).toBeTruthy();
  });

  it('says when the link no longer works', async () => {
    renderApp({ path: '/invitation?token=used-up' });
    expect(await screen.findByText(/این دعوت نامعتبر است/)).toBeTruthy();
  });

  it('offers to try again when the Invitation could not be loaded', async () => {
    const server = fakeApi({ signedInAs: 'sara@example.com' });
    const token = server.inviteElsewhere({ workspaceName: 'Home', role: 'MEMBER' });
    let attempts = 0;
    const api: ApiClient = {
      ...server.api,
      previewInvitation: (t) =>
        ++attempts === 1
          ? Promise.reject(new TypeError('Failed to fetch'))
          : server.api.previewInvitation(t),
    };
    renderApp({ path: `/invitation?token=${token}`, api });

    await userEvent.click(await screen.findByRole('button', { name: 'تلاش دوباره' }));
    expect(await screen.findByRole('button', { name: 'پذیرفتن و پیوستن' })).toBeTruthy();
  });

  it('brings a signed-out visitor back to it after logging in', async () => {
    const server = fakeApi();
    server.addUser('sara@example.com');
    const token = server.inviteElsewhere({ workspaceName: 'Home', role: 'MEMBER' });
    renderApp({ path: `/invitation?token=${token}`, api: server.api });

    expect(await screen.findByText(/برای دیدن و پذیرفتن این دعوت وارد شوید/)).toBeTruthy();
    await userEvent.click(screen.getByRole('link', { name: 'ورود به دریک' }));
    await userEvent.type(await screen.findByLabelText('ایمیل'), 'sara@example.com');
    await userEvent.type(screen.getByLabelText(/^رمز عبور/), testPassword);
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }));

    await userEvent.click(await screen.findByRole('button', { name: 'پذیرفتن و پیوستن' }));
    expect(await screen.findByText(/به .*Home.* پیوستید/)).toBeTruthy();
  });
});

describe('Switching Workspaces', () => {
  it('appears only for a User in more than one, and shows the chosen one', async () => {
    const server = fakeApi({ signedInAs: 'sara@example.com' });
    const { unmount } = renderApp({ path: '/settings', api: server.api });
    await screen.findByRole('heading', { name: 'تنظیمات', level: 1 });
    expect(screen.queryByRole('combobox', { name: 'فضای کاری' })).toBeNull();
    unmount();

    await server.api.acceptInvitation(
      server.inviteElsewhere({ workspaceName: 'Home', role: 'VIEWER' }),
    );
    renderApp({ path: '/settings', api: server.api });
    const select = await workspaceSelect();
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Personal (مالک)', 'Home (بیننده)']);
    await userEvent.selectOptions(select, 'Home (بیننده)');
    await userEvent.click(await screen.findByRole('link', { name: 'تنظیمات' }));
    expect(
      await screen.findByText('فقط مالک و مدیر فضای کاری می‌توانند این تنظیمات را تغییر دهند.'),
    ).toBeTruthy();
  });
});

describe('Consents page', () => {
  it('lists the sharing Consent and takes it back, leaving the Workspace', async () => {
    const server = fakeApi({ signedInAs: 'sara@example.com' });
    await server.api.acceptInvitation(
      server.inviteElsewhere({ workspaceName: 'Home', role: 'MEMBER' }),
    );
    renderApp({ path: '/settings', api: server.api });
    await userEvent.click(await screen.findByRole('link', { name: 'رضایت‌های شما' }));

    expect(await screen.findByText(/اشتراک‌گذاری در فضای کاری «.*Home.*»/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'پس گرفتن' }));
    await userEvent.click(screen.getByRole('button', { name: 'بله، پس بگیر' }));

    expect(await screen.findByRole('heading', { name: 'به دریک خوش آمدید' })).toBeTruthy();
    expect(server.joinedWorkspaces()).toEqual([]);
    expect(server.consents()[0]?.revokedAt).toEqual(expect.any(String));
    expect(screen.queryByRole('combobox', { name: 'فضای کاری' })).toBeNull();
  });

  it('says when there are none', async () => {
    renderApp({ path: '/settings/consents' });
    expect(await screen.findByText('هنوز رضایتی نداده‌اید.')).toBeTruthy();
  });
});

describe('Audit log page', () => {
  it('shows the Owner what happened, who did it, and older entries on request', async () => {
    const server = fakeApi({ signedInAs: 'sara@example.com' });
    server.setAudit(
      Array.from({ length: 51 }, (_, i) => ({
        id: `01900000-0000-7000-8000-${String(100 + i).padStart(12, '0')}`,
        action: i === 0 ? 'member.role_change' : i === 50 ? 'auth.register' : 'label.create',
        actorEmail: i === 0 ? 'reza@example.com' : 'sara@example.com',
        metadata: {},
        createdAt: '2026-10-09T06:30:00.000Z',
      })),
    );
    renderApp({ path: '/settings', api: server.api });
    await userEvent.click(await screen.findByRole('link', { name: 'گزارش فعالیت‌ها' }));

    const first = (await screen.findByText('تغییر نقش عضو')).closest('li');
    expect(first && within(first).getByText('reza@example.com')).toBeTruthy();
    // 06:30 UTC is 10:00 in Tehran.
    expect(first && within(first).getByText(isolate('۱۷ مهر ۱۴۰۵ ۱۰:۰۰'))).toBeTruthy();
    expect(screen.queryByText('ثبت‌نام')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'موارد قدیمی‌تر' }));
    expect(await screen.findByText('ثبت‌نام')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'موارد قدیمی‌تر' })).toBeNull();
  });

  it('is not offered to an Admin', async () => {
    renderApp({
      path: '/settings',
      api: fakeApi({ signedInAs: 'sara@example.com', role: 'ADMIN' }).api,
    });
    await screen.findByRole('link', { name: 'اعضا و دعوت‌ها' });
    expect(screen.queryByRole('link', { name: 'گزارش فعالیت‌ها' })).toBeNull();
  });
});
