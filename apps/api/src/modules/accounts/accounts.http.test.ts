import { randomUUID } from 'node:crypto';
import { currencies as coreCurrencies } from '@daric/core';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppRequest } from '../../common/request';
import { RolesGuard, WorkspaceGuard } from '../../common/workspace.guard';
import { accounts, auditLogs, currencies, workspaceMembers } from '../../db/schema';
import { call, registerUser, startTestApp, type TestApp } from '../../test/app';
import { testDatabase } from '../../test/db';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

const melli = {
  name: 'Melli',
  type: 'BANK',
  class: 'ASSET',
  currency: 'IRR',
  openingBalance: '12000000',
};

async function storedAccount(accountId: string) {
  const [row] = await db.select().from(accounts).where(eq(accounts.id, accountId));
  return row;
}

describe('currencies table', () => {
  it('holds the currencies core knows, with their minor units', async () => {
    const rows = await db.select().from(currencies).orderBy(currencies.code);
    expect(rows).toEqual(
      [...coreCurrencies]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map(({ code, minorUnits }) => ({ code, minorUnits })),
    );
  });
});

describe('Accounts', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.close());

  const path = (workspaceId: string, accountId?: string) =>
    `/v1/workspaces/${workspaceId}/accounts${accountId ? `/${accountId}` : ''}`;
  const create = (token: string, workspaceId: string, body: unknown = melli) =>
    call(t.url, 'POST', path(workspaceId), { token, body });
  const update = (token: string, workspaceId: string, accountId: string, body: unknown) =>
    call(t.url, 'PATCH', path(workspaceId, accountId), { token, body });
  const list = (token: string, workspaceId: string, query = '') =>
    call(t.url, 'GET', `${path(workspaceId)}${query}`, { token });

  async function addMember(workspaceId: string, role: 'ADMIN' | 'MEMBER' | 'VIEWER') {
    const user = await registerUser(t.url);
    await db.insert(workspaceMembers).values({ workspaceId, userId: user.userId, role });
    return user;
  }

  it('start empty', async () => {
    const a = await registerUser(t.url);
    const res = await list(a.token, a.workspaceId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('let the Owner create an Account whose balance is its opening balance', async () => {
    const a = await registerUser(t.url);
    const res = await create(a.token, a.workspaceId, { ...melli, name: '  Melli  ' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      ...melli,
      balance: '12000000',
      archived: false,
    });

    const stored = await storedAccount(res.body.id);
    expect(stored).toMatchObject({ workspaceId: a.workspaceId, openingBalance: 12000000n });
    expect((await list(a.token, a.workspaceId)).body).toEqual([res.body]);
    const read = await call(t.url, 'GET', path(a.workspaceId, res.body.id), { token: a.token });
    expect(read.body).toEqual(res.body);
  });

  it('keep Amounts beyond 2^53 exact', async () => {
    const a = await registerUser(t.url);
    const big = '9223372036854775807';
    const res = await create(a.token, a.workspaceId, { ...melli, openingBalance: big });
    expect(res.status).toBe(201);
    expect(res.body.balance).toBe(big);
  });

  it('take Liabilities in any currency, with a negative opening balance if need be', async () => {
    const a = await registerUser(t.url);
    const loan = { name: 'Car loan', type: 'LOAN', class: 'LIABILITY', currency: 'USD' };
    const res = await create(a.token, a.workspaceId, { ...loan, openingBalance: '-150' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ...loan, openingBalance: '-150', balance: '-150' });
  });

  it.each([
    ['an empty name', { name: ' ' }],
    ['an unknown type', { type: 'CRYPTO' }],
    ['an unknown class', { class: 'EQUITY' }],
    ['an unknown currency', { currency: 'XYZ' }],
    ['a fractional opening balance', { openingBalance: '1.5' }],
    ['an opening balance as a number', { openingBalance: 100 }],
    ['an opening balance beyond 64 bits', { openingBalance: '9223372036854775808' }],
    ['a missing opening balance', { openingBalance: undefined }],
  ])('reject %s', async (_, change) => {
    const a = await registerUser(t.url);
    const res = await create(a.token, a.workspaceId, { ...melli, ...change });
    expect(res.status).toBe(400);
    expect((await list(a.token, a.workspaceId)).body).toEqual([]);
  });

  it('edit only the fields sent, keeping the currency', async () => {
    const a = await registerUser(t.url);
    const { body: created } = await create(a.token, a.workspaceId);
    const res = await update(a.token, a.workspaceId, created.id, {
      name: 'Melli savings',
      openingBalance: '500',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ...created,
      name: 'Melli savings',
      openingBalance: '500',
      balance: '500',
    });
    expect((await storedAccount(created.id))?.version).toBe(2);
  });

  it.each([
    ['the currency', { currency: 'USD' }],
    ['an empty body', {}],
    ['an empty name', { name: '' }],
  ])('refuse to change %s', async (_, body) => {
    const a = await registerUser(t.url);
    const { body: created } = await create(a.token, a.workspaceId);
    const res = await update(a.token, a.workspaceId, created.id, body);
    expect(res.status).toBe(400);
    expect(await storedAccount(created.id)).toMatchObject({ name: 'Melli', currency: 'IRR' });
  });

  it('hide archived Accounts unless asked, and bring them back when unarchived', async () => {
    const a = await registerUser(t.url);
    const { body: kept } = await create(a.token, a.workspaceId, { ...melli, name: 'Kept' });
    const { body: old } = await create(a.token, a.workspaceId, { ...melli, name: 'Old' });

    const archived = await update(a.token, a.workspaceId, old.id, { archived: true });
    expect(archived.body.archived).toBe(true);
    expect((await storedAccount(old.id))?.archivedAt).toBeInstanceOf(Date);

    const names = async (query = '') =>
      (await list(a.token, a.workspaceId, query)).body.map((x: { name: string }) => x.name);
    expect(await names()).toEqual(['Kept']);
    expect(await names('?includeArchived=true')).toEqual(['Kept', 'Old']);
    // An archived Account can still be opened by id.
    const read = await call(t.url, 'GET', path(a.workspaceId, old.id), { token: a.token });
    expect(read.body).toMatchObject({ name: 'Old', archived: true });

    await update(a.token, a.workspaceId, old.id, { archived: false });
    expect(await names()).toEqual(['Kept', 'Old']);
    expect(kept.archived).toBe(false);
  });

  it('keep the first archive time when archived twice', async () => {
    const a = await registerUser(t.url);
    const { body: created } = await create(a.token, a.workspaceId);
    await update(a.token, a.workspaceId, created.id, { archived: true });
    const first = (await storedAccount(created.id))?.archivedAt;
    await update(a.token, a.workspaceId, created.id, { archived: true });
    expect((await storedAccount(created.id))?.archivedAt).toEqual(first);
  });

  it('let an Admin manage Accounts, and Members and Viewers only see them', async () => {
    const owner = await registerUser(t.url);
    const admin = await addMember(owner.workspaceId, 'ADMIN');
    const member = await addMember(owner.workspaceId, 'MEMBER');
    const viewer = await addMember(owner.workspaceId, 'VIEWER');

    const created = await create(admin.token, owner.workspaceId);
    expect(created.status).toBe(201);
    expect(
      (await update(admin.token, owner.workspaceId, created.body.id, { name: 'Renamed' })).status,
    ).toBe(200);

    for (const reader of [member, viewer]) {
      expect((await list(reader.token, owner.workspaceId)).body).toHaveLength(1);
      const read = await call(t.url, 'GET', path(owner.workspaceId, created.body.id), {
        token: reader.token,
      });
      expect(read.body.name).toBe('Renamed');
      expect((await create(reader.token, owner.workspaceId)).status).toBe(403);
      expect(
        (await update(reader.token, owner.workspaceId, created.body.id, { archived: true })).status,
      ).toBe(403);
    }
    expect((await list(owner.token, owner.workspaceId)).body).toHaveLength(1);
    expect((await storedAccount(created.body.id))?.archivedAt).toBeNull();
  });

  it("answer 404 for another Workspace's Accounts, by its id or by ours", async () => {
    const a = await registerUser(t.url);
    const b = await registerUser(t.url);
    const { body: bAccount } = await create(b.token, b.workspaceId);

    expect((await list(a.token, b.workspaceId)).status).toBe(404);
    expect((await create(a.token, b.workspaceId)).status).toBe(404);
    // A's own Workspace in the URL, B's Account id.
    const read = await call(t.url, 'GET', path(a.workspaceId, bAccount.id), { token: a.token });
    expect(read.status).toBe(404);
    expect((await update(a.token, a.workspaceId, bAccount.id, { name: 'hacked' })).status).toBe(
      404,
    );
    expect((await update(a.token, b.workspaceId, bAccount.id, { name: 'hacked' })).status).toBe(
      404,
    );
    expect((await list(a.token, a.workspaceId)).body).toEqual([]);
    expect((await storedAccount(bAccount.id))?.name).toBe('Melli');
  });

  it('answer 404 for Accounts that do not exist or ids that are not uuids', async () => {
    const a = await registerUser(t.url);
    for (const id of [randomUUID(), 'not-a-uuid']) {
      const read = await call(t.url, 'GET', path(a.workspaceId, id), { token: a.token });
      expect(read.status).toBe(404);
      expect((await update(a.token, a.workspaceId, id, { name: 'x' })).status).toBe(404);
    }
  });

  it('require a login', async () => {
    const a = await registerUser(t.url);
    expect((await call(t.url, 'GET', path(a.workspaceId))).status).toBe(401);
  });

  it('write ids and field names to the audit log, never Amounts', async () => {
    const a = await registerUser(t.url);
    const { body: created } = await create(a.token, a.workspaceId);
    await update(a.token, a.workspaceId, created.id, { openingBalance: '77', archived: true });

    const rows = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.workspaceId, a.workspaceId), eq(auditLogs.actorUserId, a.userId)))
      .orderBy(desc(auditLogs.createdAt));
    const [updated, createdRow] = rows.filter((r) => r.action.startsWith('account.'));
    expect(createdRow).toMatchObject({
      action: 'account.create',
      metadata: { accountId: created.id },
    });
    expect(updated).toMatchObject({
      action: 'account.update',
      metadata: { accountId: created.id, fields: ['openingBalance', 'archived'] },
    });
    expect(JSON.stringify(rows)).not.toMatch(/12000000|"77"/);
  });
});

describe('Accounts with the app-layer membership checks removed', () => {
  let t: TestApp;
  beforeAll(async () => {
    // Only row-level security is left between user A and user B's Accounts.
    const allowAll = {
      canActivate: (context: { switchToHttp(): { getRequest(): AppRequest } }) => {
        const req = context.switchToHttp().getRequest();
        req.membership = { workspaceId: String(req.params['wsId']), role: 'OWNER' };
        return true;
      },
    };
    t = await startTestApp({
      override: (builder) =>
        builder
          .overrideGuard(WorkspaceGuard)
          .useValue(allowAll)
          .overrideGuard(RolesGuard)
          .useValue(allowAll),
    });
  });
  afterAll(() => t.close());

  it("still keep user A out of user B's Accounts", async () => {
    const a = await registerUser(t.url);
    const b = await registerUser(t.url);
    const { body: bAccount } = await call(
      t.url,
      'POST',
      `/v1/workspaces/${b.workspaceId}/accounts`,
      {
        token: b.token,
        body: melli,
      },
    );

    const listB = await call(t.url, 'GET', `/v1/workspaces/${b.workspaceId}/accounts`, {
      token: a.token,
    });
    expect(listB.body).toEqual([]);
    const createInB = await call(t.url, 'POST', `/v1/workspaces/${b.workspaceId}/accounts`, {
      token: a.token,
      body: melli,
    });
    expect(createInB.status).toBe(404);
    const rename = await call(
      t.url,
      'PATCH',
      `/v1/workspaces/${b.workspaceId}/accounts/${bAccount.id}`,
      { token: a.token, body: { name: 'hacked' } },
    );
    expect(rename.status).toBe(404);

    const bAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.workspaceId, b.workspaceId));
    expect(bAccounts.map((x) => x.name)).toEqual(['Melli']);
  });
});
