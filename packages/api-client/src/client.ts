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
  type ExportFormat,
  exportFiles,
  authResultSchema,
  CLIENT_HEADER,
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
  type ResetPasswordInput,
  periodParam,
  type Session,
  sessionSchema,
  type Subscription,
  subscriptionSchema,
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
  type ProjectionReport,
  type ProjectionMode,
  type Period,
  type Report,
  reportSchema,
  projectionSchema,
  type ProjectionSettings,
  projectionSettingsSchema,
  type UpdateProjectionSettingsInput,
  type CreatePlannedItemInput,
  type PlannedItem,
  plannedItemListSchema,
  plannedItemSchema,
  type UpdatePlannedItemInput,
  netWorthHistorySchema,
  netWorthSchema,
  type NetWorthSnapshot,
  netWorthSnapshotSchema,
  type NetWorthSnapshotSummary,
  type UpdateValuationInput,
  valuationListSchema,
  valuationSchema,
  type AcceptedInvitation,
  acceptedInvitationSchema,
  type AuditPage,
  auditPageSchema,
  type Consent,
  consentListSchema,
  type CreatedInvitation,
  createdInvitationSchema,
  type CreateInvitationInput,
  type InvitationList,
  invitationListSchema,
  type InvitationPreview,
  invitationPreviewSchema,
  type AccountDeletionPreview,
  accountDeletionPreviewSchema,
  type Member,
  memberListSchema,
  memberSchema,
  type UpdateMemberInput,
} from '@daric/core';
import type { TokenStore } from './tokens';

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

/** A file the API sent to download. */
export interface DownloadedFile {
  blob: Blob;
  /** From the server's Content-Disposition, else `fallback`. */
  fileName: string;
}

function fileNameOf(res: Response, fallback: string): string {
  const match = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '');
  return match?.[1] ?? fallback;
}

export interface ApiClientOptions {
  /** Origin of the API; empty when the API is served from the web app's own origin. */
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Reads a cookie the page can see; defaults to `document.cookie`. */
  readCookie?: (name: string) => string | undefined;
  /**
   * Where the mobile app keeps its tokens. Given, the client authenticates
   * with a bearer header instead of cookies and refreshes the tokens itself.
   */
  tokens?: TokenStore;
}

export interface ApiClient {
  register(input: RegisterInput): Promise<Session>;
  login(input: LoginInput): Promise<Session>;
  /**
   * Ends this Signed-in Device; the API clears the session cookies. With a
   * token store the tokens are forgotten even when the API cannot be told.
   */
  logout(): Promise<void>;
  /** Uses the token from a mailed verification link; 400 when it is invalid, used or expired. */
  verifyEmail(token: string): Promise<void>;
  /** Mails the signed-in User a new verification link; 409 once verified, 429 when asked too often. */
  resendVerification(): Promise<void>;
  /** Mails a reset link if the email is registered; succeeds the same either way. */
  forgotPassword(email: string): Promise<void>;
  /** Sets a new password from a mailed reset link and ends every Signed-in Device of the User. */
  resetPassword(input: ResetPasswordInput): Promise<void>;
  me(): Promise<Me>;
  /** Owner or Admin only. */
  updateWorkspace(workspaceId: string, input: UpdateWorkspaceInput): Promise<Workspace>;
  updatePreferences(input: UpdateUserPreferencesInput): Promise<UserPreferences>;
  /** The User's Plan, its expiry and their Entitlements, as the server decides them. */
  getSubscription(): Promise<Subscription>;
  /** Everyone in the Workspace, in the order they joined; any Member may see them. */
  listMembers(workspaceId: string): Promise<Member[]>;
  /** Owner or Admin, by the role matrix: an Admin changes only Members and Viewers, to those. */
  updateMember(workspaceId: string, memberId: string, input: UpdateMemberInput): Promise<Member>;
  /** Removes a Member by the role matrix, or, on one's own membership, leaves the Workspace. */
  removeMember(workspaceId: string, memberId: string): Promise<void>;
  /** Owner only: makes the Member the Owner; the caller stays on as an Admin. */
  transferOwnership(workspaceId: string, memberId: string): Promise<void>;
  /** What deleting the signed-in User's account would delete, and what blocks it. */
  accountDeletion(): Promise<AccountDeletionPreview>;
  /**
   * Deletes the signed-in User and their data for good; the session ends with
   * it. 403 with `reason` WRONG_PASSWORD; 409 with `reason`
   * OWNS_SHARED_WORKSPACE while they own a Workspace others belong to.
   */
  deleteAccount(password: string): Promise<void>;
  /** Owner or Admin: the Invitations, newest first, and whether the Owner's Plan allows more. */
  listInvitations(workspaceId: string): Promise<InvitationList>;
  /**
   * Owner or Admin. Mails the link if an email is given; the link comes back
   * this once. 402 when the Workspace's Owner may not share it.
   */
  createInvitation(workspaceId: string, input: CreateInvitationInput): Promise<CreatedInvitation>;
  revokeInvitation(workspaceId: string, invitationId: string): Promise<void>;
  /** What a pending Invitation offers; 400 when the link is invalid, used, revoked or expired. */
  previewInvitation(token: string): Promise<InvitationPreview>;
  /**
   * Joins the Workspace. 403 with `reason` EMAIL_NOT_VERIFIED or
   * EMAIL_MISMATCH, 409 when already a Member, 402 when its Owner may no longer share it.
   */
  acceptInvitation(token: string): Promise<AcceptedInvitation>;
  /** The User's Consents, newest first, revoked ones included. */
  listConsents(): Promise<Consent[]>;
  /** Revoking workspace sharing leaves that Workspace at once. */
  revokeConsent(consentId: string): Promise<void>;
  /** Owner only: the audit log, newest first; pass the previous page's `next` as `before`. */
  listAudit(workspaceId: string, options?: { before?: string; limit?: number }): Promise<AuditPage>;
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
  /** The Projection of the current year in `mode` (the Workspace's by default), with its assumptions. */
  getProjection(
    workspaceId: string,
    options?: { mode?: ProjectionMode },
  ): Promise<ProjectionReport>;
  getProjectionSettings(workspaceId: string): Promise<ProjectionSettings>;
  /**
   * The report of a month or year (the current month by default): totals,
   * Category and Label breakdowns and the trend, in the Base Currency.
   */
  getReport(workspaceId: string, options?: { period?: Period }): Promise<Report>;
  /** Owner or Admin only. */
  updateProjectionSettings(
    workspaceId: string,
    input: UpdateProjectionSettingsInput,
  ): Promise<ProjectionSettings>;
  /** Oldest first. */
  listPlannedItems(workspaceId: string): Promise<PlannedItem[]>;
  /** Owner or Admin only. The Amount is in the Workspace's Base Currency. */
  createPlannedItem(workspaceId: string, input: CreatePlannedItemInput): Promise<PlannedItem>;
  /** Owner or Admin only. */
  updatePlannedItem(
    workspaceId: string,
    itemId: string,
    input: UpdatePlannedItemInput,
  ): Promise<PlannedItem>;
  /** Owner or Admin only. */
  deletePlannedItem(workspaceId: string, itemId: string): Promise<void>;
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
  /**
   * Every entity of the Workspace: one JSON file, or a zip of one CSV file per
   * entity. Owner or Admin only; audited.
   */
  exportWorkspace(workspaceId: string, format: ExportFormat): Promise<DownloadedFile>;
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
 * The API client (ADR-0006). On the web the browser attaches the httpOnly
 * session cookies and this code never sees a token; the only cookie it reads
 * is the CSRF token, which it echoes in a header on every mutating request.
 * Given a token store (the mobile app), it sends the access token as a bearer
 * header instead and, when the API answers 401, refreshes the tokens once and
 * repeats the request.
 */
export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? '';
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const readCookie = options.readCookie ?? documentCookie;
  const tokens = options.tokens;

  async function csrfToken(): Promise<string | undefined> {
    const existing = readCookie(CSRF_COOKIE);
    if (existing) return existing;
    const res = await doFetch(`${baseUrl}/v1/auth/csrf`, { credentials: 'include' });
    if (!res.ok) throw new ApiError(res.status, await readBody(res));
    return readCookie(CSRF_COOKIE);
  }

  /** How a request proves who sends it; the access token used, if any. */
  async function authenticate(
    method: string,
    headers: Record<string, string>,
    anonymous: boolean,
  ): Promise<{ credentials: RequestCredentials; accessToken?: string }> {
    if (!tokens) {
      if (method !== 'GET') {
        const csrf = await csrfToken();
        if (csrf) headers[CSRF_HEADER] = csrf;
      }
      return { credentials: 'include' };
    }
    headers[CLIENT_HEADER] = 'mobile';
    const accessToken = anonymous ? undefined : (await tokens.read())?.accessToken;
    if (!accessToken) return { credentials: 'omit' };
    headers['Authorization'] = `Bearer ${accessToken}`;
    return { credentials: 'omit', accessToken };
  }

  // One refresh at a time: a refresh token is good for one use, and using it
  // twice ends the Signed-in Device.
  let refreshing: Promise<boolean> | undefined;

  /** Gets new tokens after `stale` was refused; whether there are new ones to try. */
  function refreshed(store: TokenStore, stale: string): Promise<boolean> {
    return (refreshing ??= (async () => {
      const held = await store.read();
      if (!held) return false;
      // Another request refreshed meanwhile.
      if (held.accessToken !== stale) return true;
      const res = await doFetch(`${baseUrl}/v1/auth/refresh`, {
        method: 'POST',
        headers: { [CLIENT_HEADER]: 'mobile', 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: toJson({ refreshToken: held.refreshToken }),
      });
      if (res.status === 401) {
        // Used, revoked or expired: this device is signed out.
        await store.write(undefined);
        return false;
      }
      if (!res.ok) return false;
      const { accessToken, refreshToken } = authResultSchema.parse(await readBody(res));
      await store.write({ accessToken, refreshToken });
      return true;
    })().finally(() => {
      refreshing = undefined;
    }));
  }

  /**
   * Sends a request, refreshing the tokens once when the access token was
   * refused. An `anonymous` one (signing in or out) carries no access token.
   */
  async function send(
    method: string,
    path: string,
    body?: unknown,
    { anonymous = false, retry = true } = {},
  ): Promise<Response> {
    const headers: Record<string, string> = {};
    const { credentials, accessToken } = await authenticate(method, headers, anonymous);
    const init: RequestInit = { method, headers, credentials };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = toJson(body);
    }
    const res = await doFetch(`${baseUrl}${path}`, init);
    if (
      res.status === 401 &&
      retry &&
      tokens &&
      accessToken &&
      (await refreshed(tokens, accessToken))
    ) {
      return send(method, path, body, { retry: false });
    }
    return res;
  }

  async function request<T>(
    method: string,
    path: string,
    schema: { parse(value: unknown): T },
    body?: unknown,
    { anonymous = false } = {},
  ): Promise<T> {
    const res = await send(method, path, body, { anonymous });
    const parsed = await readBody(res);
    if (!res.ok) throw new ApiError(res.status, parsed);
    return schema.parse(parsed);
  }

  /** Signs in or up; the mobile app keeps the tokens it is handed. */
  async function signIn(path: string, input: unknown): Promise<Session> {
    if (!tokens) return request('POST', path, sessionSchema, input);
    const { accessToken, refreshToken, ...session } = await request(
      'POST',
      path,
      authResultSchema,
      input,
      { anonymous: true },
    );
    await tokens.write({ accessToken, refreshToken });
    return session;
  }

  async function logout(): Promise<void> {
    if (!tokens) return request('POST', '/v1/auth/logout', noContent);
    const refreshToken = (await tokens.read())?.refreshToken;
    try {
      await request('POST', '/v1/auth/logout', noContent, refreshToken && { refreshToken }, {
        anonymous: true,
      });
    } finally {
      await tokens.write(undefined);
    }
  }

  return {
    register: (input) => signIn('/v1/auth/register', input),
    login: (input) => signIn('/v1/auth/login', input),
    logout,
    verifyEmail: (token) => request('POST', '/v1/auth/email/verify', noContent, { token }),
    resendVerification: () => request('POST', '/v1/auth/email/verification', noContent),
    forgotPassword: (email) => request('POST', '/v1/auth/password/forgot', noContent, { email }),
    resetPassword: (input) => request('POST', '/v1/auth/password/reset', noContent, input),
    me: () => request('GET', '/v1/me', meSchema),
    updateWorkspace: (workspaceId, input) =>
      request('PATCH', `/v1/workspaces/${encodeURIComponent(workspaceId)}`, workspaceSchema, input),
    updatePreferences: (input) =>
      request('PATCH', '/v1/me/preferences', userPreferencesSchema, input),
    getSubscription: () => request('GET', '/v1/me/subscription', subscriptionSchema),
    listMembers: (workspaceId) => request('GET', membersPath(workspaceId), memberListSchema),
    updateMember: (workspaceId, memberId, input) =>
      request(
        'PATCH',
        `${membersPath(workspaceId)}/${encodeURIComponent(memberId)}`,
        memberSchema,
        input,
      ),
    removeMember: (workspaceId, memberId) =>
      request('DELETE', `${membersPath(workspaceId)}/${encodeURIComponent(memberId)}`, noContent),
    transferOwnership: (workspaceId, memberId) =>
      request(
        'POST',
        `${membersPath(workspaceId)}/${encodeURIComponent(memberId)}/transfer-ownership`,
        noContent,
      ),
    accountDeletion: () => request('GET', '/v1/me/deletion', accountDeletionPreviewSchema),
    deleteAccount: async (password) => {
      await request('POST', '/v1/me/deletion', noContent, { password });
      // The User is gone, and with them every token this device held.
      await tokens?.write(undefined);
    },
    listInvitations: (workspaceId) =>
      request('GET', invitationsPath(workspaceId), invitationListSchema),
    createInvitation: (workspaceId, input) =>
      request('POST', invitationsPath(workspaceId), createdInvitationSchema, input),
    revokeInvitation: (workspaceId, invitationId) =>
      request(
        'POST',
        `${invitationsPath(workspaceId)}/${encodeURIComponent(invitationId)}/revoke`,
        noContent,
      ),
    previewInvitation: (token) =>
      request('POST', '/v1/invitations/preview', invitationPreviewSchema, { token }),
    acceptInvitation: (token) =>
      request('POST', '/v1/invitations/accept', acceptedInvitationSchema, { token }),
    listConsents: () => request('GET', '/v1/me/consents', consentListSchema),
    revokeConsent: (consentId) =>
      request('POST', `/v1/me/consents/${encodeURIComponent(consentId)}/revoke`, noContent),
    listAudit: (workspaceId, { before, limit } = {}) => {
      const params = new URLSearchParams();
      if (before) params.set('before', before);
      if (limit !== undefined) params.set('limit', String(limit));
      const search = params.size > 0 ? `?${params}` : '';
      return request(
        'GET',
        `/v1/workspaces/${encodeURIComponent(workspaceId)}/audit${search}`,
        auditPageSchema,
      );
    },
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
    getProjection: (workspaceId, { mode } = {}) =>
      request(
        'GET',
        `${projectionPath(workspaceId)}${mode ? `?mode=${mode}` : ''}`,
        projectionSchema,
      ),
    getReport: (workspaceId, { period } = {}) =>
      request(
        'GET',
        `/v1/workspaces/${encodeURIComponent(workspaceId)}/reports${period ? `?period=${periodParam(period)}` : ''}`,
        reportSchema,
      ),
    getProjectionSettings: (workspaceId) =>
      request('GET', `${projectionPath(workspaceId)}/settings`, projectionSettingsSchema),
    updateProjectionSettings: (workspaceId, input) =>
      request('PATCH', `${projectionPath(workspaceId)}/settings`, projectionSettingsSchema, input),
    listPlannedItems: (workspaceId) =>
      request('GET', plannedItemsPath(workspaceId), plannedItemListSchema),
    createPlannedItem: (workspaceId, input) =>
      request('POST', plannedItemsPath(workspaceId), plannedItemSchema, input),
    updatePlannedItem: (workspaceId, itemId, input) =>
      request('PATCH', plannedItemPath(workspaceId, itemId), plannedItemSchema, input),
    deletePlannedItem: (workspaceId, itemId) =>
      request('DELETE', plannedItemPath(workspaceId, itemId), noContent),
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
    exportWorkspace: async (workspaceId, format) => {
      const res = await send(
        'GET',
        `/v1/workspaces/${encodeURIComponent(workspaceId)}/export?format=${format}`,
      );
      if (!res.ok) throw new ApiError(res.status, await readBody(res));
      return {
        blob: await res.blob(),
        fileName: fileNameOf(res, `daric-export.${exportFiles[format].extension}`),
      };
    },
  };
}

function snapshotsPath(workspaceId: string): string {
  return `/v1/workspaces/${encodeURIComponent(workspaceId)}/net-worth/snapshots`;
}

function projectionPath(workspaceId: string): string {
  return `/v1/workspaces/${encodeURIComponent(workspaceId)}/projection`;
}

function plannedItemsPath(workspaceId: string): string {
  return `${projectionPath(workspaceId)}/planned-items`;
}

function plannedItemPath(workspaceId: string, itemId: string): string {
  return `${plannedItemsPath(workspaceId)}/${encodeURIComponent(itemId)}`;
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

function membersPath(workspaceId: string): string {
  return `/v1/workspaces/${encodeURIComponent(workspaceId)}/members`;
}

function invitationsPath(workspaceId: string): string {
  return `/v1/workspaces/${encodeURIComponent(workspaceId)}/invitations`;
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
