import { themes } from '@daric/design-tokens';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import html from '../../index.html?raw';
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

  it('colors the browser bar like the active theme', async () => {
    // The theme-color tags exactly as index.html ships them.
    document.head.innerHTML = (html.match(/<meta name="theme-color"[^>]*>/g) ?? []).join('');
    const colors = () =>
      [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map(
        (meta) => meta.content,
      );
    const system = [themes.light.surface, themes.dark.surface];
    expect(colors()).toEqual(system);

    renderApp();
    await userEvent.click(await option('تیره'));
    expect(colors()).toEqual([themes.dark.surface, themes.dark.surface]);
    await userEvent.click(await option('روشن'));
    expect(colors()).toEqual([themes.light.surface, themes.light.surface]);
    await userEvent.click(await option('سیستم'));
    expect(colors()).toEqual(system);
  });

  it('is a labelled group of choices', async () => {
    renderApp();
    expect(await screen.findByRole('group', { name: 'ظاهر' })).toBeTruthy();
  });
});
