import { asc, eq } from 'drizzle-orm';
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD, seedDemo } from '../../db/seed/demo';
import {
  accounts,
  accountValuations,
  auditLogs,
  budgets,
  categories,
  exchangeRates,
  labels,
  netWorthSnapshots,
  plannedItems,
  projectionSettings,
  recurringOccurrences,
  recurringRules,
  transactionLabels,
  transactions,
  workspaceMembers,
} from '../../db/schema';
import { call, registerUser, startTestApp, type TestApp } from '../../test/app';
import { testDatabase, uniqueEmail } from '../../test/db';
import { NetWorthService } from '../net-worth/net-worth.service';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

// 1405/07/19 on the Jalali calendar.
const today = '2026-10-11';

type Row = Record<string, unknown>;

/** What identifies a row of each exported entity, as the export and the database spell it. */
const keyOf: Record<string, (row: Row) => string> = {
  members: (r) => String(r['id']),
  accounts: (r) => String(r['id']),
  valuations: (r) => String(r['id']),
  exchangeRates: (r) => String(r['id']),
  netWorthSnapshots: (r) => String(r['id']),
  categories: (r) => String(r['id']),
  labels: (r) => String(r['id']),
  transactions: (r) => String(r['id']),
  transactionLabels: (r) => `${String(r['transactionId'])}/${String(r['labelId'])}`,
  recurringRules: (r) => String(r['id']),
  recurringOccurrences: (r) => `${String(r['ruleId'])}/${String(r['dueOn'])}`,
  budgets: (r) => String(r['id']),
  plannedItems: (r) => String(r['id']),
  projectionSettings: (r) => String(r['workspaceId']),
};

/** Every row the database holds for the Workspace, read past the API, by exported entity. */
async function storedRows(workspaceId: string): Promise<Record<string, Row[]>> {
  return {
    members: await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId)),
    accounts: await db.select().from(accounts).where(eq(accounts.workspaceId, workspaceId)),
    valuations: await db
      .select()
      .from(accountValuations)
      .where(eq(accountValuations.workspaceId, workspaceId)),
    exchangeRates: await db
      .select()
      .from(exchangeRates)
      .where(eq(exchangeRates.workspaceId, workspaceId)),
    netWorthSnapshots: await db
      .select()
      .from(netWorthSnapshots)
      .where(eq(netWorthSnapshots.workspaceId, workspaceId)),
    categories: await db.select().from(categories).where(eq(categories.workspaceId, workspaceId)),
    labels: await db.select().from(labels).where(eq(labels.workspaceId, workspaceId)),
    transactions: await db
      .select()
      .from(transactions)
      .where(eq(transactions.workspaceId, workspaceId)),
    transactionLabels: await db
      .select()
      .from(transactionLabels)
      .where(eq(transactionLabels.workspaceId, workspaceId)),
    recurringRules: await db
      .select()
      .from(recurringRules)
      .where(eq(recurringRules.workspaceId, workspaceId)),
    recurringOccurrences: await db
      .select()
      .from(recurringOccurrences)
      .where(eq(recurringOccurrences.workspaceId, workspaceId)),
    budgets: await db.select().from(budgets).where(eq(budgets.workspaceId, workspaceId)),
    plannedItems: await db
      .select()
      .from(plannedItems)
      .where(eq(plannedItems.workspaceId, workspaceId)),
    projectionSettings: await db
      .select()
      .from(projectionSettings)
      .where(eq(projectionSettings.workspaceId, workspaceId)),
  };
}

/** A minimal RFC 4180 reader: quoted fields may hold commas, quotes and line breaks. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r' && text[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** CSV rows as records keyed by the header row. */
function csvRecords(text: string): { header: string[]; records: Row[] } {
  const [header = [], ...body] = parseCsv(text.replace(/^\uFEFF/, ''));
  return {
    header,
    records: body.map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i]]))),
  };
}

describe('Data export', () => {
  let t: TestApp;
  let owner: { token: string; userId: string; workspaceId: string };

  beforeAll(async () => {
    t = await startTestApp();
    const email = uniqueEmail('export-demo');
    const seeded = await seedDemo(db, { today, email });
    await t.app.get(NetWorthService).takeDueAutoSnapshots(new Date('2026-10-23T00:00:00Z'), {
      workspaceId: seeded.workspaceId,
    });
    const login = await call(t.url, 'POST', '/v1/auth/login', {
      body: { email, password: DEMO_PASSWORD },
    });
    owner = { token: login.body.accessToken, ...seeded };
    const base = `/v1/workspaces/${seeded.workspaceId}`;
    // Entities the seed leaves empty: a Projection setting and a deleted Transaction.
    const settings = await call(t.url, 'PATCH', `${base}/projection/settings`, {
      token: owner.token,
      body: { trailingMonths: 6 },
    });
    expect(settings.status).toBe(200);
    const [first] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.workspaceId, seeded.workspaceId))
      .limit(1);
    const deleted = await call(t.url, 'DELETE', `${base}/transactions/${first?.id}`, {
      token: owner.token,
    });
    expect(deleted.status).toBe(204);
  });
  afterAll(() => t.close());

  function download(token: string, workspaceId: string, query = '') {
    return fetch(`${t.url}/v1/workspaces/${workspaceId}/export${query}`, {
      headers: { authorization: `Bearer ${token}`, 'x-daric-client': 'mobile' },
    });
  }

  it('exports every row of every entity as one JSON file', async () => {
    const res = await download(owner.token, owner.workspaceId, '?format=json');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(res.headers.get('content-disposition')).toMatch(
      /^attachment; filename="daric-export-2026-\d\d-\d\d\.json"$/,
    );
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['format']).toBe('daric-export');
    expect(body['version']).toBe(1);
    expect(body['workspace']).toMatchObject({
      id: owner.workspaceId,
      calendar: 'jalali',
      baseCurrency: 'IRR',
    });

    const stored = await storedRows(owner.workspaceId);
    for (const [entity, rows] of Object.entries(stored)) {
      const key = keyOf[entity] as (row: Row) => string;
      const exported = body[entity] as Row[];
      expect(rows.length, entity).toBeGreaterThan(0);
      expect(exported.map(key).sort(), entity).toEqual(rows.map(key).sort());
    }
  });

  it('writes Amounts and rates as strings, exactly as stored', async () => {
    const res = await download(owner.token, owner.workspaceId);
    const body = (await res.json()) as Record<string, Row[]>;
    const stored = await storedRows(owner.workspaceId);

    const storedTransactions = new Map(stored['transactions']?.map((r) => [r['id'], r]));
    for (const tx of body['transactions'] ?? []) {
      const original = storedTransactions.get(tx['id']) as Row;
      expect(tx['amount']).toBe(String(original['amount']));
      expect(tx['toAmount']).toBe(
        original['toAmount'] === null ? null : String(original['toAmount']),
      );
    }
    const gold = body['valuations']?.[0] as Row;
    expect(gold['amount']).toMatch(/^\d+$/);
    expect(body['accounts']?.every((a) => typeof a['openingBalance'] === 'string')).toBe(true);
    expect(body['exchangeRates']?.[0]?.['rate']).toMatch(/^\d+(\.\d+)?$/);
    expect(body['budgets']?.every((b) => typeof b['amount'] === 'string')).toBe(true);
    const snapshot = body['netWorthSnapshots']?.[0] as Row;
    expect(typeof snapshot['total']).toBe('string');
    expect(snapshot['breakdown']).toEqual(expect.objectContaining({ accounts: expect.any(Array) }));
    // A deleted Transaction is exported too, marked as deleted.
    expect(body['transactions']?.filter((tx) => tx['deletedAt'] !== null)).toHaveLength(1);
  });

  it('exports one CSV file per entity, zipped, with the same rows as the JSON file', async () => {
    const json = (await (await download(owner.token, owner.workspaceId)).json()) as Record<
      string,
      unknown
    >;

    const res = await download(owner.token, owner.workspaceId, '?format=csv');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    expect(res.headers.get('content-disposition')).toMatch(
      /^attachment; filename="daric-export-2026-\d\d-\d\d\.zip"$/,
    );
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual(
      ['workspace', ...Object.keys(keyOf)].map((entity) => `${entity}.csv`).sort(),
    );

    const workspace = csvRecords(strFromU8(files['workspace.csv'] as Uint8Array));
    expect(workspace.records).toEqual([
      expect.objectContaining({ id: owner.workspaceId, name: 'شخصی', calendar: 'jalali' }),
    ]);
    for (const [entity, key] of Object.entries(keyOf)) {
      const { records } = csvRecords(strFromU8(files[`${entity}.csv`] as Uint8Array));
      expect(records.map(key).sort(), entity).toEqual((json[entity] as Row[]).map(key).sort());
    }

    // Values read back as the JSON file has them: Amounts as digits, notes intact, empty for null.
    const transactionsCsv = csvRecords(strFromU8(files['transactions.csv'] as Uint8Array));
    const byId = new Map((json['transactions'] as Row[]).map((r) => [r['id'], r]));
    for (const record of transactionsCsv.records) {
      const original = byId.get(record['id']) as Row;
      expect(record['amount']).toBe(original['amount']);
      expect(record['note']).toBe(original['note'] ?? '');
      expect(record['toAccountId']).toBe(original['toAccountId'] ?? '');
    }
    const snapshots = csvRecords(strFromU8(files['netWorthSnapshots.csv'] as Uint8Array));
    expect(JSON.parse(snapshots.records[0]?.['breakdown'] as string)).toEqual(
      (json['netWorthSnapshots'] as Row[]).find((s) => s['id'] === snapshots.records[0]?.['id'])?.[
        'breakdown'
      ],
    );
  });

  it('writes empty entities as a header row only', async () => {
    const fresh = await registerUser(t.url);

    const res = await download(fresh.token, fresh.workspaceId, '?format=csv');

    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    const { header, records } = csvRecords(strFromU8(files['transactions.csv'] as Uint8Array));
    expect(header).toEqual(expect.arrayContaining(['id', 'type', 'amount', 'occurredOn']));
    expect(records).toEqual([]);
  });

  it('quotes CSV text with commas, quotes and line breaks, and keeps formulas as text', async () => {
    const fresh = await registerUser(t.url);
    const base = `/v1/workspaces/${fresh.workspaceId}`;
    const as = (path: string, body: unknown) =>
      call(t.url, 'POST', `${base}${path}`, { token: fresh.token, body });
    const account = await as('/accounts', {
      name: '=HYPERLINK("http://x")',
      type: 'BANK',
      class: 'LIABILITY',
      currency: 'IRR',
      openingBalance: '-500',
    });
    expect(account.status).toBe(201);
    const category = await as('/categories', {
      kind: 'EXPENSE',
      name: 'Food',
      icon: 'utensils',
      color: 'orange',
    });
    const note = 'Lunch, "cheap"\nwith Sara';
    const recorded = await as('/transactions', {
      type: 'EXPENSE',
      accountId: account.body.id,
      categoryId: category.body.id,
      amount: '1200',
      occurredOn: today,
      note,
    });
    expect(recorded.status).toBe(201);

    const res = await download(fresh.token, fresh.workspaceId, '?format=csv');

    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    const [exported] = csvRecords(strFromU8(files['accounts.csv'] as Uint8Array)).records;
    expect(exported).toMatchObject({ name: `'=HYPERLINK("http://x")`, openingBalance: '-500' });
    const [tx] = csvRecords(strFromU8(files['transactions.csv'] as Uint8Array)).records;
    expect(tx).toMatchObject({ note, amount: '1200' });
  });

  it('records each export in the audit log', async () => {
    const fresh = await registerUser(t.url);

    await download(fresh.token, fresh.workspaceId, '?format=csv');
    await download(fresh.token, fresh.workspaceId, '?format=json');

    const audit = await db
      .select({
        action: auditLogs.action,
        actorUserId: auditLogs.actorUserId,
        metadata: auditLogs.metadata,
      })
      .from(auditLogs)
      .where(eq(auditLogs.workspaceId, fresh.workspaceId))
      .orderBy(asc(auditLogs.createdAt));
    const exports = audit.filter((a) => a.action === 'workspace.export');
    expect(exports).toEqual([
      { action: 'workspace.export', actorUserId: fresh.userId, metadata: { format: 'csv' } },
      { action: 'workspace.export', actorUserId: fresh.userId, metadata: { format: 'json' } },
    ]);
  });

  it('is for Owners and Admins only', async () => {
    const a = await registerUser(t.url);
    const roles = ['ADMIN', 'MEMBER', 'VIEWER'] as const;
    const members = await Promise.all(
      roles.map(async (role) => {
        const user = await registerUser(t.url);
        await db
          .insert(workspaceMembers)
          .values({ workspaceId: a.workspaceId, userId: user.userId, role });
        return user;
      }),
    );

    const statuses = await Promise.all(
      members.map(async (m) => (await download(m.token, a.workspaceId)).status),
    );

    expect(statuses).toEqual([200, 403, 403]);
    const stranger = await registerUser(t.url);
    expect((await download(stranger.token, a.workspaceId)).status).toBe(404);
  });

  it('refuses a format it does not know', async () => {
    const fresh = await registerUser(t.url);
    expect((await download(fresh.token, fresh.workspaceId, '?format=xlsx')).status).toBe(400);
  });
});
