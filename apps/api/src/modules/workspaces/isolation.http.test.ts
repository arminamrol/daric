import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppRequest } from '../../common/request';
import { RolesGuard, WorkspaceGuard } from '../../common/workspace.guard';
import { workspaceMembers, workspaces } from '../../db/schema';
import { call, registerUser, startTestApp, type TestApp } from '../../test/app';
import { testDatabase } from '../../test/db';

const { db, pool } = testDatabase();
afterAll(() => pool.end());

async function nameOf(workspaceId: string) {
  const [row] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  return row?.name;
}

describe('Workspace routes', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await startTestApp();
  });
  afterAll(() => t.close());

  it('let the Owner read and rename their Workspace', async () => {
    const a = await registerUser(t.url);
    const read = await call(t.url, 'GET', `/v1/workspaces/${a.workspaceId}`, { token: a.token });
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ id: a.workspaceId, type: 'PERSONAL', role: 'OWNER' });

    const renamed = await call(t.url, 'PATCH', `/v1/workspaces/${a.workspaceId}`, {
      token: a.token,
      body: { name: 'Home' },
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe('Home');
    expect(await nameOf(a.workspaceId)).toBe('Home');
  });

  it("answer 404 to user A for user B's Workspace, for reads and writes", async () => {
    const a = await registerUser(t.url);
    const b = await registerUser(t.url);
    const read = await call(t.url, 'GET', `/v1/workspaces/${b.workspaceId}`, { token: a.token });
    const write = await call(t.url, 'PATCH', `/v1/workspaces/${b.workspaceId}`, {
      token: a.token,
      body: { name: 'hacked' },
    });
    expect(read.status).toBe(404);
    expect(write.status).toBe(404);
    expect(await nameOf(b.workspaceId)).toBe('Personal');
  });

  it('answer 404 for Workspaces that do not exist or ids that are not uuids', async () => {
    const a = await registerUser(t.url);
    for (const id of [randomUUID(), 'not-a-uuid']) {
      const res = await call(t.url, 'GET', `/v1/workspaces/${id}`, { token: a.token });
      expect(res.status).toBe(404);
    }
  });

  it('require a login', async () => {
    const a = await registerUser(t.url);
    const res = await call(t.url, 'GET', `/v1/workspaces/${a.workspaceId}`);
    expect(res.status).toBe(401);
  });

  it("enforce the route's minimum Role", async () => {
    const owner = await registerUser(t.url);
    const viewer = await registerUser(t.url);
    await db
      .insert(workspaceMembers)
      .values({ workspaceId: owner.workspaceId, userId: viewer.userId, role: 'VIEWER' });

    const read = await call(t.url, 'GET', `/v1/workspaces/${owner.workspaceId}`, {
      token: viewer.token,
    });
    expect(read.status).toBe(200);
    expect(read.body.role).toBe('VIEWER');

    const write = await call(t.url, 'PATCH', `/v1/workspaces/${owner.workspaceId}`, {
      token: viewer.token,
      body: { name: 'renamed by viewer' },
    });
    expect(write.status).toBe(403);
    expect(await nameOf(owner.workspaceId)).toBe('Personal');
  });
});

describe('Workspace routes with the app-layer membership checks removed', () => {
  let t: TestApp;
  beforeAll(async () => {
    // Guards that let everything through and claim the caller is the Owner:
    // only row-level security is left between user A and user B's data.
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

  it("still keep user A out of user B's Workspace", async () => {
    const a = await registerUser(t.url);
    const b = await registerUser(t.url);

    const read = await call(t.url, 'GET', `/v1/workspaces/${b.workspaceId}`, { token: a.token });
    const write = await call(t.url, 'PATCH', `/v1/workspaces/${b.workspaceId}`, {
      token: a.token,
      body: { name: 'hacked' },
    });

    expect(read.status).toBe(404);
    expect(write.status).toBe(404);
    expect(await nameOf(b.workspaceId)).toBe('Personal');
  });

  it('still let user A use their own Workspace', async () => {
    const a = await registerUser(t.url);
    const read = await call(t.url, 'GET', `/v1/workspaces/${a.workspaceId}`, { token: a.token });
    expect(read.status).toBe(200);
  });
});
