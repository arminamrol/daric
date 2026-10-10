import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { isolate } from '@daric/i18n';
import { describe, expect, it } from 'vitest';
import { fakeApi } from '../test/fake-api';
import { renderApp } from '../test/render';

const signedIn = (options: Parameters<typeof fakeApi>[0] = {}) =>
  fakeApi({ signedInAs: 'sara@example.com', ...options });

const labelList = () => screen.findByRole('list', { name: 'برچسب‌ها' });

async function openNewLabelForm() {
  await userEvent.click(await screen.findByRole('link', { name: 'برچسب تازه' }));
  return within(await screen.findByRole('form', { name: 'برچسب تازه' }));
}

describe('Labels', () => {
  it('are reachable from the header', async () => {
    const fake = signedIn();
    renderApp({ api: fake.api });
    await userEvent.click(await screen.findByRole('link', { name: 'برچسب‌ها' }));
    expect(await screen.findByText('هنوز برچسبی نیست.')).toBeTruthy();
  });

  it('lets the Owner create a controllable one', async () => {
    const fake = signedIn();
    renderApp({ path: '/labels', api: fake.api });
    const form = await openNewLabelForm();
    await userEvent.type(form.getByRole('textbox', { name: 'نام' }), 'بیرون‌غذا');
    const controllable = form.getByRole('checkbox', { name: 'هزینه قابل کنترل' });
    expect(controllable).toHaveProperty('checked', false);
    await userEvent.click(controllable);
    await userEvent.click(form.getByRole('button', { name: 'ساخت برچسب' }));

    const item = (await within(await labelList()).findByText('بیرون‌غذا')).closest('li');
    expect(within(item as HTMLElement).getByText('قابل کنترل')).toBeTruthy();
    expect(fake.labels()).toMatchObject([{ name: 'بیرون‌غذا', controllable: true }]);
  });

  it('asks for a name, and says when another Label has it', async () => {
    const fake = signedIn();
    fake.addLabel({ name: 'سفر' });
    renderApp({ path: '/labels/new', api: fake.api });
    const form = within(await screen.findByRole('form', { name: 'برچسب تازه' }));
    await userEvent.click(form.getByRole('button', { name: 'ساخت برچسب' }));
    expect(await form.findByText('نام برچسب را وارد کنید.')).toBeTruthy();

    await userEvent.type(form.getByRole('textbox', { name: 'نام' }), 'سفر');
    await userEvent.click(form.getByRole('button', { name: 'ساخت برچسب' }));
    expect((await screen.findByRole('alert')).textContent).toBe('برچسبی با این نام هست.');
    expect(fake.labels()).toHaveLength(1);
  });

  it('edits a Label and stops flagging it as controllable', async () => {
    const fake = signedIn();
    fake.addLabel({ name: 'اشتراک', controllable: true });
    renderApp({ path: '/labels', api: fake.api });
    await userEvent.click(await screen.findByRole('link', { name: `ویرایش ${isolate('اشتراک')}` }));
    const form = within(await screen.findByRole('form', { name: 'ویرایش برچسب' }));
    const name = form.getByRole('textbox', { name: 'نام' });
    await userEvent.clear(name);
    await userEvent.type(name, 'اشتراک‌ها');
    await userEvent.click(form.getByRole('checkbox', { name: 'هزینه قابل کنترل' }));
    await userEvent.click(form.getByRole('button', { name: 'ذخیره' }));

    expect(await within(await labelList()).findByText('اشتراک‌ها')).toBeTruthy();
    expect(screen.queryByText('قابل کنترل')).toBeNull();
    expect(fake.labels()).toMatchObject([{ name: 'اشتراک‌ها', controllable: false }]);
  });

  it('archives a Label and shows archived ones when asked', async () => {
    const fake = signedIn();
    fake.addLabel({ name: 'سفر' });
    renderApp({ path: '/labels', api: fake.api });
    await userEvent.click(await screen.findByRole('link', { name: `ویرایش ${isolate('سفر')}` }));
    await userEvent.click(await screen.findByRole('button', { name: 'بایگانی برچسب' }));
    expect(await screen.findByText('هنوز برچسبی نیست.')).toBeTruthy();

    await userEvent.click(screen.getByRole('checkbox', { name: 'نمایش برچسب‌های بایگانی‌شده' }));
    expect(await screen.findByText('سفر')).toBeTruthy();
    expect(screen.getByText('بایگانی‌شده')).toBeTruthy();
    expect(fake.labels()).toMatchObject([{ name: 'سفر', archived: true }]);
  });

  it('are read-only for a Member', async () => {
    const fake = signedIn({ role: 'MEMBER' });
    fake.addLabel({ name: 'سفر' });
    renderApp({ path: '/labels', api: fake.api });
    expect(await screen.findByText('سفر')).toBeTruthy();
    expect(
      screen.getByText('فقط مالک و مدیر فضای کاری می‌توانند برچسب‌ها را بسازند یا تغییر دهند.'),
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'برچسب تازه' })).toBeNull();
    expect(screen.queryByRole('link', { name: `ویرایش ${isolate('سفر')}` })).toBeNull();
  });
});
