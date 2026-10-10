import daric from '@daric/config/eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig(daric, {
  files: ['**/*.ts'],
  rules: {
    // Nest modules are decorated empty classes.
    '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
  },
});
