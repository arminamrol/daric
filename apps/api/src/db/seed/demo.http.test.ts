import { calendarDateOf, monthPeriodOfDay } from '@daric/core';
import { asc, count, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, registerUser, startTestApp, type TestApp } from '../../test/app';
import { testDatabase } from '../../test/db';
import { one } from '../client';
import { transactionLabels, transactions, users, workspaceMembers } from '../schema';
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from './demo';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

// 1405/07/19 on the Jalali calendar.
const today = '2026-10-11';

async function demoTransactions(workspaceId: string) {
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.workspaceId, workspaceId))
    .orderBy(asc(transactions.occurredOn), asc(transactions.id));
}

describe('demo seed', () => {
  let t: TestApp;
  let seeded: { userId: string; workspaceId: string };
  beforeAll(async () => {
    t = await startTestApp();
    seeded = await seedDemo(db, { today });
  });
  afterAll(() => t.close());

  async function login() {
    const res = await call(t.url, 'POST', '/v1/auth/login', {
      body: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
    });
    expect(res.status).toBe(200);
    return res.body.accessToken as string;
  }

  it('gives a demo User who logs in to a Jalali Personal Workspace in rials', async () => {
    const token = await login();
    const me = await call(t.url, 'GET', '/v1/me', { token });
    expect(me.body.workspaces).toEqual([
      expect.objectContaining({
        id: seeded.workspaceId,
        type: 'PERSONAL',
        calendar: 'jalali',
        baseCurrency: 'IRR',
        role: 'OWNER',
      }),
    ]);
  });

  it('fills the Workspace with Accounts, Categories and Labels', async () => {
    const token = await login();
    const base = `/v1/workspaces/${seeded.workspaceId}`;
    const accounts = await call(t.url, 'GET', `${base}/accounts`, { token });
    const categories = await call(t.url, 'GET', `${base}/categories`, { token });
    const labels = await call(t.url, 'GET', `${base}/labels`, { token });
    expect(accounts.status).toBe(200);
    expect(accounts.body.length).toBeGreaterThanOrEqual(4);
    expect(accounts.body.some((a: { class: string }) => a.class === 'LIABILITY')).toBe(true);
    expect(accounts.body.some((a: { currency: string }) => a.currency !== 'IRR')).toBe(true);
    expect(categories.body.length).toBeGreaterThan(10);
    expect(labels.body.some((l: { controllable: boolean }) => l.controllable)).toBe(true);
    expect(labels.body.some((l: { controllable: boolean }) => !l.controllable)).toBe(true);
  });

  it('leaves every Account with a balance a real person could have', async () => {
    const token = await login();
    const accounts = await call(t.url, 'GET', `/v1/workspaces/${seeded.workspaceId}/accounts`, {
      token,
    });
    for (const account of accounts.body as { balance: string }[]) {
      expect(BigInt(account.balance)).toBeGreaterThanOrEqual(0n);
    }
  });

  it('records Income, Expenses and Transfers over the last six Jalali months and this one', async () => {
    const rows = await demoTransactions(seeded.workspaceId);
    const months = new Set(
      rows.map((r) => {
        const { year, month } = monthPeriodOfDay(r.occurredOn, 'jalali');
        return `${year}-${month}`;
      }),
    );
    expect(months).toEqual(
      new Set(['1405-1', '1405-2', '1405-3', '1405-4', '1405-5', '1405-6', '1405-7']),
    );
    expect(rows.every((r) => r.occurredOn <= today)).toBe(true);
    expect(calendarDateOf(one(rows.slice(0, 1)).occurredOn, 'jalali')).toEqual({
      year: 1405,
      month: 1,
      day: 1,
    });
    const types = new Set(rows.map((r) => r.type));
    expect(types).toEqual(new Set(['INCOME', 'EXPENSE', 'TRANSFER']));
    expect(rows.length).toBeGreaterThan(150);
  });

  it('uses rial amounts in the range of a Tehran household', async () => {
    const rows = await demoTransactions(seeded.workspaceId);
    const salaries = rows.filter((r) => r.type === 'INCOME' && r.note?.startsWith('حقوق'));
    expect(salaries).toHaveLength(7);
    for (const s of salaries) {
      expect(s.amount).toBeGreaterThanOrEqual(300_000_000n);
      expect(s.amount).toBeLessThanOrEqual(2_000_000_000n);
    }
    // Rials are whole; nobody pays 1,234,567 rials, prices end in at least four zeros.
    const irrRows = rows.filter((r) => r.amount >= 10_000n);
    expect(irrRows.every((r) => r.amount % 10_000n === 0n)).toBe(true);
  });

  it('attaches Labels to some Transactions', async () => {
    const rows = await demoTransactions(seeded.workspaceId);
    const attached = one(
      await db
        .select({ n: count() })
        .from(transactionLabels)
        .where(
          inArray(
            transactionLabels.transactionId,
            rows.map((r) => r.id),
          ),
        ),
    );
    expect(attached.n).toBeGreaterThan(20);
  });

  it('can run again: it replaces the demo User and leaves other Users alone', async () => {
    const other = await registerUser(t.url);
    const before = await demoTransactions(seeded.workspaceId);

    const again = await seedDemo(db, { today });

    const demoUsers = await db.select().from(users).where(eq(users.email, DEMO_EMAIL));
    expect(demoUsers).toHaveLength(1);
    expect(await demoTransactions(seeded.workspaceId)).toEqual([]);
    const after = await demoTransactions(again.workspaceId);
    // Same day, same data (apart from new ids).
    const shape = (r: (typeof before)[number]) => [r.type, r.amount, r.occurredOn, r.note];
    expect(after.map(shape)).toEqual(before.map(shape));
    const otherMembership = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, other.userId));
    expect(otherMembership).toHaveLength(1);
    seeded = again;
    await login();
  });
});
