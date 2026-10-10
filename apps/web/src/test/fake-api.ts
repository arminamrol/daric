import { ApiError, type ApiClient } from '@daric/api-client';
import { categoryKinds, categoryTree, hasRole } from '@daric/core';
import type {
  Account,
  Category,
  Me,
  Session,
  UserPreferences,
  Workspace,
  WorkspaceRole,
} from '@daric/core';

export const testPassword = 'correct horse battery';

interface FakeUser {
  id: string;
  email: string;
  password: string;
  preferences: UserPreferences;
}

/**
 * An in-memory stand-in for the API, as the browser sees it: the session is
 * the server's business, so the fake keeps it and answers `me()` from it.
 */
export function fakeApi({
  signedInAs,
  role = 'OWNER',
}: { signedInAs?: string; role?: WorkspaceRole } = {}) {
  const users = new Map<string, FakeUser>();
  let current: FakeUser | undefined;
  let nextId = 1;
  // Every User shares this one Workspace, with the same Role.
  let workspace: Workspace = {
    id: '01900000-0000-7000-9000-000000000001',
    type: 'PERSONAL',
    name: 'Personal',
    baseCurrency: 'IRR',
    calendar: 'jalali',
    timezone: 'Asia/Tehran',
    moneyDisplay: 'rial',
    role,
  };

  let accounts: Account[] = [];
  let nextAccountId = 1;
  let categories: Category[] = [];
  let nextCategoryId = 1;

  function signedIn(): FakeUser {
    if (!current) throw new ApiError(401, { message: 'Unauthorized' });
    return current;
  }

  function addUser(email: string, password = testPassword): FakeUser {
    const id = `01900000-0000-7000-8000-${String(nextId++).padStart(12, '0')}`;
    const preferences: UserPreferences = {
      displayCalendar: 'jalali',
      digits: 'persian',
      theme: 'system',
    };
    const user = { id, email, password, preferences };
    users.set(email, user);
    return user;
  }

  function session(user: FakeUser): Session {
    current = user;
    return {
      user: { id: user.id, email: user.email },
      accessTokenExpiresAt: '2026-10-10T10:15:00.000Z',
      refreshTokenExpiresAt: '2026-11-09T10:00:00.000Z',
    };
  }

  if (signedInAs) current = addUser(signedInAs);

  function inWorkspace(workspaceId: string, minimum: WorkspaceRole = 'VIEWER') {
    signedIn();
    if (workspaceId !== workspace.id) throw new ApiError(404, { message: 'Not Found' });
    if (!hasRole(workspace.role, minimum)) throw new ApiError(403, { message: 'Forbidden' });
  }

  /** Puts an Account straight into the Workspace, as if created earlier. */
  function addAccount(fields: Partial<Account> & Pick<Account, 'name'>): Account {
    const account: Account = {
      id: `01900000-0000-7000-a000-${String(nextAccountId++).padStart(12, '0')}`,
      type: 'BANK',
      class: 'ASSET',
      currency: 'IRR',
      openingBalance: 0n,
      archived: false,
      ...fields,
      balance: fields.openingBalance ?? 0n,
    };
    accounts.push(account);
    return account;
  }

  const siblings = (kind: Category['kind'], parentId: string | null) =>
    categories
      .filter((c) => c.kind === kind && c.parentId === parentId)
      .sort((a, b) => a.position - b.position);

  /** Puts a Category straight into the Workspace, last among its siblings. */
  function addCategory(fields: Partial<Category> & Pick<Category, 'name'>): Category {
    const kind = fields.kind ?? 'EXPENSE';
    const parentId = fields.parentId ?? null;
    const category: Category = {
      id: `01900000-0000-7000-b000-${String(nextCategoryId++).padStart(12, '0')}`,
      kind,
      parentId,
      icon: 'shopping-bag',
      color: 'blue',
      position: siblings(kind, parentId).length,
      archived: false,
      ...fields,
    };
    categories.push(category);
    return category;
  }

  function findCategory(categoryId: string): Category {
    const category = categories.find((c) => c.id === categoryId);
    if (!category) throw new ApiError(404, { message: 'Not Found' });
    return category;
  }

  /** The same order the API lists in: each kind's tops, each followed by its children. */
  function inTreeOrder(list: Category[]): Category[] {
    const sorted = [...list].sort((a, b) => a.position - b.position);
    return categoryKinds.flatMap((kind) =>
      categoryTree(sorted.filter((c) => c.kind === kind)).flatMap(({ children, ...top }) => [
        top,
        ...children,
      ]),
    );
  }

  const api: ApiClient = {
    async register({ email, password }) {
      if (users.has(email)) throw new ApiError(409, { message: 'Email is already registered' });
      return session(addUser(email, password));
    },
    async login({ email, password }) {
      const user = users.get(email);
      if (!user || user.password !== password) {
        throw new ApiError(401, { message: 'Email or password is incorrect' });
      }
      return session(user);
    },
    async me(): Promise<Me> {
      const user = signedIn();
      return {
        user: { id: user.id, email: user.email },
        preferences: { ...user.preferences },
        workspaces: [{ ...workspace }],
      };
    },
    async updateWorkspace(workspaceId, input) {
      signedIn();
      if (workspaceId !== workspace.id) throw new ApiError(404, { message: 'Not Found' });
      if (!hasRole(workspace.role, 'ADMIN')) throw new ApiError(403, { message: 'Forbidden' });
      workspace = { ...workspace, ...input };
      return { ...workspace };
    },
    async listAccounts(workspaceId, { includeArchived = false } = {}) {
      inWorkspace(workspaceId);
      return accounts.filter((a) => includeArchived || !a.archived).map((a) => ({ ...a }));
    },
    async createAccount(workspaceId, input) {
      inWorkspace(workspaceId, 'ADMIN');
      return { ...addAccount(input) };
    },
    async updateAccount(workspaceId, accountId, input) {
      inWorkspace(workspaceId, 'ADMIN');
      const account = accounts.find((a) => a.id === accountId);
      if (!account) throw new ApiError(404, { message: 'Not Found' });
      const updated = { ...account, ...input };
      updated.balance = updated.openingBalance;
      accounts = accounts.map((a) => (a.id === accountId ? updated : a));
      return { ...updated };
    },
    async listCategories(workspaceId, { includeArchived = false } = {}) {
      inWorkspace(workspaceId);
      return inTreeOrder(categories.filter((c) => includeArchived || !c.archived)).map((c) => ({
        ...c,
      }));
    },
    async createCategory(workspaceId, { parentId = null, ...input }) {
      inWorkspace(workspaceId, 'ADMIN');
      if (parentId) {
        const parent = findCategory(parentId);
        if (parent.parentId || parent.kind !== input.kind) {
          throw new ApiError(400, { message: 'Bad parent' });
        }
        if (parent.archived) throw new ApiError(409, { message: 'Parent archived' });
      }
      return { ...addCategory({ ...input, parentId }) };
    },
    async updateCategory(workspaceId, categoryId, input) {
      inWorkspace(workspaceId, 'ADMIN');
      const current = findCategory(categoryId);
      const updated = { ...current, ...input };
      if (input.parentId !== undefined && input.parentId !== current.parentId) {
        updated.position = siblings(current.kind, input.parentId).length;
      }
      const hasActiveChild = categories.some((c) => c.parentId === categoryId && !c.archived);
      if (updated.archived && !current.archived && hasActiveChild) {
        throw new ApiError(409, { message: 'Archive the children first' });
      }
      const parent = updated.parentId ? findCategory(updated.parentId) : undefined;
      if (!updated.archived && parent?.archived) {
        throw new ApiError(409, { message: 'The parent Category is archived' });
      }
      categories = categories.map((c) => (c.id === categoryId ? updated : c));
      return { ...updated };
    },
    async reorderCategories(workspaceId, { ids }) {
      inWorkspace(workspaceId, 'ADMIN');
      const first = findCategory(ids[0] ?? '');
      const group = siblings(first.kind, first.parentId);
      if (group.length !== ids.length || !group.every((c) => ids.includes(c.id))) {
        throw new ApiError(400, { message: 'Name every sibling' });
      }
      categories = categories.map((c) =>
        ids.includes(c.id) ? { ...c, position: ids.indexOf(c.id) } : c,
      );
      return siblings(first.kind, first.parentId).map((c) => ({ ...c }));
    },
    async updatePreferences(input) {
      const user = signedIn();
      user.preferences = { ...user.preferences, ...input };
      return { ...user.preferences };
    },
  };

  return {
    api,
    addUser,
    addAccount,
    accounts: () => accounts,
    addCategory,
    /** In the API's list order, archived ones included. */
    categories: () => inTreeOrder(categories),
    signedInUser: () => current?.email,
    workspace: () => workspace,
    preferences: () => signedIn().preferences,
  };
}
export type FakeApi = ReturnType<typeof fakeApi>;
