// Bundles the API into dist/ with workspace packages inlined (they ship TypeScript
// source) and every other dependency left to node_modules.
import { cp, rm } from 'node:fs/promises';
import { build } from 'esbuild';

await rm('dist', { recursive: true, force: true });
await build({
  entryPoints: { main: 'src/main.ts', migrate: 'src/db/migrate-cli.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  plugins: [
    {
      name: 'external-dependencies',
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) =>
          args.path.startsWith('@daric/') ? undefined : { path: args.path, external: true },
        );
      },
    },
  ],
});
// The migrator resolves `./migrations` next to the running file.
await cp('src/db/migrations', 'dist/migrations', { recursive: true });
