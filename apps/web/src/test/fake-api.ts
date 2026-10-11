import { ApiError, type ApiClient } from '@daric/api-client';
import {
  balanceEffect,
  budgetExpenses,
  budgetPeriodOf,
  budgetProgress,
  addDays,
  categoryKinds,
  dayOf,
  dueOccurrences,
  isOccurrence,
  nextOccurrence,
  monthPeriodOfDay,
  categoryTree,
  currencyOf as currencyByCode,
  hasRole,
  money,
  rateDayOf,
  toBaseCurrency,
  mayChangeTransaction,
  periodDays,
  todayIn,
} from '@daric/core';
import type {
  Account,
  Budget,
  BudgetPeriod,
  Category,
  ExchangeRateWire,
  MonthPeriod,
  DueOccurrence,
  Label,
  RecurringRule,
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
  let budgets: StoredBudget[] = [];
  let nextBudgetId = 1;
  let rules: StoredRule[] = [];
  let nextRuleId = 1;
  let rates: StoredRate[] = [];
  let nextRateId = 1;
  /** Occurrences confirmed (with their Transaction) or skipped, by `ruleId|dueOn`. */
  const handled = new Map<string, { transactionId: string | null }>();
  /** Unreachable: every call fails as fetch does when the network is down. */
  let offline = false;

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
    async logout() {
      current = undefined;
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
    async updatePreferences(input) {
      const user = signedIn();
      user.preferences = { ...user.preferences, ...input };
      return { ...user.preferences };
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
