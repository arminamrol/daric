import { describe, expect, it } from 'vitest';
import {
  createInvitationInputSchema,
  mayChangeRole,
  mayManageMember,
  rolesAssignableBy,
  updateMemberInputSchema,
} from './index';

describe('rolesAssignableBy', () => {
  it('lets the Owner give any Role but Owner', () => {
    expect(rolesAssignableBy('OWNER')).toEqual(['ADMIN', 'MEMBER', 'VIEWER']);
  });

  it('lets an Admin give only Member and Viewer', () => {
    expect(rolesAssignableBy('ADMIN')).toEqual(['MEMBER', 'VIEWER']);
  });

  it('lets Members and Viewers give none', () => {
    expect(rolesAssignableBy('MEMBER')).toEqual([]);
    expect(rolesAssignableBy('VIEWER')).toEqual([]);
  });
});

describe('mayManageMember', () => {
  it('lets the Owner manage everyone but the Owner', () => {
    expect(mayManageMember('OWNER', 'ADMIN')).toBe(true);
    expect(mayManageMember('OWNER', 'MEMBER')).toBe(true);
    expect(mayManageMember('OWNER', 'VIEWER')).toBe(true);
    expect(mayManageMember('OWNER', 'OWNER')).toBe(false);
  });

  it('keeps an Admin away from the Owner and other Admins', () => {
    expect(mayManageMember('ADMIN', 'OWNER')).toBe(false);
    expect(mayManageMember('ADMIN', 'ADMIN')).toBe(false);
    expect(mayManageMember('ADMIN', 'MEMBER')).toBe(true);
    expect(mayManageMember('ADMIN', 'VIEWER')).toBe(true);
  });

  it('lets Members and Viewers manage nobody', () => {
    expect(mayManageMember('MEMBER', 'VIEWER')).toBe(false);
    expect(mayManageMember('VIEWER', 'VIEWER')).toBe(false);
  });
});

describe('mayChangeRole', () => {
  it('needs both the Member and the new Role within reach', () => {
    expect(mayChangeRole('OWNER', 'MEMBER', 'ADMIN')).toBe(true);
    expect(mayChangeRole('ADMIN', 'VIEWER', 'MEMBER')).toBe(true);
    expect(mayChangeRole('ADMIN', 'MEMBER', 'ADMIN')).toBe(false);
    expect(mayChangeRole('ADMIN', 'ADMIN', 'VIEWER')).toBe(false);
    expect(mayChangeRole('OWNER', 'VIEWER', 'OWNER')).toBe(false);
  });
});

describe('member and invitation input', () => {
  it('never takes Owner as a Role', () => {
    expect(updateMemberInputSchema.safeParse({ role: 'OWNER' }).success).toBe(false);
    expect(createInvitationInputSchema.safeParse({ role: 'OWNER' }).success).toBe(false);
  });

  it('takes an Invitation with or without an email, which it lowercases', () => {
    expect(createInvitationInputSchema.parse({ role: 'VIEWER' })).toEqual({ role: 'VIEWER' });
    expect(
      createInvitationInputSchema.parse({ role: 'ADMIN', email: ' Reza@Example.com ' }),
    ).toEqual({ role: 'ADMIN', email: 'reza@example.com' });
    expect(createInvitationInputSchema.safeParse({ role: 'ADMIN', email: 'nope' }).success).toBe(
      false,
    );
  });
});
