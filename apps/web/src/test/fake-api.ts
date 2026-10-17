import { ApiError, type ApiClient } from '@daric/api-client';
import {
  accountValue,
  amountToWire,
  controllableSpending,
  netWorth,
  netWorthSchema,
  balanceEffect,
  budgetExpenses,
  budgetPeriodOf,
  budgetProgress,
  addDays,
  categoryKinds,
  dayOf,
  dueOccurrences,
  exportFiles,
  isOccurrence,
  nextOccurrence,
  monthPeriodOfDay,
  categoryTree,
  currencyByCode,
  hasRole,
  money,
  rateDayOf,
  toBaseCurrency,
  periodParam,
  plannedItemProblem,
  projectYear,
  projectionSchema,
  periodReport,
  reportSchema,
  trendMonths,
  trendReport,
  mayChangeTransaction,
  mayChangeRole,
  mayManageMember,
  rolesAssignableBy,
  periodDays,
  todayIn,
} from '@daric/core';
import type {
  AccountDeletionPreview,
  AuditEntry,
  Consent,
  Invitation,
  InvitationPreview,
  Member,
  NetWorthSnapshot,
  Account,
  AccountValuation,
  Budget,
  BudgetPeriod,
  Category,
  ExchangeRateWire,
  MonthPeriod,
  DueOccurrence,
  ExportFormat,
  Label,
  Locale,
  PlannedItem,
  ProjectionMode,
  RecurringRule,
  Me,
  Session,
  Subscription,
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
  emailVerified: boolean;
}

type MailedLinkPurpose = 'verify' | 'reset';

/**
 * An in-memory stand-in for the API, as the browser sees it: the session is
 * the server's business, so the fake keeps it and answers `me()` from it.
 */
export function fakeApi({
  signedInAs,
  role = 'OWNER',
  locale = 'fa',
}: { signedInAs?: string; role?: WorkspaceRole; locale?: Locale } = {}) {
  const users = new Map<string, FakeUser>();
  let current: FakeUser | undefined;
  /** Tokens of links "mailed" to Users, until used or replaced; newest last. */
  const mailedLinks = new Map<string, { email: string; purpose: MailedLinkPurpose }>();
  let nextMailToken = 1;
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
  let budgets: StoredBudget[] = [];
  let nextBudgetId = 1;
  let rules: StoredRule[] = [];
  let nextRuleId = 1;
  let rates: StoredRate[] = [];
  let nextRateId = 1;
  let valuations: AccountValuation[] = [];
  let nextValuationId = 1;
  /** In the order taken; listed oldest first by day. */
  const snapshots: NetWorthSnapshot[] = [];
  // Every User has this one Subscription: on the Trial, with billing enabled.
  const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  let subscription: Subscription = {
    billingEnabled: true,
    plan: 'PLUS',
    onTrial: true,
    trialEndsAt: trialEnd,
    expiresAt: trialEnd,
    entitlements: {
      signedInDevices: 3,
      shareWorkspace: true,
      aiAnalysesPerMonth: 30,
      aiAnalysesLeftThisMonth: 30,
    },
  };
  /** Formats of the exports asked for, oldest first. */
  const exports: ExportFormat[] = [];
  /** Occurrences confirmed (with their Transaction) or skipped, by `ruleId|dueOn`. */
  const handled = new Map<string, { transactionId: string | null }>();
  let projectionSettings: { trailingMonths: number; mode: ProjectionMode; version: number } = {
    trailingMonths: 3,
    mode: 'AUTOMATIC',
    version: 0,
  };
  let plannedItems: PlannedItem[] = [];
  let nextPlannedItemId = 1;
  /** Unreachable: every call fails as fetch does when the network is down. */
  let offline = false;
  /** Everyone in the Workspace, in the order they joined; the signed-in User is added below. */
  let members: Member[] = [];
  let nextMemberId = 1;
  /** Newest first, each with the token of its link. */
  const invitations: (Invitation & { token: string })[] = [];
  let nextInvitationId = 1;
  /** Invitations into other Workspaces, by token, as if someone had sent them. */
  const invitationsElsewhere = new Map<
    string,
    { preview: InvitationPreview; workspace: Omit<Workspace, 'role'> }
  >();
  /** Other Workspaces the User has joined. */
  let joined: Workspace[] = [];
  const consents: Consent[] = [];
  let nextConsentId = 1;
  /** Newest first. */
  let auditEntries: AuditEntry[] = [];

  function signedIn(): FakeUser {
    if (!current) throw new ApiError(401, { message: 'Unauthorized' });
    return current;
  }

  /** A User as if registered earlier; they followed the verification link unless told not. */
  function addUser(
    email: string,
    password = testPassword,
    { emailVerified = true, locale = 'fa' }: { emailVerified?: boolean; locale?: Locale } = {},
  ): FakeUser {
    const id = `01900000-0000-7000-8000-${String(nextId++).padStart(12, '0')}`;
    const preferences: UserPreferences =
      locale === 'fa'
        ? { locale, displayCalendar: 'jalali', digits: 'persian', theme: 'system' }
        : { locale, displayCalendar: 'gregorian', digits: 'latin', theme: 'system' };
    const user = { id, email, password, preferences, emailVerified };
    users.set(email, user);
    return user;
  }

  /** "Mails" a link to the User: only the newest token of a purpose works. */
  function mailLink(email: string, purpose: MailedLinkPurpose): string {
    for (const [token, link] of mailedLinks) {
      if (link.email === email && link.purpose === purpose) mailedLinks.delete(token);
    }
    const token = `${purpose}-token-${nextMailToken++}`;
    mailedLinks.set(token, { email, purpose });
    return token;
  }

  /** Uses up a token, returning its User; a 400 as the API gives for a bad link. */
  function followLink(token: string, purpose: MailedLinkPurpose): FakeUser {
    const link = mailedLinks.get(token);
    const user = link?.purpose === purpose ? users.get(link.email) : undefined;
    if (!user) throw new ApiError(400, { message: 'The link is invalid, used or expired' });
    mailedLinks.delete(token);
    return user;
  }

  function lastMailedToken(email: string, purpose: MailedLinkPurpose): string | undefined {
    return [...mailedLinks].findLast(([, l]) => l.email === email && l.purpose === purpose)?.[0];
  }

  function session(user: FakeUser): Session {
    current = user;
    return {
      user: { id: user.id, email: user.email },
      accessTokenExpiresAt: '2026-10-10T10:15:00.000Z',
      refreshTokenExpiresAt: '2026-11-09T10:00:00.000Z',
    };
  }

  if (signedInAs) current = addUser(signedInAs, testPassword, { locale });

  function addMember(email: string, memberRole: WorkspaceRole, userId?: string): Member {
    const member: Member = {
      id: `01900000-0000-7000-8d00-${String(nextMemberId++).padStart(12, '0')}`,
      userId: userId ?? `01900000-0000-7000-8e00-${String(nextMemberId).padStart(12, '0')}`,
      email,
      role: memberRole,
      joinedAt: '2026-10-01T08:00:00.000Z',
    };
    members.push(member);
    return member;
  }
  // The Workspace always has its Owner, who is the signed-in User unless told otherwise.
  if (role !== 'OWNER') addMember('owner@example.com', 'OWNER');
  if (current) addMember(current.email, role, current.id);

  /** The Workspace the call is for; its data is the one Workspace's, whichever it is. */
  function inWorkspace(workspaceId: string, minimum: WorkspaceRole = 'VIEWER'): Workspace {
    signedIn();
    const found = [workspace, ...joined].find((w) => w.id === workspaceId);
    if (!found) throw new ApiError(404, { message: 'Not Found' });
    if (!hasRole(found.role, minimum)) throw new ApiError(403, { message: 'Forbidden' });
    return found;
  }

  function findMember(memberId: string): Member {
    const member = members.find((m) => m.id === memberId);
    if (!member) throw new ApiError(404, { message: 'Not Found' });
    return member;
  }

  const sharingAllowed = () => subscription.entitlements.shareWorkspace;

  /** The one Workspace is shared while anyone but the User belongs to it. */
  function deletionPreview(): AccountDeletionPreview {
    const ref = { id: workspace.id, name: workspace.name };
    const owner = workspace.role === 'OWNER';
    const shared = owner && members.length > 1;
    const bought = subscription.plan === 'PLUS' && !subscription.onTrial;
    return {
      sharedWorkspaces: shared ? [{ ...ref, otherMembers: members.length - 1 }] : [],
      deletedWorkspaces: owner && !shared ? [ref] : [],
      plusForfeitedUntil: subscription.billingEnabled && bought ? subscription.expiresAt : null,
    };
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

  /** Puts a Budget straight into the Workspace, in its Base Currency unless told otherwise. */
  function addBudget(
    fields: Partial<StoredBudget> & Pick<StoredBudget, 'categoryId' | 'period' | 'amount'>,
  ): StoredBudget {
    const budget: StoredBudget = {
      id: `01900000-0000-7000-8b00-${String(nextBudgetId++).padStart(12, '0')}`,
      labelId: null,
      currency: workspace.baseCurrency,
      version: 1,
      ...fields,
    };
    budgets.push(budget);
    return budget;
  }

  /** A Budget with its progress in `month`, as the API computes it. */
  function withProgress(budget: StoredBudget, month: MonthPeriod): Budget {
    const day = dayOf(workspace.calendar, { year: month.year, month: month.month, day: 1 });
    const period = budgetPeriodOf(budget.period, day, workspace.calendar);
    const counted = budgetExpenses(
      { budget, period, calendar: workspace.calendar, categories },
      live(),
    );
    const currencyOf = (t: Transaction) =>
      accounts.find((a) => a.id === t.accountId)?.currency ?? 'IRR';
    let spent = counted
      .filter((t) => currencyOf(t) === budget.currency)
      .reduce((sum, t) => sum + t.amount, 0n);
    let other = counted.filter((t) => currencyOf(t) !== budget.currency);
    let ratesUsed: Budget['progress']['ratesUsed'] = [];
    if (budget.currency === workspace.baseCurrency) {
      const converted = toBaseCurrency(
        counted.map((t) => money(t.amount, currencyByCode(currencyOf(t)))),
        currencyByCode(workspace.baseCurrency),
        currentRates(),
        rateDayOf(period, workspace.calendar, today()),
      );
      spent = converted.total.amount;
      ratesUsed = converted.ratesUsed.map(({ currency, rate, effectiveOn }) => ({
        currency,
        rate,
        effectiveOn,
      }));
      other = other.filter((t) => converted.missing.some((c) => c.code === currencyOf(t)));
    }
    const progress = budgetProgress(budget.amount, spent);
    return {
      ...budget,
      progress: { ...progress, period, ratesUsed, otherCurrencyExpenses: other.length },
    };
  }

  /** Puts an Exchange Rate straight into the Workspace, into its current Base Currency. */
  function addRate(fields: Pick<StoredRate, 'currency' | 'rate' | 'effectiveOn'>): StoredRate {
    const rate: StoredRate = {
      id: `01900000-0000-7000-8d00-${String(nextRateId++).padStart(12, '0')}`,
      baseCurrency: workspace.baseCurrency,
      version: 1,
      ...fields,
    };
    rates.push(rate);
    return rate;
  }

  /** Rates into the current Base Currency, by currency, newest first, as the API lists them. */
  function currentRates(): ExchangeRateWire[] {
    return rates
      .filter((r) => r.baseCurrency === workspace.baseCurrency)
      .sort((a, b) =>
        a.currency === b.currency
          ? b.effectiveOn.localeCompare(a.effectiveOn)
          : a.currency.localeCompare(b.currency),
      )
      .map(({ baseCurrency: _, ...rate }) => ({ ...rate }));
  }

  function findRate(rateId: string): StoredRate {
    const rate = rates.find((r) => r.id === rateId && r.baseCurrency === workspace.baseCurrency);
    if (!rate) throw new ApiError(404, { message: 'Not Found' });
    return rate;
  }

  /** One rate per currency and day, as the API checks it. */
  function assertRateFree(rate: StoredRate) {
    const taken = rates.some(
      (r) =>
        r.id !== rate.id &&
        r.baseCurrency === rate.baseCurrency &&
        r.currency === rate.currency &&
        r.effectiveOn === rate.effectiveOn,
    );
    if (taken) throw new ApiError(409, { message: 'The currency already has a rate on this day' });
  }

  /** Puts a Valuation straight into the Workspace, as if entered earlier. */
  function addValuation(
    fields: Pick<AccountValuation, 'accountId' | 'amount' | 'valuedOn'>,
  ): AccountValuation {
    const valuation: AccountValuation = {
      id: `01900000-0000-7000-8e00-${String(nextValuationId++).padStart(12, '0')}`,
      version: 1,
      ...fields,
    };
    valuations.push(valuation);
    return valuation;
  }
  /** Puts a Net Worth Snapshot in, as if taken earlier; no breakdown unless given. */
  function addSnapshot(
    fields: Pick<NetWorthSnapshot, 'day' | 'total'> & Partial<NetWorthSnapshot>,
  ): NetWorthSnapshot {
    const snapshot: NetWorthSnapshot = {
      id: `01900000-0000-7000-f000-${String(snapshots.length + 1).padStart(12, '0')}`,
      kind: 'AUTO',
      takenAt: new Date().toISOString(),
      baseCurrency: workspace.baseCurrency,
      assets: fields.total > 0n ? fields.total : 0n,
      liabilities: fields.total < 0n ? -fields.total : 0n,
      byCurrency: [],
      accounts: [],
      ratesUsed: [],
      missing: [],
      ...fields,
    };
    snapshots.push(snapshot);
    return snapshot;
  }

  function findAccount(accountId: string): Account {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) throw new ApiError(404, { message: 'Not Found' });
    return account;
  }

  function findValuation(accountId: string, valuationId: string): AccountValuation {
    const valuation = valuations.find((v) => v.id === valuationId && v.accountId === accountId);
    if (!valuation) throw new ApiError(404, { message: 'Not Found' });
    return valuation;
  }

  /** One Valuation per Account and day, as the API checks it. */
  function assertValuationFree(valuation: AccountValuation) {
    const taken = valuations.some(
      (v) =>
        v.id !== valuation.id &&
        v.accountId === valuation.accountId &&
        v.valuedOn === valuation.valuedOn,
    );
    if (taken)
      throw new ApiError(409, { message: 'The Account already has a Valuation on this day' });
  }

  function findBudget(budgetId: string): StoredBudget {
    const budget = budgets.find((b) => b.id === budgetId);
    if (!budget) throw new ApiError(404, { message: 'Not Found' });
    return budget;
  }

  /** As the API checks a Budget's Category and Label, and one per Category, Label and Period. */
  function assertBudgetFits(budget: StoredBudget, current?: StoredBudget) {
    const category = categories.find((c) => c.id === budget.categoryId);
    const keptCategory = category?.id === current?.categoryId;
    if (category?.kind !== 'EXPENSE' || (category.archived && !keptCategory)) {
      throw new ApiError(400, { message: 'Bad Category' });
    }
    if (budget.labelId !== null) {
      const label = labels.find((l) => l.id === budget.labelId);
      if (!label || (label.archived && label.id !== current?.labelId)) {
        throw new ApiError(400, { message: 'Bad Label' });
      }
    }
    const taken = budgets.some(
      (b) =>
        b.id !== budget.id &&
        b.categoryId === budget.categoryId &&
        b.labelId === budget.labelId &&
        b.period === budget.period,
    );
    if (taken) throw new ApiError(409, { message: 'Taken' });
  }

  /** Puts a Recurring Rule straight into the Workspace, as if made earlier. */
  /** Puts a Planned Item straight into the Workspace, as if created earlier. */
  function addPlannedItem(
    fields: Partial<PlannedItem> &
      Pick<PlannedItem, 'name' | 'kind' | 'type' | 'amount' | 'startOn'>,
  ): PlannedItem {
    const item: PlannedItem = {
      id: `01900000-0000-7000-8f00-${String(nextPlannedItemId++).padStart(12, '0')}`,
      categoryId: null,
      currency: workspace.baseCurrency,
      endOn: null,
      version: 1,
      ...fields,
    };
    plannedItems.push(item);
    return item;
  }

  function findPlannedItem(itemId: string): PlannedItem {
    const item = plannedItems.find((p) => p.id === itemId);
    if (!item) throw new ApiError(404, { message: 'Not Found' });
    return item;
  }

  /** As the API checks a Planned Item's fields and its Category. */
  function assertPlannedItemFits(item: PlannedItem, current?: PlannedItem) {
    const problem = plannedItemProblem(item);
    if (problem) throw new ApiError(400, { message: problem });
    if (item.categoryId === null || item.categoryId === current?.categoryId) return;
    const category = categories.find((c) => c.id === item.categoryId);
    if (!category || category.kind !== item.type || category.archived) {
      throw new ApiError(400, { message: 'Invalid Category' });
    }
  }

  function addRule(
    fields: Partial<StoredRule> &
      Pick<StoredRule, 'name' | 'type' | 'accountId' | 'categoryId' | 'amount' | 'startOn'>,
  ): StoredRule {
    const rule: StoredRule = {
      id: `01900000-0000-7000-8e00-${String(nextRuleId++).padStart(12, '0')}`,
      frequency: 'MONTHLY',
      interval: 1,
      endOn: null,
      autoPost: false,
      archived: false,
      createdBy: current?.id ?? null,
      version: 1,
      ...fields,
    };
    rules.push(rule);
    return rule;
  }

  const today = () => todayIn(new Date(), workspace.timezone);

  function ruleWire({ createdBy: _, ...rule }: StoredRule): RecurringRule {
    return {
      ...rule,
      nextDueOn: rule.archived
        ? null
        : nextOccurrence(rule, workspace.calendar, addDays(today(), 1)),
    };
  }

  function findRule(ruleId: string): StoredRule {
    const rule = rules.find((r) => r.id === ruleId);
    if (!rule) throw new ApiError(404, { message: 'Not Found' });
    return rule;
  }

  const handledDays = (ruleId: string) =>
    [...handled.keys()].filter((key) => key.startsWith(`${ruleId}|`)).map((k) => k.slice(-10));

  /** As the API checks a rule's Account and Category; archived ones it has may stay. */
  function assertRuleFits(rule: StoredRule, current?: StoredRule) {
    const account = accounts.find((a) => a.id === rule.accountId);
    if (!account || (account.archived && account.id !== current?.accountId)) {
      throw new ApiError(400, { message: 'Bad Account' });
    }
    const category = categories.find((c) => c.id === rule.categoryId);
    if (
      category?.kind !== rule.type ||
      (category.archived && category.id !== current?.categoryId)
    ) {
      throw new ApiError(400, { message: 'Bad Category' });
    }
    if (rule.endOn !== null && rule.endOn < rule.startOn) {
      throw new ApiError(400, { message: 'Ends before it starts' });
    }
  }

  /** Records an occurrence as the API does: on the day it fell due, noted with the rule's name. */
  function recordOccurrence(rule: StoredRule, dueOn: string, amount = rule.amount) {
    const account = accounts.find((a) => a.id === rule.accountId);
    const category = categories.find((c) => c.id === rule.categoryId);
    if (account?.archived || category?.archived) {
      throw new ApiError(400, { message: 'Archived' });
    }
    const transaction = addTransaction({
      type: rule.type,
      accountId: rule.accountId,
      categoryId: rule.categoryId,
      amount,
      occurredOn: dueOn,
      note: rule.name,
      createdBy: rule.autoPost ? rule.createdBy : (current?.id ?? null),
    });
    handled.set(`${rule.id}|${dueOn}`, { transactionId: transaction.id });
    return transaction;
  }

  /** 404 for a rule that is missing; 400 unless `dueOn` is due and not handled. */
  function dueOccurrence(ruleId: string, dueOn: string) {
    const rule = findRule(ruleId);
    const done = handled.get(`${ruleId}|${dueOn}`);
    if (done) return { rule, done };
    if (rule.archived || dueOn > today() || !isOccurrence(rule, workspace.calendar, dueOn)) {
      throw new ApiError(400, { message: 'Not a Due Occurrence' });
    }
    return { rule, done: undefined };
  }

  const currentMonth = () =>
    monthPeriodOfDay(todayIn(new Date(), workspace.timezone), workspace.calendar);

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

  const endpoints: ApiClient = {
    async register({ email, password, locale }) {
      if (users.has(email)) throw new ApiError(409, { message: 'Email is already registered' });
      const user = addUser(email, password, { emailVerified: false, ...(locale && { locale }) });
      mailLink(email, 'verify');
      return session(user);
    },
    async login({ email, password }) {
      const user = users.get(email);
      if (!user || user.password !== password) {
        throw new ApiError(401, { message: 'Email or password is incorrect' });
      }
      return session(user);
    },
    async logout() {
      current = undefined;
    },
    async verifyEmail(token) {
      followLink(token, 'verify').emailVerified = true;
    },
    async resendVerification() {
      const user = signedIn();
      if (user.emailVerified) throw new ApiError(409, { message: 'Email is already verified' });
      mailLink(user.email, 'verify');
    },
    async forgotPassword(email) {
      if (users.has(email)) mailLink(email, 'reset');
    },
    async resetPassword({ token, password }) {
      const user = followLink(token, 'reset');
      user.password = password;
      user.emailVerified = true;
      // Every Signed-in Device ends; this browser's access cookie lives a little longer.
    },
    async me(): Promise<Me> {
      const user = signedIn();
      return {
        user: { id: user.id, email: user.email, emailVerified: user.emailVerified },
        preferences: { ...user.preferences },
        workspaces: [{ ...workspace }, ...joined.map((w) => ({ ...w }))],
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
    async listBudgets(workspaceId, { month = currentMonth() } = {}) {
      inWorkspace(workspaceId);
      return budgets.map((b) => withProgress(b, month));
    },
    async createBudget(workspaceId, { labelId = null, ...input }) {
      inWorkspace(workspaceId, 'ADMIN');
      const draft = { id: '', labelId, currency: workspace.baseCurrency, version: 1, ...input };
      assertBudgetFits(draft);
      return withProgress(addBudget({ ...input, labelId }), currentMonth());
    },
    async updateBudget(workspaceId, budgetId, input) {
      inWorkspace(workspaceId, 'ADMIN');
      const current = findBudget(budgetId);
      const updated = { ...current, ...input, version: current.version + 1 };
      assertBudgetFits(updated, current);
      budgets = budgets.map((b) => (b.id === budgetId ? updated : b));
      return withProgress(updated, currentMonth());
    },
    async deleteBudget(workspaceId, budgetId) {
      inWorkspace(workspaceId, 'ADMIN');
      findBudget(budgetId);
      budgets = budgets.filter((b) => b.id !== budgetId);
    },
    async listExchangeRates(workspaceId) {
      inWorkspace(workspaceId);
      return currentRates();
    },
    async createExchangeRate(workspaceId, input) {
      inWorkspace(workspaceId, 'ADMIN');
      if (input.currency === workspace.baseCurrency) {
        throw new ApiError(400, { message: 'The Base Currency needs no rate' });
      }
      assertRateFree({ id: '', baseCurrency: workspace.baseCurrency, version: 1, ...input });
      const { baseCurrency: _, ...rate } = addRate(input);
      return { ...rate };
    },
    async updateExchangeRate(workspaceId, rateId, input) {
      inWorkspace(workspaceId, 'ADMIN');
      const current = findRate(rateId);
      const updated = { ...current, ...input, version: current.version + 1 };
      assertRateFree(updated);
      rates = rates.map((r) => (r.id === rateId ? updated : r));
      const { baseCurrency: _, ...rate } = updated;
      return { ...rate };
    },
    async deleteExchangeRate(workspaceId, rateId) {
      inWorkspace(workspaceId, 'ADMIN');
      findRate(rateId);
      rates = rates.filter((r) => r.id !== rateId);
    },
    async listValuations(workspaceId, accountId) {
      inWorkspace(workspaceId);
      findAccount(accountId);
      return valuations
        .filter((v) => v.accountId === accountId)
        .sort((a, b) => b.valuedOn.localeCompare(a.valuedOn))
        .map((v) => ({ ...v }));
    },
    async createValuation(workspaceId, accountId, input) {
      inWorkspace(workspaceId, 'ADMIN');
      if (findAccount(accountId).archived) {
        throw new ApiError(400, { message: 'The Account is archived' });
      }
      assertValuationFree({ id: '', accountId, version: 1, ...input });
      return { ...addValuation({ accountId, ...input }) };
    },
    async updateValuation(workspaceId, accountId, valuationId, input) {
      inWorkspace(workspaceId, 'ADMIN');
      const current = findValuation(accountId, valuationId);
      const updated = { ...current, ...input, version: current.version + 1 };
      assertValuationFree(updated);
      valuations = valuations.map((v) => (v.id === valuationId ? updated : v));
      return { ...updated };
    },
    async deleteValuation(workspaceId, accountId, valuationId) {
      inWorkspace(workspaceId, 'ADMIN');
      findValuation(accountId, valuationId);
      valuations = valuations.filter((v) => v.id !== valuationId);
    },
    async getNetWorth(workspaceId) {
      inWorkspace(workspaceId);
      const day = today();
      const base = currencyByCode(workspace.baseCurrency);
      const valued = accounts.map(withBalance).map((account) => ({
        account,
        ...accountValue(
          money(account.balance, currencyByCode(account.currency)),
          valuations.filter((v) => v.accountId === account.id),
          day,
        ),
      }));
      const result = netWorth(
        valued.map(({ account, value }) => ({ id: account.id, class: account.class, value })),
        base,
        currentRates(),
        day,
      );
      const wire = (m: { amount: bigint }) => amountToWire(m.amount);
      // Through the schema, as the client reads the API's answer.
      return netWorthSchema.parse({
        day,
        baseCurrency: base.code,
        total: wire(result.total),
        assets: wire(result.assets),
        liabilities: wire(result.liabilities),
        byCurrency: result.byCurrency.map((c) => ({
          currency: c.currency.code,
          assets: wire(c.assets),
          liabilities: wire(c.liabilities),
          net: wire(c.net),
        })),
        accounts: valued.map(({ account, value, valuedOn }, i) => {
          const inBase = result.accounts[i]?.inBase;
          return {
            accountId: account.id,
            name: account.name,
            class: account.class,
            currency: account.currency,
            archived: account.archived,
            value: wire(value),
            valuedOn,
            inBase: inBase ? wire(inBase) : null,
          };
        }),
        ratesUsed: result.ratesUsed.map(({ currency, rate, effectiveOn }) => ({
          currency,
          rate,
          effectiveOn,
        })),
        missing: result.missing.map((c) => c.code),
      });
    },
    async listNetWorthSnapshots(workspaceId) {
      inWorkspace(workspaceId);
      return [...snapshots]
        .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
        .map((s) => ({
          id: s.id,
          kind: s.kind,
          day: s.day,
          takenAt: s.takenAt,
          baseCurrency: s.baseCurrency,
          total: s.total,
          assets: s.assets,
          liabilities: s.liabilities,
          missing: s.missing,
        }));
    },
    async takeNetWorthSnapshot(workspaceId) {
      inWorkspace(workspaceId, 'MEMBER');
      const now = await endpoints.getNetWorth(workspaceId);
      return addSnapshot({ ...now, kind: 'MANUAL' });
    },
    async getNetWorthSnapshot(workspaceId, snapshotId) {
      inWorkspace(workspaceId);
      const snapshot = snapshots.find((s) => s.id === snapshotId);
      if (!snapshot) throw new ApiError(404, { message: 'Not Found' });
      return snapshot;
    },
    async listRecurringRules(workspaceId, { includeArchived = false } = {}) {
      inWorkspace(workspaceId);
      return rules.filter((r) => includeArchived || !r.archived).map(ruleWire);
    },
    async createRecurringRule(workspaceId, input) {
      inWorkspace(workspaceId, 'ADMIN');
      const draft: StoredRule = {
        id: '',
        interval: 1,
        endOn: null,
        autoPost: false,
        archived: false,
        createdBy: null,
        version: 1,
        ...input,
      };
      assertRuleFits(draft);
      const { id: _, ...fields } = draft;
      return ruleWire(addRule({ ...fields, createdBy: signedIn().id }));
    },
    async updateRecurringRule(workspaceId, ruleId, input) {
      inWorkspace(workspaceId, 'ADMIN');
      const current = findRule(ruleId);
      const updated = { ...current, ...input, version: current.version + 1 };
      assertRuleFits(updated, current);
      rules = rules.map((r) => (r.id === ruleId ? updated : r));
      return ruleWire(updated);
    },
    async listDueOccurrences(workspaceId) {
      inWorkspace(workspaceId);
      let autoPosted = 0;
      const occurrences: DueOccurrence[] = [];
      for (const rule of rules.filter((r) => !r.archived)) {
        const days = dueOccurrences(rule, workspace.calendar, today(), handledDays(rule.id));
        const account = accounts.find((a) => a.id === rule.accountId);
        const category = categories.find((c) => c.id === rule.categoryId);
        if (rule.autoPost && !account?.archived && !category?.archived) {
          // Only a Member or above records them; a Viewer's list leaves them out.
          if (hasRole(workspace.role, 'MEMBER')) {
            days.forEach((dueOn) => recordOccurrence(rule, dueOn));
            autoPosted += days.length;
          }
          continue;
        }
        const { id: ruleId, name, type, accountId, categoryId, amount } = rule;
        occurrences.push(
          ...days.map((dueOn) => ({ ruleId, dueOn, name, type, accountId, categoryId, amount })),
        );
      }
      occurrences.sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0));
      return { occurrences, autoPosted };
    },
    async confirmOccurrence(workspaceId, ruleId, dueOn, { amount } = {}) {
      inWorkspace(workspaceId, 'MEMBER');
      const { rule, done } = dueOccurrence(ruleId, dueOn);
      if (done) {
        const transaction = transactions.find((t) => t.id === done.transactionId);
        if (!transaction) throw new ApiError(409, { message: 'Skipped' });
        return { ...transaction };
      }
      return { ...recordOccurrence(rule, dueOn, amount) };
    },
    async skipOccurrence(workspaceId, ruleId, dueOn) {
      inWorkspace(workspaceId, 'MEMBER');
      const { done } = dueOccurrence(ruleId, dueOn);
      if (done?.transactionId) throw new ApiError(409, { message: 'Confirmed' });
      handled.set(`${ruleId}|${dueOn}`, { transactionId: null });
    },
    async getProjection(workspaceId, { mode = projectionSettings.mode } = {}) {
      inWorkspace(workspaceId);
      const day = today();
      const currencyOf = (accountId: string) =>
        currencyByCode(
          accounts.find((a) => a.id === accountId)?.currency ?? workspace.baseCurrency,
        );
      const recurringIds = new Set([...handled.values()].map((h) => h.transactionId));
      const recorded = live();
      const result = projectYear({
        calendar: workspace.calendar,
        today: day,
        mode,
        trailingMonths: projectionSettings.trailingMonths,
        base: currencyByCode(workspace.baseCurrency),
        rates: currentRates(),
        transactions: recorded.map((t) => ({
          type: t.type,
          categoryId: t.type === 'TRANSFER' ? null : t.categoryId,
          amount: money(t.amount, currencyOf(t.accountId)),
          occurredOn: t.occurredOn,
          recurring: recurringIds.has(t.id),
        })),
        rules: rules
          .filter((r) => !r.archived)
          .map((r) => ({ ...r, amount: money(r.amount, currencyOf(r.accountId)) })),
        plannedItems: plannedItems.map((p) => ({
          ...p,
          amount: money(p.amount, currencyByCode(p.currency)),
        })),
        historyFrom: recorded.map((t) => t.occurredOn).sort()[0] ?? null,
      });
      const figures = (
        f: Record<
          'actual' | 'average' | 'variable' | 'recurring' | 'planned' | 'projected',
          bigint
        >,
      ) => ({
        actual: amountToWire(f.actual),
        average: amountToWire(f.average),
        variable: amountToWire(f.variable),
        recurring: amountToWire(f.recurring),
        planned: amountToWire(f.planned),
        projected: amountToWire(f.projected),
      });
      // Through the schema, as the client reads the API's answer.
      return projectionSchema.parse({
        ...result,
        baseCurrency: workspace.baseCurrency,
        window: result.window.map(periodParam),
        income: figures(result.income),
        expense: figures(result.expense),
        categories: result.categories.map((c) => ({
          categoryId: c.categoryId,
          type: c.type,
          ...figures(c),
        })),
        recurring: result.recurring.map((r) => ({ ...r, total: amountToWire(r.total) })),
        planned: result.planned.map((p) => ({ ...p, total: amountToWire(p.total) })),
        ratesUsed: result.ratesUsed.map(({ currency, rate, effectiveOn }) => ({
          currency,
          rate,
          effectiveOn,
        })),
      });
    },
    async exportWorkspace(workspaceId, format) {
      inWorkspace(workspaceId, 'ADMIN');
      exports.push(format);
      const { extension, contentType } = exportFiles[format];
      return {
        blob: new Blob([format === 'csv' ? 'PK' : '{}'], { type: contentType }),
        fileName: `daric-export-${today()}.${extension}`,
      };
    },
    async getReport(workspaceId, { period } = {}) {
      inWorkspace(workspaceId);
      const day = today();
      const reported = period ?? monthPeriodOfDay(day, workspace.calendar);
      const months = trendMonths(reported, workspace.calendar, day);
      const currencyOf = (accountId: string) =>
        currencyByCode(
          accounts.find((a) => a.id === accountId)?.currency ?? workspace.baseCurrency,
        );
      const input = {
        calendar: workspace.calendar,
        today: day,
        base: currencyByCode(workspace.baseCurrency),
        rates: currentRates(),
        transactions: live().map((t) => ({
          type: t.type,
          categoryId: t.type === 'TRANSFER' ? null : t.categoryId,
          amount: money(t.amount, currencyOf(t.accountId)),
          occurredOn: t.occurredOn,
          labelIds: t.type === 'TRANSFER' ? [] : t.labelIds,
        })),
      };
      const report = periodReport({ ...input, period: reported, categories });
      const trend = trendReport({ ...input, months });
      const controllable = controllableSpending({
        ...input,
        period: reported,
        categories,
        months,
        controllableLabelIds: labels.filter((l) => l.controllable).map((l) => l.id),
      });
      const wire = (amount: bigint) => amountToWire(amount);
      // Through the schema, as the client reads the API's answer.
      return reportSchema.parse({
        ...report,
        period: periodParam(reported),
        baseCurrency: workspace.baseCurrency,
        income: wire(report.income),
        expense: wire(report.expense),
        net: wire(report.net),
        categories: report.categories.map((line) => ({
          ...line,
          total: wire(line.total),
          own: wire(line.own),
          children: line.children.map((child) => ({ ...child, total: wire(child.total) })),
        })),
        labels: report.labels.map((line) => ({
          ...line,
          income: wire(line.income),
          expense: wire(line.expense),
        })),
        unlabeled: {
          income: wire(report.unlabeled.income),
          expense: wire(report.unlabeled.expense),
        },
        ratesUsed: report.ratesUsed.map(({ currency, rate, effectiveOn }) => ({
          currency,
          rate,
          effectiveOn,
        })),
        trend: trend.map((point) => ({
          ...point,
          month: periodParam(point.month),
          income: wire(point.income),
          expense: wire(point.expense),
          net: wire(point.net),
        })),
        controllable: {
          ...controllable,
          expense: wire(controllable.expense),
          labels: controllable.labels.map((line) => ({ ...line, expense: wire(line.expense) })),
          trend: controllable.trend.map((point) => ({
            month: periodParam(point.month),
            expense: wire(point.expense),
            missing: point.missing,
          })),
          monthlyAverage: wire(controllable.monthlyAverage),
        },
      });
    },
    async getProjectionSettings(workspaceId) {
      inWorkspace(workspaceId);
      return { ...projectionSettings };
    },
    async updateProjectionSettings(workspaceId, input) {
      inWorkspace(workspaceId, 'ADMIN');
      projectionSettings = {
        ...projectionSettings,
        ...input,
        version: projectionSettings.version + 1,
      };
      return { ...projectionSettings };
    },
    async listPlannedItems(workspaceId) {
      inWorkspace(workspaceId);
      return plannedItems.map((p) => ({ ...p }));
    },
    async createPlannedItem(workspaceId, { categoryId = null, endOn = null, ...input }) {
      inWorkspace(workspaceId, 'ADMIN');
      const draft = {
        id: '',
        currency: workspace.baseCurrency,
        version: 1,
        categoryId,
        endOn,
        ...input,
      };
      assertPlannedItemFits(draft);
      return { ...addPlannedItem({ ...input, categoryId, endOn }) };
    },
    async updatePlannedItem(workspaceId, itemId, input) {
      inWorkspace(workspaceId, 'ADMIN');
      const current = findPlannedItem(itemId);
      const updated = { ...current, ...input, version: current.version + 1 };
      assertPlannedItemFits(updated, current);
      plannedItems = plannedItems.map((p) => (p.id === itemId ? updated : p));
      return { ...updated };
    },
    async deletePlannedItem(workspaceId, itemId) {
      inWorkspace(workspaceId, 'ADMIN');
      findPlannedItem(itemId);
      plannedItems = plannedItems.filter((p) => p.id !== itemId);
    },
    async updatePreferences(input) {
      const user = signedIn();
      user.preferences = { ...user.preferences, ...input };
      return { ...user.preferences };
    },
    async getSubscription() {
      signedIn();
      return structuredClone(subscription);
    },
    async listMembers(workspaceId) {
      inWorkspace(workspaceId);
      return structuredClone(members);
    },
    async updateMember(workspaceId, memberId, input) {
      const { role: actor } = inWorkspace(workspaceId, 'ADMIN');
      const member = findMember(memberId);
      if (member.userId === signedIn().id || !mayChangeRole(actor, member.role, input.role)) {
        throw new ApiError(403, { message: 'Forbidden' });
      }
      member.role = input.role;
      return { ...member };
    },
    async removeMember(workspaceId, memberId) {
      const { role: actor } = inWorkspace(workspaceId);
      const member = findMember(memberId);
      const leaving = member.userId === signedIn().id;
      const allowed = leaving
        ? member.role !== 'OWNER'
        : hasRole(actor, 'ADMIN') && mayManageMember(actor, member.role);
      if (!allowed) throw new ApiError(403, { message: 'Forbidden' });
      members = members.filter((m) => m.id !== memberId);
      if (leaving) joined = joined.filter((w) => w.id !== workspaceId);
    },
    async transferOwnership(workspaceId, memberId) {
      const { role: actor } = inWorkspace(workspaceId, 'OWNER');
      const member = findMember(memberId);
      const user = signedIn();
      if (actor !== 'OWNER' || member.userId === user.id) {
        throw new ApiError(403, { message: 'Forbidden' });
      }
      members = members.map((m) =>
        m.id === memberId
          ? { ...m, role: 'OWNER' }
          : m.userId === user.id
            ? { ...m, role: 'ADMIN' }
            : m,
      );
      workspace = { ...workspace, role: 'ADMIN' };
    },
    async accountDeletion() {
      signedIn();
      return deletionPreview();
    },
    async deleteAccount(password) {
      const user = signedIn();
      if (password !== user.password) {
        throw new ApiError(403, { message: 'Forbidden', reason: 'WRONG_PASSWORD' });
      }
      const { sharedWorkspaces } = deletionPreview();
      if (sharedWorkspaces.length > 0) {
        throw new ApiError(409, { reason: 'OWNS_SHARED_WORKSPACE', sharedWorkspaces });
      }
      users.delete(user.email);
      current = undefined;
    },
    async listInvitations(workspaceId) {
      inWorkspace(workspaceId, 'ADMIN');
      return {
        sharingAllowed: sharingAllowed(),
        invitations: invitations.map(({ token: _, ...invitation }) => ({ ...invitation })),
      };
    },
    async createInvitation(workspaceId, input) {
      const { role: actor } = inWorkspace(workspaceId, 'ADMIN');
      if (!rolesAssignableBy(actor).includes(input.role)) {
        throw new ApiError(403, { message: 'Forbidden' });
      }
      if (!sharingAllowed()) throw new ApiError(402, { message: 'Payment Required' });
      const email = input.email ?? null;
      const taken =
        email !== null &&
        (members.some((m) => m.email === email) ||
          invitations.some((i) => i.email === email && i.status === 'PENDING'));
      if (taken) throw new ApiError(409, { message: 'Conflict' });
      const token = `invitation-token-${nextInvitationId}`;
      const invitation = {
        id: `01900000-0000-7000-8f00-${String(nextInvitationId++).padStart(12, '0')}`,
        email,
        role: input.role,
        status: 'PENDING' as const,
        invitedByEmail: signedIn().email,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        token,
      };
      invitations.unshift(invitation);
      const { token: _, ...shown } = invitation;
      return { ...shown, link: `https://daric.example/invitation?token=${token}` };
    },
    async revokeInvitation(workspaceId, invitationId) {
      const { role: actor } = inWorkspace(workspaceId, 'ADMIN');
      const invitation = invitations.find((i) => i.id === invitationId);
      if (!invitation) throw new ApiError(404, { message: 'Not Found' });
      if (!mayManageMember(actor, invitation.role)) {
        throw new ApiError(403, { message: 'Forbidden' });
      }
      if (invitation.status !== 'PENDING') throw new ApiError(409, { message: 'Conflict' });
      invitation.status = 'REVOKED';
    },
    async previewInvitation(token) {
      signedIn();
      const found = invitationsElsewhere.get(token);
      if (!found) throw new ApiError(400, { message: 'The invitation is invalid' });
      return { ...found.preview };
    },
    async acceptInvitation(token) {
      const user = signedIn();
      const found = invitationsElsewhere.get(token);
      if (!found) throw new ApiError(400, { message: 'The invitation is invalid' });
      if (!user.emailVerified) {
        throw new ApiError(403, { message: 'Forbidden', reason: 'EMAIL_NOT_VERIFIED' });
      }
      if (found.preview.email && found.preview.email !== user.email) {
        throw new ApiError(403, { message: 'Forbidden', reason: 'EMAIL_MISMATCH' });
      }
      if (joined.some((w) => w.id === found.workspace.id)) {
        throw new ApiError(409, { message: 'Conflict' });
      }
      invitationsElsewhere.delete(token);
      const added: Workspace = { ...found.workspace, role: found.preview.role };
      joined.push(added);
      consents.unshift({
        id: `01900000-0000-7000-8a00-${String(nextConsentId++).padStart(12, '0')}`,
        purpose: 'WORKSPACE_SHARING',
        workspace: { id: added.id, name: added.name },
        policyVersion: '2026-10-14',
        grantedAt: new Date().toISOString(),
        revokedAt: null,
      });
      return { workspace: { ...added } };
    },
    async listConsents() {
      signedIn();
      return structuredClone(consents);
    },
    async revokeConsent(consentId) {
      signedIn();
      const consent = consents.find((c) => c.id === consentId);
      if (!consent) throw new ApiError(404, { message: 'Not Found' });
      if (consent.revokedAt) return;
      consent.revokedAt = new Date().toISOString();
      const left = consent.workspace?.id;
      joined = joined.filter((w) => w.id !== left);
    },
    async listAudit(workspaceId, { before, limit = 50 } = {}) {
      inWorkspace(workspaceId, 'OWNER');
      const start = before ? auditEntries.findIndex((e) => e.id === before) + 1 : 0;
      const page = auditEntries.slice(start, start + limit);
      const more = start + limit < auditEntries.length;
      return { entries: structuredClone(page), next: more ? (page.at(-1)?.id ?? null) : null };
    },
  };

  // Every call fails while offline, as fetch does, before reaching the fake server.
  const api = Object.fromEntries(
    Object.entries(endpoints).map(([name, call]: [string, (...args: never[]) => unknown]) => [
      name,
      (...args: never[]) => {
        if (offline) return Promise.reject(new TypeError('Failed to fetch'));
        return call(...args);
      },
    ]),
  ) as unknown as ApiClient;

  return {
    api,
    /** Cuts the network (or brings it back); see `goOffline` in `test/network`. */
    setOffline: (value: boolean) => void (offline = value),
    addUser,
    addAccount,
    accounts: () => accounts,
    addCategory,
    addTransaction,
    addLabel,
    /** As stored, archived ones included. */
    labels: () => labels,
    addBudget,
    /** As stored, without progress. */
    budgets: () => budgets,
    addRule,
    /** As stored, archived ones included. */
    rules: () => rules,
    addRate,
    /** As stored, into any Base Currency. */
    rates: () => rates,
    addValuation,
    valuations: () => valuations,
    addSnapshot,
    projectionSettings: () => projectionSettings,
    /** Sets the Workspace's Projection mode, as if an Admin chose it earlier. */
    setProjectionMode: (mode: ProjectionMode) =>
      void (projectionSettings = { ...projectionSettings, mode }),
    addPlannedItem,
    plannedItems: () => plannedItems,
    /** In the order recorded, deleted ones left out. */
    transactions: () => live(),
    /** Ids of those deleted softly. */
    deletedTransactions: () => [...deleted],
    exports: () => [...exports],
    /** In the API's list order, archived ones included. */
    categories: () => inTreeOrder(categories),
    signedInUser: () => current?.email,
    /** Whether a User with this email exists. */
    hasUser: (email: string) => users.has(email),
    /** The token in the newest unused link mailed to `email`, if any. */
    verificationToken: (email: string) => lastMailedToken(email, 'verify'),
    resetToken: (email: string) => lastMailedToken(email, 'reset'),
    /** Whether the User has followed a verification (or reset) link. */
    emailVerified: (email: string) => users.get(email)?.emailVerified,
    workspace: () => workspace,
    preferences: () => signedIn().preferences,
    /** Sets what the server answers about the User's Plan. */
    setSubscription: (value: Subscription) => void (subscription = value),
    /** Puts someone else into the Workspace, as if they had joined earlier. */
    addMember: (email: string, memberRole: WorkspaceRole) => addMember(email, memberRole),
    members: () => members,
    invitations: () => invitations,
    /** An Invitation into another Workspace, as if mailed to the User; returns its token. */
    inviteElsewhere: ({
      workspaceName,
      role: invitedRole,
      email = null,
      invitedByEmail = 'reza@example.com',
    }: {
      workspaceName: string;
      role: InvitationPreview['role'];
      email?: string | null;
      invitedByEmail?: string | null;
    }) => {
      const token = `elsewhere-token-${invitationsElsewhere.size + 1}`;
      invitationsElsewhere.set(token, {
        preview: {
          workspaceName,
          role: invitedRole,
          email,
          invitedByEmail,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
        workspace: {
          ...workspace,
          id: `01900000-0000-7000-9000-${String(invitationsElsewhere.size + 2).padStart(12, '0')}`,
          name: workspaceName,
        },
      });
      return token;
    },
    joinedWorkspaces: () => joined,
    consents: () => consents,
    /** Sets the audit log, newest first. */
    setAudit: (entries: AuditEntry[]) => void (auditEntries = entries),
  };
}
export type FakeApi = ReturnType<typeof fakeApi>;

/** A Budget as the fake keeps it; progress is worked out on every read. */
interface StoredBudget {
  id: string;
  categoryId: string;
  labelId: string | null;
  period: BudgetPeriod;
  amount: bigint;
  currency: string;
  version: number;
}

/** An Exchange Rate as the fake keeps it, with the Base Currency it is into. */
type StoredRate = ExchangeRateWire & { baseCurrency: string };

/** A Recurring Rule as the fake keeps it; the next occurrence is worked out on every read. */
type StoredRule = Omit<RecurringRule, 'nextDueOn'> & { createdBy: string | null };

type Defaulted = 'id' | 'note' | 'createdBy' | 'labelIds' | 'version';

type Draft<T> = T extends unknown
  ? Omit<T, Defaulted> & Partial<Pick<T, Defaulted & keyof T>>
  : never;

/** A Transaction to put in, its bookkeeping fields optional. */
type TransactionDraft = Draft<Transaction>;
