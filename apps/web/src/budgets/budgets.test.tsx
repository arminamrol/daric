import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { monthPeriodOfDay, periodDays, periodParam, previousPeriod, todayIn } from '@daric/core';
import { isolate } from '@daric/i18n';
import { describe, expect, it } from 'vitest';
import { fakeApi } from '../test/fake-api';
import { renderApp } from '../test/render';

const signedIn = (options: Parameters<typeof fakeApi>[0] = {}) =>
  fakeApi({ signedInAs: 'sara@example.com', ...options });

const today = todayIn(new Date(), 'Asia/Tehran');
const thisMonth = monthPeriodOfDay(today, 'jalali');
const lastMonth = previousPeriod(thisMonth);

/** An Owner's Workspace with an IRR Account and the Category «خوراک» with a child «رستوران». */
function withSpending(options: Parameters<typeof fakeApi>[0] = {}) {
  const fake = signedIn(options);
  const account = fake.addAccount({ name: 'ملی' });
  const food = fake.addCategory({ name: 'خوراک' });
  const cafe = fake.addCategory({ name: 'رستوران', parentId: food.id });
  const spend = (categoryId: string, amount: bigint, occurredOn = today, labelIds: string[] = []) =>
    fake.addTransaction({
      type: 'EXPENSE',
      accountId: account.id,
      categoryId,
      amount,
      occurredOn,
      labelIds,
    });
  return { fake, account, food, cafe, spend };
}

async function openNewBudgetForm() {
  await userEvent.click(await screen.findByRole('link', { name: 'بودجهٔ تازه' }));
  return within(await screen.findByRole('form', { name: 'بودجهٔ تازه' }));
}

const progressOf = (name: string) => screen.findByRole('progressbar', { name });

describe('Budgets', () => {
  it('are reachable from the header', async () => {
    renderApp({ api: signedIn().api });
    await userEvent.click(await screen.findByRole('link', { name: 'بودجه‌ها' }));
    expect(await screen.findByText('هنوز بودجه‌ای نیست.')).toBeTruthy();
  });

  it('lets the Owner set a monthly limit and shows what the Category and its children spent', async () => {
    const { fake, food, cafe, spend } = withSpending();
    spend(food.id, 300n);
    spend(cafe.id, 200n);
    renderApp({ path: '/budgets', api: fake.api });
    const form = await openNewBudgetForm();
    await userEvent.selectOptions(form.getByRole('combobox', { name: 'دسته' }), 'خوراک');
    expect(form.getByRole('radio', { name: 'ماهانه', checked: true })).toBeTruthy();
    await userEvent.type(form.getByRole('textbox', { name: 'سقف' }), '1000');
    await userEvent.click(form.getByRole('button', { name: 'ساخت بودجه' }));

    const bar = await progressOf('خوراک');
    expect(bar.getAttribute('aria-valuenow')).toBe('50');
    expect(bar.getAttribute('aria-valuetext')).toContain('در محدوده');
    expect(screen.getByText('در محدوده')).toBeTruthy();
    expect(fake.budgets()).toMatchObject([
      { categoryId: food.id, labelId: null, period: 'MONTHLY', amount: 1000n, currency: 'IRR' },
    ]);
  });

  it('narrows a Budget to a Label', async () => {
    const { fake, food, spend } = withSpending();
    const eatingOut = fake.addLabel({ name: 'بیرون‌غذا' });
    spend(food.id, 100n, today, [eatingOut.id]);
    spend(food.id, 700n);
    renderApp({ path: '/budgets/new', api: fake.api });
    const form = within(await screen.findByRole('form', { name: 'بودجهٔ تازه' }));
    await userEvent.selectOptions(form.getByRole('combobox', { name: 'دسته' }), 'خوراک');
    await userEvent.selectOptions(form.getByRole('combobox', { name: 'برچسب' }), 'بیرون‌غذا');
    await userEvent.click(form.getByRole('radio', { name: 'سالانه' }));
    await userEvent.type(form.getByRole('textbox', { name: 'سقف' }), '1000');
    await userEvent.click(form.getByRole('button', { name: 'ساخت بودجه' }));

    const bar = await progressOf(`${isolate('خوراک')} · ${isolate('بیرون‌غذا')}`);
    expect(bar.getAttribute('aria-valuenow')).toBe('10');
    expect(fake.budgets()).toMatchObject([{ labelId: eatingOut.id, period: 'YEARLY' }]);
  });

  it('warns from 80% and shows overspending, in words and not only color', async () => {
    const { fake, food, cafe, spend } = withSpending();
    fake.addBudget({ categoryId: food.id, period: 'MONTHLY', amount: 1000n });
    fake.addBudget({ categoryId: cafe.id, period: 'MONTHLY', amount: 100n });
    spend(food.id, 650n);
    spend(cafe.id, 150n);
    renderApp({ path: '/budgets', api: fake.api });

    const food80 = await progressOf('خوراک');
    expect(food80.getAttribute('aria-valuenow')).toBe('80');
    expect(food80.getAttribute('aria-valuetext')).toContain('نزدیک سقف');
    const cafeName = `${isolate('خوراک')} › ${isolate('رستوران')}`;
    const over = await progressOf(cafeName);
    // The bar stops full; the words say by how much.
    expect(over.getAttribute('aria-valuenow')).toBe('100');
    expect(over.getAttribute('aria-valuetext')).toContain('بیش از بودجه');
    const cafeCard = screen.getByRole('article', { name: cafeName });
    expect(within(cafeCard).getByText('بیش از بودجه')).toBeTruthy();
    expect(within(cafeCard).getByText(/بیش از سقف$/)).toBeTruthy();
    const foodCard = screen.getByRole('article', { name: 'خوراک' });
    expect(within(foodCard).getByText('نزدیک سقف')).toBeTruthy();
    expect(within(foodCard).getByText(/مانده$/)).toBeTruthy();
  });

  it('shows another month', async () => {
    const { fake, food, spend } = withSpending();
    fake.addBudget({ categoryId: food.id, period: 'MONTHLY', amount: 1000n });
    spend(food.id, 500n, periodDays(lastMonth, 'jalali').from);
    const { router } = renderApp({ path: '/budgets', api: fake.api });
    expect((await progressOf('خوراک')).getAttribute('aria-valuenow')).toBe('0');

    await userEvent.click(screen.getByRole('link', { name: 'ماه قبل' }));
    expect(router.state.location.search).toBe(`?month=${periodParam(lastMonth)}`);
    await screen.findByRole('progressbar', { name: 'خوراک', value: { now: 50 } });
  });

  it('converts Expenses in other currencies with the rate in force, and names the rate', async () => {
    const { fake, food, spend } = withSpending();
    const dollars = fake.addAccount({ name: 'دلاری', currency: 'USD' });
    const euros = fake.addAccount({ name: 'یورویی', currency: 'EUR' });
    const { from } = periodDays(lastMonth, 'jalali');
    fake.addRate({ currency: 'USD', rate: '10', effectiveOn: from });
    fake.addBudget({ categoryId: food.id, period: 'MONTHLY', amount: 1000n });
    spend(food.id, 100n, from);
    for (const [accountId, amount] of [
      [dollars.id, 2500n],
      [euros.id, 100n],
    ] as const) {
      fake.addTransaction({
        type: 'EXPENSE',
        accountId,
        categoryId: food.id,
        amount,
        occurredOn: from,
      });
    }
    renderApp({ path: `/budgets?month=${periodParam(lastMonth)}`, api: fake.api });

    // 100 rials plus 25.00 USD at 10 rials each.
    await screen.findByRole('progressbar', { name: 'خوراک', value: { now: 35 } });
    // The rate came into force on the month's first day.
    expect(
      screen.getByText(
        new RegExp(
          `^هزینه‌های دلار با نرخ ${isolate('۱ دلار = ۱۰ ریال')}، از .+، تبدیل شده‌اند\\.$`,
        ),
      ),
    ).toBeTruthy();
    expect(
      screen.getByText('هزینه‌هایی با ارز دیگر که نرخی برایشان نیست در این رقم نیامده‌اند.'),
    ).toBeTruthy();
  });

  it('asks for a Category and a positive limit, and says when the Budget already exists', async () => {
    const { fake, food } = withSpending();
    fake.addBudget({ categoryId: food.id, period: 'MONTHLY', amount: 1000n });
    renderApp({ path: '/budgets/new', api: fake.api });
    const form = within(await screen.findByRole('form', { name: 'بودجهٔ تازه' }));
    await userEvent.click(form.getByRole('button', { name: 'ساخت بودجه' }));
    expect(await form.findByText('یک دسته انتخاب کنید.')).toBeTruthy();

    await userEvent.selectOptions(form.getByRole('combobox', { name: 'دسته' }), 'خوراک');
    await userEvent.click(form.getByRole('button', { name: 'ساخت بودجه' }));
    expect(await form.findByText('سقف بودجه را وارد کنید.')).toBeTruthy();
    await userEvent.type(form.getByRole('textbox', { name: 'سقف' }), '0');
    await userEvent.click(form.getByRole('button', { name: 'ساخت بودجه' }));
    expect(await form.findByText('سقف بودجه باید بیشتر از صفر باشد.')).toBeTruthy();

    await userEvent.clear(form.getByRole('textbox', { name: 'سقف' }));
    await userEvent.type(form.getByRole('textbox', { name: 'سقف' }), '500');
    await userEvent.click(form.getByRole('button', { name: 'ساخت بودجه' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'این دسته برای همین برچسب و دوره بودجه دارد.',
    );
    expect(fake.budgets()).toHaveLength(1);
  });

  it('offers only active Expense Categories', async () => {
    const { fake } = withSpending();
    fake.addCategory({ name: 'حقوق', kind: 'INCOME' });
    fake.addCategory({ name: 'قدیمی', archived: true });
    renderApp({ path: '/budgets/new', api: fake.api });
    const form = within(await screen.findByRole('form', { name: 'بودجهٔ تازه' }));
    const options = within(form.getByRole('combobox', { name: 'دسته' }))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['', 'خوراک', `${isolate('خوراک')} › ${isolate('رستوران')}`]);
  });

  it('changes the limit and deletes a Budget', async () => {
    const { fake, food } = withSpending();
    fake.addBudget({ categoryId: food.id, period: 'MONTHLY', amount: 1000n });
    renderApp({ path: '/budgets', api: fake.api });
    await userEvent.click(
      await screen.findByRole('link', { name: `ویرایش بودجهٔ ${isolate('خوراک')}` }),
    );
    const form = within(await screen.findByRole('form', { name: 'ویرایش بودجه' }));
    const amount = form.getByRole('textbox', { name: 'سقف' });
    await userEvent.clear(amount);
    await userEvent.type(amount, '2000');
    await userEvent.click(form.getByRole('button', { name: 'ذخیره' }));
    await progressOf('خوراک');
    expect(fake.budgets()).toMatchObject([{ amount: 2000n, version: 2 }]);

    await userEvent.click(screen.getByRole('link', { name: `ویرایش بودجهٔ ${isolate('خوراک')}` }));
    await userEvent.click(await screen.findByRole('button', { name: 'حذف بودجه' }));
    expect(await screen.findByText('هنوز بودجه‌ای نیست.')).toBeTruthy();
    expect(fake.budgets()).toEqual([]);
  });

  it('are read-only for a Member', async () => {
    const { fake, food } = withSpending({ role: 'MEMBER' });
    fake.addBudget({ categoryId: food.id, period: 'MONTHLY', amount: 1000n });
    renderApp({ path: '/budgets', api: fake.api });
    expect(await progressOf('خوراک')).toBeTruthy();
    expect(
      screen.getByText('فقط مالک و مدیر فضای کاری می‌توانند بودجه‌ها را بسازند یا تغییر دهند.'),
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'بودجهٔ تازه' })).toBeNull();
    expect(screen.queryByRole('link', { name: `ویرایش بودجهٔ ${isolate('خوراک')}` })).toBeNull();
  });
});
