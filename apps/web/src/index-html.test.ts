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

  it('applies the remembered theme before first paint', () => {
    expect(html).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
  });
});
