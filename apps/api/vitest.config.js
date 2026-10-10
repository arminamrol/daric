import preset from '@daric/config/vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
  preset,
  defineConfig({
    test: {
      // Creates and migrates a throwaway database; tests need Postgres running.
      globalSetup: ['./src/test/global-setup.ts'],
      testTimeout: 20_000,
      hookTimeout: 60_000,
    },
  }),
);
