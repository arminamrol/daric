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

/** Rial and dollar Accounts, a loan, gold valued in euros and a dollar rate. */
function household(options: Parameters<typeof fakeApi>[0] = {}) {
  const fake = signedIn(options);
  fake.addAccount({ name: 'ملت', openingBalance: 80_000_000n });
  fake.addAccount({ name: 'وام', type: 'LOAN', class: 'LIABILITY', openingBalance: 30_000_000n });
  fake.addAccount({ name: 'دلار نقد', type: 'CASH', currency: 'USD', openingBalance: 10_000n });
  const gold = fake.addAccount({ name: 'طلا', type: 'OTHER_ASSET', currency: 'EUR' });
  fake.addValuation({ accountId: gold.id, amount: 20_000n, valuedOn: '2026-10-01' });
  fake.addRate({ currency: 'USD', rate: '1000000', effectiveOn: '2026-10-01' });
  return { fake, gold };
}

describe('Net Worth', () => {
  it('is reachable from the header', async () => {
    renderApp({ api: signedIn().api });
    await userEvent.click(await screen.findByRole('link', { name: 'دارایی خالص' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'دارایی خالص' })).toBeTruthy();
    expect(await screen.findByText('هنوز حسابی نیست.')).toBeTruthy();
  });

  it('shows Assets minus Liabilities in the Base Currency, with the rate used and a missing rate', async () => {
    const { fake } = household();
    renderApp({ path: '/net-worth', api: fake.api });

    const totals = within(await screen.findByRole('region', { name: 'جمع' }));
    // 80,000,000 + 100 dollars at 1,000,000 − 30,000,000; the euros have no rate.
    expect(totals.getByText('۱۵۰٬۰۰۰٬۰۰۰ ریال')).toBeTruthy();
    expect(totals.getByText('۱۸۰٬۰۰۰٬۰۰۰ ریال')).toBeTruthy();
    expect(totals.getByText('۳۰٬۰۰۰٬۰۰۰ ریال')).toBeTruthy();
    expect(
      totals.getByText(`با نرخ ${isolate('۱ دلار = ۱٬۰۰۰٬۰۰۰ ریال')}، از ${isolate('۱۴۰۵/۰۷/۰۹')}`),
    ).toBeTruthy();
    expect(
      totals.getByText(`نرخی برای یورو تا ${isolate('۱۴۰۵/۰۷/۱۸')} نیست؛ در جمع نیامده است.`),
    ).toBeTruthy();
  });

  it('breaks Net Worth down by currency and by Account', async () => {
    const { fake } = household();
    renderApp({ path: '/net-worth', api: fake.api });

    const byCurrency = within(await screen.findByRole('region', { name: 'به تفکیک ارز' }));
    expect(byCurrency.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('۲۰۰٫۰۰ یورو'),
      expect.stringContaining('۵۰٬۰۰۰٬۰۰۰ ریال'),
      expect.stringContaining('۱۰۰٫۰۰ دلار'),
    ]);

    const assets = within(screen.getByRole('region', { name: 'دارایی‌ها' }));
    const gold = within(assets.getByRole('listitem', { name: 'طلا' }));
    expect(gold.getByText('۲۰۰٫۰۰ یورو')).toBeTruthy();
    expect(gold.getByText(`ارزش‌گذاری ${isolate('۱۴۰۵/۰۷/۰۹')}`)).toBeTruthy();
    expect(gold.getByText('بدون نرخ')).toBeTruthy();
    const dollars = within(assets.getByRole('listitem', { name: 'دلار نقد' }));
    expect(dollars.getByText('مانده حساب')).toBeTruthy();
    expect(dollars.getByText(`≈ ${isolate('۱۰۰٬۰۰۰٬۰۰۰ ریال')}`)).toBeTruthy();
    const liabilities = within(screen.getByRole('region', { name: 'بدهی‌ها' }));
    expect(liabilities.getByRole('listitem', { name: 'وام' }).textContent).toContain(
      '۳۰٬۰۰۰٬۰۰۰ ریال',
    );
  });

  it('leaves out archived Accounts with nothing in them', async () => {
    const fake = signedIn();
    fake.addAccount({ name: 'بسته', archived: true });
    fake.addAccount({ name: 'قدیمی', archived: true, openingBalance: 5n });
    renderApp({ path: '/net-worth', api: fake.api });
    expect(await screen.findByRole('listitem', { name: 'قدیمی' })).toBeTruthy();
    expect(screen.queryByRole('listitem', { name: 'بسته' })).toBeNull();
  });
});

describe('Valuations', () => {
  const newValuationForm = async () =>
    within(await screen.findByRole('form', { name: 'ارزش‌گذاری تازه' }));

  it('let the Owner value an Account from the Net Worth screen, counted instead of its balance', async () => {
    const fake = signedIn();
    fake.addAccount({ name: 'ملت', openingBalance: 1_000_000n });
    fake.addAccount({ name: 'خودرو', type: 'OTHER_ASSET', openingBalance: 5_000_000n });
    fake.addAccount({ name: 'وام', type: 'LOAN', class: 'LIABILITY', openingBalance: 500_000n });
    renderApp({ path: '/net-worth', api: fake.api });
    await userEvent.click(await screen.findByRole('link', { name: 'خودرو' }));

    expect(
      await screen.findByRole('heading', { name: `ارزش‌گذاری ${isolate('خودرو')}` }),
    ).toBeTruthy();
    expect(screen.getByText('هنوز ارزش‌گذاری نشده است.')).toBeTruthy();
    const form = await newValuationForm();
    expect(form.getByRole('textbox', { name: 'تاریخ' })).toHaveProperty('value', '۱۴۰۵/۰۷/۱۸');
    await userEvent.type(form.getByRole('textbox', { name: 'ارزش' }), '۴۵۰٬۰۰۰٬۰۰۰');
    await userEvent.click(form.getByRole('button', { name: 'ثبت ارزش‌گذاری' }));

    const list = within(await screen.findByRole('list', { name: 'ارزش‌گذاری‌ها' }));
    expect(await list.findByText('۴۵۰٬۰۰۰٬۰۰۰ ریال')).toBeTruthy();
    expect(fake.valuations()).toMatchObject([{ amount: 450_000_000n, valuedOn: '2026-10-10' }]);

    await userEvent.click(screen.getByRole('link', { name: 'بازگشت به دارایی خالص' }));
    const totals = within(await screen.findByRole('region', { name: 'جمع' }));
    // 1,000,000 + the car's 450,000,000 instead of its 5,000,000 balance − 500,000.
    expect(await totals.findByText('۴۵۰٬۵۰۰٬۰۰۰ ریال')).toBeTruthy();
  });

  it('list them newest first and delete one', async () => {
    const fake = signedIn();
    const car = fake.addAccount({ name: 'خودرو', type: 'OTHER_ASSET' });
    fake.addValuation({ accountId: car.id, amount: 400_000_000n, valuedOn: '2026-09-01' });
    fake.addValuation({ accountId: car.id, amount: 450_000_000n, valuedOn: '2026-10-01' });
    renderApp({ path: `/accounts/${car.id}/valuations`, api: fake.api });

    const list = within(await screen.findByRole('list', { name: 'ارزش‌گذاری‌ها' }));
    expect(list.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('۴۵۰٬۰۰۰٬۰۰۰ ریال'),
      expect.stringContaining('۴۰۰٬۰۰۰٬۰۰۰ ریال'),
    ]);
    await userEvent.click(
      list.getByRole('button', { name: `حذف ارزش‌گذاری ${isolate('۱۴۰۵/۰۷/۰۹')}` }),
    );
    await waitFor(() => expect(list.getAllByRole('listitem')).toHaveLength(1));
    expect(fake.valuations()).toMatchObject([{ valuedOn: '2026-09-01' }]);
  });

  it('check the value and day, and say when the Account already has a Valuation that day', async () => {
    const fake = signedIn();
    const car = fake.addAccount({ name: 'خودرو', type: 'OTHER_ASSET' });
    fake.addValuation({ accountId: car.id, amount: 1n, valuedOn: '2026-10-10' });
    renderApp({ path: `/accounts/${car.id}/valuations`, api: fake.api });
    const form = await newValuationForm();
    const value = form.getByRole('textbox', { name: 'ارزش' });
    const submit = form.getByRole('button', { name: 'ثبت ارزش‌گذاری' });

    await userEvent.click(submit);
    expect(form.getByText('ارزش را وارد کنید.')).toBeTruthy();
    await userEvent.type(value, '-5');
    await userEvent.click(submit);
    expect(form.getByText('ارزش نمی‌تواند منفی باشد.')).toBeTruthy();
    await userEvent.clear(value);
    await userEvent.type(value, '5');
    await userEvent.click(submit);
    expect(
      await form.findByText('این حساب برای این روز ارزش‌گذاری دارد؛ اول آن را حذف کنید.'),
    ).toBeTruthy();
    expect(fake.valuations()).toHaveLength(1);
  });

  it('take no new Valuation on an archived Account', async () => {
    const fake = signedIn();
    const car = fake.addAccount({ name: 'خودرو', type: 'OTHER_ASSET', archived: true });
    renderApp({ path: `/accounts/${car.id}/valuations`, api: fake.api });
    expect(
      await screen.findByText('این حساب بایگانی شده است و ارزش‌گذاری تازه نمی‌گیرد.'),
    ).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'ارزش‌گذاری تازه' })).toBeNull();
  });

  it('are shown to Members, who cannot change them', async () => {
    const fake = signedIn({ role: 'MEMBER' });
    const car = fake.addAccount({ name: 'خودرو', type: 'OTHER_ASSET' });
    fake.addValuation({ accountId: car.id, amount: 450_000_000n, valuedOn: '2026-10-01' });
    renderApp({ path: `/accounts/${car.id}/valuations`, api: fake.api });
    expect(await screen.findByText('۴۵۰٬۰۰۰٬۰۰۰ ریال')).toBeTruthy();
    expect(
      screen.getByText('فقط مالک و مدیر فضای کاری می‌توانند ارزش‌گذاری وارد یا حذف کنند.'),
    ).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'ارزش‌گذاری تازه' })).toBeNull();
    expect(screen.queryByRole('button', { name: /حذف/ })).toBeNull();
  });

  it('say so for an Account that does not exist', async () => {
    renderApp({ path: '/accounts/01900000-0000-7000-a000-000000000099/valuations' });
    expect(await screen.findByText('این حساب پیدا نشد.')).toBeTruthy();
  });
});

describe('Net Worth history', () => {
  const history = async () => within(await screen.findByRole('region', { name: 'تاریخچه' }));

  it('says the first snapshot comes at the month end when there is none yet', async () => {
    renderApp({ path: '/net-worth', api: signedIn().api });
    const region = await history();
    expect(
      await region.findByText('هنوز چیزی ثبت نشده است. اولین ثبت خودکار پایان همین ماه است.'),
    ).toBeTruthy();
    expect(region.queryByRole('img')).toBeNull();
  });

  it('charts the snapshots with the same numbers in a table, newest first', async () => {
    const fake = signedIn();
    fake.addSnapshot({ day: '2026-08-22', total: 900_000_000n });
    fake.addSnapshot({ day: '2026-09-22', total: 950_000_000n, missing: ['EUR'] });
    renderApp({ path: '/net-worth', api: fake.api });

    const region = await history();
    expect(
      await region.findByRole('img', {
        name: `نمودار دارایی خالص از ${isolate('۱۴۰۵/۰۵/۳۱')} تا ${isolate('۱۴۰۵/۰۶/۳۱')}، به ریال`,
      }),
    ).toBeTruthy();
    await userEvent.click(region.getByText('نمایش به صورت جدول'));
    const table = within(region.getByRole('table', { name: 'تاریخچهٔ دارایی خالص' }));
    const rows = table.getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual([
      '۱۴۰۵/۰۶/۳۱',
      '۱۴۰۵/۰۵/۳۱',
    ]);
    const [latest] = rows;
    expect(latest?.textContent).toContain('پایان ماه');
    expect(latest?.textContent).toContain('۹۵۰٬۰۰۰٬۰۰۰ ریال');
    expect(latest?.textContent).toContain('بی یورو؛ نرخ نداشت');
  });

  it("takes a snapshot of today's Net Worth on demand", async () => {
    const { fake } = household();
    renderApp({ path: '/net-worth', api: fake.api });

    const region = await history();
    await userEvent.click(await region.findByRole('button', { name: 'ثبت دارایی خالص امروز' }));
    expect(await region.findByRole('status')).toHaveProperty(
      'textContent',
      'دارایی خالص امروز ثبت شد.',
    );
    await userEvent.click(await region.findByText('نمایش به صورت جدول'));
    const row = region.getAllByRole('row')[1];
    expect(row?.textContent).toContain('۱۴۰۵/۰۷/۱۸');
    expect(row?.textContent).toContain('دستی');
    expect(row?.textContent).toContain('۱۵۰٬۰۰۰٬۰۰۰ ریال');
  });

  it('lets Viewers look but not take one', async () => {
    const fake = signedIn({ role: 'VIEWER' });
    fake.addSnapshot({ day: '2026-09-22', total: 5n });
    renderApp({ path: '/net-worth', api: fake.api });
    const region = await history();
    expect(await region.findByRole('img')).toBeTruthy();
    expect(region.queryByRole('button')).toBeNull();
  });

  it('leaves out snapshots in a former Base Currency, saying how many', async () => {
    const fake = signedIn();
    fake.addSnapshot({ day: '2026-08-22', total: 100n, baseCurrency: 'USD' });
    fake.addSnapshot({ day: '2026-09-22', total: 5n });
    renderApp({ path: '/net-worth', api: fake.api });
    const region = await history();
    expect(
      await region.findByText('۱ ثبت به ارز پایهٔ دیگری است و این‌جا نیامده است.'),
    ).toBeTruthy();
    await userEvent.click(region.getByText('نمایش به صورت جدول'));
    expect(region.getAllByRole('row')).toHaveLength(2);
  });
});
