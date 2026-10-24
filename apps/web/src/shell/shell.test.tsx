import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeApi } from '../test/fake-api';
import { renderApp } from '../test/render';

/** Pretends the browser is as narrow as a phone; jsdom has no `matchMedia`, so it reads as wide. */
function onPhone() {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

afterEach(() => {
  // @ts-expect-error jsdom has none; removing the phone stub restores that.
  delete window.matchMedia;
});

/** A signed-in Owner with an Account and a Category, so a Transaction can be recorded. */
function setUp(options: Parameters<typeof fakeApi>[0] = {}) {
  const fake = fakeApi({ signedInAs: 'sara@example.com', ...options });
  fake.addAccount({ name: 'ملی', openingBalance: 1_000_000n });
  fake.addCategory({ name: 'خوراک', kind: 'EXPENSE' });
  return fake;
}

/** The API of a User flagged as Operator. */
function operator() {
  const fake = setUp();
  const me = fake.api.me.bind(fake.api);
  fake.api.me = async () => {
    const found = await me();
    return { ...found, user: { ...found.user, operator: true } };
  };
  return fake;
}

const sections = () => screen.findByRole('navigation', { name: 'بخش‌ها' });
const home = () => screen.findByRole('heading', { level: 1, name: 'به دریک خوش آمدید' });

describe('on a wide screen', () => {
  it('reaches every section from the sidebar, showing where the User is', async () => {
    renderApp({ api: setUp().api });
    const nav = within(await sections());

    for (const name of [
      'خانه',
      'تراکنش‌ها',
      'بودجه‌ها',
      'گزارش‌ها',
      'پیش‌بینی',
      'دارایی خالص',
      'حساب‌ها',
      'دسته‌ها',
      'برچسب‌ها',
      'تکرارشونده‌ها',
      'نرخ ارز',
      'تنظیمات',
    ]) {
      expect(nav.getByRole('link', { name })).toBeTruthy();
    }
    expect(nav.getByRole('link', { name: 'خانه' }).getAttribute('aria-current')).toBe('page');

    await userEvent.click(nav.getByRole('link', { name: 'گزارش‌ها' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'گزارش‌ها' })).toBeTruthy();
    expect(nav.getByRole('link', { name: 'گزارش‌ها' }).getAttribute('aria-current')).toBe('page');
    expect(nav.getByRole('group', { name: 'تحلیل‌ها' })).toBeTruthy();
    expect(nav.getByRole('group', { name: 'بیشتر' })).toBeTruthy();
  });

  it('collapses to icons, keeping every section reachable, and remembers it', async () => {
    const fake = setUp();
    const view = renderApp({ api: fake.api });
    await home();
    const toggle = screen.getByRole('button', { name: 'نوار کناری' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(within(await sections()).getByRole('link', { name: 'بودجه‌ها' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'بودجه‌ها' })).toBeTruthy();

    view.unmount();
    renderApp({ api: fake.api });
    await home();
    expect(screen.getByRole('button', { name: 'نوار کناری' }).getAttribute('aria-expanded')).toBe(
      'false',
    );
  });

  it('records a Transaction from the sidebar in a sheet', async () => {
    const fake = setUp();
    renderApp({ api: fake.api });
    await home();
    await userEvent.click(screen.getByRole('button', { name: 'ثبت تراکنش' }));

    const sheet = within(await screen.findByRole('dialog', { name: 'ثبت تراکنش' }));
    await userEvent.type(sheet.getByRole('textbox', { name: 'مبلغ' }), '۲۵۰٬۰۰۰{Enter}');
    expect(await sheet.findByText('ثبت شد.')).toBeTruthy();
    expect(fake.transactions()).toMatchObject([{ type: 'EXPENSE', amount: 250_000n }]);

    await userEvent.click(sheet.getByRole('button', { name: 'بستن' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await home()).toBeTruthy();
  });

  it('offers no recording to a Viewer', async () => {
    renderApp({ api: setUp({ role: 'VIEWER' }).api });
    await home();
    expect(screen.queryByRole('button', { name: 'ثبت تراکنش' })).toBeNull();
  });

  it('shows the Back Office only to Operators', async () => {
    const view = renderApp({ api: setUp().api });
    await home();
    expect(screen.queryByRole('link', { name: 'بک‌آفیس' })).toBeNull();

    view.unmount();
    renderApp({ api: operator().api });
    expect(await within(await sections()).findByRole('link', { name: 'بک‌آفیس' })).toBeTruthy();
  });
});

describe('on a phone', () => {
  it('moves between the tabbed sections with the tab bar', async () => {
    onPhone();
    renderApp({ api: setUp().api });
    const tabs = within(await sections());

    await userEvent.click(tabs.getByRole('link', { name: 'تراکنش‌ها' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'تراکنش‌ها' })).toBeTruthy();
    expect(tabs.getByRole('link', { name: 'تراکنش‌ها' }).getAttribute('aria-current')).toBe('page');
    await userEvent.click(tabs.getByRole('link', { name: 'خانه' }));
    expect(await home()).toBeTruthy();
  });

  it('opens Insights as a list of its pages', async () => {
    onPhone();
    renderApp({ api: setUp().api });
    await userEvent.click(within(await sections()).getByRole('button', { name: 'تحلیل‌ها' }));

    const sheet = within(await screen.findByRole('dialog', { name: 'تحلیل‌ها' }));
    expect(sheet.getByRole('link', { name: 'گزارش‌ها' })).toBeTruthy();
    expect(sheet.getByRole('link', { name: 'پیش‌بینی' })).toBeTruthy();
    await userEvent.click(sheet.getByRole('link', { name: 'دارایی خالص' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'دارایی خالص' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      within(await sections())
        .getByRole('button', { name: 'تحلیل‌ها' })
        .getAttribute('aria-current'),
    ).toBe('true');
  });

  it('lists the remaining sections under More, with the theme and logging out', async () => {
    onPhone();
    renderApp({ api: setUp().api });
    await userEvent.click(within(await sections()).getByRole('button', { name: 'بیشتر' }));

    const sheet = within(await screen.findByRole('dialog', { name: 'بیشتر' }));
    const names = sheet.getAllByRole('link').map((link) => link.textContent);
    expect(names).toEqual([
      'بودجه‌ها',
      'حساب‌ها',
      'دسته‌ها',
      'برچسب‌ها',
      'تکرارشونده‌ها',
      'نرخ ارز',
      'تنظیمات',
    ]);
    expect(sheet.getByRole('radiogroup', { name: 'ظاهر' })).toBeTruthy();
    expect(sheet.getByRole('button', { name: 'خروج' })).toBeTruthy();
    expect(sheet.queryByRole('link', { name: 'بک‌آفیس' })).toBeNull();

    await userEvent.click(sheet.getByRole('link', { name: 'دسته‌ها' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'دسته‌ها' })).toBeTruthy();
  });

  it('lists the Back Office under More for Operators', async () => {
    onPhone();
    renderApp({ api: operator().api });
    await userEvent.click(within(await sections()).getByRole('button', { name: 'بیشتر' }));
    const sheet = within(await screen.findByRole('dialog', { name: 'بیشتر' }));
    expect(await sheet.findByRole('link', { name: 'بک‌آفیس' })).toBeTruthy();
  });

  it('records a Transaction with the "+" in a sheet', async () => {
    onPhone();
    const fake = setUp();
    renderApp({ api: fake.api });
    await userEvent.click(within(await sections()).getByRole('button', { name: 'ثبت تراکنش' }));

    const sheet = within(await screen.findByRole('dialog', { name: 'ثبت تراکنش' }));
    const amount = sheet.getByRole('textbox', { name: 'مبلغ' });
    expect(document.activeElement).toBe(amount);
    await userEvent.type(amount, '۲۵۰٬۰۰۰{Enter}');
    expect(await sheet.findByText('ثبت شد.')).toBeTruthy();
    expect(fake.transactions()).toHaveLength(1);
  });

  it('keeps the Workspace switcher at hand', async () => {
    onPhone();
    const fake = setUp();
    const me = fake.api.me.bind(fake.api);
    fake.api.me = async () => {
      const found = await me();
      const [own] = found.workspaces;
      if (!own) return found;
      const shared = { ...own, id: '01900000-0000-7000-9000-0000000000ff', name: 'Home' };
      return { ...found, workspaces: [own, { ...shared, role: 'MEMBER' as const }] };
    };
    renderApp({ api: fake.api });
    expect(await screen.findByRole('combobox', { name: 'فضای کاری' })).toBeTruthy();
  });
});
