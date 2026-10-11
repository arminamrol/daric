import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addDays, calendarDateOf, dayOf, formatDay, todayIn } from '@daric/core';
import { isolate } from '@daric/i18n';
import { describe, expect, it } from 'vitest';
import { fakeApi } from '../test/fake-api';
import { renderApp } from '../test/render';

const signedIn = (options: Parameters<typeof fakeApi>[0] = {}) =>
  fakeApi({ signedInAs: 'sara@example.com', ...options });

const today = todayIn(new Date(), 'Asia/Tehran');

/** The first day of the Jalali month `n` months before this one. */
function firstOfMonthsAgo(n: number) {
  const { year, month } = calendarDateOf(today, 'jalali');
  const index = year * 12 + (month - 1) - n;
  return dayOf('jalali', { year: Math.floor(index / 12), month: (index % 12) + 1, day: 1 });
}

/** A day as the app shows it: Jalali, Persian digits. */
const shown = (day: string) =>
  formatDay(day, { calendar: 'jalali', locale: 'fa', digits: 'persian' });

/** A Workspace with the Account «ملی», the Expense Category «اجاره» and the Income Category «حقوق». */
function withAccount(options: Parameters<typeof fakeApi>[0] = {}) {
  const fake = signedIn(options);
  const account = fake.addAccount({ name: 'ملی' });
  const rent = fake.addCategory({ name: 'اجاره' });
  const salary = fake.addCategory({ name: 'حقوق', kind: 'INCOME' });
  const addRent = (fields: Partial<Parameters<typeof fake.addRule>[0]> = {}) =>
    fake.addRule({
      name: 'اجارهٔ خانه',
      type: 'EXPENSE',
      accountId: account.id,
      categoryId: rent.id,
      amount: 250000n,
      startOn: firstOfMonthsAgo(1),
      ...fields,
    });
  return { fake, account, rent, salary, addRent };
}

const dueList = () => screen.findByRole('list', { name: 'در انتظار تأیید' });

describe('Recurring Rules', () => {
  it('are reachable from the header', async () => {
    renderApp({ api: signedIn().api });
    await userEvent.click(await screen.findByRole('link', { name: /^تکرارشونده‌ها/ }));
    expect(await screen.findByText(/هنوز تراکنش تکرارشونده‌ای نیست/)).toBeTruthy();
    expect(screen.getByText('چیزی در انتظار تأیید نیست.')).toBeTruthy();
  });

  it('lets the Owner make a monthly rule, shown with its next occurrence', async () => {
    const { fake, account, rent } = withAccount();
    renderApp({ path: '/recurring', api: fake.api });
    await userEvent.click(await screen.findByRole('link', { name: 'تکرارشوندهٔ تازه' }));
    const form = within(await screen.findByRole('form', { name: 'تکرارشوندهٔ تازه' }));
    await userEvent.type(form.getByRole('textbox', { name: 'نام' }), 'اجارهٔ خانه');
    expect(form.getByRole('radio', { name: 'هزینه' })).toHaveProperty('checked', true);
    expect(form.getByRole('radio', { name: 'ماهانه' })).toHaveProperty('checked', true);
    await userEvent.selectOptions(form.getByRole('combobox', { name: 'دسته' }), 'اجاره');
    await userEvent.type(form.getByRole('textbox', { name: 'مبلغ' }), '250000');
    const start = addDays(today, 3);
    const startField = form.getByRole('textbox', { name: 'اولین سررسید' });
    await userEvent.clear(startField);
    await userEvent.type(startField, shown(start));
    await userEvent.click(form.getByRole('button', { name: 'ساخت' }));

    const card = within(await screen.findByRole('listitem', { name: 'اجارهٔ خانه' }));
    expect(card.getByText('هر ماه')).toBeTruthy();
    expect(card.getByText(`سررسید بعدی: ${isolate(shown(start))}`)).toBeTruthy();
    expect(fake.rules()).toMatchObject([
      {
        name: 'اجارهٔ خانه',
        type: 'EXPENSE',
        accountId: account.id,
        categoryId: rent.id,
        amount: 250000n,
        frequency: 'MONTHLY',
        interval: 1,
        startOn: start,
        endOn: null,
        autoPost: false,
      },
    ]);
  });

  it('shows what the form gets wrong before sending anything', async () => {
    const { fake } = withAccount();
    renderApp({ path: '/recurring/new', api: fake.api });
    const form = within(await screen.findByRole('form', { name: 'تکرارشوندهٔ تازه' }));
    const endField = form.getByRole('textbox', { name: 'پایان (اختیاری)' });
    await userEvent.type(endField, shown(addDays(today, -1)));
    await userEvent.click(form.getByRole('button', { name: 'ساخت' }));
    expect(form.getByText('یک نام وارد کنید.')).toBeTruthy();
    expect(form.getByText('مبلغ را وارد کنید.')).toBeTruthy();
    expect(form.getByText('پایان نمی‌تواند پیش از اولین سررسید باشد.')).toBeTruthy();
    expect(fake.rules()).toEqual([]);
  });

  it('lists every missed occurrence oldest first, and confirms one with an edited Amount', async () => {
    const { fake, account, addRent } = withAccount();
    addRent({ startOn: firstOfMonthsAgo(2) });
    renderApp({ path: '/recurring', api: fake.api });
    // The header shows how many wait.
    expect(await screen.findByRole('link', { name: /^تکرارشونده‌ها.*۳ مورد/ })).toBeTruthy();
    const items = within(await dueList()).getAllByRole('listitem');
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual(
      [2, 1, 0].map((n) => `${isolate('اجارهٔ خانه')}، ${isolate(shown(firstOfMonthsAgo(n)))}`),
    );

    const oldest = within(items[0] as HTMLElement);
    const amount = oldest.getByRole('textbox', { name: 'مبلغ' });
    await userEvent.clear(amount);
    await userEvent.type(amount, '260000');
    await userEvent.click(oldest.getByRole('button', { name: 'تأیید' }));

    expect(await screen.findByText(`«${isolate('اجارهٔ خانه')}» ثبت شد.`)).toBeTruthy();
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'در انتظار تأیید' })).getAllByRole('listitem'),
      ).toHaveLength(2),
    );
    expect(fake.transactions()).toMatchObject([
      {
        type: 'EXPENSE',
        accountId: account.id,
        amount: 260000n,
        occurredOn: firstOfMonthsAgo(2),
        note: 'اجارهٔ خانه',
      },
    ]);
  });

  it('skips an occurrence without recording anything', async () => {
    const { fake, addRent } = withAccount();
    addRent({ startOn: firstOfMonthsAgo(0) });
    renderApp({ path: '/recurring', api: fake.api });
    const item = within(within(await dueList()).getByRole('listitem'));
    await userEvent.click(item.getByRole('button', { name: 'رد کردن' }));
    expect(await screen.findByText('چیزی در انتظار تأیید نیست.')).toBeTruthy();
    expect(fake.transactions()).toEqual([]);
  });

  it('records an auto-posting rule’s occurrences as soon as the app opens', async () => {
    const { fake, addRent } = withAccount();
    addRent({ startOn: firstOfMonthsAgo(1), autoPost: true });
    renderApp({ path: '/transactions', api: fake.api });
    await waitFor(() => expect(fake.transactions()).toHaveLength(2));
    expect(await screen.findAllByText('اجارهٔ خانه')).toHaveLength(2);
  });

  it('lets Members confirm but not change rules, and Viewers only look', async () => {
    for (const role of ['MEMBER', 'VIEWER'] as const) {
      const { fake, addRent } = withAccount({ role });
      addRent({ startOn: firstOfMonthsAgo(0) });
      const { unmount } = renderApp({ path: '/recurring', api: fake.api });
      const item = within(within(await dueList()).getByRole('listitem'));
      expect(screen.queryByRole('link', { name: 'تکرارشوندهٔ تازه' })).toBeNull();
      expect(screen.getByText(/فقط مالک و مدیر/)).toBeTruthy();
      expect(item.queryByRole('button', { name: 'تأیید' }) === null).toBe(role === 'VIEWER');
      unmount();
    }
  });

  it('changes and archives a rule; an archived one has nothing due', async () => {
    const { fake, addRent } = withAccount();
    const rule = addRent({ startOn: firstOfMonthsAgo(0) });
    renderApp({ path: '/recurring', api: fake.api });
    await userEvent.click(
      await screen.findByRole('link', { name: `ویرایش ${isolate('اجارهٔ خانه')}` }),
    );
    const form = within(await screen.findByRole('form', { name: 'ویرایش تکرارشونده' }));
    expect(form.getByRole('textbox', { name: 'مبلغ' })).toHaveProperty('value', '۲۵۰۰۰۰');
    await userEvent.click(form.getByRole('checkbox', { name: 'ثبت خودکار بدون تأیید' }));
    await userEvent.click(form.getByRole('checkbox', { name: 'بایگانی' }));
    await userEvent.click(form.getByRole('button', { name: 'ذخیره' }));

    expect(await screen.findByText(/هنوز تراکنش تکرارشونده‌ای نیست/)).toBeTruthy();
    expect(fake.rules()).toMatchObject([{ id: rule.id, autoPost: true, archived: true }]);
    expect(screen.getByText('چیزی در انتظار تأیید نیست.')).toBeTruthy();
    await userEvent.click(screen.getByRole('checkbox', { name: 'نمایش بایگانی‌شده‌ها' }));
    expect(await screen.findByText('بایگانی‌شده')).toBeTruthy();
  });
});
