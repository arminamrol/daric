import type { Subscription } from '@daric/core';
import { isolate } from '@daric/i18n';
import { screen, within } from '@testing-library/react';
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

const plus = {
  signedInDevices: 3,
  shareWorkspace: true,
  aiAnalysesPerMonth: 30,
  aiAnalysesLeftThisMonth: 26,
};

function signedIn(subscription?: Subscription) {
  const fake = fakeApi({ signedInAs: 'sara@example.com' });
  if (subscription) fake.setSubscription(subscription);
  return fake;
}

/** The value next to `term` in the list of Entitlements. */
function entitlement(term: string) {
  const list = within(screen.getByRole('region', { name: 'امکانات شما' }));
  return list.getByText(term).nextElementSibling?.textContent;
}

describe('Subscription page', () => {
  it('opens from Settings and shows the Trial and when it ends', async () => {
    renderApp({
      path: '/settings',
      api: signedIn({
        billingEnabled: true,
        plan: 'PLUS',
        onTrial: true,
        // 23 Oct 2026, 1 Aban 1405 in Tehran.
        trialEndsAt: '2026-10-23T06:30:00.000Z',
        expiresAt: '2026-10-23T06:30:00.000Z',
        graceEndsAt: '2026-10-30T06:30:00.000Z',
        inGracePeriod: false,
        entitlements: plus,
      }).api,
    });
    await userEvent.click(await screen.findByRole('link', { name: 'اشتراک و امکانات طرح شما' }));

    expect(await screen.findByRole('heading', { name: 'اشتراک', level: 1 })).toBeTruthy();
    expect(await screen.findByText('دریک پلاس')).toBeTruthy();
    expect(screen.getByText(`دوره آزمایشی تا ${isolate('۱ آبان ۱۴۰۵')}`)).toBeTruthy();
    expect(entitlement('دستگاه‌های واردشده')).toBe('۳');
    expect(entitlement('اشتراک‌گذاری فضای کاری')).toBe('دارد');
    expect(entitlement('تحلیل هوش مصنوعی در این ماه')).toBe(
      `${isolate('۲۶')} از ${isolate('۳۰')} مانده`,
    );
  });

  it('shows bought Plus with its expiry', async () => {
    renderApp({
      path: '/settings/subscription',
      api: signedIn({
        billingEnabled: true,
        plan: 'PLUS',
        onTrial: false,
        trialEndsAt: '2026-09-01T06:30:00.000Z',
        expiresAt: '2026-10-23T06:30:00.000Z',
        graceEndsAt: '2026-10-30T06:30:00.000Z',
        inGracePeriod: false,
        entitlements: plus,
      }).api,
    });
    expect(await screen.findByText(`فعال تا ${isolate('۱ آبان ۱۴۰۵')}`)).toBeTruthy();
  });

  it('shows Free once Plus has ended, with what Free allows', async () => {
    renderApp({
      path: '/settings/subscription',
      api: signedIn({
        billingEnabled: true,
        plan: 'FREE',
        onTrial: false,
        trialEndsAt: '2026-10-01T06:30:00.000Z',
        expiresAt: '2026-10-01T06:30:00.000Z',
        graceEndsAt: '2026-10-08T06:30:00.000Z',
        inGracePeriod: false,
        entitlements: {
          signedInDevices: 1,
          shareWorkspace: false,
          aiAnalysesPerMonth: 1,
          aiAnalysesLeftThisMonth: 1,
        },
      }).api,
    });
    expect(await screen.findByText('رایگان')).toBeTruthy();
    expect(screen.getByText(`پلاس در ${isolate('۹ مهر ۱۴۰۵')} به پایان رسید.`)).toBeTruthy();
    expect(entitlement('دستگاه‌های واردشده')).toBe('۱');
    expect(entitlement('اشتراک‌گذاری فضای کاری')).toBe('ندارد');
  });

  it('says everything is unlimited when billing is disabled on the server', async () => {
    renderApp({
      path: '/settings/subscription',
      api: signedIn({
        billingEnabled: false,
        plan: 'PLUS',
        onTrial: true,
        trialEndsAt: '2026-10-23T06:30:00.000Z',
        expiresAt: '2026-10-23T06:30:00.000Z',
        graceEndsAt: '2026-10-30T06:30:00.000Z',
        inGracePeriod: false,
        entitlements: {
          signedInDevices: null,
          shareWorkspace: true,
          aiAnalysesPerMonth: null,
          aiAnalysesLeftThisMonth: null,
        },
      }).api,
    });
    expect(
      await screen.findByText('روی این سرور همه امکانات بدون محدودیت در دسترس است.'),
    ).toBeTruthy();
    expect(screen.queryByText('دریک پلاس')).toBeNull();
    expect(entitlement('دستگاه‌های واردشده')).toBe('نامحدود');
    expect(entitlement('تحلیل هوش مصنوعی در این ماه')).toBe('نامحدود');
  });

  it('lists the Signed-in Devices and signs another one out', async () => {
    const fake = signedIn();
    fake.setDevices([
      {
        id: '01900000-0000-7000-8f00-000000000001',
        name: 'Chrome · Windows',
        signedInAt: '2026-10-01T08:00:00.000Z',
        // 17 Mehr 1405.
        lastUsedAt: '2026-10-09T06:00:00.000Z',
        current: true,
      },
      {
        id: '01900000-0000-7000-8f00-000000000002',
        name: null,
        signedInAt: '2026-09-20T08:00:00.000Z',
        // 10 Mehr 1405.
        lastUsedAt: '2026-10-02T06:00:00.000Z',
        current: false,
      },
    ]);
    renderApp({ path: '/settings/subscription', api: fake.api });

    const section = within(await screen.findByRole('region', { name: 'دستگاه‌های واردشده' }));
    expect(section.getByText(`تا ${isolate('۳')} دستگاه هم‌زمان`, { exact: false })).toBeTruthy();
    const items = await section.findAllByRole('listitem');
    const [mine, other] = items;
    if (!mine || !other) throw new Error('expected two devices');
    expect(items.map((item) => item.querySelector('p')?.textContent)).toEqual([
      'Chrome · Windowsهمین دستگاه',
      'دستگاه ناشناخته',
    ]);
    expect(within(mine).getByText(`آخرین استفاده ${isolate('۱۷ مهر ۱۴۰۵')}`)).toBeTruthy();
    expect(within(mine).queryByRole('button')).toBeNull();

    await userEvent.click(
      within(other).getByRole('button', {
        name: `خارج کردن ${isolate('دستگاه ناشناخته')}`,
      }),
    );
    await userEvent.click(within(other).getByRole('button', { name: 'بله، خارج کن' }));
    await vi.waitFor(() => expect(section.getAllByRole('listitem')).toHaveLength(1));
    expect(fake.devices().map((d) => d.id)).toEqual(['01900000-0000-7000-8f00-000000000001']);
  });

  it('gives no device limit when billing is disabled', async () => {
    renderApp({
      path: '/settings/subscription',
      api: signedIn({
        billingEnabled: false,
        plan: 'FREE',
        onTrial: false,
        trialEndsAt: null,
        expiresAt: null,
        graceEndsAt: null,
        inGracePeriod: false,
        entitlements: {
          signedInDevices: null,
          shareWorkspace: true,
          aiAnalysesPerMonth: null,
          aiAnalysesLeftThisMonth: null,
        },
      }).api,
    });
    const section = within(await screen.findByRole('region', { name: 'دستگاه‌های واردشده' }));
    expect(await section.findByText('Chrome · Windows')).toBeTruthy();
    expect(section.queryByText(/هم‌زمان/)).toBeNull();
  });
});
