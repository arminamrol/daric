import preset from '@daric/config/eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';

export default defineConfig(preset, {
  files: ['src/**/*.{ts,tsx}'],
  extends: [reactHooks.configs.flat.recommended],
});
