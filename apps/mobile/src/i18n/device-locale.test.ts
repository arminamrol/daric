import { describe, expect, it } from 'vitest';
import { memorySettings } from '../storage/settings';
import { deviceLocale, rememberLocale } from './device-locale';

describe('the language on this device', () => {
  it('is Persian until another is chosen', () => {
    expect(deviceLocale(memorySettings())).toBe('fa');
  });

  it('is the one last chosen, across a restart', () => {
    const settings = memorySettings();
    rememberLocale(settings, 'en');
    expect(deviceLocale(settings)).toBe('en');
    rememberLocale(settings, 'fa');
    expect(deviceLocale(settings)).toBe('fa');
  });

  it('falls back to Persian for a value it does not know', () => {
    const settings = memorySettings();
    settings.set('daric.locale', 'de');
    expect(deviceLocale(settings)).toBe('fa');
  });
});
