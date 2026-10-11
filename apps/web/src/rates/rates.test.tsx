import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isolate } from '@daric/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi } from '../test/fake-api';
import { renderApp } from '../test/render';

// 10 October 2026, 18 Mehr 1405, in Tehran.
const NOW = new Date('2026-10-10T08:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const signedIn = (options: Parameters<typeof fakeApi>[0] = {}) =>
  fakeApi({ signedInAs: 'sara@example.com', ...options });

const newRateForm = async () => within(await screen.findByRole('form', { name: 'نرخ تازه' }));

describe('Exchange Rates', () => {
  it('are reachable from the header', async () => {
    renderApp({ api: signedIn().api });
    await userEvent.click(await screen.findByRole('link', { name: 'نرخ ارز' }));
    expect(await screen.findByText('هنوز نرخی نیست.')).toBeTruthy();
  });

  it('let the Owner enter a rate in tomans, stored in rials, from today by default', async () => {
    const fake = signedIn();
    fake.workspace().moneyDisplay = 'toman';
    renderApp({ path: '/rates', api: fake.api });
    await userEvent.click(await screen.findByRole('link', { name: 'نرخ تازه' }));
    const form = await newRateForm();
    // The Base Currency needs no rate.
    expect(
      within(form.getByRole('combobox', { name: 'ارز' }))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['دلار', 'یورو']);
    expect(form.getByText('یک دلار چند تومان می‌ارزد.')).toBeTruthy();
    expect(form.getByRole('textbox', { name: 'از تاریخ' })).toHaveProperty('value', '۱۴۰۵/۰۷/۱۸');
    await userEvent.type(form.getByRole('textbox', { name: 'نرخ' }), '۱۰۵٬۰۰۰');
    await userEvent.click(form.getByRole('button', { name: 'ثبت نرخ' }));

    const dollar = within(await screen.findByRole('region', { name: 'دلار' }));
    expect(dollar.getByText('۱ دلار = ۱۰۵٬۰۰۰ تومان')).toBeTruthy();
    expect(dollar.getByText(`از ${isolate('۱۴۰۵/۰۷/۱۸')}`)).toBeTruthy();
    expect(fake.rates()).toMatchObject([
      { currency: 'USD', rate: '1050000', effectiveOn: '2026-10-10', baseCurrency: 'IRR' },
    ]);
  });

  it('list each currency newest first, marking the rate in force today', async () => {
    const fake = signedIn();
    fake.addRate({ currency: 'USD', rate: '1000000', effectiveOn: '2026-09-01' });
    fake.addRate({ currency: 'USD', rate: '1050000.5', effectiveOn: '2026-10-01' });
    fake.addRate({ currency: 'USD', rate: '1100000', effectiveOn: '2026-10-20' });
    fake.addRate({ currency: 'EUR', rate: '1200000', effectiveOn: '2026-10-01' });
    renderApp({ path: '/rates', api: fake.api });

    const dollar = within(await screen.findByRole('region', { name: 'دلار' }));
    const rows = dollar.getAllByRole('listitem');
    expect(rows.map((row) => within(row).getByRole('link').textContent)).toEqual([
      '۱ دلار = ۱٬۱۰۰٬۰۰۰ ریال',
      '۱ دلار = ۱٬۰۵۰٬۰۰۰٫۵ ریال',
      '۱ دلار = ۱٬۰۰۰٬۰۰۰ ریال',
    ]);
    expect(within(rows[1] as HTMLElement).getByText('نرخ امروز')).toBeTruthy();
    expect(dollar.getAllByText('نرخ امروز')).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'یورو' })).toBeTruthy();
  });

  it('check the rate and day, and say when the currency already has a rate that day', async () => {
    const fake = signedIn();
    fake.addRate({ currency: 'USD', rate: '1000000', effectiveOn: '2026-10-10' });
    renderApp({ path: '/rates/new', api: fake.api });
    const form = await newRateForm();
    const rate = form.getByRole('textbox', { name: 'نرخ' });
    const day = form.getByRole('textbox', { name: 'از تاریخ' });
    const submit = form.getByRole('button', { name: 'ثبت نرخ' });

    await userEvent.click(submit);
    expect(await form.findByText('نرخ را وارد کنید.')).toBeTruthy();
    expect(document.activeElement).toBe(rate);
    await userEvent.type(rate, '0');
    await userEvent.click(submit);
    expect(await form.findByText('نرخ باید بیشتر از صفر باشد.')).toBeTruthy();
    await userEvent.clear(rate);
    await userEvent.type(rate, '12abc');
    await userEvent.click(submit);
    expect(await form.findByText('نرخ را به شکل عدد وارد کنید.')).toBeTruthy();

    await userEvent.clear(rate);
    await userEvent.type(rate, '1100000');
    await userEvent.clear(day);
    await userEvent.type(day, '1405/13/01');
    await userEvent.click(submit);
    expect(await form.findByText('تاریخ را به شکل سال/ماه/روز وارد کنید.')).toBeTruthy();

    await userEvent.clear(day);
    await userEvent.type(day, '1405/07/18');
    await userEvent.click(submit);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'این ارز برای این روز نرخ دارد؛ همان را ویرایش کنید.',
    );
    expect(fake.rates()).toHaveLength(1);
  });

  it('change the rate and day of one, keeping its currency, and delete it', async () => {
    const fake = signedIn();
    fake.addRate({ currency: 'USD', rate: '1000000', effectiveOn: '2026-10-01' });
    renderApp({ path: '/rates', api: fake.api });
    await userEvent.click(
      await screen.findByRole('link', {
        name: `ویرایش نرخ ${isolate('دلار')} از ${isolate('۱۴۰۵/۰۷/۰۹')}`,
      }),
    );
    const form = within(await screen.findByRole('form', { name: 'ویرایش نرخ' }));
    expect(form.getByRole('combobox', { name: 'ارز' })).toHaveProperty('disabled', true);
    const rate = form.getByRole('textbox', { name: 'نرخ' });
    expect(rate).toHaveProperty('value', '۱٬۰۰۰٬۰۰۰');
    await userEvent.clear(rate);
    await userEvent.type(rate, '1,020,000');
    await userEvent.click(form.getByRole('button', { name: 'ذخیره' }));
    expect(await screen.findByText('۱ دلار = ۱٬۰۲۰٬۰۰۰ ریال')).toBeTruthy();
    expect(fake.rates()).toMatchObject([
      { rate: '1020000', effectiveOn: '2026-10-01', version: 2 },
    ]);

    await userEvent.click(
      screen.getByRole('link', {
        name: `ویرایش نرخ ${isolate('دلار')} از ${isolate('۱۴۰۵/۰۷/۰۹')}`,
      }),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'حذف نرخ' }));
    expect(await screen.findByText('هنوز نرخی نیست.')).toBeTruthy();
    expect(fake.rates()).toEqual([]);
  });

  it('are read-only for a Member', async () => {
    const fake = signedIn({ role: 'MEMBER' });
    const rate = fake.addRate({ currency: 'USD', rate: '1000000', effectiveOn: '2026-10-01' });
    const { router } = renderApp({ path: '/rates', api: fake.api });
    expect(await screen.findByText('۱ دلار = ۱٬۰۰۰٬۰۰۰ ریال')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'نرخ تازه' })).toBeNull();
    expect(screen.queryByRole('link', { name: /ویرایش نرخ/ })).toBeNull();
    expect(
      screen.getByText('فقط مالک و مدیر فضای کاری می‌توانند نرخ‌ها را وارد یا ویرایش کنند.'),
    ).toBeTruthy();
    await router.navigate(`/rates/${rate.id}`);
    await waitFor(() => expect(router.state.location.pathname).toBe('/rates'));
  });
});
