import { randomUUID } from 'node:crypto';
import { defaultCategories } from '@daric/core';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppRequest } from '../../common/request';
import { RolesGuard, WorkspaceGuard } from '../../common/workspace.guard';
import { auditLogs, categories, workspaceMembers } from '../../db/schema';
import { call, registerUser, startTestApp, type TestApp } from '../../test/app';
import { testDatabase } from '../../test/db';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

const food = { kind: 'EXPENSE', name: 'Food', icon: 'utensils', color: 'orange' };
const salary = { kind: 'INCOME', name: 'Salary', icon: 'briefcase', color: 'green' };

interface Wire {
  id: string;
  kind: string;
  parentId: string | null;
  name: string;
  position: number;
  archived: boolean;
}

async function storedCategory(categoryId: string) {
  const [row] = await db.select().from(categories).where(eq(categories.id, categoryId));
  return row;
}

describe('Categories', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.close());

  const path = (workspaceId: string, rest = '') =>
    `/v1/workspaces/${workspaceId}/categories${rest}`;
  const create = (token: string, workspaceId: string, body: unknown = food) =>
    call(t.url, 'POST', path(workspaceId), { token, body });
  const update = (token: string, workspaceId: string, categoryId: string, body: unknown) =>
    call(t.url, 'PATCH', path(workspaceId, `/${categoryId}`), { token, body });
  const reorder = (token: string, workspaceId: string, ids: string[]) =>
    call(t.url, 'PUT', path(workspaceId, '/order'), { token, body: { ids } });
  const list = async (token: string, workspaceId: string, query = '') =>
    call(t.url, 'GET', path(workspaceId, query), { token });

  /** A User whose Workspace holds no Categories but the ones a test makes. */
  async function emptyWorkspace() {
    const user = await registerUser(t.url);
    await db.delete(categories).where(eq(categories.workspaceId, user.workspaceId));
    return user;
  }

  async function addMember(workspaceId: string, role: 'ADMIN' | 'MEMBER' | 'VIEWER') {
    const user = await registerUser(t.url);
    await db.insert(workspaceMembers).values({ workspaceId, userId: user.userId, role });
    return user;
  }

  describe('of a new Workspace', () => {
    it('are the Persian defaults, children after their parent, in order', async () => {
      const a = await registerUser(t.url);
      const res = await list(a.token, a.workspaceId);
      expect(res.status).toBe(200);
      const body = res.body as Wire[];
      const tops = body.filter((c) => c.parentId === null);
      for (const kind of ['INCOME', 'EXPENSE']) {
        expect(tops.filter((c) => c.kind === kind).map((c) => [c.name, c.position])).toEqual(
          defaultCategories.filter((d) => d.kind === kind).map((d, i) => [d.name, i]),
        );
      }
      for (const parent of defaultCategories) {
        const top = tops.find((c) => c.name === parent.name && c.kind === parent.kind);
        const children = body.filter((c) => c.parentId === top?.id);
        expect(children.map((c) => [c.name, c.kind, c.position])).toEqual(
          (parent.children ?? []).map((c, i) => [c.name, parent.kind, i]),
        );
        // Listed right after their parent.
        const at = body.indexOf(top as Wire);
        expect(children.map((c) => body.indexOf(c))).toEqual(children.map((_, i) => at + 1 + i));
      }
      expect(body.every((c) => !c.archived)).toBe(true);
    });

    it('belong to that Workspace only', async () => {
      const a = await registerUser(t.url);
      const b = await registerUser(t.url);
      const aIds = (await list(a.token, a.workspaceId)).body.map((c: Wire) => c.id);
      const bIds = (await list(b.token, b.workspaceId)).body.map((c: Wire) => c.id);
      expect(aIds.filter((id: string) => bIds.includes(id))).toEqual([]);
    });
  });

  it('let the Owner create a top-level Category, put last among its kind', async () => {
    const a = await emptyWorkspace();
    const first = await create(a.token, a.workspaceId, { ...food, name: '  Food  ' });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({
      id: expect.any(String),
      ...food,
      parentId: null,
      position: 0,
      archived: false,
    });
    const second = await create(a.token, a.workspaceId, { ...food, name: 'Rent' });
    expect(second.body.position).toBe(1);
    // Income counts its own positions.
    expect((await create(a.token, a.workspaceId, salary)).body.position).toBe(0);

    expect((await storedCategory(first.body.id))?.workspaceId).toBe(a.workspaceId);
    const read = await call(t.url, 'GET', path(a.workspaceId, `/${first.body.id}`), {
      token: a.token,
    });
    expect(read.body).toEqual(first.body);
  });

  it('let the Owner create a child under a top-level Category of the same kind', async () => {
    const a = await emptyWorkspace();
    const { body: parent } = await create(a.token, a.workspaceId);
    const child = await create(a.token, a.workspaceId, {
      ...food,
      name: 'Groceries',
      icon: 'shopping-cart',
      parentId: parent.id,
    });
    expect(child.status).toBe(201);
    expect(child.body).toMatchObject({ parentId: parent.id, position: 0 });
    expect((await list(a.token, a.workspaceId)).body.map((c: Wire) => c.name)).toEqual([
      'Food',
      'Groceries',
    ]);
  });

  it.each([
    ['an empty name', { name: ' ' }],
    ['an unknown kind', { kind: 'TRANSFER' }],
    ['an unknown icon', { icon: 'rocket' }],
    ['an unknown color', { color: '#ff0000' }],
    ['a parent that does not exist', { parentId: randomUUID() }],
  ])('reject %s', async (_, change) => {
    const a = await emptyWorkspace();
    const res = await create(a.token, a.workspaceId, { ...food, ...change });
    expect(res.status).toBe(400);
    expect((await list(a.token, a.workspaceId)).body).toEqual([]);
  });

  describe('stay one level deep', () => {
    it('refusing a child under a child', async () => {
      const a = await emptyWorkspace();
      const { body: parent } = await create(a.token, a.workspaceId);
      const { body: child } = await create(a.token, a.workspaceId, {
        ...food,
        name: 'Groceries',
        parentId: parent.id,
      });
      const res = await create(a.token, a.workspaceId, {
        ...food,
        name: 'Fruit',
        parentId: child.id,
      });
      expect(res.status).toBe(400);
      expect((await list(a.token, a.workspaceId)).body).toHaveLength(2);
    });

    it('refusing to move a Category under a child', async () => {
      const a = await emptyWorkspace();
      const { body: parent } = await create(a.token, a.workspaceId);
      const { body: child } = await create(a.token, a.workspaceId, {
        ...food,
        name: 'Groceries',
        parentId: parent.id,
      });
      const { body: rent } = await create(a.token, a.workspaceId, { ...food, name: 'Rent' });
      expect((await update(a.token, a.workspaceId, rent.id, { parentId: child.id })).status).toBe(
        400,
      );
      expect((await storedCategory(rent.id))?.parentId).toBeNull();
    });

    it('refusing to give a parent to a Category that has children', async () => {
      const a = await emptyWorkspace();
      const { body: parent } = await create(a.token, a.workspaceId);
      await create(a.token, a.workspaceId, { ...food, name: 'Groceries', parentId: parent.id });
      const { body: home } = await create(a.token, a.workspaceId, { ...food, name: 'Home' });
      expect((await update(a.token, a.workspaceId, parent.id, { parentId: home.id })).status).toBe(
        400,
      );
      expect((await storedCategory(parent.id))?.parentId).toBeNull();
    });

    it('even when two moves race', async () => {
      const a = await emptyWorkspace();
      for (let round = 0; round < 5; round++) {
        const [x, y, z] = await Promise.all(
          ['A', 'B', 'C'].map(
            async (name) => (await create(a.token, a.workspaceId, { ...food, name })).body.id,
          ),
        );
        // x under y and y under z cannot both happen.
        const results = await Promise.all([
          update(a.token, a.workspaceId, x, { parentId: y }),
          update(a.token, a.workspaceId, y, { parentId: z }),
        ]);
        expect(results.filter((r) => r.status === 200)).toHaveLength(1);
        const rows = await db
          .select()
          .from(categories)
          .where(eq(categories.workspaceId, a.workspaceId));
        const byId = new Map(rows.map((r) => [r.id, r]));
        for (const row of rows) {
          if (row.parentId) expect(byId.get(row.parentId)?.parentId).toBeNull();
        }
      }
    });

    it('refusing a Category as its own parent', async () => {
      const a = await emptyWorkspace();
      const { body: parent } = await create(a.token, a.workspaceId);
      expect(
        (await update(a.token, a.workspaceId, parent.id, { parentId: parent.id })).status,
      ).toBe(400);
    });
  });

  describe('refuse a parent of the other kind', () => {
    it('when creating', async () => {
      const a = await emptyWorkspace();
      const { body: income } = await create(a.token, a.workspaceId, salary);
      const res = await create(a.token, a.workspaceId, { ...food, parentId: income.id });
      expect(res.status).toBe(400);
      expect((await list(a.token, a.workspaceId)).body).toHaveLength(1);
    });

    it('when moving', async () => {
      const a = await emptyWorkspace();
      const { body: income } = await create(a.token, a.workspaceId, salary);
      const { body: expense } = await create(a.token, a.workspaceId);
      expect(
        (await update(a.token, a.workspaceId, expense.id, { parentId: income.id })).status,
      ).toBe(400);
      expect((await storedCategory(expense.id))?.parentId).toBeNull();
    });
  });

  it('edit only the fields sent, keeping the kind', async () => {
    const a = await emptyWorkspace();
    const { body: created } = await create(a.token, a.workspaceId);
    const res = await update(a.token, a.workspaceId, created.id, {
      name: 'Eating',
      icon: 'coffee',
      color: 'red',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...created, name: 'Eating', icon: 'coffee', color: 'red' });
    expect((await storedCategory(created.id))?.version).toBe(2);

    for (const body of [{ kind: 'INCOME' }, {}, { name: '' }, { color: 'puce' }]) {
      expect((await update(a.token, a.workspaceId, created.id, body)).status).toBe(400);
    }
    expect(await storedCategory(created.id)).toMatchObject({ kind: 'EXPENSE', name: 'Eating' });
  });

  it('move a Category under a parent and back, last among its new siblings', async () => {
    const a = await emptyWorkspace();
    const { body: parent } = await create(a.token, a.workspaceId);
    await create(a.token, a.workspaceId, { ...food, name: 'Groceries', parentId: parent.id });
    const { body: cafe } = await create(a.token, a.workspaceId, { ...food, name: 'Cafe' });

    const moved = await update(a.token, a.workspaceId, cafe.id, { parentId: parent.id });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ parentId: parent.id, position: 1 });

    const back = await update(a.token, a.workspaceId, cafe.id, { parentId: null });
    expect(back.body).toMatchObject({ parentId: null, position: 1 });
  });

  describe('reorder', () => {
    it('siblings to the order given', async () => {
      const a = await emptyWorkspace();
      const ids: string[] = [];
      for (const name of ['A', 'B', 'C']) {
        ids.push((await create(a.token, a.workspaceId, { ...food, name })).body.id);
      }
      const [x, y, z] = ids as [string, string, string];
      const res = await reorder(a.token, a.workspaceId, [z, x, y]);
      expect(res.status).toBe(200);
      expect(res.body.map((c: Wire) => [c.name, c.position])).toEqual([
        ['C', 0],
        ['A', 1],
        ['B', 2],
      ]);
      expect((await list(a.token, a.workspaceId)).body.map((c: Wire) => c.name)).toEqual([
        'C',
        'A',
        'B',
      ]);
    });

    it('only when given every sibling, and nothing else', async () => {
      const a = await emptyWorkspace();
      const { body: one } = await create(a.token, a.workspaceId, { ...food, name: 'A' });
      const { body: two } = await create(a.token, a.workspaceId, { ...food, name: 'B' });
      const { body: archived } = await create(a.token, a.workspaceId, { ...food, name: 'Old' });
      await update(a.token, a.workspaceId, archived.id, { archived: true });
      const { body: child } = await create(a.token, a.workspaceId, {
        ...food,
        name: 'Child',
        parentId: one.id,
      });
      const { body: income } = await create(a.token, a.workspaceId, salary);

      for (const ids of [
        [two.id, one.id], // archived sibling missing
        [two.id, one.id, archived.id, child.id], // a child is not a top-level sibling
        [two.id, one.id, archived.id, income.id], // other kind
        [two.id, one.id, archived.id, randomUUID()],
      ]) {
        expect((await reorder(a.token, a.workspaceId, ids)).status).toBe(400);
      }
      expect(
        (await list(a.token, a.workspaceId, '?includeArchived=true')).body
          .filter((c: Wire) => c.kind === 'EXPENSE' && !c.parentId)
          .map((c: Wire) => c.name),
      ).toEqual(['A', 'B', 'Old']);
      expect((await reorder(a.token, a.workspaceId, [archived.id, two.id, one.id])).status).toBe(
        200,
      );
    });
  });

  describe('archiving', () => {
    it('hides a Category unless asked, and unarchiving brings it back', async () => {
      const a = await emptyWorkspace();
      await create(a.token, a.workspaceId, { ...food, name: 'Kept' });
      const { body: old } = await create(a.token, a.workspaceId, { ...food, name: 'Old' });
      const archived = await update(a.token, a.workspaceId, old.id, { archived: true });
      expect(archived.body.archived).toBe(true);
      expect((await storedCategory(old.id))?.archivedAt).toBeInstanceOf(Date);

      const names = async (query = '') =>
        (await list(a.token, a.workspaceId, query)).body.map((c: Wire) => c.name);
      expect(await names()).toEqual(['Kept']);
      expect(await names('?includeArchived=true')).toEqual(['Kept', 'Old']);

      await update(a.token, a.workspaceId, old.id, { archived: false });
      expect(await names()).toEqual(['Kept', 'Old']);
    });

    it('keeps the first archive time when archived twice', async () => {
      const a = await emptyWorkspace();
      const { body: created } = await create(a.token, a.workspaceId);
      await update(a.token, a.workspaceId, created.id, { archived: true });
      const first = (await storedCategory(created.id))?.archivedAt;
      await update(a.token, a.workspaceId, created.id, { archived: true });
      expect((await storedCategory(created.id))?.archivedAt).toEqual(first);
    });

    it('never leaves an active Category under an archived parent', async () => {
      const a = await emptyWorkspace();
      const { body: parent } = await create(a.token, a.workspaceId);
      const { body: child } = await create(a.token, a.workspaceId, {
        ...food,
        name: 'Groceries',
        parentId: parent.id,
      });
      // The parent waits for its children.
      expect((await update(a.token, a.workspaceId, parent.id, { archived: true })).status).toBe(
        409,
      );
      await update(a.token, a.workspaceId, child.id, { archived: true });
      expect((await update(a.token, a.workspaceId, parent.id, { archived: true })).status).toBe(
        200,
      );
      // An archived parent takes no active children, new or moved or unarchived.
      expect((await update(a.token, a.workspaceId, child.id, { archived: false })).status).toBe(
        409,
      );
      expect(
        (await create(a.token, a.workspaceId, { ...food, name: 'Fruit', parentId: parent.id }))
          .status,
      ).toBe(409);
      const { body: rent } = await create(a.token, a.workspaceId, { ...food, name: 'Rent' });
      expect((await update(a.token, a.workspaceId, rent.id, { parentId: parent.id })).status).toBe(
        409,
      );
      // Unarchived together it is fine.
      await update(a.token, a.workspaceId, parent.id, { archived: false });
      expect((await update(a.token, a.workspaceId, child.id, { archived: false })).status).toBe(
        200,
      );
    });
  });

  it('let an Admin manage Categories, and Members and Viewers only see them', async () => {
    const owner = await emptyWorkspace();
    const admin = await addMember(owner.workspaceId, 'ADMIN');
    const member = await addMember(owner.workspaceId, 'MEMBER');
    const viewer = await addMember(owner.workspaceId, 'VIEWER');

    const created = await create(admin.token, owner.workspaceId);
    expect(created.status).toBe(201);
    expect(
      (await update(admin.token, owner.workspaceId, created.body.id, { name: 'X' })).status,
    ).toBe(200);
    expect((await reorder(admin.token, owner.workspaceId, [created.body.id])).status).toBe(200);

    for (const reader of [member, viewer]) {
      expect((await list(reader.token, owner.workspaceId)).body).toHaveLength(1);
      expect((await create(reader.token, owner.workspaceId)).status).toBe(403);
      expect(
        (await update(reader.token, owner.workspaceId, created.body.id, { archived: true })).status,
      ).toBe(403);
      expect((await reorder(reader.token, owner.workspaceId, [created.body.id])).status).toBe(403);
    }
    expect((await storedCategory(created.body.id))?.archivedAt).toBeNull();
  });

  it("answer 404 for another Workspace's Categories, and refuse them as parents", async () => {
    const a = await emptyWorkspace();
    const b = await emptyWorkspace();
    const { body: bCategory } = await create(b.token, b.workspaceId);

    expect((await list(a.token, b.workspaceId)).status).toBe(404);
    expect((await create(a.token, b.workspaceId)).status).toBe(404);
    const read = await call(t.url, 'GET', path(a.workspaceId, `/${bCategory.id}`), {
      token: a.token,
    });
    expect(read.status).toBe(404);
    expect((await update(a.token, a.workspaceId, bCategory.id, { name: 'hacked' })).status).toBe(
      404,
    );
    expect((await create(a.token, a.workspaceId, { ...food, parentId: bCategory.id })).status).toBe(
      400,
    );
    expect((await reorder(a.token, a.workspaceId, [bCategory.id])).status).toBe(400);
    expect((await list(a.token, a.workspaceId)).body).toEqual([]);
    expect((await storedCategory(bCategory.id))?.name).toBe('Food');
  });

  it('answer 404 for Categories that do not exist or ids that are not uuids', async () => {
    const a = await emptyWorkspace();
    for (const id of [randomUUID(), 'not-a-uuid']) {
      const read = await call(t.url, 'GET', path(a.workspaceId, `/${id}`), { token: a.token });
      expect(read.status).toBe(404);
      expect((await update(a.token, a.workspaceId, id, { name: 'x' })).status).toBe(404);
    }
  });

  it('require a login', async () => {
    const a = await registerUser(t.url);
    expect((await call(t.url, 'GET', path(a.workspaceId))).status).toBe(401);
  });

  it('write ids and field names to the audit log', async () => {
    const a = await emptyWorkspace();
    const { body: created } = await create(a.token, a.workspaceId);
    await update(a.token, a.workspaceId, created.id, { name: 'Eating', archived: true });
    await reorder(a.token, a.workspaceId, [created.id]);

    const rows = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.workspaceId, a.workspaceId), eq(auditLogs.actorUserId, a.userId)))
      .orderBy(desc(auditLogs.createdAt));
    const [reordered, updated, createdRow] = rows.filter((r) => r.action.startsWith('category.'));
    expect(createdRow).toMatchObject({
      action: 'category.create',
      metadata: { categoryId: created.id },
    });
    expect(updated).toMatchObject({
      action: 'category.update',
      metadata: { categoryId: created.id, fields: ['name', 'archived'] },
    });
    expect(reordered).toMatchObject({
      action: 'category.reorder',
      metadata: { categoryIds: [created.id] },
    });
  });
});

describe('Categories with the app-layer membership checks removed', () => {
  let t: TestApp;
  beforeAll(async () => {
    // Only row-level security is left between user A and user B's Categories.
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

  it("still keep user A out of user B's Categories", async () => {
    const a = await registerUser(t.url);
    const b = await registerUser(t.url);
    const bPath = `/v1/workspaces/${b.workspaceId}/categories`;
    const before = await db
      .select()
      .from(categories)
      .where(eq(categories.workspaceId, b.workspaceId));
    const target = before[0];
    if (!target) throw new Error('B has no default Categories');

    expect((await call(t.url, 'GET', bPath, { token: a.token })).body).toEqual([]);
    expect((await call(t.url, 'POST', bPath, { token: a.token, body: food })).status).toBe(404);
    const rename = await call(t.url, 'PATCH', `${bPath}/${target.id}`, {
      token: a.token,
      body: { name: 'hacked' },
    });
    expect(rename.status).toBe(404);

    const after = await db
      .select()
      .from(categories)
      .where(eq(categories.workspaceId, b.workspaceId));
    expect(after.map((c) => c.name).sort()).toEqual(before.map((c) => c.name).sort());
  });
});
