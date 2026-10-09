import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';

const theme = () => document.documentElement.dataset['theme'];
const option = (name: string) => screen.findByRole<HTMLInputElement>('radio', { name });

describe('theme', () => {
  it('follows the system preference by default', async () => {
    renderApp();
    expect((await option('سیستم')).checked).toBe(true);
    expect(theme()).toBeUndefined();
  });

  it('applies and remembers a chosen theme', async () => {
    const view = renderApp();
    await userEvent.click(await option('تیره'));
    expect(theme()).toBe('dark');

    view.unmount();
    document.documentElement.removeAttribute('data-theme');
    renderApp();
    expect((await option('تیره')).checked).toBe(true);
    expect(theme()).toBe('dark');
  });

  it('goes back to the system preference', async () => {
    renderApp();
    await userEvent.click(await option('روشن'));
    expect(theme()).toBe('light');
    await userEvent.click(await option('سیستم'));
    expect(theme()).toBeUndefined();
  });

  it('is a labelled group of choices', async () => {
    renderApp();
    expect(await screen.findByRole('group', { name: 'ظاهر' })).toBeTruthy();
  });
});
