import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fakeApi } from '../test/fake-api';
import { renderApp } from '../test/render';

const signedIn = (options: Parameters<typeof fakeApi>[0] = {}) =>
  fakeApi({ signedInAs: 'sara@example.com', ...options });

const group = (name: 'دارایی‌ها' | 'بدهی‌ها') => screen.findByRole('region', { name });

async function openNewAccountForm() {
  await userEvent.click(await screen.findByRole('link', { name: 'حساب تازه' }));
  return within(await screen.findByRole('form', { name: 'حساب تازه' }));
}

describe('Accounts', () => {
  it('are reachable from the header and start empty', async () => {
    renderApp();
    await userEvent.click(await screen.findByRole('link', { name: 'حساب‌ها' }));
    expect(await screen.findByText('هنوز حسابی نیست.')).toBeTruthy();
  });

  it('lets the Owner create one and shows its balance', async () => {
    const fake = signedIn();
    renderApp({ path: '/accounts', api: fake.api });
    const form = await openNewAccountForm();
    await userEvent.type(form.getByRole('textbox', { name: 'نام' }), 'ملی');
    await userEvent.type(form.getByRole('textbox', { name: 'موجودی اولیه' }), '۱۲٬۰۰۰٬۰۰۰');
    await userEvent.click(form.getByRole('button', { name: 'ساخت حساب' }));

    const assets = within(await group('دارایی‌ها'));
    expect(await assets.findByText('ملی')).toBeTruthy();
    expect(assets.getByText('۱۲٬۰۰۰٬۰۰۰ ریال')).toBeTruthy();
    expect(fake.accounts()).toMatchObject([
      { name: 'ملی', type: 'BANK', class: 'ASSET', currency: 'IRR', openingBalance: 12000000n },
    ]);
  });

  it('reads the opening balance in tomans when the Workspace shows tomans', async () => {
    const fake = signedIn();
    await fake.api.updateWorkspace(fake.workspace().id, { moneyDisplay: 'toman' });
    renderApp({ path: '/accounts', api: fake.api });
    const form = await openNewAccountForm();
    expect(form.getByText('به تومان. برای بدهی، مبلغی که بدهکارید.')).toBeTruthy();
    await userEvent.type(form.getByRole('textbox', { name: 'نام' }), 'کیف');
    await userEvent.type(form.getByRole('textbox', { name: 'موجودی اولیه' }), '1200000.5');
    await userEvent.click(form.getByRole('button', { name: 'ساخت حساب' }));

    expect(await screen.findByText('۱٬۲۰۰٬۰۰۰٫۵ تومان')).toBeTruthy();
    expect(fake.accounts()[0]?.openingBalance).toBe(12000005n);
  });

  it('makes a loan a Liability by default and keeps other currencies', async () => {
    const fake = signedIn();
    renderApp({ path: '/accounts', api: fake.api });
    const form = await openNewAccountForm();
    await userEvent.type(form.getByRole('textbox', { name: 'نام' }), 'وام خودرو');
    await userEvent.selectOptions(form.getByRole('combobox', { name: 'نوع' }), 'LOAN');
    expect(form.getByRole('radio', { name: 'بدهی' })).toHaveProperty('checked', true);
    await userEvent.selectOptions(form.getByRole('combobox', { name: 'ارز' }), 'USD');
    await userEvent.type(form.getByRole('textbox', { name: 'موجودی اولیه' }), '1500.25');
    await userEvent.click(form.getByRole('button', { name: 'ساخت حساب' }));

    const liabilities = within(await group('بدهی‌ها'));
    expect(await liabilities.findByText('۱٬۵۰۰٫۲۵ دلار')).toBeTruthy();
    expect(fake.accounts()[0]).toMatchObject({ class: 'LIABILITY', openingBalance: 150025n });
  });

  it('refuses an amount the currency cannot hold and a missing name', async () => {
    const fake = signedIn();
    renderApp({ path: '/accounts', api: fake.api });
    const form = await openNewAccountForm();
    await userEvent.type(form.getByRole('textbox', { name: 'موجودی اولیه' }), '10.5');
    await userEvent.click(form.getByRole('button', { name: 'ساخت حساب' }));

    expect(form.getByText('نام حساب را وارد کنید.')).toBeTruthy();
    expect(form.getByText('این مبلغ بیش از حد رقم اعشار دارد.')).toBeTruthy();
    expect(form.getByRole('textbox', { name: 'موجودی اولیه' }).getAttribute('aria-invalid')).toBe(
      'true',
    );
    expect(fake.accounts()).toEqual([]);
  });

  it('lets the Owner edit an Account, but not its currency', async () => {
    const fake = signedIn();
    const sent: unknown[] = [];
    const updateAccount = fake.api.updateAccount;
    fake.api.updateAccount = (workspaceId, accountId, input) => {
      sent.push(input);
      return updateAccount(workspaceId, accountId, input);
    };
    fake.addAccount({ name: 'ملی', openingBalance: 5000n });
    renderApp({ path: '/accounts', api: fake.api });
    await userEvent.click(await screen.findByRole('link', { name: 'ویرایش ملی' }));
    const form = within(await screen.findByRole('form', { name: 'ویرایش حساب' }));
    expect(form.getByRole('combobox', { name: 'ارز' }).matches(':disabled')).toBe(true);
    const name = form.getByRole('textbox', { name: 'نام' });
    const balance = form.getByRole('textbox', { name: 'موجودی اولیه' });
    expect(balance).toHaveProperty('value', '۵۰۰۰');
    await userEvent.clear(name);
    await userEvent.type(name, 'ملی پس‌انداز');
    await userEvent.clear(balance);
    await userEvent.type(balance, '7000');
    await userEvent.click(form.getByRole('button', { name: 'ذخیره' }));

    expect(await screen.findByText('۷٬۰۰۰ ریال')).toBeTruthy();
    expect(screen.getByText('ملی پس‌انداز')).toBeTruthy();
    expect(fake.accounts()[0]).toMatchObject({ name: 'ملی پس‌انداز', openingBalance: 7000n });
    // Only the changed fields go to the server.
    expect(sent).toEqual([{ name: 'ملی پس‌انداز', openingBalance: 7000n }]);
  });

  it('hides archived Accounts unless asked, and can bring them back', async () => {
    const fake = signedIn();
    fake.addAccount({ name: 'ملی' });
    fake.addAccount({ name: 'قدیمی' });
    renderApp({ path: '/accounts', api: fake.api });
    await userEvent.click(await screen.findByRole('link', { name: 'ویرایش قدیمی' }));
    await userEvent.click(await screen.findByRole('button', { name: 'بایگانی حساب' }));

    await screen.findByRole('link', { name: 'ویرایش ملی' });
    expect(screen.queryByText('قدیمی')).toBeNull();

    await userEvent.click(screen.getByRole('checkbox', { name: 'نمایش حساب‌های بایگانی‌شده' }));
    expect(await screen.findByText('قدیمی')).toBeTruthy();
    expect(screen.getByText('بایگانی‌شده')).toBeTruthy();

    await userEvent.click(screen.getByRole('link', { name: 'ویرایش قدیمی' }));
    await userEvent.click(await screen.findByRole('button', { name: 'بازگرداندن از بایگانی' }));
    await screen.findByRole('link', { name: 'ویرایش قدیمی' });
    expect(fake.accounts().map((a) => a.archived)).toEqual([false, false]);
  });

  it('are read-only for a Member', async () => {
    const fake = signedIn({ role: 'MEMBER' });
    fake.addAccount({ name: 'ملی', openingBalance: 1000n });
    renderApp({ path: '/accounts', api: fake.api });
    expect(await screen.findByText('۱٬۰۰۰ ریال')).toBeTruthy();
    expect(
      screen.getByText('فقط مالک و مدیر فضای کاری می‌توانند حساب‌ها را بسازند یا تغییر دهند.'),
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'حساب تازه' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'ویرایش ملی' })).toBeNull();
  });
});
