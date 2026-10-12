import {
  type Account,
  accountListSchema,
  accountSchema,
  type Budget,
  budgetListSchema,
  budgetSchema,
  type Category,
  categoryListSchema,
  categorySchema,
  type CreateAccountInput,
  type CreateBudgetInput,
  type CreateExchangeRateInput,
  type ExchangeRateWire,
  exchangeRateListSchema,
  exchangeRateSchema,
  type ConfirmOccurrenceInput,
  type CreateRecurringRuleInput,
  type DueOccurrences,
  dueOccurrencesSchema,
  type RecurringRule,
  recurringRuleListSchema,
  recurringRuleSchema,
  type UpdateRecurringRuleInput,
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
  type MonthPeriod,
  type UpdateAccountInput,
  type UpdateBudgetInput,
  type UpdateExchangeRateInput,
  type UpdateCategoryInput,
  type UpdateLabelInput,
  type UpdateTransactionInput,
  type UpdateUserPreferencesInput,
  type UpdateWorkspaceInput,
  type UserPreferences,
  userPreferencesSchema,
  type Workspace,
  workspaceSchema,
  type AccountValuation,
  type CreateValuationInput,
  type NetWorthReport,
  netWorthHistorySchema,
  netWorthSchema,
  type NetWorthSnapshot,
  netWorthSnapshotSchema,
  type NetWorthSnapshotSummary,
  type UpdateValuationInput,
  valuationListSchema,
  valuationSchema,
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

/**
 * The server's current copy when an edit was refused for starting from a
 * stale version; undefined for any other error.
 */
export function transactionConflict(error: unknown): Transaction | undefined {
  if (!(error instanceof ApiError) || error.status !== 409) return undefined;
  const body = error.body as { transaction?: unknown } | undefined;
  const parsed = transactionSchema.safeParse(body?.transaction);
  return parsed.success ? parsed.data : undefined;
}

const noContent = { parse: (): void => undefined };

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
  /** Ends this Signed-in Device; the API clears the session cookies. */
  logout(): Promise<void>;
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
  /**
   * Oldest first, each with its progress in `month` (the current month of the
   * Workspace Calendar by default), or in the year holding it for a yearly Budget.
   */
  listBudgets(workspaceId: string, options?: { month?: MonthPeriod }): Promise<Budget[]>;
  /** Owner or Admin only. The limit is in the Workspace's Base Currency. */
  createBudget(workspaceId: string, input: CreateBudgetInput): Promise<Budget>;
  /** Owner or Admin only. */
  updateBudget(workspaceId: string, budgetId: string, input: UpdateBudgetInput): Promise<Budget>;
  /** Owner or Admin only. */
  deleteBudget(workspaceId: string, budgetId: string): Promise<void>;
  /** Rates into the current Base Currency, by currency code, newest first within each. */
  listExchangeRates(workspaceId: string): Promise<ExchangeRateWire[]>;
  /** Owner or Admin only. One rate per currency and day; never of the Base Currency itself. */
  createExchangeRate(
    workspaceId: string,
    input: CreateExchangeRateInput,
  ): Promise<ExchangeRateWire>;
  /** Owner or Admin only. */
  updateExchangeRate(
    workspaceId: string,
    rateId: string,
    input: UpdateExchangeRateInput,
  ): Promise<ExchangeRateWire>;
  /** Owner or Admin only. */
  deleteExchangeRate(workspaceId: string, rateId: string): Promise<void>;
  /** The Account's Valuations, newest first. */
  listValuations(workspaceId: string, accountId: string): Promise<AccountValuation[]>;
  /** Owner or Admin only. One per Account and day; never on an archived Account. */
  createValuation(
    workspaceId: string,
    accountId: string,
    input: CreateValuationInput,
  ): Promise<AccountValuation>;
  /** Owner or Admin only. */
  updateValuation(
    workspaceId: string,
    accountId: string,
    valuationId: string,
    input: UpdateValuationInput,
  ): Promise<AccountValuation>;
  /** Owner or Admin only. */
  deleteValuation(workspaceId: string, accountId: string, valuationId: string): Promise<void>;
  /** Net Worth today in the Base Currency, by currency and by Account. */
  getNetWorth(workspaceId: string): Promise<NetWorthReport>;
  /** Every Net Worth Snapshot, oldest first. */
  listNetWorthSnapshots(workspaceId: string): Promise<NetWorthSnapshotSummary[]>;
  /** Stores today's Net Worth as a MANUAL snapshot. */
  takeNetWorthSnapshot(workspaceId: string): Promise<NetWorthSnapshot>;
  getNetWorthSnapshot(workspaceId: string, snapshotId: string): Promise<NetWorthSnapshot>;
  /** Oldest first. Archived rules are left out unless `includeArchived`. */
  listRecurringRules(
    workspaceId: string,
    options?: { includeArchived?: boolean },
  ): Promise<RecurringRule[]>;
  /** Owner or Admin only. */
  createRecurringRule(workspaceId: string, input: CreateRecurringRuleInput): Promise<RecurringRule>;
  /** Owner or Admin only; also archives and unarchives. */
  updateRecurringRule(
    workspaceId: string,
    ruleId: string,
    input: UpdateRecurringRuleInput,
  ): Promise<RecurringRule>;
  /**
   * The Due Occurrences, oldest first. Occurrences of auto-posting rules are
   * recorded first; `autoPosted` says how many, so Transactions can be refetched.
   */
  listDueOccurrences(workspaceId: string): Promise<DueOccurrences>;
  /**
   * Member or above. Records the occurrence as a Transaction on the day it fell
   * due; confirming it again returns the same Transaction.
   */
  confirmOccurrence(
    workspaceId: string,
    ruleId: string,
    dueOn: string,
    input?: ConfirmOccurrenceInput,
  ): Promise<Transaction>;
  /** Member or above. Skipping it again changes nothing. */
  skipOccurrence(workspaceId: string, ruleId: string, dueOn: string): Promise<void>;
  /** Newest first. A Period is of the Workspace Calendar; a parent Category includes its children. */
  listTransactions(workspaceId: string, filters?: ListTransactionsQuery): Promise<Transaction[]>;
  /** One that is not deleted. */
  getTransaction(workspaceId: string, transactionId: string): Promise<Transaction>;
  /**
   * Member or above. Sending the same `id` again returns the Transaction
   * already recorded instead of recording it twice.
   */
  createTransaction(workspaceId: string, input: CreateTransactionInput): Promise<Transaction>;
  /**
   * Member or above; a Member only their own. Replaces its fields, and its
   * Labels when given. A stale `version` is refused: see `transactionConflict`.
   */
  updateTransaction(
    workspaceId: string,
    transactionId: string,
    input: UpdateTransactionInput,
  ): Promise<Transaction>;
  /** Member or above; a Member only their own. Deletes it softly, whatever its version. */
  deleteTransaction(workspaceId: string, transactionId: string): Promise<void>;
  /** Member or above; a Member only their own. Brings a deleted Transaction back. */
  restoreTransaction(workspaceId: string, transactionId: string): Promise<Transaction>;
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
    logout: () => request('POST', '/v1/auth/logout', noContent),
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
    getTransaction: (workspaceId, transactionId) =>
      request('GET', transactionPath(workspaceId, transactionId), transactionSchema),
    updateTransaction: (workspaceId, transactionId, input) =>
      request('PUT', transactionPath(workspaceId, transactionId), transactionSchema, input),
    deleteTransaction: (workspaceId, transactionId) =>
      request('DELETE', transactionPath(workspaceId, transactionId), noContent),
    restoreTransaction: (workspaceId, transactionId) =>
      request('POST', `${transactionPath(workspaceId, transactionId)}/restore`, transactionSchema),
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
    listBudgets: (workspaceId, { month } = {}) =>
      request(
        'GET',
        `${budgetsPath(workspaceId)}${month ? `?month=${periodParam(month)}` : ''}`,
        budgetListSchema,
      ),
    createBudget: (workspaceId, input) =>
      request('POST', budgetsPath(workspaceId), budgetSchema, input),
    updateBudget: (workspaceId, budgetId, input) =>
      request('PATCH', budgetPath(workspaceId, budgetId), budgetSchema, input),
    deleteBudget: (workspaceId, budgetId) =>
      request('DELETE', budgetPath(workspaceId, budgetId), noContent),
    listExchangeRates: (workspaceId) =>
      request('GET', ratesPath(workspaceId), exchangeRateListSchema),
    createExchangeRate: (workspaceId, input) =>
      request('POST', ratesPath(workspaceId), exchangeRateSchema, input),
    updateExchangeRate: (workspaceId, rateId, input) =>
      request('PATCH', ratePath(workspaceId, rateId), exchangeRateSchema, input),
    deleteExchangeRate: (workspaceId, rateId) =>
      request('DELETE', ratePath(workspaceId, rateId), noContent),
    listValuations: (workspaceId, accountId) =>
      request('GET', valuationsPath(workspaceId, accountId), valuationListSchema),
    createValuation: (workspaceId, accountId, input) =>
      request('POST', valuationsPath(workspaceId, accountId), valuationSchema, input),
    updateValuation: (workspaceId, accountId, valuationId, input) =>
      request('PATCH', valuationPath(workspaceId, accountId, valuationId), valuationSchema, input),
    deleteValuation: (workspaceId, accountId, valuationId) =>
      request('DELETE', valuationPath(workspaceId, accountId, valuationId), noContent),
    getNetWorth: (workspaceId) =>
      request('GET', `/v1/workspaces/${encodeURIComponent(workspaceId)}/net-worth`, netWorthSchema),
    listNetWorthSnapshots: (workspaceId) =>
      request('GET', snapshotsPath(workspaceId), netWorthHistorySchema),
    takeNetWorthSnapshot: (workspaceId) =>
      request('POST', snapshotsPath(workspaceId), netWorthSnapshotSchema),
    getNetWorthSnapshot: (workspaceId, snapshotId) =>
      request(
        'GET',
        `${snapshotsPath(workspaceId)}/${encodeURIComponent(snapshotId)}`,
        netWorthSnapshotSchema,
      ),
    listRecurringRules: (workspaceId, { includeArchived = false } = {}) =>
      request(
        'GET',
        `${recurringPath(workspaceId)}${includeArchived ? '?includeArchived=true' : ''}`,
        recurringRuleListSchema,
      ),
    createRecurringRule: (workspaceId, input) =>
      request('POST', recurringPath(workspaceId), recurringRuleSchema, input),
    updateRecurringRule: (workspaceId, ruleId, input) =>
      request(
        'PATCH',
        `${recurringPath(workspaceId)}/${encodeURIComponent(ruleId)}`,
        recurringRuleSchema,
        input,
      ),
    listDueOccurrences: (workspaceId) =>
      request('GET', `${recurringPath(workspaceId)}/due`, dueOccurrencesSchema),
    confirmOccurrence: (workspaceId, ruleId, dueOn, input = {}) =>
      request(
        'POST',
        `${occurrencePath(workspaceId, ruleId, dueOn)}/confirm`,
        transactionSchema,
        input,
      ),
    skipOccurrence: (workspaceId, ruleId, dueOn) =>
      request('POST', `${occurrencePath(workspaceId, ruleId, dueOn)}/skip`, noContent),
  };
}

function snapshotsPath(workspaceId: string): string {
  return `/v1/workspaces/${encodeURIComponent(workspaceId)}/net-worth/snapshots`;
}

function valuationsPath(workspaceId: string, accountId: string): string {
  return `/v1/workspaces/${encodeURIComponent(workspaceId)}/accounts/${encodeURIComponent(accountId)}/valuations`;
}

function valuationPath(workspaceId: string, accountId: string, valuationId: string) {
  return `${valuationsPath(workspaceId, accountId)}/${encodeURIComponent(valuationId)}`;
}

function recurringPath(workspaceId: string): string {
  return `/v1/workspaces/${encodeURIComponent(workspaceId)}/recurring`;
}

function occurrencePath(workspaceId: string, ruleId: string, dueOn: string) {
  return `${recurringPath(workspaceId)}/${encodeURIComponent(ruleId)}/occurrences/${encodeURIComponent(dueOn)}`;
}

function budgetsPath(workspaceId: string): string {
  return `/v1/workspaces/${encodeURIComponent(workspaceId)}/budgets`;
}

function budgetPath(workspaceId: string, budgetId: string) {
  return `${budgetsPath(workspaceId)}/${encodeURIComponent(budgetId)}`;
}

function ratesPath(workspaceId: string): string {
  return `/v1/workspaces/${encodeURIComponent(workspaceId)}/exchange-rates`;
}

function ratePath(workspaceId: string, rateId: string) {
  return `${ratesPath(workspaceId)}/${encodeURIComponent(rateId)}`;
}

function transactionPath(workspaceId: string, transactionId: string) {
  return `${transactionsPath(workspaceId)}/${encodeURIComponent(transactionId)}`;
}

function transactionLabelPath(workspaceId: string, transactionId: string, labelId: string) {
  return `${transactionPath(workspaceId, transactionId)}/labels/${encodeURIComponent(labelId)}`;
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
