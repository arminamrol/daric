import type { Payment, Subscription } from '@daric/core';
import { isolate } from '@daric/i18n';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { leave } from '../lib/leave';
import { fakeApi } from '../test/fake-api';
import { renderApp } from '../test/render';

// 2026-10-09 10:00 in Tehran is 17 Mehr 1405.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-09T06:30:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const plusEntitlements = {
  signedInDevices: 3,
  shareWorkspace: true,
  aiAnalysesPerMonth: 30,
  aiAnalysesLeftThisMonth: 30,
};
const free: Subscription = {
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
};
const paid: Payment = {
  id: '01900000-0000-7000-8e00-0000000000aa',
  months: 3,
  amount: 5_700_000n,
  currency: 'IRR',
  status: 'PAID',
  receipt: '201',
  // 1 Bahman 1405.
  plusUntil: '2027-01-21T06:30:00.000Z',
  // 17 Mehr 1405.
  createdAt: '2026-10-09T06:00:00.000Z',
  completedAt: '2026-10-09T06:03:00.000Z',
};

function signedIn(subscription?: Subscription) {
  const fake = fakeApi({ signedInAs: 'sara@example.com' });
  if (subscription) fake.setSubscription(subscription);
  return fake;
}

describe('Buying Plus', () => {
  it('opens from the Subscription page, prices each choice on the server and pays', async () => {
    const goTo = vi.spyOn(leave, 'to').mockImplementation(() => undefined);
    const fake = signedIn(free);
    renderApp({ path: '/settings/subscription', api: fake.api });

    await userEvent.click(await screen.findByRole('link', { name: 'خرید دریک پلاس' }));
    expect(await screen.findByRole('heading', { name: 'خرید دریک پلاس', level: 1 })).toBeTruthy();

    // One month is chosen to start with, at the full price.
    const summary = within(await screen.findByRole('region', { name: 'مبلغ قابل پرداخت' }));
    expect(summary.getByText('۲٬۰۰۰٬۰۰۰ ریال')).toBeTruthy();
    expect(summary.queryByText(/تخفیف/)).toBeNull();

    const year = screen.getByRole('radio', { name: new RegExp(`^${isolate('۱۲')} ماه`) });
    expect(year.closest('label')?.textContent).toContain(`${isolate('۱۷')}٪ تخفیف`);
    await userEvent.click(year);
    expect(summary.getByText('۲۰٬۰۰۰٬۰۰۰ ریال')).toBeTruthy();
    expect(summary.getByText('۲۴٬۰۰۰٬۰۰۰ ریال')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'پرداخت با زرین‌پال' }));
    await vi.waitFor(() => expect(goTo).toHaveBeenCalledOnce());
    const [started] = fake.payments();
    expect(started).toMatchObject({ months: 12, amount: 20_000_000n, status: 'PENDING' });
    expect(goTo).toHaveBeenCalledWith(`https://pay.example/start/${started?.id}`);
  });

  it('offers to extend Plus that was bought', async () => {
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
        entitlements: plusEntitlements,
      }).api,
    });
    const link = await screen.findByRole('link', { name: 'تمدید دریک پلاس' });
    expect(link.getAttribute('href')).toBe('/settings/subscription/checkout');
  });

  it('says so when the payment could not be started', async () => {
    vi.spyOn(leave, 'to').mockImplementation(() => undefined);
    const fake = signedIn(free);
    fake.api.checkout = () => Promise.reject(new Error('502'));
    renderApp({ path: '/settings/subscription/checkout', api: fake.api });
    await userEvent.click(await screen.findByRole('button', { name: 'پرداخت با زرین‌پال' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'پرداخت شروع نشد. کمی بعد دوباره امتحان کنید.',
    );
    expect(leave.to).not.toHaveBeenCalled();
  });

  it('sells nothing when billing is disabled on the server', async () => {
    renderApp({
      path: '/settings/subscription/checkout',
      api: signedIn({ ...free, billingEnabled: false }).api,
    });
    expect(
      await screen.findByText('روی این سرور همه امکانات بدون محدودیت در دسترس است.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'پرداخت با زرین‌پال' })).toBeNull();
  });
});

describe('Coming back from the payment', () => {
  it('shows a Paid Payment and lists it in the history', async () => {
    const fake = signedIn();
    fake.addPayment(paid);
    renderApp({ path: `/settings/subscription?payment=${paid.id}`, api: fake.api });

    const result = await screen.findByRole('status', { name: 'نتیجه پرداخت' });
    expect(
      within(result).getByText(`پرداخت انجام شد. پلاس تا ${isolate('۱ بهمن ۱۴۰۵')} فعال است.`),
    ).toBeTruthy();

    const history = within(screen.getByRole('region', { name: 'پرداخت‌ها' }));
    const [row] = await history.findAllByRole('listitem');
    if (!row) throw new Error('expected one Payment');
    expect(within(row).getByText(`${isolate('۳')} ماه`)).toBeTruthy();
    expect(within(row).getByText('۵٬۷۰۰٬۰۰۰ ریال')).toBeTruthy();
    expect(within(row).getByText('پرداخت‌شده')).toBeTruthy();
    expect(within(row).getByText(`کد پیگیری ${isolate('201')}`)).toBeTruthy();
    expect(within(row).getByText('۱۷ مهر ۱۴۰۵')).toBeTruthy();
  });

  it.each([
    ['CANCELED', 'پرداخت لغو شد و مبلغی کسر نشد.', 'لغوشده'],
    [
      'FAILED',
      'پرداخت انجام نشد. اگر مبلغی کسر شده باشد، بانک تا ۷۲ ساعت آن را برمی‌گرداند.',
      'ناموفق',
    ],
  ] as const)('explains a %s Payment', async (status, message, label) => {
    const fake = signedIn();
    fake.addPayment({ ...paid, status, receipt: null, plusUntil: null });
    renderApp({ path: `/settings/subscription?payment=${paid.id}`, api: fake.api });
    const result = await screen.findByRole('status', { name: 'نتیجه پرداخت' });
    expect(result.textContent).toContain(message);
    const history = within(screen.getByRole('region', { name: 'پرداخت‌ها' }));
    expect(await history.findByText(label)).toBeTruthy();
  });

  it('says a Payment is still being confirmed', async () => {
    const fake = signedIn();
    fake.addPayment({
      ...paid,
      status: 'PENDING',
      receipt: null,
      plusUntil: null,
      completedAt: null,
    });
    renderApp({ path: `/settings/subscription?payment=${paid.id}`, api: fake.api });
    const result = await screen.findByRole('status', { name: 'نتیجه پرداخت' });
    expect(result.textContent).toContain('پرداخت هنوز تأیید نشده است.');
  });

  it('says there are no Payments yet', async () => {
    renderApp({ path: '/settings/subscription', api: signedIn().api });
    const history = within(await screen.findByRole('region', { name: 'پرداخت‌ها' }));
    expect(await history.findByText('هنوز پرداختی نکرده‌اید.')).toBeTruthy();
  });
});
