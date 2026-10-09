import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';

describe('web shell', () => {
  it('renders in Persian, right to left', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { name: 'به دریک خوش آمدید' })).toBeTruthy();
    expect(document.documentElement.lang).toBe('fa');
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('renders left to right when the locale is English', async () => {
    renderApp({ locale: 'en' });
    expect(await screen.findByText('Daric')).toBeTruthy();
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('lets keyboard users skip to the main content', async () => {
    renderApp();
    const skip = await screen.findByRole('link', { name: 'رفتن به محتوای اصلی' });
    const target = skip.getAttribute('href')?.slice(1) ?? '';
    expect(screen.getByRole('main').id).toBe(target);
  });

  it('shows a not-found page for unknown addresses', async () => {
    renderApp({ path: '/nowhere' });
    expect(await screen.findByRole('heading', { name: 'صفحه پیدا نشد' })).toBeTruthy();
    // The Latin path is isolated so it does not reorder the Persian sentence around it.
    expect(screen.getByText('صفحه‌ای با نشانی ⁨/nowhere⁩ نیست.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'بازگشت به خانه' }).getAttribute('href')).toBe('/');
  });
});
