import { describe, expect, it } from 'vitest';
import { applyDirection } from './rtl';
import type { LayoutDirection, ReloadMarker } from './rtl';

function fakeManager(isRTL: boolean): LayoutDirection & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    isRTL,
    allowRTL: (allow) => void calls.push(`allow ${allow}`),
    forceRTL: (force) => void calls.push(`force ${force}`),
    swapLeftAndRightInRTL: (swap) => void calls.push(`swap ${swap}`),
  };
}

function fakeMarker(initial: string | null = null): ReloadMarker & { value: string | null } {
  const marker = {
    value: initial,
    get: () => marker.value,
    set: (value: string | null) => void (marker.value = value),
  };
  return marker;
}

describe('applyDirection', () => {
  it('leaves an app already laid out right to left for Persian as it is', () => {
    const manager = fakeManager(true);
    expect(applyDirection('fa', manager, fakeMarker())).toBe('ready');
    expect(manager.calls).not.toContain('force true');
  });

  it('turns layout right to left for Persian and asks for a reload, since it applies only at start', () => {
    const manager = fakeManager(false);
    expect(applyDirection('fa', manager, fakeMarker())).toBe('reload');
    expect(manager.calls).toContain('allow true');
    expect(manager.calls).toContain('force true');
  });

  it('turns layout left to right for English', () => {
    const manager = fakeManager(true);
    expect(applyDirection('en', manager, fakeMarker())).toBe('reload');
    expect(manager.calls).toContain('force false');
    expect(applyDirection('en', fakeManager(false), fakeMarker())).toBe('ready');
  });

  it('keeps left and right swapped in RTL, so start and end styles follow the direction', () => {
    const manager = fakeManager(true);
    applyDirection('fa', manager, fakeMarker());
    expect(manager.calls).toContain('swap true');
  });

  it('reloads only once for a direction: when the reload did not take, it carries on instead of looping', () => {
    const marker = fakeMarker();
    expect(applyDirection('fa', fakeManager(false), marker)).toBe('reload');
    expect(applyDirection('fa', fakeManager(false), marker)).toBe('ready');
  });

  it('forgets the reload once the direction took, so a later change reloads again', () => {
    const marker = fakeMarker();
    applyDirection('fa', fakeManager(false), marker);
    applyDirection('fa', fakeManager(true), marker);
    expect(marker.value).toBeNull();
    expect(applyDirection('en', fakeManager(true), marker)).toBe('reload');
  });
});
