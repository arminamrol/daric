import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isolate } from '@daric/i18n';
import { describe, expect, it } from 'vitest';
import { fakeApi } from '../test/fake-api';
import { renderApp } from '../test/render';

const signedIn = (options: Parameters<typeof fakeApi>[0] = {}) =>
  fakeApi({ signedInAs: 'sara@example.com', ...options });

const categoryList = () => screen.findByRole('list', { name: 'دسته‌ها' });

async function openNewCategoryForm() {
  await userEvent.click(await screen.findByRole('link', { name: 'دسته تازه' }));
  return within(await screen.findByRole('form', { name: 'دسته تازه' }));
}

describe('Categories', () => {
  it('are reachable from the header and start with Expense Categories', async () => {
    const fake = signedIn();
    fake.addCategory({ name: 'حقوق', kind: 'INCOME' });
    renderApp({ api: fake.api });
    await userEvent.click(await screen.findByRole('link', { name: 'دسته‌ها' }));
    expect(screen.getByRole('radio', { name: 'هزینه' })).toHaveProperty('checked', true);
    expect(await screen.findByText('هنوز دسته‌ای نیست.')).toBeTruthy();

    await userEvent.click(screen.getByRole('radio', { name: 'درآمد' }));
    expect(await screen.findByText('حقوق')).toBeTruthy();
  });

  it('lets the Owner create one with an icon and a color', async () => {
    const fake = signedIn();
    renderApp({ path: '/categories', api: fake.api });
    const form = await openNewCategoryForm();
    await userEvent.type(form.getByRole('textbox', { name: 'نام' }), 'خوراک');
    const icons = within(form.getByRole('group', { name: 'نماد' }));
    await userEvent.click(icons.getByRole('radio', { name: 'غذا' }));
    const colors = within(form.getByRole('group', { name: 'رنگ' }));
    await userEvent.click(colors.getByRole('radio', { name: 'نارنجی' }));
    expect(colors.getByRole('radio', { name: 'نارنجی' })).toHaveProperty('checked', true);
    await userEvent.click(form.getByRole('button', { name: 'ساخت دسته' }));

    expect(await within(await categoryList()).findByText('خوراک')).toBeTruthy();
    expect(fake.categories()).toMatchObject([
      { name: 'خوراک', kind: 'EXPENSE', parentId: null, icon: 'utensils', color: 'orange' },
    ]);
  });

  it('starts a new Category in the kind being viewed, and offers only parents of that kind', async () => {
    const fake = signedIn();
    fake.addCategory({ name: 'خوراک', kind: 'EXPENSE' });
    const salary = fake.addCategory({ name: 'حقوق', kind: 'INCOME' });
    renderApp({ path: '/categories?kind=INCOME', api: fake.api });
    const form = await openNewCategoryForm();
    expect(form.getByRole('radio', { name: 'درآمد' })).toHaveProperty('checked', true);
    const parent = form.getByRole('combobox', { name: 'دسته والد' });
    expect(
      within(parent)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['بدون والد (دسته اصلی)', 'حقوق']);
    await userEvent.type(form.getByRole('textbox', { name: 'نام' }), 'پاداش');
    await userEvent.selectOptions(parent, salary.id);
    await userEvent.click(form.getByRole('button', { name: 'ساخت دسته' }));

    // Children are listed inside their parent.
    const parentItem = (await within(await categoryList()).findByText('حقوق')).closest('li');
    expect(await within(parentItem as HTMLElement).findByText('پاداش')).toBeTruthy();
    expect(fake.categories().find((c) => c.name === 'پاداش')).toMatchObject({
      kind: 'INCOME',
      parentId: salary.id,
    });
  });

  it('lets the Owner reorder siblings', async () => {
    const fake = signedIn();
    fake.addCategory({ name: 'خوراک' });
    fake.addCategory({ name: 'مسکن' });
    fake.addCategory({ name: 'قدیمی', archived: true });
    renderApp({ path: '/categories', api: fake.api });
    await userEvent.click(
      await screen.findByRole('button', { name: `بالا بردن ${isolate('مسکن')}` }),
    );

    const names = async () =>
      within(await categoryList())
        .getAllByRole('link')
        .map((link) => link.textContent);
    expect(await screen.findByText(`${isolate('مسکن')} یک جا بالاتر رفت.`)).toBeTruthy();
    expect(await names()).toEqual(['مسکن', 'خوراک']);
    expect(fake.categories().map((c) => c.name)).toEqual(['مسکن', 'خوراک', 'قدیمی']);

    // The edges stay focusable, but do nothing.
    const top = screen.getByRole('button', { name: `بالا بردن ${isolate('مسکن')}` });
    expect(top.getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(top);
    expect(fake.categories().map((c) => c.name)).toEqual(['مسکن', 'خوراک', 'قدیمی']);
    const bottom = screen.getByRole('button', { name: `پایین بردن ${isolate('خوراک')}` });
    expect(bottom.getAttribute('aria-disabled')).toBe('true');
  });

  it('edits a Category, keeping its kind, and moves it to the top level', async () => {
    const fake = signedIn();
    const food = fake.addCategory({ name: 'خوراک' });
    fake.addCategory({ name: 'کافه', parentId: food.id });
    renderApp({ path: '/categories', api: fake.api });
    await userEvent.click(await screen.findByRole('link', { name: `ویرایش ${isolate('کافه')}` }));
    const form = within(await screen.findByRole('form', { name: 'ویرایش دسته' }));
    expect(form.queryByRole('radio', { name: 'درآمد' })).toBeNull();
    expect(form.getByText('نوع دسته پس از ساخت عوض نمی‌شود.')).toBeTruthy();
    await userEvent.selectOptions(form.getByRole('combobox', { name: 'دسته والد' }), '');
    await userEvent.click(
      within(form.getByRole('group', { name: 'رنگ' })).getByRole('radio', { name: 'قرمز' }),
    );
    await userEvent.click(form.getByRole('button', { name: 'ذخیره' }));

    await screen.findByRole('link', { name: `ویرایش ${isolate('خوراک')}` });
    expect(fake.categories()[1]).toMatchObject({ name: 'کافه', parentId: null, color: 'red' });
  });

  it('does not let a parent become a child', async () => {
    const fake = signedIn();
    const food = fake.addCategory({ name: 'خوراک' });
    fake.addCategory({ name: 'کافه', parentId: food.id });
    renderApp({ path: `/categories/${food.id}`, api: fake.api });
    const form = within(await screen.findByRole('form', { name: 'ویرایش دسته' }));
    expect(form.getByRole('combobox', { name: 'دسته والد' }).matches(':disabled')).toBe(true);
    expect(form.getByText('این دسته زیردسته دارد، پس خودش زیردسته نمی‌شود.')).toBeTruthy();
  });

  it('archives children before their parent, and shows archived ones when asked', async () => {
    const fake = signedIn();
    const food = fake.addCategory({ name: 'خوراک' });
    fake.addCategory({ name: 'کافه', parentId: food.id });
    renderApp({ path: '/categories', api: fake.api });

    await userEvent.click(await screen.findByRole('link', { name: `ویرایش ${isolate('خوراک')}` }));
    await userEvent.click(await screen.findByRole('button', { name: 'بایگانی دسته' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'اول زیردسته‌های این دسته را بایگانی کنید.',
    );

    await userEvent.click(screen.getByRole('link', { name: 'بازگشت به دسته‌ها' }));
    await userEvent.click(await screen.findByRole('link', { name: `ویرایش ${isolate('کافه')}` }));
    await userEvent.click(await screen.findByRole('button', { name: 'بایگانی دسته' }));
    await screen.findByRole('link', { name: `ویرایش ${isolate('خوراک')}` });
    expect(screen.queryByText('کافه')).toBeNull();

    await userEvent.click(screen.getByRole('checkbox', { name: 'نمایش دسته‌های بایگانی‌شده' }));
    expect(await screen.findByText('کافه')).toBeTruthy();
    expect(screen.getByText('بایگانی‌شده')).toBeTruthy();
  });

  it('are read-only for a Member', async () => {
    const fake = signedIn({ role: 'MEMBER' });
    fake.addCategory({ name: 'خوراک' });
    fake.addCategory({ name: 'مسکن' });
    renderApp({ path: '/categories', api: fake.api });
    expect(await screen.findByText('خوراک')).toBeTruthy();
    expect(
      screen.getByText('فقط مالک و مدیر فضای کاری می‌توانند دسته‌ها را بسازند یا تغییر دهند.'),
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'دسته تازه' })).toBeNull();
    expect(screen.queryByRole('link', { name: `ویرایش ${isolate('خوراک')}` })).toBeNull();
    expect(screen.queryByRole('button', { name: `بالا بردن ${isolate('مسکن')}` })).toBeNull();
  });
});
