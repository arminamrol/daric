import { screen, within } from '@testing-library/react';
import { isolate } from '@daric/i18n';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi } from '../test/fake-api';
import { renderApp } from '../test/render';

// 2026-10-09 10:00 in Tehran is 17 Mehr 1405.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-09T06:30:00Z'));
});
afterEach(() => vi.useRealTimers());

const signedIn = (options: Parameters<typeof fakeApi>[0] = {}) =>
  fakeApi({ signedInAs: 'sara@example.com', ...options });

const workspaceForm = () => screen.findByRole('form', { name: 'تنظیمات فضای کاری' });
const preferencesForm = () => screen.findByRole('form', { name: 'ترجیحات شما' });

const today = (date: string) => `امروز: ${isolate(date)}`;
const thisMonth = (period: string) => `این ماه: ${isolate(period)}`;

async function goHome() {
  await userEvent.click(screen.getByRole('link', { name: 'خانه' }));
}

describe('home', () => {
  it('shows today and the current month in the default settings', async () => {
    renderApp();
    expect(await screen.findByText(today('۱۷ مهر ۱۴۰۵'))).toBeTruthy();
    expect(screen.getByText(thisMonth('مهر ۱۴۰۵'))).toBeTruthy();
  });
});

describe('Workspace settings', () => {
  it('lets the Owner switch the Workspace Calendar, which regroups the months', async () => {
    const fake = signedIn();
    renderApp({ path: '/settings', api: fake.api });
    const form = within(await workspaceForm());
    await userEvent.click(form.getByRole('radio', { name: 'میلادی' }));
    await userEvent.click(form.getByRole('button', { name: 'ذخیره' }));
    expect(await form.findByRole('status')).toHaveProperty('textContent', 'ذخیره شد.');
    expect(fake.workspace().calendar).toBe('gregorian');

    await goHome();
    expect(await screen.findByText(thisMonth('اکتبر ۲۰۲۶'))).toBeTruthy();
    // The User still sees dates in their own display calendar.
    expect(screen.getByText(today('۱۷ مهر ۱۴۰۵'))).toBeTruthy();
  });

  it('saves the Base Currency, timezone, name and Rial/Toman display', async () => {
    const fake = signedIn();
    renderApp({ path: '/settings', api: fake.api });
    const form = within(await workspaceForm());
    const name = form.getByRole('textbox', { name: 'نام' });
    await userEvent.clear(name);
    await userEvent.type(name, 'خانه');
    await userEvent.selectOptions(form.getByRole('combobox', { name: 'ارز پایه' }), 'USD');
    await userEvent.selectOptions(
      form.getByRole('combobox', { name: 'منطقه زمانی' }),
      'Europe/Berlin',
    );
    await userEvent.click(form.getByRole('radio', { name: 'تومان' }));
    await userEvent.click(form.getByRole('button', { name: 'ذخیره' }));

    await form.findByRole('status');
    expect(fake.workspace()).toMatchObject({
      name: 'خانه',
      baseCurrency: 'USD',
      timezone: 'Europe/Berlin',
      moneyDisplay: 'toman',
    });
    const preview = screen.getByTestId('display-preview');
    expect(within(preview).getByText('۱۲۳٬۴۵۰٫۰۰ دلار')).toBeTruthy();
  });

  it('shows money in tomans once the Workspace does', async () => {
    renderApp({ path: '/settings', api: signedIn().api });
    const preview = await screen.findByTestId('display-preview');
    expect(within(preview).getByText('۱۲٬۳۴۵٬۰۰۰ ریال')).toBeTruthy();

    const form = within(await workspaceForm());
    await userEvent.click(form.getByRole('radio', { name: 'تومان' }));
    await userEvent.click(form.getByRole('button', { name: 'ذخیره' }));
    expect(await within(preview).findByText('۱٬۲۳۴٬۵۰۰ تومان')).toBeTruthy();
  });

  it('is read-only for a Member', async () => {
    renderApp({ path: '/settings', api: signedIn({ role: 'MEMBER' }).api });
    const form = within(await workspaceForm());
    expect(
      form.getByText('فقط مالک و مدیر فضای کاری می‌توانند این تنظیمات را تغییر دهند.'),
    ).toBeTruthy();
    expect(form.getByRole('radio', { name: 'میلادی' }).matches(':disabled')).toBe(true);
    expect(form.getByRole('textbox', { name: 'نام' }).matches(':disabled')).toBe(true);
    expect(form.queryByRole('button', { name: 'ذخیره' })).toBeNull();
  });

  it('says so when saving fails', async () => {
    const fake = signedIn();
    fake.api.updateWorkspace = () => Promise.reject(new Error('offline'));
    renderApp({ path: '/settings', api: fake.api });
    const form = within(await workspaceForm());
    await userEvent.click(form.getByRole('radio', { name: 'میلادی' }));
    await userEvent.click(form.getByRole('button', { name: 'ذخیره' }));
    expect(await form.findByRole('alert')).toHaveProperty(
      'textContent',
      'ذخیره نشد. دوباره امتحان کنید.',
    );
  });
});

describe('User preferences', () => {
  it('change only how dates are drawn, not which month it is', async () => {
    const fake = signedIn();
    renderApp({ path: '/settings', api: fake.api });
    const form = within(await preferencesForm());
    await userEvent.click(form.getByRole('radio', { name: 'میلادی' }));
    await userEvent.click(form.getByRole('radio', { name: 'لاتین (123)' }));
    expect(fake.preferences()).toMatchObject({ displayCalendar: 'gregorian', digits: 'latin' });

    await goHome();
    expect(await screen.findByText(today('9 اکتبر 2026'))).toBeTruthy();
    expect(screen.getByText(thisMonth('مهر 1405'))).toBeTruthy();
  });

  it('show their effect in the preview straight away', async () => {
    renderApp({ path: '/settings', api: signedIn().api });
    const preview = await screen.findByTestId('display-preview');
    expect(within(preview).getByText('۱۴۰۵/۰۷/۱۷')).toBeTruthy();

    const form = within(await preferencesForm());
    await userEvent.click(form.getByRole('radio', { name: 'لاتین (123)' }));
    expect(await within(preview).findByText('1405/07/17')).toBeTruthy();
    expect(within(preview).getByText('12,345,000 ریال')).toBeTruthy();
  });

  it('keep the theme with the User on every device', async () => {
    const fake = signedIn();
    const view = renderApp({ path: '/settings', api: fake.api });
    const form = within(await preferencesForm());
    await userEvent.click(form.getByRole('radio', { name: 'تیره' }));
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(fake.preferences().theme).toBe('dark');

    // Another device: nothing stored locally, the same User signs in.
    view.unmount();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    renderApp({ api: fake.api });
    await screen.findByText(today('۱۷ مهر ۱۴۰۵'));
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('are reachable from the header', async () => {
    renderApp();
    await userEvent.click(await screen.findByRole('link', { name: 'تنظیمات' }));
    expect(await preferencesForm()).toBeTruthy();
  });
});
