import type { ApiClient } from '@daric/api-client';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pendingInvitation } from '../members/pendingInvitation';
import { fakeApi, testPassword } from '../test/fake-api';
import { renderApp } from '../test/render';

const EMAIL = 'sara@example.com';
const newUser = () => fakeApi({ signedInAs: EMAIL, onboarded: false });

const wizard = () => screen.findByRole('heading', { name: 'راه‌اندازی دریک', level: 1 });
const step = (name: string) => screen.findByRole('heading', { name, level: 2 });
const home = () => screen.findByRole('heading', { name: 'به دریک خوش آمدید' });
const click = async (name: string) => userEvent.click(await screen.findByRole('button', { name }));
const next = () => click('بعدی');
const choose = async (group: string, choice: string) =>
  userEvent.click(
    within(await screen.findByRole('radiogroup', { name: group })).getByRole('radio', {
      name: choice,
    }),
  );
const checked = (group: string) =>
  within(screen.getByRole('radiogroup', { name: group }))
    .getAllByRole('radio')
    .find((radio) => radio.getAttribute('aria-checked') === 'true')?.textContent;

// The device's own timezone, as the browser reports it.
const systemTimeZone = process.env['TZ'];
beforeEach(() => {
  process.env['TZ'] = 'Europe/Berlin';
});
afterEach(() => {
  if (systemTimeZone === undefined) delete process.env['TZ'];
  else process.env['TZ'] = systemTimeZone;
});

describe('Onboarding', () => {
  it('greets a new User with the first of five steps instead of the app', async () => {
    renderApp({ api: newUser().api });

    expect(await wizard()).toBeTruthy();
    expect(await step('زبان شما')).toBeTruthy();
    expect(screen.getByText('گام ۱ از ۵')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'به دریک خوش آمدید' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'قبلی' })).toBeNull();
  });

  it('walks through every step and back', async () => {
    renderApp({ api: newUser().api });
    await wizard();

    for (const [n, name] of [
      ['۲', 'ارز پایهٔ شما'],
      ['۳', 'تقویم شما'],
      ['۴', 'ریال یا تومان'],
      ['۵', 'داده‌ها روی این دستگاه بماند؟'],
    ] as const) {
      await next();
      expect(await step(name)).toBeTruthy();
      expect(screen.getByText(`گام ${n} از ۵`)).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: 'بعدی' })).toBeNull();

    await click('قبلی');
    expect(await step('ریال یا تومان')).toBeTruthy();
    expect(screen.getByText('گام ۴ از ۵')).toBeTruthy();
  });

  it("offers today's settings and the device's timezone as defaults", async () => {
    renderApp({ api: newUser().api });
    await wizard();
    expect(checked('زبان')).toBe('فارسی');

    await next();
    expect((screen.getByRole('combobox', { name: 'ارز پایه' }) as HTMLSelectElement).value).toBe(
      'IRR',
    );
    await next();
    await step('تقویم شما');
    expect(checked('تقویم فضای کاری')).toBe('شمسی');
    expect((screen.getByRole('combobox', { name: 'منطقه زمانی' }) as HTMLSelectElement).value).toBe(
      'Europe/Berlin',
    );
    await next();
    await step('ریال یا تومان');
    expect(checked('نمایش ریال ایران')).toBe('ریال');
    await next();
    await step('داده‌ها روی این دستگاه بماند؟');
    expect(checked('داده‌ها روی این دستگاه بماند؟')).toBe('نه، فقط هنگام اتصال');
  });

  it('saves every choice through the settings, then opens the app for good', async () => {
    const server = newUser();
    const view = renderApp({ api: server.api });
    await wizard();

    await choose('زبان', 'English');
    expect(await step('Your language')).toBeTruthy();
    expect(server.preferences().locale).toBe('en');
    await click('Next');

    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Base currency' }),
      'USD',
    );
    await click('Next');

    await choose('Workspace calendar', 'Gregorian');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Timezone' }), 'Asia/Dubai');
    await click('Next');

    await choose('Show Iranian rials as', 'Tomans');
    await click('Next');

    await choose('Keep data on this device?', 'Yes, keep it on this device');
    await click('Start using Daric');

    expect(await screen.findByRole('heading', { name: 'Welcome to Daric' })).toBeTruthy();
    expect(server.workspace()).toMatchObject({
      baseCurrency: 'USD',
      calendar: 'gregorian',
      timezone: 'Asia/Dubai',
      moneyDisplay: 'toman',
    });
    expect(localStorage.getItem('daric.keepData')).toBe('yes');
    expect(server.onboarded(EMAIL)).toBe(true);

    // Stored on the server: not shown again, on this device or any other.
    view.unmount();
    localStorage.clear();
    renderApp({ api: server.api });
    expect(await screen.findByRole('heading', { name: 'Welcome to Daric' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Set up Daric' })).toBeNull();
  });

  it('leaves a skipped step as it was', async () => {
    const server = newUser();
    renderApp({ api: server.api });
    await wizard();
    await next();
    await next();

    await step('تقویم شما');
    await choose('تقویم فضای کاری', 'میلادی');
    await click('رد شدن از این گام');

    expect(await step('ریال یا تومان')).toBeTruthy();
    expect(server.workspace()).toMatchObject({ calendar: 'jalali', timezone: 'Asia/Tehran' });
  });

  it('skips the whole setup at once, changing nothing', async () => {
    const server = newUser();
    renderApp({ api: server.api });
    await wizard();
    await next();

    await click('رد شدن از راه‌اندازی');

    expect(await home()).toBeTruthy();
    expect(server.onboarded(EMAIL)).toBe(true);
    expect(server.workspace()).toMatchObject({ baseCurrency: 'IRR', timezone: 'Asia/Tehran' });
  });

  it('is never shown to a User who finished it', async () => {
    renderApp({ api: fakeApi({ signedInAs: EMAIL }).api });
    expect(await home()).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'راه‌اندازی دریک' })).toBeNull();
  });

  it('keeps the step and says so when a choice could not be saved', async () => {
    const server = newUser();
    const api: ApiClient = {
      ...server.api,
      updateWorkspace: () => Promise.reject(new TypeError('Failed to fetch')),
    };
    renderApp({ api });
    await wizard();
    await next();
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'ارز پایه' }), 'USD');
    await next();

    expect((await screen.findByRole('alert')).textContent).toBe('ذخیره نشد. دوباره امتحان کنید.');
    expect(screen.getByRole('heading', { name: 'ارز پایهٔ شما', level: 2 })).toBeTruthy();
  });

  it('asks a User invited into another Workspace only their own choices', async () => {
    const server = newUser();
    await server.api.acceptInvitation(
      server.inviteElsewhere({ workspaceName: 'Home', role: 'MEMBER' }),
    );
    renderApp({ api: server.api });
    await wizard();

    expect(await step('زبان شما')).toBeTruthy();
    expect(screen.getByText('گام ۱ از ۲')).toBeTruthy();
    await next();
    expect(await step('داده‌ها روی این دستگاه بماند؟')).toBeTruthy();
    expect(screen.getByText('گام ۲ از ۲')).toBeTruthy();
    await click('شروع کار با دریک');

    expect(await home()).toBeTruthy();
    expect(server.onboarded(EMAIL)).toBe(true);
  });

  it('asks a User still on their way to an Invitation only their own choices', async () => {
    pendingInvitation.set('invitation-token');
    renderApp({ api: newUser().api });
    await wizard();
    expect(screen.getByText('گام ۱ از ۲')).toBeTruthy();
  });

  it('follows a sign-up', async () => {
    const server = fakeApi();
    renderApp({ path: '/signup', api: server.api });
    await userEvent.type(await screen.findByLabelText('ایمیل'), 'new@example.com');
    await userEvent.type(screen.getByLabelText(/^رمز عبور/), testPassword);
    await userEvent.click(screen.getByRole('button', { name: 'ثبت‌نام' }));

    expect(await wizard()).toBeTruthy();
  });
});
