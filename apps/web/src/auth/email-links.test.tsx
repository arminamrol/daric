import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fakeApi, testPassword } from '../test/fake-api';
import { renderApp } from '../test/render';

const email = 'sara@example.com';
const newPassword = 'a brand new passphrase';
const linkInvalid = 'این پیوند درست نیست، پیش‌تر به کار رفته یا زمانش گذشته است.';

describe('forgotten password', () => {
  it('is reachable from the login page', async () => {
    renderApp({ path: '/login', api: fakeApi().api });
    await userEvent.click(
      await screen.findByRole('link', { name: 'رمز عبور را فراموش کرده‌اید؟' }),
    );
    expect(await screen.findByRole('heading', { name: 'فراموشی رمز عبور' })).toBeTruthy();
  });

  it('mails a reset link and says so without telling whether the email is registered', async () => {
    const server = fakeApi();
    server.addUser(email);
    renderApp({ path: '/forgot-password', api: server.api });

    await userEvent.type(await screen.findByLabelText('ایمیل'), email);
    await userEvent.click(screen.getByRole('button', { name: 'فرستادن پیوند' }));

    expect((await screen.findByRole('status')).textContent).toMatch(
      /اگر این ایمیل در دریک ثبت شده/,
    );
    expect(server.resetToken(email)).toBeDefined();
  });

  it('checks the email before asking', async () => {
    const server = fakeApi();
    renderApp({ path: '/forgot-password', api: server.api });
    await userEvent.type(await screen.findByLabelText('ایمیل'), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'فرستادن پیوند' }));
    expect(await screen.findByText('این ایمیل درست نیست.')).toBeTruthy();
  });

  it('sets the new password from the mailed link', async () => {
    const server = fakeApi();
    server.addUser(email);
    await server.api.forgotPassword(email);
    renderApp({ path: `/reset-password?token=${server.resetToken(email)}`, api: server.api });

    await userEvent.type(await screen.findByLabelText(/^رمز عبور تازه/), newPassword);
    await userEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ رمز تازه' }));

    expect((await screen.findByRole('status')).textContent).toMatch(/رمز تازه ذخیره شد/);
    await userEvent.click(screen.getByRole('link', { name: 'ورود به دریک' }));
    expect(await screen.findByRole('heading', { name: 'ورود به دریک' })).toBeTruthy();
    await expect(server.api.login({ email, password: newPassword })).resolves.toBeTruthy();
    await expect(server.api.login({ email, password: testPassword })).rejects.toThrow();
  });

  it('asks for a new link when the token is invalid, used or expired', async () => {
    const server = fakeApi();
    renderApp({ path: '/reset-password?token=stale', api: server.api });
    await userEvent.type(await screen.findByLabelText(/^رمز عبور تازه/), newPassword);
    await userEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ رمز تازه' }));

    expect((await screen.findByRole('alert')).textContent).toBe(linkInvalid);
    await userEvent.click(screen.getByRole('link', { name: 'درخواست پیوند تازه' }));
    expect(await screen.findByRole('heading', { name: 'فراموشی رمز عبور' })).toBeTruthy();
  });

  it('checks the new password before sending it', async () => {
    renderApp({ path: '/reset-password?token=t', api: fakeApi().api });
    await userEvent.type(await screen.findByLabelText(/^رمز عبور تازه/), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ رمز تازه' }));
    expect(await screen.findByText('رمز عبور باید دست‌کم ۸ نویسه باشد.')).toBeTruthy();
  });
});

describe('email verification', () => {
  it('verifies the email from the mailed link, signed in or not', async () => {
    const server = fakeApi();
    await server.api.register({ email, password: testPassword });
    await server.api.logout();
    renderApp({ path: `/verify-email?token=${server.verificationToken(email)}`, api: server.api });

    expect(await screen.findByText('ایمیل شما تأیید شد.')).toBeTruthy();
    expect(server.emailVerified(email)).toBe(true);
  });

  it('says so when the link is invalid', async () => {
    renderApp({ path: '/verify-email?token=stale', api: fakeApi().api });
    expect((await screen.findByRole('alert')).textContent).toBe(linkInvalid);
  });

  it('reminds an unverified User at home and mails the link again', async () => {
    const server = fakeApi();
    await server.api.register({ email, password: testPassword });
    const first = server.verificationToken(email);
    renderApp({ api: server.api });

    expect(await screen.findByText(/ایمیل شما هنوز تأیید نشده است/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'فرستادن دوبارهٔ پیوند' }));
    expect(await screen.findByText('پیوند تازه فرستاده شد.')).toBeTruthy();
    expect(server.verificationToken(email)).not.toBe(first);
  });

  it('does not remind a verified User', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { name: 'به دریک خوش آمدید' })).toBeTruthy();
    expect(screen.queryByText(/ایمیل شما هنوز تأیید نشده است/)).toBeNull();
  });
});
