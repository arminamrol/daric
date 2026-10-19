import type { Subscription } from '@daric/core';
import { isolate } from '@daric/i18n';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reportSignedOut } from '../auth/signedOut';
import { fakeApi } from '../test/fake-api';
import { renderApp } from '../test/render';

// 2026-10-09 10:00 in Tehran.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-09T06:30:00Z'));
});
afterEach(() => vi.useRealTimers());

const plus = {
  signedInDevices: 3,
  shareWorkspace: true,
  aiAnalysesPerMonth: 30,
  aiAnalysesLeftThisMonth: 30,
};

/** Plus ended on 5 Oct; its Grace Period runs to the 12th, three days and a bit from now: 4 days, counting the part. */
const inGrace: Subscription = {
  billingEnabled: true,
  plan: 'PLUS',
  onTrial: false,
  trialEndsAt: '2026-09-01T06:30:00.000Z',
  expiresAt: '2026-10-05T08:00:00.000Z',
  graceEndsAt: '2026-10-12T08:00:00.000Z',
  inGracePeriod: true,
  entitlements: plus,
};

const banner = () => screen.queryByRole('region', { name: 'تمدید دریک پلاس' });

describe('Grace Period banner', () => {
  it('shows the days left and leads to checkout on every page', async () => {
    const fake = fakeApi({ signedInAs: 'sara@example.com' });
    fake.setSubscription(inGrace);
    renderApp({ path: '/transactions', api: fake.api });

    const region = within(
      (await screen.findByRole('region', { name: 'تمدید دریک پلاس' })) as HTMLElement,
    );
    expect(
      region.getByText(new RegExp(`تا ${isolate('۴')} روز دیگر همچنان کار می‌کند`)),
    ).toBeTruthy();
    await userEvent.click(region.getByRole('link', { name: 'تمدید دریک پلاس' }));
    expect(await screen.findByRole('heading', { name: 'خرید دریک پلاس', level: 1 })).toBeTruthy();
  });

  it('says one more day on the last day', async () => {
    const fake = fakeApi({ signedInAs: 'sara@example.com' });
    fake.setSubscription({ ...inGrace, graceEndsAt: '2026-10-09T20:00:00.000Z' });
    renderApp({ path: '/', api: fake.api });
    expect(await screen.findByText(/تا یک روز دیگر همچنان کار می‌کند/)).toBeTruthy();
  });

  it('is not shown while Plus runs, or on a server with billing disabled', async () => {
    const fake = fakeApi({ signedInAs: 'sara@example.com' });
    renderApp({ path: '/', api: fake.api });
    await screen.findByRole('heading', { name: 'به دریک خوش آمدید' });
    expect(banner()).toBeNull();

    fake.setSubscription({ ...inGrace, billingEnabled: false });
    const other = renderApp({ path: '/', api: fake.api });
    await within(other.container).findByRole('heading', { name: 'به دریک خوش آمدید' });
    expect(within(other.container).queryByRole('region', { name: 'تمدید دریک پلاس' })).toBeNull();
  });

  it('shows the end of the Grace Period on the Subscription page', async () => {
    const fake = fakeApi({ signedInAs: 'sara@example.com' });
    fake.setSubscription(inGrace);
    renderApp({ path: '/settings/subscription', api: fake.api });
    expect(
      await screen.findByText(
        `پلاس در ${isolate('۱۳ مهر ۱۴۰۵')} به پایان رسید، اما تا ${isolate('۲۰ مهر ۱۴۰۵')} همچنان کار می‌کند.`,
      ),
    ).toBeTruthy();
  });
});

describe('a suspended Workspace', () => {
  it("tells a Member their access is paused by the Owner's plan", async () => {
    const fake = fakeApi({ signedInAs: 'reza@example.com', role: 'MEMBER' });
    fake.suspend(fake.workspace().id);
    renderApp({ path: '/transactions', api: fake.api });

    expect(
      await screen.findByRole('heading', { name: 'دسترسی با طرح مالک متوقف شده است' }),
    ).toBeTruthy();
    expect(screen.getByText(/چیزی پاک نشده/)).toBeTruthy();
  });

  it('still lets the Member reach their own subscription and consents', async () => {
    const fake = fakeApi({ signedInAs: 'reza@example.com', role: 'MEMBER' });
    fake.suspend(fake.workspace().id);
    renderApp({ path: '/settings/subscription', api: fake.api });
    expect(await screen.findByRole('heading', { name: 'اشتراک', level: 1 })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'دسترسی با طرح مالک متوقف شده است' })).toBeNull();
  });

  it('marks paused Members on the Members page for the Owner', async () => {
    const fake = fakeApi({ signedInAs: 'sara@example.com' });
    fake.addMember('reza@example.com', 'MEMBER');
    fake.suspendMember('reza@example.com');
    renderApp({ path: '/settings/members', api: fake.api });

    const list = within(await screen.findByRole('list', { name: 'اعضا' }));
    const row = list.getByText('reza@example.com').closest('li');
    expect(row && within(row).getByText('متوقف')).toBeTruthy();
    expect(screen.getByText(/دسترسی اعضای «متوقف» با پایان دریک پلاس شما/)).toBeTruthy();
  });
});

describe('signed out when Plus ended', () => {
  it('explains why, with a way to Plus', async () => {
    const fake = fakeApi({ signedInAs: 'sara@example.com' });
    renderApp({ path: '/settings', api: fake.api });
    await screen.findByRole('heading', { name: 'تنظیمات', level: 1 });

    fake.signOutThisDevice();
    act(() => reportSignedOut('PLUS_ENDED'));

    expect((await screen.findByRole('status')).textContent).toContain(
      'از این دستگاه خارج شدید، چون دریک پلاس شما تمام شد',
    );
    expect(
      screen.getByRole('link', { name: 'با دریک پلاس روی دستگاه‌های بیشتری وارد بمانید' }),
    ).toBeTruthy();
  });
});
