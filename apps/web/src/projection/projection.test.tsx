import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dayOf, formatDay, toPersianDigits } from '@daric/core';
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

/** A day as the app shows it: Jalali, Persian digits. */
const shownDay = (day: string) =>
  formatDay(day, { calendar: 'jalali', locale: 'fa', digits: 'persian' });

const signedIn = (options: Parameters<typeof fakeApi>[0] = {}) =>
  fakeApi({ signedInAs: 'sara@example.com', ...options });

/**
 * The plan's worked example: rent, a subscription and salary repeat; groceries
 * and a side job vary. With `installments`, 8 of each window month's 38/42/40
 * of groceries are a loan's installments instead.
 */
async function workedExample(
  options: Parameters<typeof fakeApi>[0] = {},
  { installments = false } = {},
) {
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
  const installment = fake.addCategory({ name: 'قسط' });
  const loan = installments ? mt(8) : 0n;
  add('EXPENSE', groceries.id, j(1405, 4, 10), mt(38) - loan);
  add('EXPENSE', groceries.id, j(1405, 5, 5), mt(42) - loan);
  add('EXPENSE', groceries.id, j(1405, 6, 31), mt(40) - loan);
  if (installments) {
    for (const m of [4, 5, 6]) add('EXPENSE', installment.id, j(1405, m, 10), loan);
  }
  add('EXPENSE', groceries.id, j(1405, 1, 15), mt(110));
  add('EXPENSE', groceries.id, j(1405, 7, 17), mt(15));
  // Side income: Tir 10, Mordad 30, Shahrivar 20, and 60 in Farvardin.
  add('INCOME', side.id, j(1405, 4, 2), mt(10));
  add('INCOME', side.id, j(1405, 5, 2), mt(30));
  add('INCOME', side.id, j(1405, 6, 2), mt(20));
  add('INCOME', side.id, j(1405, 1, 2), mt(60));
  return { fake, account, groceries, rent, installment, salary };
}

/** The plan's Planned Items: rent 25 and installments 8 a month, insurance 15 once, salary 80 a month. */
function addPlan(
  fake: ReturnType<typeof signedIn>,
  { rent, installment, salary }: Record<'rent' | 'installment' | 'salary', { id: string }>,
) {
  fake.addPlannedItem({
    name: 'اجاره',
    kind: 'FIXED_MONTHLY',
    type: 'EXPENSE',
    categoryId: rent.id,
    amount: mt(25),
    startOn: j(1405, 1, 1),
  });
  fake.addPlannedItem({
    name: 'قسط وام',
    kind: 'FIXED_MONTHLY',
    type: 'EXPENSE',
    categoryId: installment.id,
    amount: mt(8),
    startOn: j(1405, 1, 10),
  });
  fake.addPlannedItem({
    name: 'بیمهٔ خودرو',
    kind: 'ONE_OFF',
    type: 'EXPENSE',
    amount: mt(15),
    startOn: j(1405, 9, 1),
  });
  fake.addPlannedItem({
    name: 'حقوق',
    kind: 'FIXED_MONTHLY',
    type: 'INCOME',
    categoryId: salary.id,
    amount: mt(80),
    startOn: j(1405, 1, 25),
  });
}

async function withPlannedItems() {
  const example = await workedExample({}, { installments: true });
  addPlan(example.fake, example);
  return example;
}

/**
 * For Viewers, who cannot confirm occurrences: the Planned Items alone, with
 * the subscription's rule (0.5 × 6 = 3) in a Category none of them plans for.
 */
function viewerWithPlan() {
  const fake = signedIn({ role: 'VIEWER' });
  const account = fake.addAccount({ name: 'ملی' });
  const subscriptions = fake.addCategory({ name: 'اشتراک' });
  fake.addRule({
    name: 'اشتراک فیلم',
    type: 'EXPENSE',
    accountId: account.id,
    categoryId: subscriptions.id,
    amount: mt(0.5),
    startOn: j(1405, 7, 20),
  });
  addPlan(fake, {
    rent: fake.addCategory({ name: 'اجاره' }),
    installment: fake.addCategory({ name: 'قسط' }),
    salary: fake.addCategory({ name: 'حقوق', kind: 'INCOME' }),
  });
  return fake;
}

const totalsOf = async (type: 'هزینه' | 'درآمد') =>
  within(
    within(await screen.findByRole('region', { name: 'جمع' })).getByRole('article', {
      name: type,
    }),
  );

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

  it('switches to Manual: Expense 600 and Income 1,080 million tomans, kept for the Workspace', async () => {
    const { fake } = await withPlannedItems();
    renderApp({ path: '/projection', api: fake.api });

    expect(await screen.findByRole('radio', { name: 'خودکار', checked: true })).toBeTruthy();
    await userEvent.click(screen.getByRole('radio', { name: 'دستی' }));

    const expense = await totalsOf('هزینه');
    expect(await expense.findByText(rial(mt(600)))).toBeTruthy();
    expect(expense.getByText(rial(mt(180)))).toBeTruthy();
    expect(expense.queryByText('تکرارشونده‌ها')).toBeNull();
    const income = await totalsOf('درآمد');
    expect(income.getByText(rial(mt(1080)))).toBeTruthy();
    expect(screen.getByText('آنچه تا امروز گذشته، به‌اضافهٔ اقلام برنامه‌ریزی‌شده.')).toBeTruthy();
    await waitFor(() => expect(fake.projectionSettings().mode).toBe('MANUAL'));

    const panel = within(screen.getByRole('region', { name: 'فرض‌ها' }));
    expect(panel.queryByRole('list', { name: 'میانگین ماهانه به تفکیک دسته' })).toBeNull();
    expect(panel.queryByRole('combobox')).toBeNull();
    const planned = within(panel.getByRole('list', { name: 'اقلام برنامه‌ریزی‌شده تا پایان سال' }));
    expect(planned.getByRole('listitem', { name: 'قسط وام' }).textContent).toContain(
      `۵ بار، جمع ${isolate(rial(mt(40)))}`,
    );
    expect(planned.getByRole('listitem', { name: 'بیمهٔ خودرو' }).textContent).toContain(
      'بدون دسته',
    );
    const expenses = within(screen.getByRole('region', { name: 'هزینه به تفکیک دسته' }));
    expect(
      expenses
        .getByRole('listitem', { name: 'اجاره' })
        .textContent?.includes(
          `تا امروز ${isolate(rial(mt(175)))}، برنامه‌ریزی‌شده ${isolate(rial(mt(125)))}`,
        ),
    ).toBe(true);
    expect(expenses.getByRole('listitem', { name: 'بدون دسته' }).textContent).toContain(
      rial(mt(15)),
    );
  });

  it('projects Combined by Precedence: Expense 776.87 and Income 1,188.67 million tomans', async () => {
    const { fake } = await withPlannedItems();
    renderApp({ path: '/projection', api: fake.api });

    await userEvent.click(await screen.findByRole('radio', { name: 'ترکیبی' }));
    const expense = await totalsOf('هزینه');
    expect(await expense.findByText(rial(7_768_666_667n))).toBeTruthy();
    const income = await totalsOf('درآمد');
    expect(income.getByText(rial(11_886_666_667n))).toBeTruthy();
    const panel = within(screen.getByRole('region', { name: 'فرض‌ها' }));
    // Rent's and salary's rules give way to their Planned Items; the subscription's stays.
    const rules = within(panel.getByRole('list', { name: 'تکرارشونده‌ها تا پایان سال' }));
    expect(rules.getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual([
      'اشتراک فیلم',
    ]);
    const averages = within(panel.getByRole('list', { name: 'میانگین ماهانه به تفکیک دسته' }));
    expect(averages.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      `خوراک${rial(mt(32))}`,
      `کار جانبی${rial(mt(20))}`,
    ]);
  });

  it('opens in the Workspace’s mode, and lets a Viewer look at another without keeping it', async () => {
    const fake = viewerWithPlan();
    fake.setProjectionMode('MANUAL');
    renderApp({ path: '/projection', api: fake.api });

    // 125 + 40 + 15 planned; Combined adds the subscription's 3.
    expect(await (await totalsOf('هزینه')).findAllByText(rial(mt(180)))).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'دستی', checked: true })).toBeTruthy();
    await userEvent.click(screen.getByRole('radio', { name: 'ترکیبی' }));
    expect(await (await totalsOf('هزینه')).findByText(rial(mt(183)))).toBeTruthy();
    expect(fake.projectionSettings().mode).toBe('MANUAL');
  });

  describe('Planned Items', () => {
    it('are listed for every Member, without a way to change them below Admin', async () => {
      const fake = viewerWithPlan();
      renderApp({ path: '/projection', api: fake.api });

      const section = within(await screen.findByRole('region', { name: 'اقلام برنامه‌ریزی‌شده' }));
      const rent = within(await section.findByRole('listitem', { name: 'اجاره' }));
      expect(rent.getByText(/ثابت ماهانه · هزینه · اجاره/)).toBeTruthy();
      expect(
        within(section.getByRole('listitem', { name: 'بیمهٔ خودرو' })).getByText(
          `یک‌باره · هزینه · بدون دسته · ${isolate(rial(mt(15)))} در ${isolate(shownDay(j(1405, 9, 1)))}`,
        ),
      ).toBeTruthy();
      expect(section.queryByRole('link')).toBeNull();
    });

    it('lets an Admin add a Fixed Monthly item, which needs a Category', async () => {
      const { fake, installment } = await workedExample();
      renderApp({ path: '/projection', api: fake.api });

      await userEvent.click(await screen.findByRole('link', { name: 'قلم تازه' }));
      const form = within(await screen.findByRole('form', { name: 'قلم برنامه‌ریزی‌شدهٔ تازه' }));
      expect(form.getByRole('radio', { name: 'ثابت ماهانه', checked: true })).toBeTruthy();
      await userEvent.type(form.getByRole('textbox', { name: 'نام' }), 'قسط وام');
      await userEvent.type(form.getByRole('textbox', { name: 'مبلغ' }), '80000000');
      await userEvent.click(form.getByRole('button', { name: 'ساخت' }));
      expect(form.getByText('قلم ثابت ماهانه دسته می‌خواهد.')).toBeTruthy();
      expect(fake.plannedItems()).toEqual([]);

      await userEvent.selectOptions(form.getByRole('combobox', { name: 'دسته' }), 'قسط');
      const start = form.getByRole('textbox', { name: 'اولین ماه' });
      await userEvent.clear(start);
      await userEvent.type(start, shownDay(j(1405, 8, 10)));
      await userEvent.type(
        form.getByRole('textbox', { name: 'پایان (اختیاری)' }),
        shownDay(j(1405, 12, 10)),
      );
      await userEvent.click(form.getByRole('button', { name: 'ساخت' }));

      const section = within(await screen.findByRole('region', { name: 'اقلام برنامه‌ریزی‌شده' }));
      expect(await section.findByRole('listitem', { name: 'قسط وام' })).toBeTruthy();
      expect(fake.plannedItems()).toMatchObject([
        {
          name: 'قسط وام',
          kind: 'FIXED_MONTHLY',
          type: 'EXPENSE',
          categoryId: installment.id,
          amount: mt(8),
          currency: 'IRR',
          startOn: j(1405, 8, 10),
          endOn: j(1405, 12, 10),
        },
      ]);
    });

    it('lets an Admin add a One-Off with no Category, and no end', async () => {
      const { fake } = await workedExample();
      renderApp({ path: '/projection/planned/new', api: fake.api });

      const form = within(await screen.findByRole('form', { name: 'قلم برنامه‌ریزی‌شدهٔ تازه' }));
      await userEvent.click(form.getByRole('radio', { name: 'یک‌باره' }));
      expect(form.queryByRole('textbox', { name: 'پایان (اختیاری)' })).toBeNull();
      await userEvent.type(form.getByRole('textbox', { name: 'نام' }), 'بیمهٔ خودرو');
      await userEvent.type(form.getByRole('textbox', { name: 'مبلغ' }), '150000000');
      const day = form.getByRole('textbox', { name: 'روز' });
      await userEvent.clear(day);
      await userEvent.type(day, shownDay(j(1405, 9, 1)));
      await userEvent.click(form.getByRole('button', { name: 'ساخت' }));

      await screen.findByRole('region', { name: 'اقلام برنامه‌ریزی‌شده' });
      expect(fake.plannedItems()).toMatchObject([
        { name: 'بیمهٔ خودرو', kind: 'ONE_OFF', categoryId: null, endOn: null, amount: mt(15) },
      ]);
    });

    it('lets an Admin change and delete an item', async () => {
      const { fake } = await withPlannedItems();
      renderApp({ path: '/projection', api: fake.api });

      await userEvent.click(
        await screen.findByRole('link', { name: `ویرایش ${isolate('قسط وام')}` }),
      );
      const form = within(await screen.findByRole('form', { name: 'ویرایش قلم برنامه‌ریزی‌شده' }));
      // Its kind and type stay as made.
      expect(form.queryByRole('radio')).toBeNull();
      const amount = form.getByRole('textbox', { name: 'مبلغ' });
      await userEvent.clear(amount);
      await userEvent.type(amount, '90000000');
      await userEvent.click(form.getByRole('button', { name: 'ذخیره' }));
      await screen.findByRole('region', { name: 'اقلام برنامه‌ریزی‌شده' });
      expect(fake.plannedItems().find((i) => i.name === 'قسط وام')).toMatchObject({
        amount: mt(9),
        version: 2,
      });

      await userEvent.click(
        await screen.findByRole('link', { name: `ویرایش ${isolate('بیمهٔ خودرو')}` }),
      );
      await userEvent.click(await screen.findByRole('button', { name: 'حذف قلم' }));
      await screen.findByRole('region', { name: 'اقلام برنامه‌ریزی‌شده' });
      expect(fake.plannedItems().map((i) => i.name)).toEqual(['اجاره', 'قسط وام', 'حقوق']);
    });
  });
});
