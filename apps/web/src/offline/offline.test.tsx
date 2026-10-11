import { keyValueStore } from '@daric/offline-queue';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeApi, testPassword } from '../test/fake-api';
import { goOffline, goOnline } from '../test/network';
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

/** A bank Account, a Category and one Expense; signed in unless `signedIn` is false. */
function setUp({ signedIn = true } = {}) {
  const fake = fakeApi(signedIn ? { signedInAs: 'sara@example.com' } : {});
  if (!signedIn) fake.addUser('sara@example.com');
  const melli = fake.addAccount({ name: 'ملی', openingBalance: 1_000_000n });
  const food = fake.addCategory({ name: 'خوراک', kind: 'EXPENSE' });
  const bread = fake.addTransaction({
    type: 'EXPENSE',
    accountId: melli.id,
    categoryId: food.id,
    amount: 300n,
    occurredOn: '2026-10-10',
    note: 'نان',
  });
  return { fake, melli, food, bread };
}

const entryForm = async () => within(await screen.findByRole('form', { name: 'ثبت تراکنش' }));
const editForm = async () => within(await screen.findByRole('form', { name: 'ویرایش تراکنش' }));
const amountField = (form: Awaited<ReturnType<typeof entryForm>>) =>
  form.getByRole('textbox', { name: 'مبلغ' });

/** The list row showing `text`. */
async function row(text: string) {
  const item = (await screen.findByText(text)).closest('li');
  if (!item) throw new Error(`No row shows ${text}`);
  return within(item);
}

const pendingMark = 'هنوز فرستاده نشده';
const waitingNotice = 'تغییرهایی هنوز فرستاده نشده‌اند؛ با وصل شدن اینترنت فرستاده می‌شوند.';

async function logIn({ keepData }: { keepData: boolean }) {
  await userEvent.type(await screen.findByLabelText('ایمیل'), 'sara@example.com');
  await userEvent.type(screen.getByLabelText(/^رمز عبور/), testPassword);
  const keep = screen.getByRole('checkbox', { name: 'داده‌ها روی این دستگاه بماند' });
  expect(keep).toHaveProperty('checked', false);
  if (keepData) await userEvent.click(keep);
  await userEvent.click(screen.getByRole('button', { name: 'ورود' }));
  await screen.findByRole('heading', { name: 'به دریک خوش آمدید' });
}

/** What this browser kept in IndexedDB. */
const kept = (key: string) => keyValueStore('daric').get<unknown>(key);

describe('Working offline', () => {
  it('records a Transaction offline, shows it as waiting and sends it once back online', async () => {
    const { fake } = setUp();
    renderApp({ path: '/transactions', api: fake.api });
    const form = await entryForm();
    await screen.findByText('−۳۰۰ ریال');

    goOffline(fake);
    await userEvent.type(amountField(form), '۲۵۰٬۰۰۰{Enter}');
    expect(await form.findByText('ثبت شد؛ با وصل شدن اینترنت فرستاده می‌شود.')).toBeTruthy();
    const waiting = await row('−۲۵۰٬۰۰۰ ریال');
    expect(waiting.getByRole('img', { name: pendingMark })).toBeTruthy();
    expect(screen.getByText(waitingNotice)).toBeTruthy();
    expect(fake.transactions()).toHaveLength(1);
    // Ready for the next one while offline too.
    expect(amountField(form)).toHaveProperty('value', '');

    goOnline(fake);
    await vi.waitFor(() => expect(fake.transactions()).toHaveLength(2));
    await vi.waitFor(() => expect(screen.queryByText(waitingNotice)).toBeNull());
    expect((await row('−۲۵۰٬۰۰۰ ریال')).queryByRole('img', { name: pendingMark })).toBeNull();
    expect(fake.transactions()[1]).toMatchObject({ amount: 250000n, version: 1 });
  });

  it('sends what was recorded offline in the order it was recorded, each once', async () => {
    const { fake } = setUp();
    renderApp({ path: '/transactions', api: fake.api });
    const form = await entryForm();
    goOffline(fake);
    for (const amount of ['۱۰', '۲۰', '۳۰']) {
      await userEvent.type(amountField(form), `${amount}{Enter}`);
      await row(`−${amount} ریال`);
    }
    goOnline(fake);
    await vi.waitFor(() => expect(fake.transactions()).toHaveLength(4));
    expect(fake.transactions().map((t) => t.amount)).toEqual([300n, 10n, 20n, 30n]);
  });

  it('edits offline: the change shows at once and is saved once back online', async () => {
    const { fake, bread } = setUp();
    const { router } = renderApp({ path: '/transactions', api: fake.api });
    await screen.findByText('−۳۰۰ ریال');
    goOffline(fake);

    await userEvent.click((await row('−۳۰۰ ریال')).getByRole('link', { name: 'ویرایش' }));
    const form = await editForm();
    await userEvent.clear(amountField(form));
    await userEvent.type(amountField(form), '400');
    await userEvent.click(form.getByRole('button', { name: 'ذخیره' }));

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/transactions'));
    expect((await row('−۴۰۰ ریال')).getByRole('img', { name: pendingMark })).toBeTruthy();
    expect(screen.queryByText('−۳۰۰ ریال')).toBeNull();

    goOnline(fake);
    await vi.waitFor(() =>
      expect(fake.transactions()[0]).toMatchObject({ id: bread.id, amount: 400n, version: 2 }),
    );
  });

  it('deletes offline, undoes it without the API, and deletes for good once back online', async () => {
    const { fake, bread } = setUp();
    renderApp({ path: '/transactions', api: fake.api });
    await screen.findByText('−۳۰۰ ریال');
    goOffline(fake);

    await userEvent.click((await row('−۳۰۰ ریال')).getByRole('button', { name: 'حذف' }));
    expect(await screen.findByText('در این سال تراکنشی نیست.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'برگرداندن' }));
    expect(await screen.findByText('−۳۰۰ ریال')).toBeTruthy();

    await userEvent.click((await row('−۳۰۰ ریال')).getByRole('button', { name: 'حذف' }));
    await screen.findByText('در این سال تراکنشی نیست.');
    goOnline(fake);
    await vi.waitFor(() => expect(fake.deletedTransactions()).toEqual([bread.id]));
  });

  it('undoing an offline delete brings back the offline edit it replaced', async () => {
    const { fake, bread } = setUp();
    renderApp({ path: '/transactions', api: fake.api });
    await screen.findByText('−۳۰۰ ریال');
    goOffline(fake);
    await userEvent.click((await row('−۳۰۰ ریال')).getByRole('link', { name: 'ویرایش' }));
    const form = await editForm();
    await userEvent.clear(amountField(form));
    await userEvent.type(amountField(form), '400');
    await userEvent.click(form.getByRole('button', { name: 'ذخیره' }));

    await userEvent.click((await row('−۴۰۰ ریال')).getByRole('button', { name: 'حذف' }));
    await screen.findByText('در این سال تراکنشی نیست.');
    await userEvent.click(screen.getByRole('button', { name: 'برگرداندن' }));
    expect((await row('−۴۰۰ ریال')).getByRole('img', { name: pendingMark })).toBeTruthy();

    goOnline(fake);
    await vi.waitFor(() =>
      expect(fake.transactions()[0]).toMatchObject({ id: bread.id, amount: 400n, version: 2 }),
    );
    expect(fake.deletedTransactions()).toEqual([]);
  });

  it('never sends a Transaction recorded and deleted while offline', async () => {
    const { fake } = setUp();
    renderApp({ path: '/transactions', api: fake.api });
    const form = await entryForm();
    goOffline(fake);
    await userEvent.type(amountField(form), '۵۵{Enter}');
    await userEvent.click((await row('−۵۵ ریال')).getByRole('button', { name: 'حذف' }));
    await vi.waitFor(() => expect(screen.queryByText('−۵۵ ریال')).toBeNull());
    expect(screen.queryByText(waitingNotice)).toBeNull();

    // Undone, it is recorded after all.
    await userEvent.click(screen.getByRole('button', { name: 'برگرداندن' }));
    await row('−۵۵ ریال');
    goOnline(fake);
    await vi.waitFor(() => expect(fake.transactions().map((t) => t.amount)).toEqual([300n, 55n]));
  });

  describe('an edit that meets a newer copy when it is sent', () => {
    async function editOfflineThenChangeElsewhere() {
      const fixture = setUp();
      const { fake, melli, food, bread } = fixture;
      renderApp({ path: '/transactions', api: fake.api });
      await screen.findByText('−۳۰۰ ریال');
      goOffline(fake);
      await userEvent.click((await row('−۳۰۰ ریال')).getByRole('link', { name: 'ویرایش' }));
      const form = await editForm();
      await userEvent.clear(amountField(form));
      await userEvent.type(amountField(form), '400');
      await userEvent.click(form.getByRole('button', { name: 'ذخیره' }));
      await row('−۴۰۰ ریال');

      fake.setOffline(false);
      await fake.api.updateTransaction(fake.workspace().id, bread.id, {
        type: 'EXPENSE',
        accountId: melli.id,
        categoryId: food.id,
        amount: 999n,
        occurredOn: '2026-10-10',
        note: 'نان',
        version: 1,
      });
      goOnline(fake);
      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain('جای دیگری هم تغییر کرد');
      expect(
        (await row('−۴۰۰ ریال')).getByRole('img', { name: 'جای دیگری هم تغییر کرد' }),
      ).toBeTruthy();
      return { ...fixture, alert: within(alert) };
    }

    it('keeps mine on request, against the newer copy', async () => {
      const { fake, alert } = await editOfflineThenChangeElsewhere();
      await userEvent.click(alert.getByRole('button', { name: 'تغییرات من بماند' }));
      await vi.waitFor(() =>
        expect(fake.transactions()[0]).toMatchObject({ amount: 400n, version: 3 }),
      );
      await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    });

    it('keeps theirs on request, dropping mine', async () => {
      const { fake, alert } = await editOfflineThenChangeElsewhere();
      await userEvent.click(alert.getByRole('button', { name: 'نسخهٔ تازه را بیاور' }));
      expect(await screen.findByText('−۹۹۹ ریال')).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(fake.transactions()[0]).toMatchObject({ amount: 999n, version: 2 });
    });
  });

  it('holds a change the API refuses until it is put aside', async () => {
    const { fake, melli } = setUp();
    renderApp({ path: '/transactions', api: fake.api });
    const form = await entryForm();
    goOffline(fake);
    await userEvent.type(amountField(form), '۷۷{Enter}');
    await row('−۷۷ ریال');

    fake.setOffline(false);
    await fake.api.updateAccount(fake.workspace().id, melli.id, { archived: true });
    goOnline(fake);
    const alert = within(await screen.findByRole('alert'));
    expect(alert.getByText('تغییری که دادید پذیرفته نشد.')).toBeTruthy();
    expect((await row('−۷۷ ریال')).getByRole('img', { name: 'پذیرفته نشد' })).toBeTruthy();
    await userEvent.click(alert.getByRole('button', { name: 'کنار بگذار' }));
    await vi.waitFor(() => expect(screen.queryByText('−۷۷ ریال')).toBeNull());
    expect(fake.transactions()).toHaveLength(1);
  });
});

describe('Keeping data on this device', () => {
  it('is off unless ticked at login: nothing is kept, so the app does not open offline', async () => {
    const { fake } = setUp({ signedIn: false });
    const first = renderApp({ path: '/login', api: fake.api });
    await logIn({ keepData: false });
    await userEvent.click(screen.getByRole('link', { name: 'تراکنش‌ها' }));
    await screen.findByText('−۳۰۰ ریال');
    first.unmount();

    goOffline(fake);
    renderApp({ path: '/transactions', api: fake.api });
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.queryByText('−۳۰۰ ریال')).toBeNull();
    expect(await kept('queryCache')).toBeUndefined();
    expect(localStorage.getItem('daric.keepData')).toBeNull();
  });

  it('when ticked, opens offline with the data from the last visit and keeps what is recorded', async () => {
    const { fake } = setUp({ signedIn: false });
    const first = renderApp({ path: '/login', api: fake.api });
    await logIn({ keepData: true });
    await userEvent.click(screen.getByRole('link', { name: 'تراکنش‌ها' }));
    await screen.findByText('−۳۰۰ ریال');
    await vi.waitFor(async () =>
      expect(
        JSON.stringify(await kept('queryCache'), (_, v: unknown) =>
          typeof v === 'bigint' ? String(v) : v,
        ),
      ).toContain('نان'),
    );
    first.unmount();

    goOffline(fake);
    const second = renderApp({ path: '/transactions', api: fake.api });
    expect(await screen.findByText('−۳۰۰ ریال')).toBeTruthy();
    const form = await entryForm();
    await userEvent.type(amountField(form), '۱۲{Enter}');
    await row('−۱۲ ریال');
    second.unmount();

    // Opened again later, still offline: what waits is still there, and is sent once online.
    const third = renderApp({ path: '/transactions', api: fake.api });
    expect((await row('−۱۲ ریال')).getByRole('img', { name: pendingMark })).toBeTruthy();
    third.unmount();
    goOnline(fake);
    renderApp({ path: '/transactions', api: fake.api });
    await vi.waitFor(() => expect(fake.transactions()).toHaveLength(2));
  });

  it('is forgotten when a later login is not ticked, even without a logout in between', async () => {
    const { fake } = setUp({ signedIn: false });
    const first = renderApp({ path: '/login', api: fake.api });
    await logIn({ keepData: true });
    await vi.waitFor(async () => expect(await kept('queryCache')).toBeDefined());
    first.unmount();

    // The session lapses on the server; the next person logs in without ticking.
    // The kept cache still names the old User until the API says otherwise.
    await fake.api.logout();
    renderApp({ api: fake.api });
    await screen.findByRole('heading', { name: 'ورود به دریک' });
    await logIn({ keepData: false });
    await vi.waitFor(async () => expect(await kept('queryCache')).toBeUndefined());
    expect(localStorage.getItem('daric.keepData')).toBeNull();
  });

  it('is wiped on logout, with what waits to be sent and the answer', async () => {
    const { fake } = setUp({ signedIn: false });
    const first = renderApp({ path: '/login', api: fake.api });
    await logIn({ keepData: true });
    await userEvent.click(screen.getByRole('link', { name: 'تراکنش‌ها' }));
    const form = await entryForm();
    goOffline(fake);
    await userEvent.type(amountField(form), '۱۲{Enter}');
    await row('−۱۲ ریال');
    expect(localStorage.getItem('daric.lastPicks.' + fake.workspace().id)).not.toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'خروج' }));
    expect(await screen.findByRole('heading', { name: 'ورود به دریک' })).toBeTruthy();
    expect(await kept('queryCache')).toBeUndefined();
    expect(await kept('entries')).toBeUndefined();
    expect(localStorage.getItem('daric.keepData')).toBeNull();
    expect(localStorage.getItem('daric.lastPicks.' + fake.workspace().id)).toBeNull();
    first.unmount();

    // The API could not be told offline; it is, as soon as the app opens online.
    expect(fake.signedInUser()).toBe('sara@example.com');
    goOnline(fake);
    renderApp({ path: '/transactions', api: fake.api });
    await screen.findByRole('heading', { name: 'ورود به دریک' });
    await vi.waitFor(() => expect(fake.signedInUser()).toBeUndefined());
    expect(fake.transactions()).toHaveLength(1);
  });

  it('logging in again after an offline logout works as usual', async () => {
    const { fake } = setUp();
    const first = renderApp({ path: '/transactions', api: fake.api });
    await screen.findByText('−۳۰۰ ریال');
    goOffline(fake);
    await userEvent.click(screen.getByRole('button', { name: 'خروج' }));
    await screen.findByRole('heading', { name: 'ورود به دریک' });
    first.unmount();

    goOnline(fake);
    renderApp({ path: '/login', api: fake.api });
    await logIn({ keepData: false });
    await userEvent.click(screen.getByRole('link', { name: 'تراکنش‌ها' }));
    expect(await screen.findByText('−۳۰۰ ریال')).toBeTruthy();
  });

  it('logging out online ends the Signed-in Device on the API', async () => {
    const { fake } = setUp();
    renderApp({ api: fake.api });
    await screen.findByRole('heading', { name: 'به دریک خوش آمدید' });
    await userEvent.click(await screen.findByRole('button', { name: 'خروج' }));
    expect(await screen.findByRole('heading', { name: 'ورود به دریک' })).toBeTruthy();
    expect(fake.signedInUser()).toBeUndefined();
  });
});
