import css from '@eslint/css';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { logicalApply, logicalClasses } from './logical-properties.js';

/**
 * Physical properties that do not depend on writing direction, so they stay allowed in CSS:
 * only left/right ones must become logical (start/end).
 */
const DIRECTION_NEUTRAL = [
  'top',
  'bottom',
  'width',
  'height',
  'min-width',
  'max-width',
  'min-height',
  'max-height',
  'margin-top',
  'margin-bottom',
  'padding-top',
  'padding-bottom',
  'border-top',
  'border-top-color',
  'border-top-style',
  'border-top-width',
  'border-bottom',
  'border-bottom-color',
  'border-bottom-style',
  'border-bottom-width',
  'scroll-margin-top',
  'scroll-margin-bottom',
  'scroll-padding-top',
  'scroll-padding-bottom',
  'overflow-x',
  'overflow-y',
  'overscroll-behavior-x',
  'overscroll-behavior-y',
  'contain-intrinsic-width',
  'contain-intrinsic-height',
];
const VIEWPORT_UNITS = ['vw', 'vh', 'svw', 'svh', 'lvw', 'lvh', 'dvw', 'dvh', 'cqw', 'cqh'];

const daric = {
  rules: { 'logical-classes': logicalClasses, 'logical-apply': logicalApply },
};

/** Shared flat config for every Daric package and app. */
export default defineConfig(
  { ignores: ['**/dist/**', '**/coverage/**', '**/.turbo/**'] },
  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.strict, tseslint.configs.stylistic],
    plugins: { daric },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'daric/logical-classes': 'error',
    },
  },
  {
    files: ['**/*.css'],
    plugins: { css, daric },
    language: 'css/css',
    languageOptions: { tolerant: true },
    rules: {
      'css/prefer-logical-properties': [
        'error',
        { allowProperties: DIRECTION_NEUTRAL, allowUnits: VIEWPORT_UNITS },
      ],
      'daric/logical-apply': 'error',
    },
  },
);
