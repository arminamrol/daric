import { describe, expect, it } from 'vitest';
import { brandFiles, logoColors, logoMark } from './index';

describe('brand files', () => {
  // The committed files are generated; refresh them with `pnpm --filter @daric/design-tokens generate`.
  it.each(Object.keys(brandFiles()))('%s matches the committed file', async (name) => {
    await expect(brandFiles()[name]).toMatchFileSnapshot(`../brand/${name}`);
  });

  it('serves the web app the committed favicon', async () => {
    await expect(brandFiles()['favicon.svg']).toMatchFileSnapshot(
      '../../../apps/web/public/favicon.svg',
    );
  });

  it('has the mark, both lockups and the app icon in light and dark', () => {
    const names = Object.keys(brandFiles());
    for (const file of ['mark', 'lockup-fa', 'lockup-en', 'app-icon']) {
      expect(names).toContain(`${file}-light.svg`);
      expect(names).toContain(`${file}-dark.svg`);
    }
  });

  it('names the logo for assistive technology, in the lockup language', () => {
    const files = brandFiles();
    expect(files['mark-light.svg']).toContain('<title>Daric</title>');
    expect(files['lockup-en-dark.svg']).toContain('<title>Daric</title>');
    expect(files['lockup-fa-light.svg']).toContain('<title>دریک</title>');
    expect(files['lockup-fa-light.svg']).toMatch(/<svg [^>]*xml:lang="fa"/);
  });

  it('puts the mark at the start of each lockup: right in Persian, left in English', () => {
    const files = brandFiles();
    const markX = (svg = '') => Number(/<g transform="translate\(([\d.]+) /.exec(svg)?.[1]);
    const width = (svg = '') => Number(/viewBox="0 0 ([\d.]+) /.exec(svg)?.[1]);
    expect(markX(files['lockup-en-light.svg'])).toBe(0);
    expect(markX(files['lockup-fa-light.svg'])).toBeCloseTo(
      width(files['lockup-fa-light.svg']) - 64,
    );
  });

  it('draws the favicon in the dark coin gold when the system is dark', () => {
    const favicon = brandFiles()['favicon.svg'];
    expect(favicon).toContain(logoColors.light.coin);
    expect(favicon).toMatch(
      new RegExp(`@media \\(prefers-color-scheme: dark\\)[^}]*\\{[^}]*${logoColors.dark.coin}`),
    );
  });
});

describe('logo colors', () => {
  it('strikes the coin in gold and the arrow in navy, a lighter gold in dark', () => {
    expect(logoColors.light).toMatchObject({ coin: '#c38f26', ink: '#0a1328', tile: '#fcf8ec' });
    expect(logoColors.dark).toMatchObject({ coin: '#d9a93c', ink: '#0a1328', tile: '#0a1328' });
  });
});

describe('logoMark', () => {
  const distance = ([x, y]: readonly [number, number]) => Math.hypot(x - 32, y - 32);

  it('breaks the rim with the arrowhead while keeping it on the coin', () => {
    const rimOuter = logoMark.rim.r + logoMark.rim.strokeWidth / 2;
    expect(distance(logoMark.tip)).toBeGreaterThan(rimOuter);
    expect(distance(logoMark.tip) + logoMark.halo).toBeLessThan(logoMark.coin.r);
  });

  it('keeps the fletchings clear of the rim', () => {
    const rimInner = logoMark.rim.r - logoMark.rim.strokeWidth / 2;
    const { arm, strokeWidth } = logoMark.fletching;
    for (const [x, y] of logoMark.fletching.corners) {
      for (const end of [
        [x - arm, y],
        [x, y + arm],
      ] as const) {
        expect(distance(end) + strokeWidth / 2).toBeLessThan(rimInner);
      }
    }
  });
});
