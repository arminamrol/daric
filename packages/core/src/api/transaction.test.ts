import { describe, expect, it } from 'vitest';
import {
  createTransactionInputSchema,
  listTransactionsQuerySchema,
  periodParam,
  transactionSchema,
} from './index';

const accountId = '01900000-0000-7000-a000-000000000001';
const categoryId = '01900000-0000-7000-b000-000000000001';
const labelId = '01900000-0000-7000-8c00-000000000001';
const otherLabelId = '01900000-0000-7000-8c00-000000000002';
const valid = {
  type: 'EXPENSE',
  accountId,
  categoryId,
  amount: '250000',
  occurredOn: '2026-10-10',
};

describe('createTransactionInputSchema', () => {
  it('reads the Amount as a bigint and leaves the note empty by default', () => {
    expect(createTransactionInputSchema.parse(valid)).toEqual({
      ...valid,
      amount: 250000n,
      note: null,
      labelIds: [],
    });
  });

  it('takes the Labels to attach', () => {
    expect(
      createTransactionInputSchema.parse({ ...valid, labelIds: [labelId, otherLabelId] }).labelIds,
    ).toEqual([labelId, otherLabelId]);
  });

  it('takes a client-made UUIDv7 id and a trimmed note', () => {
    const id = '0199d0f0-0000-7000-8000-000000000001';
    expect(createTransactionInputSchema.parse({ ...valid, id, note: '  نان  ' })).toMatchObject({
      id,
      note: 'نان',
    });
    expect(createTransactionInputSchema.parse({ ...valid, note: '   ' }).note).toBeNull();
  });

  it.each([
    ['a zero Amount', { amount: '0' }],
    ['a negative Amount', { amount: '-5' }],
    ['a fractional Amount', { amount: '1.5' }],
    ['an Amount as a JSON number', { amount: 100 }],
    ['a Transfer', { type: 'TRANSFER' }],
    ['an id that is not a UUIDv7', { id: '01900000-0000-4000-8000-000000000001' }],
    ['a day that does not exist', { occurredOn: '2026-02-30' }],
    ['a day with a time', { occurredOn: '2026-10-10T10:00:00Z' }],
    ['a missing Category', { categoryId: undefined }],
    ['a note over 1000 characters', { note: 'x'.repeat(1001) }],
    ['an unknown field', { currency: 'USD' }],
    ['a Label id that is not a uuid', { labelIds: ['travel'] }],
    ['the same Label twice', { labelIds: [labelId, labelId] }],
    ['the same Label twice in different case', { labelIds: [labelId, labelId.toUpperCase()] }],
    [
      'more than 20 Labels',
      {
        labelIds: Array.from(
          { length: 21 },
          (_, i) => `01900000-0000-7000-8c00-${String(i).padStart(12, '0')}`,
        ),
      },
    ],
  ])('rejects %s', (_, change) => {
    expect(createTransactionInputSchema.safeParse({ ...valid, ...change }).success).toBe(false);
  });
});

describe('transactionSchema', () => {
  it('reads a Transaction from the wire', () => {
    const wire = {
      ...valid,
      id: '0199d0f0-0000-7000-8000-000000000001',
      note: null,
      createdBy: '01900000-0000-7000-8000-000000000001',
      labelIds: [labelId],
      version: 1,
    };
    expect(transactionSchema.parse(wire)).toEqual({ ...wire, amount: 250000n });
  });
});

describe('listTransactionsQuerySchema', () => {
  it('reads a month or a year of the Workspace Calendar', () => {
    expect(listTransactionsQuerySchema.parse({ period: '1405-07' })).toEqual({
      period: { kind: 'month', year: 1405, month: 7 },
    });
    expect(listTransactionsQuerySchema.parse({ period: '1405' })).toEqual({
      period: { kind: 'year', year: 1405 },
    });
    expect(listTransactionsQuerySchema.parse({ accountId, categoryId, labelId })).toEqual({
      accountId,
      categoryId,
      labelId,
    });
  });

  it.each([['1405-13'], ['1405-7'], ['14'], ['July'], ['0000'], ['0000-01']])(
    'rejects the period %j',
    (period) => {
      expect(listTransactionsQuerySchema.safeParse({ period }).success).toBe(false);
    },
  );

  it('writes a Period back as the same parameter', () => {
    expect(periodParam({ kind: 'month', year: 1405, month: 7 })).toBe('1405-07');
    expect(periodParam({ kind: 'year', year: 2026 })).toBe('2026');
  });
});
