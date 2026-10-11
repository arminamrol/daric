import { screen, within } from '@testing-library/react';
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

/** A signed-in Owner with a bank Account and a few Categories. */
function setUp(options: Parameters<typeof fakeApi>[0] = {}) {
  const fake = fakeApi({ signedInAs: 'sara@example.com', ...options });
  const melli = fake.addAccount({ name: 'ملی', openingBalance: 1_000_000n });
  const food = fake.addCategory({ name: 'خوراک', kind: 'EXPENSE' });
  const bread = fake.addCategory({ name: 'نان', kind: 'EXPENSE', parentId: food.id });
  const salary = fake.addCategory({ name: 'حقوق', kind: 'INCOME' });
  return { fake, melli, food, bread, salary };
}

const income = (amount: string) => `درآمد: ${isolate(amount)}`;
const expense = (amount: string) => `هزینه: ${isolate(amount)}`;

const entryForm = async () => within(await screen.findByRole('form', { name: 'ثبت تراکنش' }));
const amountField = (form: Awaited<ReturnType<typeof entryForm>>) =>
  form.getByRole('textbox', { name: 'مبلغ' });

describe('Recording a Transaction', () => {
  it('is reachable from the header, with the amount ready to type', async () => {
    const { fake } = setUp();
    renderApp({ api: fake.api });
    await userEvent.click(await screen.findByRole('link', { name: 'تراکنش‌ها' }));
    const form = await entryForm();
    expect(document.activeElement).toBe(amountField(form));
    expect(form.getByRole('radio', { name: 'هزینه' })).toHaveProperty('checked', true);
    expect(form.getByRole('textbox', { name: 'تاریخ' })).toHaveProperty('value', '۱۴۰۵/۰۷/۱۸');
  });

  it('takes an amount and Enter, lists the Expense and updates the balance', async () => {
    const { fake, melli, food } = setUp();
    renderApp({ path: '/transactions', api: fake.api });
    const form = await entryForm();
    await userEvent.type(amountField(form), '۲۵۰٬۰۰۰{Enter}');

    const mehr = within(await screen.findByRole('region', { name: 'مهر ۱۴۰۵' }));
    expect(await mehr.findByText('−۲۵۰٬۰۰۰ ریال')).toBeTruthy();
    expect(mehr.getByText(expense('۲۵۰٬۰۰۰ ریال'))).toBeTruthy();
    expect(fake.transactions()).toMatchObject([
      {
        type: 'EXPENSE',
        accountId: melli.id,
        categoryId: food.id,
        amount: 250000n,
        occurredOn: '2026-10-10',
        note: null,
      },
    ]);
    // A client-made UUIDv7, so a retry cannot record it twice.
    expect(fake.transactions()[0]?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    expect((await fake.api.listAccounts(fake.workspace().id))[0]?.balance).toBe(750000n);

    // Ready for the next one: amount cleared and focused, the rest kept.
    expect(screen.getByRole('status').textContent).toBe('ثبت شد.');
    expect(amountField(form)).toHaveProperty('value', '');
    expect(document.activeElement).toBe(amountField(form));
  });

  it('records Income with an Income Category, a past day and a note', async () => {
    const { fake, salary } = setUp();
    renderApp({ path: '/transactions', api: fake.api });
    const form = await entryForm();
    await userEvent.click(form.getByRole('radio', { name: 'درآمد' }));
    const category = form.getByRole('combobox', { name: 'دسته' });
    expect(
      within(category)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['حقوق']);
    await userEvent.type(amountField(form), '5000000');
    const day = form.getByRole('textbox', { name: 'تاریخ' });
    await userEvent.clear(day);
    await userEvent.type(day, '1405/06/31');
    await userEvent.type(form.getByRole('textbox', { name: 'یادداشت' }), 'حقوق شهریور');
    await userEvent.click(form.getByRole('button', { name: 'ثبت' }));

    const shahrivar = within(await screen.findByRole('region', { name: 'شهریور ۱۴۰۵' }));
    expect(await shahrivar.findByText('+۵٬۰۰۰٬۰۰۰ ریال')).toBeTruthy();
    expect(shahrivar.getByText('حقوق شهریور')).toBeTruthy();
    expect(fake.transactions()).toMatchObject([
      { type: 'INCOME', categoryId: salary.id, occurredOn: '2026-09-22', note: 'حقوق شهریور' },
    ]);
  });

  it('offers child Categories under their parent', async () => {
    const { fake, bread } = setUp();
    renderApp({ path: '/transactions', api: fake.api });
    const form = await entryForm();
    const category = form.getByRole('combobox', { name: 'دسته' });
    expect(
      within(category)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['خوراک', `${isolate('خوراک')} › ${isolate('نان')}`]);
    await userEvent.selectOptions(category, bread.id);
    await userEvent.type(amountField(form), '40000{Enter}');
    await screen.findByText('−۴۰٬۰۰۰ ریال');
    expect(fake.transactions()[0]).toMatchObject({ categoryId: bread.id });
  });

  it('tags it with Labels, offering only active ones, and starts the next one untagged', async () => {
    const { fake } = setUp();
    const travel = fake.addLabel({ name: 'سفر' });
    const eatingOut = fake.addLabel({ name: 'بیرون‌غذا', controllable: true });
    fake.addLabel({ name: 'قدیمی', archived: true });
    renderApp({ path: '/transactions', api: fake.api });
    const form = await entryForm();
    const picker = within(form.getByRole('group', { name: 'برچسب‌ها' }));
    expect(picker.getAllByRole('checkbox').map((c) => c.closest('label')?.textContent)).toEqual([
      'بیرون‌غذا',
      'سفر',
    ]);
    await userEvent.click(picker.getByRole('checkbox', { name: 'سفر' }));
    await userEvent.click(picker.getByRole('checkbox', { name: 'بیرون‌غذا' }));
    await userEvent.type(amountField(form), '90000{Enter}');

    const row = (await screen.findByText('−۹۰٬۰۰۰ ریال')).closest('li') as HTMLElement;
    const shown = within(within(row).getByRole('list', { name: 'برچسب‌ها' }));
    expect(shown.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'بیرون‌غذا',
      'سفر',
    ]);
    expect(new Set(fake.transactions()[0]?.labelIds)).toEqual(new Set([travel.id, eatingOut.id]));
    expect(picker.getByRole('checkbox', { name: 'سفر' })).toHaveProperty('checked', false);
  });

  it('offers no Label picker when there are no Labels', async () => {
    const { fake } = setUp();
    renderApp({ path: '/transactions', api: fake.api });
    const form = await entryForm();
    expect(form.queryByRole('group', { name: 'برچسب‌ها' })).toBeNull();
  });

  it('remembers the last Account and Category on this device', async () => {
    const { fake, bread } = setUp();
    const cash = fake.addAccount({ name: 'نقد', type: 'CASH' });
    const first = renderApp({ path: '/transactions', api: fake.api });
    let form = await entryForm();
    await userEvent.selectOptions(form.getByRole('combobox', { name: 'حساب' }), cash.id);
    await userEvent.selectOptions(form.getByRole('combobox', { name: 'دسته' }), bread.id);
    await userEvent.type(amountField(form), '1000{Enter}');
    await screen.findByText('−۱٬۰۰۰ ریال');
    first.unmount();

    renderApp({ path: '/transactions', api: fake.api });
    form = await entryForm();
    expect(form.getByRole('combobox', { name: 'حساب' })).toHaveProperty('value', cash.id);
    expect(form.getByRole('combobox', { name: 'دسته' })).toHaveProperty('value', bread.id);
  });

  it('shows today in the display calendar, whatever the Workspace Calendar', async () => {
    const { fake } = setUp();
    await fake.api.updatePreferences({ displayCalendar: 'gregorian', digits: 'latin' });
    renderApp({ path: '/transactions', api: fake.api });
    const form = await entryForm();
    expect(form.getByRole('textbox', { name: 'تاریخ' })).toHaveProperty('value', '2026/10/10');
    await userEvent.type(amountField(form), '1000{Enter}');
    // Still grouped by the Workspace's Jalali month.
    expect(await screen.findByRole('region', { name: 'مهر 1405' })).toBeTruthy();
    expect(fake.transactions()[0]?.occurredOn).toBe('2026-10-10');
  });

  it('reads the amount in tomans when the Workspace shows tomans', async () => {
    const { fake } = setUp();
    await fake.api.updateWorkspace(fake.workspace().id, { moneyDisplay: 'toman' });
    renderApp({ path: '/transactions', api: fake.api });
    const form = await entryForm();
    expect(form.getByText('به تومان')).toBeTruthy();
    await userEvent.type(amountField(form), '25000{Enter}');
    expect(await screen.findByText('−۲۵٬۰۰۰ تومان')).toBeTruthy();
    expect(fake.transactions()[0]?.amount).toBe(250000n);
  });

  it.each([
    ['no amount', '', undefined, 'مبلغ را وارد کنید.'],
    ['a zero amount', '0', undefined, 'مبلغ باید بیشتر از صفر باشد.'],
    ['a negative amount', '-5', undefined, 'مبلغ باید بیشتر از صفر باشد.'],
    ['a fraction of a rial', '10.5', undefined, 'این مبلغ بیش از حد رقم اعشار دارد.'],
    ['a day that does not exist', '1000', '1405/12/30', 'تاریخ را به شکل سال/ماه/روز وارد کنید.'],
  ])('refuses %s', async (_, amount, day, message) => {
    const { fake } = setUp();
    renderApp({ path: '/transactions', api: fake.api });
    const form = await entryForm();
    if (amount) await userEvent.type(amountField(form), amount);
    if (day) {
      const field = form.getByRole('textbox', { name: 'تاریخ' });
      await userEvent.clear(field);
      await userEvent.type(field, day);
    }
    await userEvent.click(form.getByRole('button', { name: 'ثبت' }));
    expect(await form.findByText(message)).toBeTruthy();
    expect(fake.transactions()).toEqual([]);
  });

  it('asks for an Account first when there is none', async () => {
    const fake = fakeApi({ signedInAs: 'sara@example.com' });
    fake.addCategory({ name: 'خوراک' });
    renderApp({ path: '/transactions', api: fake.api });
    expect(await screen.findByText('برای ثبت تراکنش اول یک حساب بسازید.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'حساب تازه' })).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'ثبت تراکنش' })).toBeNull();
  });

  it('is not offered to a Viewer, who still sees the list', async () => {
    const { fake, melli, food } = setUp({ role: 'VIEWER' });
    fake.addTransaction({
      type: 'EXPENSE',
      accountId: melli.id,
      categoryId: food.id,
      amount: 1000n,
      occurredOn: '2026-10-01',
    });
    renderApp({ path: '/transactions', api: fake.api });
    expect(await screen.findByText('−۱٬۰۰۰ ریال')).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'ثبت تراکنش' })).toBeNull();
    expect(screen.getByText('بیننده‌ها نمی‌توانند تراکنش ثبت کنند.')).toBeTruthy();
  });
});

describe('Recording a Transfer', () => {
  it('moves money between two Accounts of one currency, counting it as neither Income nor Expense', async () => {
    const { fake, melli } = setUp();
    const cash = fake.addAccount({ name: 'نقد', type: 'CASH' });
    renderApp({ path: '/transactions', api: fake.api });
    const form = await entryForm();
    await userEvent.click(form.getByRole('radio', { name: 'انتقال' }));
    expect(form.queryByRole('combobox', { name: 'دسته' })).toBeNull();
    expect(form.getByRole('combobox', { name: 'از حساب' })).toHaveProperty('value', melli.id);
    // The other Account is the only destination offered.
    const to = form.getByRole('combobox', { name: 'به حساب' });
    expect(
      within(to)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['نقد']);
    expect(form.queryByRole('textbox', { name: 'مبلغ دریافتی' })).toBeNull();
    await userEvent.type(amountField(form), '300000{Enter}');

    const mehr = within(await screen.findByRole('region', { name: 'مهر ۱۴۰۵' }));
    const row = (await mehr.findByText('۳۰۰٬۰۰۰ ریال')).closest('li') as HTMLElement;
    expect(within(row).getByText('انتقال')).toBeTruthy();
    expect(
      within(row).getByText(`${isolate('ملی')} ← ${isolate('نقد')}`, { exact: false }),
    ).toBeTruthy();
    expect(mehr.queryByText(/هزینه:|درآمد:/)).toBeNull();
    expect(fake.transactions()).toMatchObject([
      {
        type: 'TRANSFER',
        accountId: melli.id,
        toAccountId: cash.id,
        amount: 300000n,
        toAmount: 300000n,
        occurredOn: '2026-10-10',
      },
    ]);
    const balances = (await fake.api.listAccounts(fake.workspace().id)).map((a) => a.balance);
    expect(balances).toEqual([700000n, 300000n]);
  });

  it('asks for the Amount received in the other currency, converting nothing', async () => {
    const { fake, melli } = setUp();
    const dollars = fake.addAccount({ name: 'دلاری', currency: 'USD' });
    renderApp({ path: '/transactions', api: fake.api });
    const form = await entryForm();
    await userEvent.click(form.getByRole('radio', { name: 'انتقال' }));
    await userEvent.selectOptions(form.getByRole('combobox', { name: 'به حساب' }), dollars.id);
    const received = form.getByRole('textbox', { name: 'مبلغ دریافتی' });
    expect(form.getByText('به دلار آمریکا')).toBeTruthy();
    await userEvent.type(amountField(form), '5000000');
    await userEvent.click(form.getByRole('button', { name: 'ثبت' }));
    expect(await form.findByText('مبلغ دریافتی را وارد کنید.')).toBeTruthy();
    expect(document.activeElement).toBe(received);
    expect(fake.transactions()).toEqual([]);

    await userEvent.type(received, '12.5{Enter}');
    const row = (await screen.findByText('۵٬۰۰۰٬۰۰۰ ریال', { exact: false })).closest('li');
    expect(row?.textContent).toContain(`${isolate('۵٬۰۰۰٬۰۰۰ ریال')} ← ${isolate('۱۲٫۵۰ دلار')}`);
    expect(fake.transactions()).toMatchObject([
      {
        type: 'TRANSFER',
        accountId: melli.id,
        toAccountId: dollars.id,
        amount: 5000000n,
        toAmount: 1250n,
      },
    ]);
    expect(received).toHaveProperty('value', '');
  });

  it('remembers the destination Account on this device', async () => {
    const { fake } = setUp();
    fake.addAccount({ name: 'نقد', type: 'CASH' });
    const savings = fake.addAccount({ name: 'پس‌انداز' });
    const first = renderApp({ path: '/transactions', api: fake.api });
    let form = await entryForm();
    await userEvent.click(form.getByRole('radio', { name: 'انتقال' }));
    await userEvent.selectOptions(form.getByRole('combobox', { name: 'به حساب' }), savings.id);
    await userEvent.type(amountField(form), '1000{Enter}');
    await screen.findByText('۱٬۰۰۰ ریال');
    first.unmount();

    renderApp({ path: '/transactions', api: fake.api });
    form = await entryForm();
    await userEvent.click(form.getByRole('radio', { name: 'انتقال' }));
    expect(form.getByRole('combobox', { name: 'به حساب' })).toHaveProperty('value', savings.id);
  });

  it('is not offered with a single Account', async () => {
    const { fake } = setUp();
    renderApp({ path: '/transactions', api: fake.api });
    const form = await entryForm();
    expect(form.queryByRole('radio', { name: 'انتقال' })).toBeNull();
  });
});

describe('The Transaction list', () => {
  it('groups the year by month of the Workspace Calendar, newest first, with totals per currency', async () => {
    const { fake, melli, food, salary } = setUp();
    const dollars = fake.addAccount({ name: 'دلاری', currency: 'USD' });
    const add = (fields: Parameters<typeof fake.addTransaction>[0]) => fake.addTransaction(fields);
    add({
      type: 'EXPENSE',
      accountId: melli.id,
      categoryId: food.id,
      amount: 300n,
      occurredOn: '2026-10-10',
    });
    add({
      type: 'INCOME',
      accountId: melli.id,
      categoryId: salary.id,
      amount: 9000n,
      occurredOn: '2026-09-23',
    });
    add({
      type: 'EXPENSE',
      accountId: dollars.id,
      categoryId: food.id,
      amount: 1250n,
      occurredOn: '2026-10-01',
    });
    add({
      type: 'EXPENSE',
      accountId: melli.id,
      categoryId: food.id,
      amount: 50n,
      occurredOn: '2026-09-22',
    });
    // Last year (1404) is not shown.
    add({
      type: 'EXPENSE',
      accountId: melli.id,
      categoryId: food.id,
      amount: 7n,
      occurredOn: '2026-03-20',
    });
    renderApp({ path: '/transactions', api: fake.api });

    const months = await screen.findAllByRole('region', { name: /۱۴۰۵/ });
    expect(months.map((m) => within(m).getByRole('heading').textContent)).toEqual([
      'مهر ۱۴۰۵',
      'شهریور ۱۴۰۵',
    ]);
    const mehr = within(months[0] as HTMLElement);
    expect(mehr.getByText(income('۹٬۰۰۰ ریال'))).toBeTruthy();
    expect(mehr.getByText(expense('۳۰۰ ریال'))).toBeTruthy();
    expect(mehr.getByText(expense('۱۲٫۵۰ دلار'))).toBeTruthy();
    expect(screen.queryByText('−۷ ریال')).toBeNull();

    await userEvent.click(screen.getByRole('link', { name: 'سال قبل' }));
    const esfand = within(await screen.findByRole('region', { name: 'اسفند ۱۴۰۴' }));
    expect(esfand.getByText('−۷ ریال')).toBeTruthy();
  });

  it('filters by Account and by Category', async () => {
    const { fake, melli, food, bread, salary } = setUp();
    const cash = fake.addAccount({ name: 'نقد', type: 'CASH' });
    const add = (fields: Parameters<typeof fake.addTransaction>[0]) => fake.addTransaction(fields);
    add({
      type: 'EXPENSE',
      accountId: melli.id,
      categoryId: bread.id,
      amount: 100n,
      occurredOn: '2026-10-01',
    });
    add({
      type: 'EXPENSE',
      accountId: cash.id,
      categoryId: food.id,
      amount: 200n,
      occurredOn: '2026-10-02',
    });
    add({
      type: 'INCOME',
      accountId: melli.id,
      categoryId: salary.id,
      amount: 300n,
      occurredOn: '2026-10-03',
    });
    renderApp({ path: '/transactions', api: fake.api });
    await screen.findByText('−۱۰۰ ریال');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'فیلتر حساب' }), cash.id);
    await vi.waitFor(() => expect(screen.queryByText('−۱۰۰ ریال')).toBeNull());
    expect(screen.getByText('−۲۰۰ ریال')).toBeTruthy();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'فیلتر حساب' }), '');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'فیلتر دسته' }), food.id);
    // A parent includes its children.
    expect(await screen.findByText('−۱۰۰ ریال')).toBeTruthy();
    expect(screen.getByText('−۲۰۰ ریال')).toBeTruthy();
    expect(screen.queryByText('+۳۰۰ ریال')).toBeNull();
  });

  it('filters by Label', async () => {
    const { fake, melli, food } = setUp();
    const travel = fake.addLabel({ name: 'سفر' });
    const old = fake.addLabel({ name: 'قدیمی', archived: true });
    const add = (amount: bigint, labelIds: string[]) =>
      fake.addTransaction({
        type: 'EXPENSE',
        accountId: melli.id,
        categoryId: food.id,
        amount,
        occurredOn: '2026-10-01',
        labelIds,
      });
    add(100n, [travel.id]);
    add(200n, []);
    add(300n, [old.id]);
    renderApp({ path: '/transactions', api: fake.api });
    await screen.findByText('−۲۰۰ ریال');

    const filter = screen.getByRole('combobox', { name: 'فیلتر برچسب' });
    // Archived Labels still filter old Transactions.
    await userEvent.selectOptions(filter, old.id);
    await vi.waitFor(() => expect(screen.queryByText('−۲۰۰ ریال')).toBeNull());
    expect(screen.getByText('−۳۰۰ ریال')).toBeTruthy();
    await userEvent.selectOptions(filter, travel.id);
    expect(await screen.findByText('−۱۰۰ ریال')).toBeTruthy();
    expect(screen.queryByText('−۳۰۰ ریال')).toBeNull();
  });

  it('says when a year has no Transactions', async () => {
    const { fake } = setUp();
    renderApp({ path: '/transactions', api: fake.api });
    expect(await screen.findByText('در این سال تراکنشی نیست.')).toBeTruthy();
  });
});

describe('Editing and deleting a Transaction', () => {
  /** The list row showing `text`. */
  const row = async (text: string) => {
    const item = (await screen.findByText(text)).closest('li');
    if (!item) throw new Error(`No row shows ${text}`);
    return within(item);
  };
  const editForm = async () => within(await screen.findByRole('form', { name: 'ویرایش تراکنش' }));

  function withExpense(options: Parameters<typeof setUp>[0] = {}) {
    const fixture = setUp(options);
    const transaction = fixture.fake.addTransaction({
      type: 'EXPENSE',
      accountId: fixture.melli.id,
      categoryId: fixture.food.id,
      amount: 300n,
      occurredOn: '2026-10-10',
      note: 'نان',
    });
    return { ...fixture, transaction };
  }

  it('opens one from the list with its values, saves the changes and lists them', async () => {
    const { fake, salary } = withExpense();
    const { router } = renderApp({ path: '/transactions', api: fake.api });
    await userEvent.click((await row('−۳۰۰ ریال')).getByRole('link', { name: 'ویرایش' }));

    const form = await editForm();
    expect(amountField(form)).toHaveProperty('value', '۳۰۰');
    expect(form.getByRole('textbox', { name: 'یادداشت' })).toHaveProperty('value', 'نان');
    expect(form.getByRole('textbox', { name: 'تاریخ' })).toHaveProperty('value', '۱۴۰۵/۰۷/۱۸');
    await userEvent.click(form.getByRole('radio', { name: 'درآمد' }));
    await userEvent.clear(amountField(form));
    await userEvent.type(amountField(form), '400');
    await userEvent.click(form.getByRole('button', { name: 'ذخیره' }));

    expect(await screen.findByText('+۴۰۰ ریال')).toBeTruthy();
    expect(router.state.location.pathname).toBe('/transactions');
    expect(fake.transactions()).toMatchObject([
      { type: 'INCOME', categoryId: salary.id, amount: 400n, note: 'نان', version: 2 },
    ]);
    expect((await fake.api.listAccounts(fake.workspace().id))[0]?.balance).toBe(1_000_400n);
  });

  it('keeps an archived Account the Transaction is on', async () => {
    const { fake, melli, transaction } = withExpense();
    fake.addAccount({ name: 'نقد' });
    await fake.api.updateAccount(fake.workspace().id, melli.id, { archived: true });
    renderApp({ path: `/transactions/${transaction.id}`, api: fake.api });
    const form = await editForm();
    const account = form.getByRole('combobox', { name: 'حساب' });
    expect(account).toHaveProperty('value', melli.id);
    await userEvent.click(form.getByRole('button', { name: 'ذخیره' }));
    await screen.findByRole('form', { name: 'ثبت تراکنش' });
    expect(fake.transactions()[0]).toMatchObject({ accountId: melli.id, version: 2 });
  });

  it('offers to keep theirs or mine when it changed elsewhere meanwhile', async () => {
    const { fake, melli, food, transaction } = withExpense();
    renderApp({ path: `/transactions/${transaction.id}`, api: fake.api });
    const form = await editForm();
    const changeElsewhere = (amount: bigint, version: number) =>
      fake.api.updateTransaction(fake.workspace().id, transaction.id, {
        type: 'EXPENSE',
        accountId: melli.id,
        categoryId: food.id,
        amount,
        occurredOn: '2026-10-10',
        note: 'نان',
        version,
      });

    await changeElsewhere(999n, 1);
    const note = form.getByRole('textbox', { name: 'یادداشت' });
    await userEvent.clear(note);
    await userEvent.type(note, 'شیر');
    await userEvent.click(form.getByRole('button', { name: 'ذخیره' }));
    expect((await form.findByRole('alert')).textContent).toContain('جای دیگری تغییر کرد');
    await userEvent.click(form.getByRole('button', { name: 'نسخهٔ تازه را بیاور' }));
    expect(amountField(form)).toHaveProperty('value', '۹۹۹');
    expect(note).toHaveProperty('value', 'نان');
    expect(form.queryByRole('alert')).toBeNull();

    await userEvent.clear(note);
    await userEvent.type(note, 'شیر');
    await changeElsewhere(5n, 2);
    await userEvent.click(form.getByRole('button', { name: 'ذخیره' }));
    await userEvent.click(await form.findByRole('button', { name: 'تغییرات من بماند' }));
    await screen.findByRole('form', { name: 'ثبت تراکنش' });
    expect(fake.transactions()[0]).toMatchObject({ amount: 999n, note: 'شیر', version: 4 });
  });

  it('says when it was deleted elsewhere, or cannot be found', async () => {
    const { fake, transaction } = withExpense();
    const { unmount } = renderApp({ path: `/transactions/${transaction.id}`, api: fake.api });
    const form = await editForm();
    await fake.api.deleteTransaction(fake.workspace().id, transaction.id);
    await userEvent.click(form.getByRole('button', { name: 'ذخیره' }));
    expect((await form.findByRole('alert')).textContent).toBe('این تراکنش حذف شده است.');
    unmount();

    renderApp({ path: `/transactions/${transaction.id}`, api: fake.api });
    expect((await screen.findByRole('alert')).textContent).toBe('این تراکنش پیدا نشد.');
    expect(screen.getByRole('link', { name: 'بازگشت به تراکنش‌ها' })).toBeTruthy();
  });

  it('deletes one from the list and undoes it', async () => {
    const { fake, transaction } = withExpense();
    renderApp({ path: '/transactions', api: fake.api });
    await userEvent.click((await row('−۳۰۰ ریال')).getByRole('button', { name: 'حذف' }));

    expect(await screen.findByText('تراکنش حذف شد.')).toBeTruthy();
    expect(await screen.findByText('در این سال تراکنشی نیست.')).toBeTruthy();
    expect(fake.deletedTransactions()).toEqual([transaction.id]);
    expect((await fake.api.listAccounts(fake.workspace().id))[0]?.balance).toBe(1_000_000n);

    await userEvent.click(screen.getByRole('button', { name: 'برگرداندن' }));
    expect(await screen.findByText('−۳۰۰ ریال')).toBeTruthy();
    expect(screen.queryByText('تراکنش حذف شد.')).toBeNull();
    expect(fake.deletedTransactions()).toEqual([]);
  });

  it('lets a Member change only what they recorded, and a Viewer nothing', async () => {
    const { fake, melli, food } = setUp({ role: 'MEMBER' });
    const someoneElse = fake.addUser('reza@example.com');
    fake.addTransaction({
      type: 'EXPENSE',
      accountId: melli.id,
      categoryId: food.id,
      amount: 300n,
      occurredOn: '2026-10-10',
    });
    const theirs = fake.addTransaction({
      type: 'EXPENSE',
      accountId: melli.id,
      categoryId: food.id,
      amount: 700n,
      occurredOn: '2026-10-09',
      createdBy: someoneElse.id,
    });
    renderApp({ path: '/transactions', api: fake.api });
    const mine = await row('−۳۰۰ ریال');
    expect(mine.getByRole('link', { name: 'ویرایش' })).toBeTruthy();
    expect(mine.getByRole('button', { name: 'حذف' })).toBeTruthy();
    const others = await row('−۷۰۰ ریال');
    expect(others.queryByRole('link', { name: 'ویرایش' })).toBeNull();
    expect(others.queryByRole('button', { name: 'حذف' })).toBeNull();
    // Nor by typing its address.
    const { router } = renderApp({ path: `/transactions/${theirs.id}`, api: fake.api });
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/transactions'));
  });

  it('offers a Viewer no way to change anything', async () => {
    const { fake } = withExpense({ role: 'VIEWER' });
    renderApp({ path: '/transactions', api: fake.api });
    const only = await row('−۳۰۰ ریال');
    expect(only.queryByRole('link', { name: 'ویرایش' })).toBeNull();
    expect(only.queryByRole('button', { name: 'حذف' })).toBeNull();
  });
});
