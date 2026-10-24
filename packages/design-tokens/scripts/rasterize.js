// Renders the brand files in ../brand into the PNG and ICO icons the apps ship. Run after
// `pnpm generate` whenever the logo changes: `pnpm --filter @daric/design-tokens rasterize`.
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const at = (path) => fileURLToPath(new URL(path, import.meta.url));
const web = '../../../apps/web/public/';
const mobile = '../../../apps/mobile/assets/';

/** Output file → [brand file, width in pixels]. */
const PNGS = {
  [`${web}pwa-64x64.png`]: ['mark-light.svg', 64],
  [`${web}pwa-192x192.png`]: ['mark-light.svg', 192],
  [`${web}pwa-512x512.png`]: ['mark-light.svg', 512],
  [`${web}maskable-icon-512x512.png`]: ['app-icon-light.svg', 512],
  [`${web}apple-touch-icon-180x180.png`]: ['app-icon-light.svg', 180],
  [`${mobile}icon.png`]: ['app-icon-light.svg', 1024],
  [`${mobile}icon-dark.png`]: ['app-icon-dark.svg', 1024],
  [`${mobile}adaptive-icon.png`]: ['adaptive-icon.svg', 1024],
  [`${mobile}splash-icon-light.png`]: ['mark-light.svg', 600],
  [`${mobile}splash-icon-dark.png`]: ['mark-dark.svg', 600],
};

const render = (file, width) =>
  new Resvg(readFileSync(at(`../brand/${file}`), 'utf8'), {
    fitTo: { mode: 'width', value: width },
  })
    .render()
    .asPng();

/** An ICO holding PNG images (supported by every browser that reads favicon.ico). */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size % 256, 0);
    entry.writeUInt8(size % 256, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...pngs.map(({ png }) => png)]);
}

for (const [out, [file, width]] of Object.entries(PNGS)) {
  writeFileSync(at(out), render(file, width));
}
writeFileSync(
  at(`${web}favicon.ico`),
  ico([16, 32, 48].map((size) => ({ size, png: render('mark-light.svg', size) }))),
);
