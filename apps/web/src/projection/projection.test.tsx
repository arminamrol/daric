import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dayOf, toPersianDigits } from '@daric/core';
import { isolate } from '@daric/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi } from '../test/fake-api';
import { renderApp } from '../test/render';

// 9 October 2026, 17 Mehr 1405 in Tehran: the plan's worked example.
const NOW = new Date('2026-10-09T08:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const j = (year: number, month: number, day: number) => dayOf('jalali', { year, month, day });
/** Million tomans in rials, as the worked example counts. */
const mt = (millions: number) => BigInt(Math.round(millions * 10)) * 1_000_000n;
const rial = (amount: bigint) =>
  `${toPersianDigits(amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '٬'))} ریال`;

const signedIn = (options: Parameters<typeof fakeApi>[0] = {}) =>
  fakeApi({ signedInAs: 'sara@example.com', ...options });

/** The plan's worked example: rent, a subscription and salary repeat; groceries and a side job vary. */
async function workedExample(options: Parameters<typeof fakeApi>[0] = {}) {
  const fake = signedIn(options);
  const workspaceId = fake.workspace().id;
  const account = fake.addAccount({ name: 'ملی' });
  const rent = fake.addCategory({ name: 'اجاره' });
  const groceries = fake.addCategory({ name: 'خوراک' });
  const subscriptions = fake.addCategory({ name: 'اشتراک' });
  const salary = fake.addCategory({ name: 'حقوق', kind: 'INCOME' });
  const side = fake.addCategory({ name: 'کار جانبی', kind: 'INCOME' });
  const rule = (
    name: string,
    type: 'INCOME' | 'EXPENSE',
    categoryId: string,
    amount: bigint,
    startOn: string,
  ) => fake.addRule({ name, type, accountId: account.id, categoryId, amount, startOn });
  const rentRule = rule('اجارهٔ خانه', 'EXPENSE', rent.id, mt(25), j(1405, 1, 1));
  rule('اشتراک فیلم', 'EXPENSE', subscriptions.id, mt(0.5), j(1405, 7, 20));
  const salaryRule = rule('حقوق ماهانه', 'INCOME', salary.id, mt(80), j(1405, 1, 25));
  for (const m of [1, 2, 3, 4, 5, 6, 7]) {
    await fake.api.confirmOccurrence(workspaceId, rentRule.id, j(1405, m, 1));
  }
  for (const m of [1, 2, 3, 4, 5, 6]) {
    await fake.api.confirmOccurrence(workspaceId, salaryRule.id, j(1405, m, 25));
  }
  const add = (
    type: 'INCOME' | 'EXPENSE',
    categoryId: string,
    occurredOn: string,
    amount: bigint,
  ) =>
    fake.addTransaction({
      type,
      accountId: account.id,
      categoryId,
      amount,
      occurredOn,
      labelIds: [],
    });
  // Groceries: Tir 38, Mordad 42, Shahrivar 40, and 125 outside the window.
  add('EXPENSE', groceries.id, j(1405, 4, 10), mt(38));
  add('EXPENSE', groceries.id, j(1405, 5, 5), mt(42));
  add('EXPENSE', groceries.id, j(1405, 6, 31), mt(40));
  add('EXPENSE', groceries.id, j(1405, 1, 15), mt(110));
  add('EXPENSE', groceries.id, j(1405, 7, 17), mt(15));
  // Side income: Tir 10, Mordad 30, Shahrivar 20, and 60 in Farvardin.
  add('INCOME', side.id, j(1405, 4, 2), mt(10));
  add('INCOME', side.id, j(1405, 5, 2), mt(30));
  add('INCOME', side.id, j(1405, 6, 2), mt(20));
  add('INCOME', side.id, j(1405, 1, 2), mt(60));
  return { fake, account, groceries };
}

describe('Projection', () => {
  it('is reachable from the header', async () => {
    renderApp({ api: signedIn().api });
    await userEvent.click(await screen.findByRole('link', { name: 'پیش‌بینی' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'پیش‌بینی پایان سال' }),
    ).toBeTruthy();
    expect(await screen.findByText('هنوز چیزی برای پیش‌بینی نیست.')).toBeTruthy();
    expect(
      screen.getByText(
        'هنوز ماه کاملی سابقه ندارید؛ برای باقی سال جز تکرارشونده‌ها چیزی برآورد نشده است.',
      ),
    ).toBeTruthy();
  });

  it('shows the worked example: Expense 765.33 and Income 1,188.67 million tomans', async () => {
    const { fake } = await workedExample();
    renderApp({ path: '/projection', api: fake.api });

    const totals = within(await screen.findByRole('region', { name: 'جمع' }));
    const expense = within(totals.getByRole('article', { name: 'هزینه' }));
    expect(expense.getByText(rial(7_653_333_333n))).toBeTruthy();
    expect(expense.getByText(rial(mt(420)))).toBeTruthy();
    expect(expense.getByText(rial(2_173_333_333n))).toBeTruthy();
    expect(expense.getByText(rial(mt(128)))).toBeTruthy();
    const income = within(totals.getByRole('article', { name: 'درآمد' }));
    expect(income.getByText(rial(11_886_666_667n))).toBeTruthy();
    expect(income.getByText(rial(mt(480)))).toBeTruthy();
  });

  it('breaks each type down by Category, largest first', async () => {
    const { fake } = await workedExample();
    renderApp({ path: '/projection', api: fake.api });

    const expenses = within(await screen.findByRole('region', { name: 'هزینه به تفکیک دسته' }));
    expect(expenses.getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual([
      'خوراک',
      'اجاره',
      'اشتراک',
    ]);
    const rent = within(expenses.getByRole('listitem', { name: 'اجاره' }));
    expect(rent.getByText(rial(mt(300)))).toBeTruthy();
    expect(
      rent.getByText(
        `تا امروز ${isolate(rial(mt(175)))}، میانگین ${isolate(rial(0n))}، تکرارشونده ${isolate(rial(mt(125)))}`,
      ),
    ).toBeTruthy();
    const incomes = within(screen.getByRole('region', { name: 'درآمد به تفکیک دسته' }));
    expect(incomes.getByRole('listitem', { name: 'حقوق' }).textContent).toContain(rial(mt(960)));
  });

  it('shows every assumption: months left, window, averages and Recurring Rules', async () => {
    const { fake } = await workedExample();
    renderApp({ path: '/projection', api: fake.api });

    const panel = within(await screen.findByRole('region', { name: 'فرض‌ها' }));
    expect(panel.getByText('باقی سال: ۵ ماه کامل و ۱۳ روز از ۳۰ روز این ماه.')).toBeTruthy();
    expect(
      panel.getByText(
        `میانگین ماهانه از ماه‌های ${isolate('تیر ۱۴۰۵')}، ${isolate('مرداد ۱۴۰۵')}، ${isolate('شهریور ۱۴۰۵')}.`,
      ),
    ).toBeTruthy();
    const averages = within(panel.getByRole('list', { name: 'میانگین ماهانه به تفکیک دسته' }));
    expect(averages.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      `خوراک${rial(mt(40))}`,
      `کار جانبی${rial(mt(20))}`,
    ]);
    const rules = within(panel.getByRole('list', { name: 'تکرارشونده‌ها تا پایان سال' }));
    expect(rules.getByRole('listitem', { name: 'اجارهٔ خانه' }).textContent).toContain(
      `۵ بار، جمع ${isolate(rial(mt(125)))}`,
    );
    expect(rules.getByRole('listitem', { name: 'اشتراک فیلم' }).textContent).toContain(
      `۶ بار، جمع ${isolate(rial(mt(3)))}`,
    );
    expect(rules.getByRole('listitem', { name: 'حقوق ماهانه' }).textContent).toContain(
      `۶ بار، جمع ${isolate(rial(mt(480)))}`,
    );
  });

  it('warns when history is short or a currency has no rate', async () => {
    const fake = signedIn();
    const account = fake.addAccount({ name: 'ملی' });
    const dollars = fake.addAccount({ name: 'دلار', type: 'CASH', currency: 'USD' });
    const food = fake.addCategory({ name: 'خوراک' });
    const spend = (accountId: string, amount: bigint, occurredOn: string) =>
      fake.addTransaction({
        type: 'EXPENSE',
        accountId,
        categoryId: food.id,
        amount,
        occurredOn,
        labelIds: [],
      });
    spend(account.id, 900n, j(1405, 6, 20));
    spend(dollars.id, 500n, j(1405, 7, 1));
    renderApp({ path: '/projection', api: fake.api });

    const panel = within(await screen.findByRole('region', { name: 'فرض‌ها' }));
    expect(
      panel.getByText('فقط ۱ ماه از ۳ ماه سابقه دارید؛ میانگین از همان ۱ ماه است.'),
    ).toBeTruthy();
    expect(panel.getByText(`میانگین ماهانه فقط از ${isolate('شهریور ۱۴۰۵')}.`)).toBeTruthy();
    expect(
      panel.getByText(`نرخی برای دلار تا ${isolate('۱۴۰۵/۰۷/۱۷')} نیست؛ در جمع نیامده است.`),
    ).toBeTruthy();
  });

  it('lets an Admin change how many months the average looks back over', async () => {
    const { fake } = await workedExample();
    renderApp({ path: '/projection', api: fake.api });

    const panel = within(await screen.findByRole('region', { name: 'فرض‌ها' }));
    const select = await panel.findByRole('combobox', { name: 'میانگین از چند ماه گذشته' });
    expect((select as HTMLSelectElement).value).toBe('3');
    await userEvent.selectOptions(select, '1');
    await userEvent.click(panel.getByRole('button', { name: 'ذخیره' }));

    await waitFor(() => expect(fake.projectionSettings().trailingMonths).toBe(1));
    expect(
      await panel.findByText(`میانگین ماهانه از ماه‌های ${isolate('شهریور ۱۴۰۵')}.`),
    ).toBeTruthy();
    const expense = within(screen.getByRole('article', { name: 'هزینه' }));
    // Shahrivar alone: 40 × 5.4333…, as before.
    expect(expense.getByText(rial(7_653_333_333n))).toBeTruthy();
  });

  it('shows Viewers the setting without letting them change it', async () => {
    renderApp({ path: '/projection', api: signedIn({ role: 'VIEWER' }).api });

    const panel = within(await screen.findByRole('region', { name: 'فرض‌ها' }));
    expect(await panel.findByText('میانگین از ۳ ماه گذشته گرفته می‌شود.')).toBeTruthy();
    expect(panel.queryByRole('combobox')).toBeNull();
  });
});
