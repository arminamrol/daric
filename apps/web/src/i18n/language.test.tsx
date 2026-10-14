import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import html from '../../index.html?raw';
import { fakeApi } from '../test/fake-api';
import { renderApp } from '../test/render';
import { LOCALE_STORAGE_KEY } from './locale';

const root = () => document.documentElement;
const option = (name: string) => screen.findByRole<HTMLInputElement>('radio', { name });

describe('language', () => {
  it('starts in Persian, right to left', async () => {
    renderApp({ path: '/settings' });
    await screen.findByRole('heading', { name: 'تنظیمات' });
    expect(root().lang).toBe('fa');
    expect(root().dir).toBe('rtl');
    expect((await option('فارسی')).checked).toBe(true);
  });

  it("switches a signed-in User's whole app to English, left to right, and keeps it with them", async () => {
    const { api } = fakeApi({ signedInAs: 'sara@example.com' });
    const view = renderApp({ path: '/settings', api });
    await screen.findByRole('heading', { name: 'تنظیمات' });
    await userEvent.click(await option('English'));

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy();
    expect(root().lang).toBe('en');
    expect(root().dir).toBe('ltr');
    expect(document.title).toBe('Daric');
    expect(screen.getByRole('navigation', { name: 'Sections' })).toBeTruthy();

    view.unmount();
    localStorage.clear();
    renderApp({ path: '/settings', api });
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy();
    expect((await option('English')).checked).toBe(true);
  });

  it("lets the User's saved language win over this device's", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'fa');
    const { api } = fakeApi({ signedInAs: 'sara@example.com', locale: 'en' });
    renderApp({ api });
    expect(await screen.findByRole('heading', { name: 'Welcome to Daric' })).toBeTruthy();
    expect(root().dir).toBe('ltr');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  });

  it("remembers a guest's choice on this device and signs them up in it", async () => {
    const server = fakeApi();
    const view = renderApp({ path: '/signup', api: server.api });
    await screen.findByRole('heading', { name: 'ساخت حساب دریک' });
    await userEvent.click(await option('English'));
    expect(await screen.findByRole('heading', { name: 'Create a Daric account' })).toBeTruthy();
    expect(root().dir).toBe('ltr');

    view.unmount();
    renderApp({ path: '/signup', api: server.api });
    expect(await screen.findByRole('heading', { name: 'Create a Daric account' })).toBeTruthy();

    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse battery');
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(await screen.findByRole('heading', { name: 'Welcome to Daric' })).toBeTruthy();
    expect((await server.api.me()).preferences.locale).toBe('en');
  });

  it('applies the remembered language before first paint', () => {
    expect(html).toContain(`localStorage.getItem('${LOCALE_STORAGE_KEY}')`);
  });
});
