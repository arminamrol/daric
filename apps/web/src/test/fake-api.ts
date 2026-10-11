import { ApiError, type ApiClient } from '@daric/api-client';
import {
  balanceEffect,
  categoryKinds,
  categoryTree,
  hasRole,
  mayChangeTransaction,
  periodDays,
} from '@daric/core';
import type {
  Account,
  Category,
  Label,
  Me,
  Session,
  Transaction,
  UserPreferences,
  Workspace,
  WorkspaceRole,
} from '@daric/core';
import { v7 as uuidv7 } from 'uuid';

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
  let transactions: Transaction[] = [];
  /** Deleted softly: kept, but left out of lists and balances. */
  const deleted = new Set<string>();
  let labels: Label[] = [];
  let nextLabelId = 1;

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

  /** The opening balance plus the Account's Transactions, as the API computes it. */
  function withBalance(account: Account): Account {
    const effects = live().map((t) => balanceEffect(t, account));
    return { ...account, balance: effects.reduce((a, b) => a + b, account.openingBalance) };
  }

  /** Puts a Transaction straight into the Workspace, as if recorded earlier. */
  function addTransaction(fields: TransactionDraft): Transaction {
    const transaction = {
      id: uuidv7(),
      note: null,
      createdBy: current?.id ?? null,
      labelIds: [],
      version: 1,
      ...fields,
    } as Transaction;
    transactions.push(transaction);
    return transaction;
  }

  const live = () => transactions.filter((t) => !deleted.has(t.id));

  /** A Transaction the signed-in User may change; 404 when it is missing or deleted. */
  function changeable(transactionId: string, { includeDeleted = false } = {}): Transaction {
    const user = signedIn();
    const transaction = transactions.find((t) => t.id === transactionId);
    if (!transaction || (!includeDeleted && deleted.has(transactionId))) {
      throw new ApiError(404, { message: 'Not Found' });
    }
    if (!mayChangeTransaction(workspace.role, user.id, transaction)) {
      throw new ApiError(403, { message: 'Forbidden' });
    }
    return transaction;
  }

  function replace(updated: Transaction): Transaction {
    transactions = transactions.map((t) => (t.id === updated.id ? updated : t));
    return { ...updated };
  }

  /** Newest first, like the API. */
  const newestFirst = (list: Transaction[]) =>
    list
      .map((t, index) => ({ t, index }))
      .sort((a, b) =>
        a.t.occurredOn === b.t.occurredOn
          ? b.index - a.index
          : a.t.occurredOn < b.t.occurredOn
            ? 1
            : -1,
      )
      .map(({ t }) => ({ ...t }));

  /** Puts a Label straight into the Workspace, as if created earlier. */
  function addLabel(fields: Partial<Label> & Pick<Label, 'name'>): Label {
    const label: Label = {
      id: `01900000-0000-7000-8c00-${String(nextLabelId++).padStart(12, '0')}`,
      controllable: false,
      archived: false,
      ...fields,
    };
    labels.push(label);
    return label;
  }

  /** By name, like the API. */
  const byName = (list: Label[]) =>
    [...list].sort((a, b) => a.name.localeCompare(b.name)).map((l) => ({ ...l }));

  function assertNameFree(name: string, labelId?: string) {
    const taken = labels.some(
      (l) => l.id !== labelId && l.name.toLowerCase() === name.toLowerCase(),
    );
    if (taken) throw new ApiError(409, { message: 'Another Label already has this name' });
  }

  /** Changes a Transaction's Labels, as attaching or detaching does. */
  function relabel(transactionId: string, change: (labelIds: string[]) => string[]) {
    const transaction = changeable(transactionId);
    const labelIds = change(transaction.labelIds);
    return replace(
      labelIds.length === transaction.labelIds.length
        ? transaction
        : { ...transaction, labelIds, version: transaction.version + 1 },
    );
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
      return accounts.filter((a) => includeArchived || !a.archived).map(withBalance);
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
      accounts = accounts.map((a) => (a.id === accountId ? updated : a));
      return withBalance(updated);
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
    async listLabels(workspaceId, { includeArchived = false } = {}) {
      inWorkspace(workspaceId);
      return byName(labels.filter((l) => includeArchived || !l.archived));
    },
    async createLabel(workspaceId, input) {
      inWorkspace(workspaceId, 'ADMIN');
      assertNameFree(input.name);
      return { ...addLabel({ name: input.name, controllable: input.controllable ?? false }) };
    },
    async updateLabel(workspaceId, labelId, input) {
      inWorkspace(workspaceId, 'ADMIN');
      const current = labels.find((l) => l.id === labelId);
      if (!current) throw new ApiError(404, { message: 'Not Found' });
      if (input.name !== undefined) assertNameFree(input.name, labelId);
      const updated = { ...current, ...input };
      labels = labels.map((l) => (l.id === labelId ? updated : l));
      return { ...updated };
    },
    async attachLabel(workspaceId, transactionId, labelId) {
      inWorkspace(workspaceId, 'MEMBER');
      const label = labels.find((l) => l.id === labelId);
      if (!label) throw new ApiError(404, { message: 'Not Found' });
      return relabel(transactionId, (ids) => {
        if (ids.includes(labelId)) return ids;
        if (label.archived) throw new ApiError(400, { message: 'The Label is archived' });
        return [...ids, labelId].sort();
      });
    },
    async detachLabel(workspaceId, transactionId, labelId) {
      inWorkspace(workspaceId, 'MEMBER');
      return relabel(transactionId, (ids) => ids.filter((id) => id !== labelId));
    },
    async listTransactions(workspaceId, { period, accountId, categoryId, labelId } = {}) {
      inWorkspace(workspaceId);
      const days = period && periodDays(period, workspace.calendar);
      const childIds = categories.filter((c) => c.parentId === categoryId).map((c) => c.id);
      return newestFirst(
        live().filter(
          (t) =>
            (!days || (t.occurredOn >= days.from && t.occurredOn < days.until)) &&
            (!accountId ||
              t.accountId === accountId ||
              (t.type === 'TRANSFER' && t.toAccountId === accountId)) &&
            (!categoryId ||
              (t.type !== 'TRANSFER' &&
                (t.categoryId === categoryId || childIds.includes(t.categoryId)))) &&
            (!labelId || t.labelIds.includes(labelId)),
        ),
      );
    },
    async createTransaction(workspaceId, { id, ...input }) {
      inWorkspace(workspaceId, 'MEMBER');
      const existing = transactions.find((t) => t.id === id);
      if (existing) return { ...existing };
      const usable = (accountId: string) => accounts.find((a) => a.id === accountId && !a.archived);
      const account = usable(input.accountId);
      if (!account) throw new ApiError(400, { message: 'Bad Account' });
      const active = new Set(labels.filter((l) => !l.archived).map((l) => l.id));
      if (!input.labelIds.every((labelId) => active.has(labelId))) {
        throw new ApiError(400, { message: 'Bad Label' });
      }
      const labelIds = [...input.labelIds].sort();
      if (input.type === 'TRANSFER') {
        const to = usable(input.toAccountId);
        if (!to || to.id === account.id) throw new ApiError(400, { message: 'Bad Account' });
        const toAmount =
          to.currency === account.currency ? (input.toAmount ?? input.amount) : input.toAmount;
        if (
          toAmount === undefined ||
          (to.currency === account.currency && toAmount !== input.amount)
        ) {
          throw new ApiError(400, { message: 'Bad Amounts' });
        }
        return { ...addTransaction({ ...input, toAmount, labelIds, ...(id && { id }) }) };
      }
      const category = categories.find((c) => c.id === input.categoryId && !c.archived);
      if (category?.kind !== input.type) throw new ApiError(400, { message: 'Bad Category' });
      return { ...addTransaction({ ...input, labelIds, ...(id && { id }) }) };
    },
    async getTransaction(workspaceId, transactionId) {
      inWorkspace(workspaceId);
      const transaction = live().find((t) => t.id === transactionId);
      if (!transaction) throw new ApiError(404, { message: 'Not Found' });
      return { ...transaction };
    },
    async updateTransaction(workspaceId, transactionId, { version, ...input }) {
      inWorkspace(workspaceId, 'MEMBER');
      const current = changeable(transactionId);
      if (current.version !== version) {
        // As on the wire: Amounts as decimal strings.
        const wire = JSON.parse(
          JSON.stringify(current, (_, v: unknown) => (typeof v === 'bigint' ? String(v) : v)),
        ) as unknown;
        throw new ApiError(409, { message: 'Stale', transaction: wire });
      }
      const { labelIds = current.labelIds, ...fields } = input;
      const common = {
        id: current.id,
        createdBy: current.createdBy,
        labelIds: [...labelIds].sort(),
        version: version + 1,
      };
      if (fields.type === 'TRANSFER') {
        const { toAmount = fields.amount, ...rest } = fields;
        return replace({ ...common, ...rest, toAmount });
      }
      return replace({ ...common, ...fields });
    },
    async deleteTransaction(workspaceId, transactionId) {
      inWorkspace(workspaceId, 'MEMBER');
      const current = changeable(transactionId, { includeDeleted: true });
      if (deleted.has(transactionId)) return;
      deleted.add(transactionId);
      replace({ ...current, version: current.version + 1 });
    },
    async restoreTransaction(workspaceId, transactionId) {
      inWorkspace(workspaceId, 'MEMBER');
      const current = changeable(transactionId, { includeDeleted: true });
      if (!deleted.delete(transactionId)) return { ...current };
      return replace({ ...current, version: current.version + 1 });
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
    addTransaction,
    addLabel,
    /** As stored, archived ones included. */
    labels: () => labels,
    /** In the order recorded, deleted ones left out. */
    transactions: () => live(),
    /** Ids of those deleted softly. */
    deletedTransactions: () => [...deleted],
    /** In the API's list order, archived ones included. */
    categories: () => inTreeOrder(categories),
    signedInUser: () => current?.email,
    workspace: () => workspace,
    preferences: () => signedIn().preferences,
  };
}
export type FakeApi = ReturnType<typeof fakeApi>;

type Defaulted = 'id' | 'note' | 'createdBy' | 'labelIds' | 'version';

type Draft<T> = T extends unknown
  ? Omit<T, Defaulted> & Partial<Pick<T, Defaulted & keyof T>>
  : never;

/** A Transaction to put in, its bookkeeping fields optional. */
type TransactionDraft = Draft<Transaction>;
