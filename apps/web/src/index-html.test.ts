import { themes } from '@daric/design-tokens';
import { fa } from '@daric/i18n';
import { describe, expect, it } from 'vitest';
import html from '../index.html?raw';
import css from './index.css?raw';
import { THEME_STORAGE_KEY } from './theme/theme';

describe('index.html', () => {
  it('starts in Persian, right to left, before any script runs', () => {
    expect(html).toMatch(/<html lang="fa" dir="rtl">/);
  });

  it('loads nothing from other origins (fonts and assets are self-hosted)', () => {
    for (const source of [html, css]) {
      expect(source).not.toMatch(/(?:src|href)=["']?(?:https?:)?\/\//);
      expect(source).not.toMatch(/(?:url\(|@import\s+)["']?(?:https?:)?\/\//);
    }
  });

  it('names the app and colors the browser bar from the dictionary and tokens', () => {
    expect(html).toContain(`<title>${fa['app.name']}</title>`);
    expect(html).toContain(`<meta name="description" content="${fa['app.tagline']}" />`);
    for (const scheme of ['light', 'dark'] as const) {
      expect(html).toContain(
        `<meta name="theme-color" content="${themes[scheme].surface}" media="(prefers-color-scheme: ${scheme})" />`,
      );
    }
  });

  it('applies the remembered theme before first paint', () => {
    expect(html).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
  });
});
