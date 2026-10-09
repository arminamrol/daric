import { describe, expect, it } from 'vitest';
import { direction, isolate } from './index';

describe('direction', () => {
  it('is right-to-left for Persian and left-to-right for English', () => {
    expect(direction('fa')).toBe('rtl');
    expect(direction('en')).toBe('ltr');
  });
});

describe('isolate', () => {
  it('wraps text in first-strong isolate marks so it keeps its own direction inside a message', () => {
    expect(isolate('/reports')).toBe('⁨/reports⁩');
  });
});
