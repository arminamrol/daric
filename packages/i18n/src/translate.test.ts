import { describe, expect, it } from 'vitest';
import { createTranslator } from './index';
import type { PlainMessageKey } from './index';

describe('createTranslator', () => {
  it('translates keys into Persian', () => {
    const t = createTranslator('fa');
    expect(t('app.name')).toBe('دریک');
  });

  it('fills {param} placeholders', () => {
    const t = createTranslator('fa');
    expect(t('notFound.description', { path: '/reports' })).toBe('صفحه‌ای با نشانی /reports نیست.');
  });

  it('translates into English, falling back to Persian for messages English does not have yet', () => {
    const t = createTranslator('en');
    expect(t('app.name')).toBe('Daric');
    expect(t('notFound.description', { path: '/reports' })).toBe('صفحه‌ای با نشانی /reports نیست.');
  });

  it('rejects unknown keys and missing or extra params at compile time', () => {
    const t = createTranslator('fa');
    // @ts-expect-error unknown key
    t('app.missing');
    // @ts-expect-error params required
    t('notFound.description');
    // @ts-expect-error wrong param name
    t('notFound.description', { url: '/reports' });
    // @ts-expect-error no params expected
    t('app.name', { path: '/reports' });
  });

  it('translates plain keys kept in data without params', () => {
    const t = createTranslator('fa');
    const labels: PlainMessageKey[] = ['app.name'];
    expect(labels.map((key) => t(key))).toEqual(['دریک']);
    // @ts-expect-error messages with placeholders are not plain
    const _withParams: PlainMessageKey = 'notFound.description';
  });
});
