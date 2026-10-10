import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppRequest } from '../../common/request';
import { RolesGuard, WorkspaceGuard } from '../../common/workspace.guard';
import { auditLogs, labels, workspaceMembers } from '../../db/schema';
import { call, registerUser, startTestApp, type TestApp } from '../../test/app';
import { testDatabase } from '../../test/db';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

type User = Awaited<ReturnType<typeof registerUser>>;

async function storedLabels(workspaceId: string) {
  return db.select().from(labels).where(eq(labels.workspaceId, workspaceId));
}

function client(t: TestApp, user: User, workspaceId = user.workspaceId) {
  const base = `/v1/workspaces/${workspaceId}/labels`;
  const as = (method: string, path: string, body?: unknown) =>
    call(t.url, method, `${base}${path}`, { token: user.token, body });
  return {
    create: (body: unknown) => as('POST', '', body),
    list: (query = '') => as('GET', query),
    get: (id: string) => as('GET', `/${id}`),
    update: (id: string, body: unknown) => as('PATCH', `/${id}`, body),
  };
}

describe('Labels', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.close());

  async function setUp() {
    const user = await registerUser(t.url);
    return { user, api: client(t, user) };
  }

  async function addMember(workspaceId: string, role: 'ADMIN' | 'MEMBER' | 'VIEWER') {
    const user = await registerUser(t.url);
    await db.insert(workspaceMembers).values({ workspaceId, userId: user.userId, role });
    return user;
  }

  it('start with none in a new Workspace', async () => {
    const { api } = await setUp();
    expect((await api.list()).body).toEqual([]);
  });

  it('create a Label, controllable or not, and list them by name', async () => {
    const { api } = await setUp();
    const travel = await api.create({ name: '  Travel ' });
    expect(travel.status).toBe(201);
    expect(travel.body).toEqual({
      id: expect.any(String),
      name: 'Travel',
      controllable: false,
      archived: false,
    });
    const eatingOut = await api.create({ name: 'Eating out', controllable: true });
    expect(eatingOut.body.controllable).toBe(true);
    expect((await api.get(travel.body.id)).body).toEqual(travel.body);
    expect((await api.list()).body.map((l: { name: string }) => l.name)).toEqual([
      'Eating out',
      'Travel',
    ]);
  });

  it('rename, flag, archive and bring back a Label', async () => {
    const { api } = await setUp();
    const { body: label } = await api.create({ name: 'Subscriptions' });
    const flagged = await api.update(label.id, { name: 'Subs', controllable: true });
    expect(flagged.status).toBe(200);
    expect(flagged.body).toEqual({ ...label, name: 'Subs', controllable: true });

    expect((await api.update(label.id, { archived: true })).body.archived).toBe(true);
    expect((await api.list()).body).toEqual([]);
    expect((await api.list('?includeArchived=true')).body).toEqual([
      { ...flagged.body, archived: true },
    ]);
    expect((await api.update(label.id, { archived: false })).body.archived).toBe(false);
    expect((await api.list()).body).toHaveLength(1);
  });

  it('refuse a name already used in the Workspace, ignoring case', async () => {
    const { user, api } = await setUp();
    await api.create({ name: 'Travel' });
    const { body: other } = await api.create({ name: 'Gifts' });
    expect((await api.create({ name: 'travel' })).status).toBe(409);
    expect((await api.update(other.id, { name: 'TRAVEL' })).status).toBe(409);
    // Archived Labels keep their name.
    await api.update(other.id, { archived: true });
    expect((await api.create({ name: 'gifts' })).status).toBe(409);
    expect(await storedLabels(user.workspaceId)).toHaveLength(2);
    // Another Workspace may use the same name.
    expect((await (await setUp()).api.create({ name: 'Travel' })).status).toBe(201);
  });

  it.each([
    ['an empty name', { name: '  ' }],
    ['a name over 100 characters', { name: 'x'.repeat(101) }],
    ['a controllable flag that is not a boolean', { name: 'Travel', controllable: 'yes' }],
    ['an unknown field', { name: 'Travel', color: 'red' }],
  ])('reject %s', async (_, body) => {
    const { user, api } = await setUp();
    expect((await api.create(body)).status).toBe(400);
    expect(await storedLabels(user.workspaceId)).toEqual([]);
  });

  it('reject an empty update', async () => {
    const { api } = await setUp();
    const { body: label } = await api.create({ name: 'Travel' });
    expect((await api.update(label.id, {})).status).toBe(400);
  });

  it('let only Owners and Admins change Labels; every Member sees them', async () => {
    const { user: owner, api } = await setUp();
    const { body: label } = await api.create({ name: 'Travel' });
    const admin = client(t, await addMember(owner.workspaceId, 'ADMIN'), owner.workspaceId);
    expect((await admin.create({ name: 'Gifts' })).status).toBe(201);
    for (const role of ['MEMBER', 'VIEWER'] as const) {
      const other = client(t, await addMember(owner.workspaceId, role), owner.workspaceId);
      expect((await other.create({ name: `By ${role}` })).status).toBe(403);
      expect((await other.update(label.id, { controllable: true })).status).toBe(403);
      expect((await other.list()).body).toHaveLength(2);
      expect((await other.get(label.id)).status).toBe(200);
    }
  });

  it("answer 404 for another Workspace's Labels, by its id or by ours", async () => {
    const a = await setUp();
    const b = await setUp();
    const { body: bLabel } = await b.api.create({ name: 'Secret' });
    const aInB = client(t, a.user, b.user.workspaceId);
    expect((await aInB.list()).status).toBe(404);
    expect((await aInB.create({ name: 'Hacked' })).status).toBe(404);
    expect((await aInB.update(bLabel.id, { name: 'Hacked' })).status).toBe(404);
    expect((await a.api.get(bLabel.id)).status).toBe(404);
    expect((await a.api.update(bLabel.id, { name: 'Hacked' })).status).toBe(404);
    expect((await a.api.list('?includeArchived=true')).body).toEqual([]);
    expect((await b.api.get(bLabel.id)).body.name).toBe('Secret');
  });

  it('answer 404 for Labels that do not exist or ids that are not uuids', async () => {
    const { api } = await setUp();
    for (const id of [randomUUID(), 'not-a-uuid']) {
      expect((await api.get(id)).status).toBe(404);
      expect((await api.update(id, { name: 'x' })).status).toBe(404);
    }
  });

  it('write ids and field names to the audit log, never names', async () => {
    const { user, api } = await setUp();
    const { body: label } = await api.create({ name: 'Pharmacy' });
    await api.update(label.id, { controllable: true });
    const rows = await db
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.workspaceId, user.workspaceId), eq(auditLogs.actorUserId, user.userId)),
      )
      .orderBy(desc(auditLogs.createdAt));
    expect(rows.filter((r) => r.action.startsWith('label.'))).toMatchObject([
      { action: 'label.update', metadata: { labelId: label.id, fields: ['controllable'] } },
      { action: 'label.create', metadata: { labelId: label.id } },
    ]);
    expect(JSON.stringify(rows)).not.toContain('Pharmacy');
  });
});

describe('Labels with the app-layer membership checks removed', () => {
  let t: TestApp;
  beforeAll(async () => {
    // Only row-level security is left between user A and user B's Labels.
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

  it("still keep user A out of user B's Labels", async () => {
    const a = await registerUser(t.url);
    const b = await registerUser(t.url);
    const { body: bLabel } = await client(t, b).create({ name: 'Secret' });
    const aInB = client(t, a, b.workspaceId);
    expect((await aInB.list()).body).toEqual([]);
    expect((await aInB.get(bLabel.id)).status).toBe(404);
    expect((await aInB.update(bLabel.id, { name: 'Hacked' })).status).toBe(404);
    expect((await aInB.create({ name: 'Planted' })).status).toBe(404);
    expect(await storedLabels(b.workspaceId)).toMatchObject([{ name: 'Secret' }]);
  });
});
