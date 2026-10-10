import {
  type Account,
  accountListSchema,
  accountSchema,
  type Category,
  categoryListSchema,
  categorySchema,
  type CreateAccountInput,
  type CreateCategoryInput,
  type CreateLabelInput,
  type CreateTransactionInput,
  CSRF_COOKIE,
  CSRF_HEADER,
  type Label,
  labelListSchema,
  labelSchema,
  type ListTransactionsQuery,
  type LoginInput,
  type Me,
  meSchema,
  type RegisterInput,
  type ReorderCategoriesInput,
  periodParam,
  type Session,
  sessionSchema,
  type Transaction,
  transactionListSchema,
  transactionSchema,
  type UpdateAccountInput,
  type UpdateCategoryInput,
  type UpdateLabelInput,
  type UpdateUserPreferencesInput,
  type UpdateWorkspaceInput,
  type UserPreferences,
  userPreferencesSchema,
  type Workspace,
  workspaceSchema,
} from '@daric/core';

/** A non-2xx answer from the API. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API answered ${status}`);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  /** Origin of the API; empty when the API is served from the web app's own origin. */
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Reads a cookie the page can see; defaults to `document.cookie`. */
  readCookie?: (name: string) => string | undefined;
}

export interface ApiClient {
  register(input: RegisterInput): Promise<Session>;
  login(input: LoginInput): Promise<Session>;
  me(): Promise<Me>;
  /** Owner or Admin only. */
  updateWorkspace(workspaceId: string, input: UpdateWorkspaceInput): Promise<Workspace>;
  updatePreferences(input: UpdateUserPreferencesInput): Promise<UserPreferences>;
  /** Archived Accounts are left out unless `includeArchived`. */
  listAccounts(workspaceId: string, options?: { includeArchived?: boolean }): Promise<Account[]>;
  /** Owner or Admin only. */
  createAccount(workspaceId: string, input: CreateAccountInput): Promise<Account>;
  /** Owner or Admin only. */
  updateAccount(
    workspaceId: string,
    accountId: string,
    input: UpdateAccountInput,
  ): Promise<Account>;
  /** Each kind's top-level Categories in order, each followed by its children. */
  listCategories(workspaceId: string, options?: { includeArchived?: boolean }): Promise<Category[]>;
  /** Owner or Admin only. */
  createCategory(workspaceId: string, input: CreateCategoryInput): Promise<Category>;
  /** Owner or Admin only; also moves, archives and unarchives. */
  updateCategory(
    workspaceId: string,
    categoryId: string,
    input: UpdateCategoryInput,
  ): Promise<Category>;
  /** Owner or Admin only: every sibling under one parent, in the new order. */
  reorderCategories(workspaceId: string, input: ReorderCategoriesInput): Promise<Category[]>;
  /** By name. Archived Labels are left out unless `includeArchived`. */
  listLabels(workspaceId: string, options?: { includeArchived?: boolean }): Promise<Label[]>;
  /** Owner or Admin only. */
  createLabel(workspaceId: string, input: CreateLabelInput): Promise<Label>;
  /** Owner or Admin only; also flags, archives and unarchives. */
  updateLabel(workspaceId: string, labelId: string, input: UpdateLabelInput): Promise<Label>;
  /** Newest first. A Period is of the Workspace Calendar; a parent Category includes its children. */
  listTransactions(workspaceId: string, filters?: ListTransactionsQuery): Promise<Transaction[]>;
  /**
   * Member or above. Sending the same `id` again returns the Transaction
   * already recorded instead of recording it twice.
   */
  createTransaction(workspaceId: string, input: CreateTransactionInput): Promise<Transaction>;
  /** Member or above; an active Label. Attaching one it already carries changes nothing. */
  attachLabel(workspaceId: string, transactionId: string, labelId: string): Promise<Transaction>;
  /** Member or above. Detaching one it does not carry changes nothing. */
  detachLabel(workspaceId: string, transactionId: string, labelId: string): Promise<Transaction>;
}

/** Amounts are bigints in code and decimal strings on the wire (ADR-0004). */
function toJson(body: unknown): string {
  return JSON.stringify(body, (_, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
}

function documentCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  for (const part of document.cookie.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

/**
 * The web app's API client (ADR-0006). The browser attaches the httpOnly
 * session cookies; this code never sees a token. The only cookie it reads is
 * the CSRF token, which it echoes in a header on every mutating request.
 */
export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? '';
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const readCookie = options.readCookie ?? documentCookie;

  async function csrfToken(): Promise<string | undefined> {
    const existing = readCookie(CSRF_COOKIE);
    if (existing) return existing;
    const res = await doFetch(`${baseUrl}/v1/auth/csrf`, { credentials: 'include' });
    if (!res.ok) throw new ApiError(res.status, await readBody(res));
    return readCookie(CSRF_COOKIE);
  }

  async function request<T>(
    method: string,
    path: string,
    schema: { parse(value: unknown): T },
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (method !== 'GET') {
      const csrf = await csrfToken();
      if (csrf) headers[CSRF_HEADER] = csrf;
    }
    const init: RequestInit = { method, headers, credentials: 'include' };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = toJson(body);
    }
    const res = await doFetch(`${baseUrl}${path}`, init);
    const parsed = await readBody(res);
    if (!res.ok) throw new ApiError(res.status, parsed);
    return schema.parse(parsed);
  }

  return {
    register: (input) => request('POST', '/v1/auth/register', sessionSchema, input),
    login: (input) => request('POST', '/v1/auth/login', sessionSchema, input),
    me: () => request('GET', '/v1/me', meSchema),
    updateWorkspace: (workspaceId, input) =>
      request('PATCH', `/v1/workspaces/${encodeURIComponent(workspaceId)}`, workspaceSchema, input),
    updatePreferences: (input) =>
      request('PATCH', '/v1/me/preferences', userPreferencesSchema, input),
    listAccounts: (workspaceId, { includeArchived = false } = {}) =>
      request(
        'GET',
        `${accountsPath(workspaceId)}${includeArchived ? '?includeArchived=true' : ''}`,
        accountListSchema,
      ),
    createAccount: (workspaceId, input) =>
      request('POST', accountsPath(workspaceId), accountSchema, input),
    updateAccount: (workspaceId, accountId, input) =>
      request(
        'PATCH',
        `${accountsPath(workspaceId)}/${encodeURIComponent(accountId)}`,
        accountSchema,
        input,
      ),
    listCategories: (workspaceId, { includeArchived = false } = {}) =>
      request(
        'GET',
        `${categoriesPath(workspaceId)}${includeArchived ? '?includeArchived=true' : ''}`,
        categoryListSchema,
      ),
    createCategory: (workspaceId, input) =>
      request('POST', categoriesPath(workspaceId), categorySchema, input),
    updateCategory: (workspaceId, categoryId, input) =>
      request(
        'PATCH',
        `${categoriesPath(workspaceId)}/${encodeURIComponent(categoryId)}`,
        categorySchema,
        input,
      ),
    reorderCategories: (workspaceId, input) =>
      request('PUT', `${categoriesPath(workspaceId)}/order`, categoryListSchema, input),
    listTransactions: (workspaceId, filters = {}) => {
      const query = new URLSearchParams();
      if (filters.period) query.set('period', periodParam(filters.period));
      if (filters.accountId) query.set('accountId', filters.accountId);
      if (filters.categoryId) query.set('categoryId', filters.categoryId);
      if (filters.labelId) query.set('labelId', filters.labelId);
      const search = query.size > 0 ? `?${query}` : '';
      return request('GET', `${transactionsPath(workspaceId)}${search}`, transactionListSchema);
    },
    createTransaction: (workspaceId, input) =>
      request('POST', transactionsPath(workspaceId), transactionSchema, input),
    attachLabel: (workspaceId, transactionId, labelId) =>
      request('PUT', transactionLabelPath(workspaceId, transactionId, labelId), transactionSchema),
    detachLabel: (workspaceId, transactionId, labelId) =>
      request(
        'DELETE',
        transactionLabelPath(workspaceId, transactionId, labelId),
        transactionSchema,
      ),
    listLabels: (workspaceId, { includeArchived = false } = {}) =>
      request(
        'GET',
        `${labelsPath(workspaceId)}${includeArchived ? '?includeArchived=true' : ''}`,
        labelListSchema,
      ),
    createLabel: (workspaceId, input) =>
      request('POST', labelsPath(workspaceId), labelSchema, input),
    updateLabel: (workspaceId, labelId, input) =>
      request(
        'PATCH',
        `${labelsPath(workspaceId)}/${encodeURIComponent(labelId)}`,
        labelSchema,
        input,
      ),
  };
}

function transactionLabelPath(workspaceId: string, transactionId: string, labelId: string) {
  return `${transactionsPath(workspaceId)}/${encodeURIComponent(transactionId)}/labels/${encodeURIComponent(labelId)}`;
}

function labelsPath(workspaceId: string): string {
  return `/v1/workspaces/${encodeURIComponent(workspaceId)}/labels`;
}

function transactionsPath(workspaceId: string): string {
  return `/v1/workspaces/${encodeURIComponent(workspaceId)}/transactions`;
}

function categoriesPath(workspaceId: string): string {
  return `/v1/workspaces/${encodeURIComponent(workspaceId)}/categories`;
}

function accountsPath(workspaceId: string): string {
  return `/v1/workspaces/${encodeURIComponent(workspaceId)}/accounts`;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
