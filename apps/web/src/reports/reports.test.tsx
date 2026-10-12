import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dayOf } from '@daric/core';
import { isolate } from '@daric/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi } from '../test/fake-api';
import { renderApp } from '../test/render';

// 9 October 2026: 17 Mehr 1405 in Tehran.
const NOW = new Date('2026-10-09T08:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const j = (year: number, month: number, day: number) => dayOf('jalali', { year, month, day });

const signedIn = (options: Parameters<typeof fakeApi>[0] = {}) =>
  fakeApi({ signedInAs: 'sara@example.com', ...options });

/** A month of food (with groceries under it), rent, salary and a Label, plus last month's rent. */
function household(options: Parameters<typeof fakeApi>[0] = {}) {
  const fake = signedIn(options);
  const account = fake.addAccount({ name: 'ملی' });
  const savings = fake.addAccount({ name: 'پس‌انداز' });
  const food = fake.addCategory({ name: 'خوراک' });
  const groceries = fake.addCategory({ name: 'خواربار', parentId: food.id });
  const rent = fake.addCategory({ name: 'اجاره' });
  const salary = fake.addCategory({ name: 'حقوق', kind: 'INCOME' });
  const out = fake.addLabel({ name: 'بیرون‌غذا' });
  const add = (
    type: 'INCOME' | 'EXPENSE',
    categoryId: string,
    occurredOn: string,
    amount: bigint,
    labelIds: string[] = [],
  ) =>
    fake.addTransaction({ type, accountId: account.id, categoryId, amount, occurredOn, labelIds });
  add('EXPENSE', food.id, j(1405, 7, 2), 100_000n, [out.id]);
  add('EXPENSE', groceries.id, j(1405, 7, 3), 300_000n);
  add('EXPENSE', rent.id, j(1405, 7, 1), 1_600_000n);
  add('INCOME', salary.id, j(1405, 7, 1), 5_000_000n);
  add('EXPENSE', rent.id, j(1405, 6, 1), 1_500_000n);
  fake.addTransaction({
    type: 'TRANSFER',
    accountId: account.id,
    toAccountId: savings.id,
    amount: 9_000_000n,
    toAmount: 9_000_000n,
    occurredOn: j(1405, 7, 5),
    labelIds: [],
  });
  return fake;
}

async function section(name: string) {
  return within(await screen.findByRole('region', { name }));
}

describe('Reports', () => {
  it('sum up the current month in the Base Currency, leaving out Transfers', async () => {
    renderApp({ path: '/reports', api: household().api });

    expect(await screen.findByRole('heading', { level: 1, name: 'گزارش‌ها' })).toBeTruthy();
    expect(screen.getByText('مهر ۱۴۰۵')).toBeTruthy();
    const summary = await section('خلاصه');
    const figures = summary.getAllByRole('definition').map((dd) => dd.textContent);
    expect(figures).toEqual(['۵٬۰۰۰٬۰۰۰ ریال', '۲٬۰۰۰٬۰۰۰ ریال', '۳٬۰۰۰٬۰۰۰ ریال']);
  });

  it('break Expense down by Category, with children under their parent and shares', async () => {
    renderApp({ path: '/reports', api: household().api });

    const expense = await section('هزینه به تفکیک دسته');
    const rows = expense.getAllByRole('row').slice(1);
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual([
      'اجاره',
      'خوراک',
      `${isolate('خوراک')} (خود دسته)`,
      `${isolate('خوراک')} › ${isolate('خواربار')}`,
    ]);
    expect(rows[0]?.textContent).toContain('۱٬۶۰۰٬۰۰۰ ریال');
    expect(rows[0]?.textContent).toContain('۸۰٪');
    expect(rows[1]?.textContent).toContain('۴۰۰٬۰۰۰ ریال');
    expect(rows[1]?.textContent).toContain('۲۰٪');
    expect(rows[3]?.textContent).toContain('۱۵٪');
    const income = await section('درآمد به تفکیک دسته');
    expect(income.getByRole('rowheader', { name: 'حقوق' })).toBeTruthy();
  });

  it('break the month down by Label, with what carried none', async () => {
    renderApp({ path: '/reports', api: household().api });

    const labels = await section('به تفکیک برچسب');
    const rows = labels.getAllByRole('row').slice(1);
    expect(rows[0]?.textContent).toContain('بیرون‌غذا');
    expect(rows[0]?.textContent).toContain('۱۰۰٬۰۰۰ ریال · ۵٪');
    expect(rows[1]?.textContent).toContain('بی برچسب');
    expect(rows[1]?.textContent).toContain('۱٬۹۰۰٬۰۰۰ ریال');
    expect(rows[1]?.textContent).toContain('۵٬۰۰۰٬۰۰۰ ریال');
  });

  it('chart the twelve months up to the Period, with the same numbers in a table', async () => {
    renderApp({ path: '/reports', api: household().api });

    const trend = await section('درآمد و هزینهٔ ماه‌ها');
    expect(
      await trend.findByRole('img', {
        name: `نمودار ستونی درآمد و هزینه از ${isolate('آبان ۱۴۰۴')} تا ${isolate('مهر ۱۴۰۵')}، به ریال`,
      }),
    ).toBeTruthy();
    await userEvent.click(trend.getByText('نمایش به صورت جدول'));
    const table = within(trend.getByRole('table', { name: 'درآمد و هزینهٔ ماه‌ها' }));
    const rows = table.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(12);
    expect(rows[0]?.textContent).toContain('مهر ۱۴۰۵');
    expect(rows[1]?.textContent).toContain('شهریور ۱۴۰۵');
    expect(rows[1]?.textContent).toContain('-۱٬۵۰۰٬۰۰۰ ریال');
  });

  it('switch to the whole year and step between years', async () => {
    renderApp({ path: '/reports', api: household().api });

    await userEvent.click(await screen.findByRole('link', { name: 'سالانه' }));
    expect(await screen.findByText('۱۴۰۵')).toBeTruthy();
    const summary = await section('خلاصه');
    expect(await summary.findByText('۳٬۵۰۰٬۰۰۰ ریال')).toBeTruthy();

    await userEvent.click(screen.getByRole('link', { name: 'سال قبل' }));
    expect(await screen.findByText('۱۴۰۴')).toBeTruthy();
    expect(await screen.findByText('در این بازه درآمد یا هزینه‌ای ثبت نشده است.')).toBeTruthy();
  });

  it('warn about a currency with no rate, which the totals leave out', async () => {
    const fake = household();
    const dollars = fake.addAccount({ name: 'دلار', currency: 'USD' });
    const rent = fake.categories().find((c) => c.name === 'اجاره');
    if (!rent) throw new Error('No rent Category');
    fake.addTransaction({
      type: 'EXPENSE',
      accountId: dollars.id,
      categoryId: rent.id,
      amount: 500n,
      occurredOn: j(1405, 7, 4),
      labelIds: [],
    });
    renderApp({ path: '/reports', api: fake.api });

    const summary = await section('خلاصه');
    expect(await summary.findByText(/نرخی برای دلار/)).toBeTruthy();
    expect(summary.getAllByRole('definition')[1]?.textContent).toBe('۲٬۰۰۰٬۰۰۰ ریال');
  });

  describe('controllable spending', () => {
    /** Eating out and subscriptions flagged controllable, over three months, plus rent. */
    function spender() {
      const fake = signedIn();
      const account = fake.addAccount({ name: 'ملی' });
      const food = fake.addCategory({ name: 'خوراک' });
      const rent = fake.addCategory({ name: 'اجاره' });
      const out = fake.addLabel({ name: 'بیرون‌غذا', controllable: true });
      const subs = fake.addLabel({ name: 'اشتراک‌ها', controllable: true });
      const add = (categoryId: string, occurredOn: string, amount: bigint, labelIds: string[]) =>
        fake.addTransaction({
          type: 'EXPENSE',
          accountId: account.id,
          categoryId,
          amount,
          occurredOn,
          labelIds,
        });
      add(food.id, j(1405, 5, 10), 400_000n, [subs.id]);
      add(food.id, j(1405, 6, 10), 200_000n, [out.id, subs.id]);
      add(food.id, j(1405, 7, 2), 100_000n, [out.id]);
      add(rent.id, j(1405, 7, 1), 1_600_000n, []);
      return fake;
    }

    it('sum up the month’s controllable spending, its share, Labels and months', async () => {
      renderApp({ path: '/reports', api: spender().api });

      const controllable = await section('هزینه‌های قابل کنترل');
      const figures = controllable.getAllByRole('definition').map((dd) => dd.textContent);
      expect(figures.slice(0, 2)).toEqual(['۱۰۰٬۰۰۰ ریال', '۶٪']);
      const labels = within(controllable.getByRole('table', { name: 'به تفکیک برچسب قابل کنترل' }));
      const labelRows = labels.getAllByRole('row').slice(1);
      expect(labelRows).toHaveLength(1);
      expect(labelRows[0]?.textContent).toContain('بیرون‌غذا');
      expect(labelRows[0]?.textContent).toContain('۱۰۰٬۰۰۰ ریال');
      const months = within(controllable.getByRole('table', { name: 'هزینهٔ قابل کنترل ماه‌ها' }));
      const monthRows = months.getAllByRole('row').slice(1);
      expect(monthRows).toHaveLength(12);
      expect(monthRows[0]?.textContent).toContain('مهر ۱۴۰۵');
      expect(monthRows[1]?.textContent).toContain('۲۰۰٬۰۰۰ ریال');
      expect(monthRows[2]?.textContent).toContain('۴۰۰٬۰۰۰ ریال');
    });

    it('estimate what reducing it by 20% saves, and follow the slider', async () => {
      renderApp({ path: '/reports', api: spender().api });

      const controllable = await section('هزینه‌های قابل کنترل');
      const slider = controllable.getByRole('slider', { name: 'کاهش هزینهٔ قابل کنترل' });
      expect(slider).toHaveProperty('value', '20');
      expect(
        controllable.getByText('بر پایهٔ میانگین ۲ ماه گذشته: ۳۰۰٬۰۰۰ ریال در ماه.'),
      ).toBeTruthy();
      const savings = () =>
        within(controllable.getByRole('status'))
          .getAllByRole('definition')
          .map((dd) => dd.textContent);
      expect(savings()).toEqual(['۶۰٬۰۰۰ ریال', '۷۲۰٬۰۰۰ ریال']);

      fireEvent.change(slider, { target: { value: '50' } });
      expect(slider.getAttribute('aria-valuetext')).toBe('۵۰٪');
      expect(savings()).toEqual(['۱۵۰٬۰۰۰ ریال', '۱٬۸۰۰٬۰۰۰ ریال']);
    });

    it('point to the Labels page while no Label is controllable', async () => {
      renderApp({ path: '/reports', api: household().api });

      const controllable = await section('هزینه‌های قابل کنترل');
      expect(controllable.getByText(/هیچ برچسبی قابل کنترل نیست/)).toBeTruthy();
      expect(controllable.getByRole('link', { name: 'برچسب‌ها' }).getAttribute('href')).toBe(
        '/labels',
      );
      expect(controllable.queryByRole('slider')).toBeNull();
    });
  });
});
