import { defineConfig } from 'vitest/config';

/** Shared Vitest preset: node environment, no globals, colocated `*.test.ts` files. */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    globals: false,
    passWithNoTests: true,
  },
});
