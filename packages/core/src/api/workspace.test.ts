import { describe, expect, it } from 'vitest';
import { hasRole } from './index';

describe('hasRole', () => {
  it('ranks Owner above Admin above Member above Viewer', () => {
    expect(hasRole('OWNER', 'ADMIN')).toBe(true);
    expect(hasRole('ADMIN', 'ADMIN')).toBe(true);
    expect(hasRole('MEMBER', 'ADMIN')).toBe(false);
    expect(hasRole('VIEWER', 'MEMBER')).toBe(false);
    expect(hasRole('VIEWER', 'VIEWER')).toBe(true);
  });
});
