import { budgetProgress, categoryKinds, categoryTree } from '@daric/core';
import type {
  Account,
  Budget,
  Category,
  DueOccurrence,
  Label,
  MonthPeriod,
  RecurringRule,
} from '@daric/core';
import type { SyncState } from './pending';
import { entriesOf } from './writes';
import type {
  AccountFields,
  BudgetFields,
  CategoryFields,
  Entity,
  LabelFields,
  QueuedWrite,
  RecurringRuleFields,
} from './writes';

/** A list from the API with the waiting changes on top, and the state of each thing they touch. */
export interface Shown<T> {
  items: T[];
  states: ReadonlyMap<string, SyncState>;
}

/**
 * Applies the waiting changes of `entity` to `list`, in order: an edit changes
 * its thing in place, a new one goes last, a delete takes it out. `build`
 * makes the thing from the fields a change carries and what is shown of it
 * so far, if anything; undefined leaves it out.
 */
function overlay<T extends { id: string }, F>(
  list: readonly T[],
  entries: readonly QueuedWrite[],
  entity: Entity,
  build: (id: string, fields: F, existing: T | undefined, shown: readonly T[]) => T | undefined,
): Shown<T> {
  let shown = [...list];
  const states = new Map<string, SyncState>();
  for (const entry of entriesOf(entries, entity)) {
    states.set(entry.id, entry.status);
    const at = shown.findIndex((item) => item.id === entry.id);
    const existing = shown[at];
    if (entry.kind === 'delete') {
      shown = shown.filter((item) => item.id !== entry.id);
      continue;
    }
    if (!('entity' in entry.payload)) continue;
    const built = build(entry.id, entry.payload.fields as F, existing, shown);
    if (!built) continue;
    if (existing) shown[at] = built;
    else shown.push(built);
  }
  return { items: shown, states };
}

/** Whether every field a new thing needs is there; a create always names them. */
function complete<F extends object, K extends keyof F>(
  fields: F,
  keys: readonly K[],
): fields is F & Required<Pick<F, K>> {
  return keys.every((key) => fields[key] !== undefined);
}

/**
 * The Accounts with the waiting changes on top. A balance moves with its
 * opening balance; one archived while waiting leaves a list without archived ones.
 */
export function withWaitingAccounts(
  list: readonly Account[],
  entries: readonly QueuedWrite[],
  { includeArchived }: { includeArchived: boolean },
): Shown<Account> {
  const shown = overlay<Account, AccountFields>(list, entries, 'account', (id, f, existing) => {
    if (existing) {
      const opening = f.openingBalance ?? existing.openingBalance;
      return {
        ...existing,
        ...f,
        id,
        currency: existing.currency,
        balance: existing.balance + opening - existing.openingBalance,
      };
    }
    if (!complete(f, ['name', 'type', 'class', 'currency', 'openingBalance'] as const)) {
      return undefined;
    }
    return {
      id,
      name: f.name,
      type: f.type,
      class: f.class,
      currency: f.currency,
      openingBalance: f.openingBalance,
      balance: f.openingBalance,
      archived: f.archived ?? false,
    };
  });
  return includeArchived ? shown : { ...shown, items: shown.items.filter((a) => !a.archived) };
}

/** The place after every sibling of a Category of `kind` under `parentId`. */
function lastAmong(shown: readonly Category[], kind: Category['kind'], parentId: string | null) {
  const siblings = shown.filter((c) => c.kind === kind && c.parentId === parentId);
  return Math.max(-1, ...siblings.map((c) => c.position)) + 1;
}

/**
 * The Categories with the waiting changes and new orders on top, in the API's
 * order: each kind's top level by position, each followed by its children. A
 * new or moved Category goes last among its siblings, as the API puts it.
 */
export function withWaitingCategories(
  list: readonly Category[],
  entries: readonly QueuedWrite[],
): Shown<Category> {
  const shown = overlay<Category, CategoryFields>(
    list,
    entries,
    'category',
    (id, f, existing, all) => {
      if (existing) {
        const parentId = f.parentId === undefined ? existing.parentId : f.parentId;
        const moved = parentId !== existing.parentId;
        return {
          ...existing,
          ...f,
          id,
          kind: existing.kind,
          parentId,
          position: moved ? lastAmong(all, existing.kind, parentId) : existing.position,
        };
      }
      if (!complete(f, ['kind', 'name', 'icon', 'color'] as const)) return undefined;
      const parentId = f.parentId ?? null;
      return {
        id,
        kind: f.kind,
        parentId,
        name: f.name,
        icon: f.icon,
        color: f.color,
        position: lastAmong(all, f.kind, parentId),
        archived: f.archived ?? false,
      };
    },
  );
  let items = shown.items;
  for (const entry of entriesOf(entries, 'categoryOrder')) {
    if (entry.kind === 'delete' || !('entity' in entry.payload)) continue;
    if (entry.payload.entity !== 'categoryOrder') continue;
    const { ids } = entry.payload.fields;
    items = items.map((c) => (ids.includes(c.id) ? { ...c, position: ids.indexOf(c.id) } : c));
  }
  // Sorting keeps the API's order among equal positions.
  const byPosition = [...items].sort((a, b) => a.position - b.position);
  return {
    items: categoryKinds.flatMap((kind) =>
      categoryTree(byPosition.filter((c) => c.kind === kind)).flatMap(({ children, ...top }) => [
        top,
        ...children,
      ]),
    ),
    states: shown.states,
  };
}

/** The Labels with the waiting changes on top, by name ignoring case, as the API lists them. */
export function withWaitingLabels(
  list: readonly Label[],
  entries: readonly QueuedWrite[],
): Shown<Label> {
  const shown = overlay<Label, LabelFields>(list, entries, 'label', (id, f, existing) => {
    if (existing) return { ...existing, ...f, id };
    if (f.name === undefined) return undefined;
    return {
      id,
      name: f.name,
      controllable: f.controllable ?? false,
      archived: f.archived ?? false,
    };
  });
  const key = (label: Label) => label.name.toLowerCase();
  return {
    ...shown,
    items: shown.items.sort((a, b) =>
      key(a) === key(b) ? (a.id < b.id ? -1 : 1) : key(a) < key(b) ? -1 : 1,
    ),
  };
}

/**
 * The Budgets with the waiting changes on top, progress worked out again with
 * core from what was spent so far. A new one has spent nothing yet: the API
 * tells once it has it.
 */
export function withWaitingBudgets(
  list: readonly Budget[],
  entries: readonly QueuedWrite[],
  context: {
    /** The Base Currency, which a new Budget is kept in. */
    currency: string;
    /** The month the list shows progress for. */
    month: MonthPeriod;
  },
): Shown<Budget> {
  return overlay<Budget, BudgetFields>(list, entries, 'budget', (id, f, existing) => {
    const periodOf = (period: Budget['period']) =>
      period === 'MONTHLY' ? context.month : { kind: 'year' as const, year: context.month.year };
    if (existing) {
      const amount = f.amount ?? existing.amount;
      return {
        ...existing,
        ...f,
        id,
        labelId: f.labelId === undefined ? existing.labelId : f.labelId,
        amount,
        progress: {
          ...existing.progress,
          // What was spent so far stays until the API tells it for the new Period.
          period: f.period ? periodOf(f.period) : existing.progress.period,
          ...budgetProgress(amount, existing.progress.spent),
        },
      };
    }
    if (!complete(f, ['categoryId', 'period', 'amount'] as const)) return undefined;
    return {
      id,
      categoryId: f.categoryId,
      labelId: f.labelId ?? null,
      period: f.period,
      amount: f.amount,
      currency: context.currency,
      version: 1,
      progress: {
        period: periodOf(f.period),
        ...budgetProgress(f.amount, 0n),
        ratesUsed: [],
        otherCurrencyExpenses: 0,
      },
    };
  });
}

/**
 * The Recurring Rules with the waiting changes on top. Until the API has a
 * change, a rule shows no next occurrence: the API works it out.
 */
export function withWaitingRules(
  list: readonly RecurringRule[],
  entries: readonly QueuedWrite[],
): Shown<RecurringRule> {
  return overlay<RecurringRule, RecurringRuleFields>(
    list,
    entries,
    'recurringRule',
    (id, f, existing) => {
      if (existing) {
        return {
          ...existing,
          ...f,
          id,
          endOn: f.endOn === undefined ? existing.endOn : f.endOn,
          nextDueOn: null,
        };
      }
      const needed = [
        'name',
        'type',
        'accountId',
        'categoryId',
        'amount',
        'frequency',
        'startOn',
      ] as const;
      if (!complete(f, needed)) return undefined;
      return {
        id,
        name: f.name,
        type: f.type,
        accountId: f.accountId,
        categoryId: f.categoryId,
        amount: f.amount,
        frequency: f.frequency,
        interval: f.interval ?? 1,
        startOn: f.startOn,
        endOn: f.endOn ?? null,
        autoPost: f.autoPost ?? false,
        archived: f.archived ?? false,
        nextDueOn: null,
        version: 1,
      };
    },
  );
}

/**
 * The Due Occurrences less those confirmed or skipped on this device and not
 * sent yet. One the API refused comes back, to be confirmed or skipped again.
 */
export function withWaitingDue(
  list: readonly DueOccurrence[],
  entries: readonly QueuedWrite[],
): DueOccurrence[] {
  const handled = new Set(
    entriesOf(entries, 'occurrence')
      .filter((e) => e.status !== 'rejected')
      .map((e) => e.id),
  );
  return list.filter((o) => !handled.has(`${o.ruleId}:${o.dueOn}`));
}
