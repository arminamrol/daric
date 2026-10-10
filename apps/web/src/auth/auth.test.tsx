import { ApiError, type ApiClient } from '@daric/api-client';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fakeApi, testPassword } from '../test/fake-api';
import { renderApp } from '../test/render';

const emptyHome = () => screen.findByRole('heading', { name: 'به دریک خوش آمدید' });
const loginHeading = () => screen.findByRole('heading', { name: 'ورود به دریک' });
const signupHeading = () => screen.findByRole('heading', { name: 'ساخت حساب دریک' });
const passwordField = () => screen.getByLabelText(/^رمز عبور/);

async function fillIn(email: string, password: string) {
  await userEvent.type(await screen.findByLabelText('ایمیل'), email);
  await userEvent.type(passwordField(), password);
}

describe('signed-out visitors', () => {
  it('are sent from home to the login page', async () => {
    const { router } = renderApp({ api: fakeApi().api });
    expect(await loginHeading()).toBeTruthy();
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.queryByRole('heading', { name: 'به دریک خوش آمدید' })).toBeNull();
  });

  it('can move between login and sign-up', async () => {
    renderApp({ path: '/login', api: fakeApi().api });
    await userEvent.click(await screen.findByRole('link', { name: 'ثبت‌نام کنید' }));
    expect(await signupHeading()).toBeTruthy();
    await userEvent.click(screen.getByRole('link', { name: 'وارد شوید' }));
    expect(await loginHeading()).toBeTruthy();
  });
});

describe('login', () => {
  it('lands on the empty home', async () => {
    const server = fakeApi();
    server.addUser('sara@example.com');
    renderApp({ path: '/login', api: server.api });

    await fillIn('sara@example.com', testPassword);
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }));

    expect(await emptyHome()).toBeTruthy();
    expect(server.signedInUser()).toBe('sara@example.com');
  });

  it('says so when the email or password is wrong', async () => {
    const server = fakeApi();
    server.addUser('sara@example.com');
    renderApp({ path: '/login', api: server.api });

    await fillIn('sara@example.com', 'not my password');
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }));

    expect((await screen.findByRole('alert')).textContent).toBe('ایمیل یا رمز عبور درست نیست.');
    expect(await loginHeading()).toBeTruthy();
  });

  it('asks for both fields before calling the API', async () => {
    const server = fakeApi();
    const login = vi.spyOn(server.api, 'login');
    renderApp({ path: '/login', api: server.api });

    await userEvent.click(await screen.findByRole('button', { name: 'ورود' }));

    const email = screen.getByLabelText('ایمیل');
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(email.getAttribute('aria-describedby')).toBe(screen.getByText('ایمیل را وارد کنید.').id);
    expect(document.activeElement).toBe(email);
    expect(passwordField().getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('رمز عبور را وارد کنید.')).toBeTruthy();
    expect(login).not.toHaveBeenCalled();
  });

  it('sends a signed-in User straight home', async () => {
    renderApp({ path: '/login' });
    expect(await emptyHome()).toBeTruthy();
  });

  it('says so when there have been too many attempts', async () => {
    const api: ApiClient = {
      ...fakeApi().api,
      login: () => Promise.reject(new ApiError(429, {})),
    };
    renderApp({ path: '/login', api });
    await fillIn('sara@example.com', testPassword);
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'تلاش‌ها زیاد بود. کمی بعد دوباره امتحان کنید.',
    );
  });
});

describe('sign-up', () => {
  it('lands on the empty home', async () => {
    const server = fakeApi();
    renderApp({ path: '/signup', api: server.api });

    await fillIn('new@example.com', testPassword);
    await userEvent.click(screen.getByRole('button', { name: 'ثبت‌نام' }));

    expect(await emptyHome()).toBeTruthy();
    expect(server.signedInUser()).toBe('new@example.com');
  });

  it('checks the email and password length in Persian before calling the API', async () => {
    const server = fakeApi();
    const register = vi.spyOn(server.api, 'register');
    renderApp({ path: '/signup', api: server.api });

    await fillIn('not-an-email', 'short');
    await userEvent.click(screen.getByRole('button', { name: 'ثبت‌نام' }));

    expect(await screen.findByText('این ایمیل درست نیست.')).toBeTruthy();
    const password = passwordField();
    expect(password.getAttribute('aria-invalid')).toBe('true');
    const describedBy = password.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(describedBy).toContain(screen.getByText('رمز عبور باید دست‌کم ۸ نویسه باشد.').id);
    expect(register).not.toHaveBeenCalled();
  });

  it('tells a taken email apart from other failures', async () => {
    const server = fakeApi();
    server.addUser('sara@example.com');
    renderApp({ path: '/signup', api: server.api });

    await fillIn('sara@example.com', testPassword);
    await userEvent.click(screen.getByRole('button', { name: 'ثبت‌نام' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'با این ایمیل قبلاً ثبت‌نام شده است.',
    );
  });

  it('uses password-manager friendly fields', async () => {
    renderApp({ path: '/signup', api: fakeApi().api });
    const form = await screen.findByRole('form', { name: 'ساخت حساب دریک' });
    expect(within(form).getByLabelText('ایمیل').getAttribute('autocomplete')).toBe('email');
    expect(
      within(form)
        .getByLabelText(/^رمز عبور/)
        .getAttribute('autocomplete'),
    ).toBe('new-password');
  });

  it('shows an error when the API cannot be reached', async () => {
    const api: ApiClient = {
      ...fakeApi().api,
      register: () => Promise.reject(new TypeError('Failed to fetch')),
    };
    renderApp({ path: '/signup', api });
    await fillIn('new@example.com', testPassword);
    await userEvent.click(screen.getByRole('button', { name: 'ثبت‌نام' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'مشکلی پیش آمد. دوباره امتحان کنید.',
    );
  });
});
