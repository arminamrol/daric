import { describe, expect, it } from 'vitest';
import { createLabelInputSchema, labelSchema, updateLabelInputSchema } from './index';

describe('createLabelInputSchema', () => {
  it('trims the name and makes a Label that is not controllable by default', () => {
    expect(createLabelInputSchema.parse({ name: ' بیرون‌غذا ' })).toEqual({
      name: 'بیرون‌غذا',
      controllable: false,
    });
    expect(createLabelInputSchema.parse({ name: 'اشتراک', controllable: true }).controllable).toBe(
      true,
    );
  });

  it.each([
    ['an empty name', { name: ' ' }],
    ['a name over 100 characters', { name: 'x'.repeat(101) }],
    ['a controllable flag that is not a boolean', { name: 'اشتراک', controllable: 'yes' }],
  ])('rejects %s', (_, input) => {
    expect(createLabelInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('updateLabelInputSchema', () => {
  it('takes any of name, controllable and archived', () => {
    expect(updateLabelInputSchema.parse({ name: ' سفر ' })).toEqual({ name: 'سفر' });
    expect(updateLabelInputSchema.parse({ controllable: true, archived: true })).toEqual({
      controllable: true,
      archived: true,
    });
  });

  it.each([
    ['nothing', {}],
    ['an unknown field', { color: 'red' }],
    ['an empty name', { name: '' }],
  ])('rejects %s', (_, input) => {
    expect(updateLabelInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('labelSchema', () => {
  it('reads a Label from the wire', () => {
    const wire = {
      id: '01900000-0000-7000-8c00-000000000001',
      name: 'سفر',
      controllable: false,
      archived: false,
    };
    expect(labelSchema.parse(wire)).toEqual(wire);
  });
});
