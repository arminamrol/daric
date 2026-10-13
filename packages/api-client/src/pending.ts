import { periodDays } from '@daric/core';
import type {
  CalendarSystem,
  Category,
  CreateTransactionInput,
  ListTransactionsQuery,
  Transaction,
} from '@daric/core';
import type { Entry } from '@daric/offline-queue';

/** A Transaction change waiting in the offline queue; its scope is the Workspace. */
export type QueuedTransactionChange = Entry<CreateTransactionInput, Transaction>;

/** Where a change shown before the API has it stands: on its way, or waiting for the user. */
export type SyncState = 'pending' | 'conflict' | 'rejected';

/** The Transaction a queued create or edit describes, as the API would return it. */
export function transactionFromInput(
  input: CreateTransactionInput,
  { id, createdBy, version }: Pick<Transaction, 'id' | 'createdBy' | 'version'>,
): Transaction {
  const common = {
    id,
    accountId: input.accountId,
    amount: input.amount,
    occurredOn: input.occurredOn,
    note: input.note ?? null,
    createdBy,
    labelIds: [...input.labelIds].sort(),
    version,
  };
  return input.type === 'TRANSFER'
    ? {
        ...common,
        type: 'TRANSFER',
        toAccountId: input.toAccountId,
        toAmount: input.toAmount ?? input.amount,
      }
    : { ...common, type: input.type, categoryId: input.categoryId };
}

/** What a stored Transaction is made of: the reverse of `transactionFromInput`. */
export function inputFromTransaction(transaction: Transaction): CreateTransactionInput {
  const common = {
    id: transaction.id,
    accountId: transaction.accountId,
    amount: transaction.amount,
    occurredOn: transaction.occurredOn,
    note: transaction.note,
    labelIds: transaction.labelIds,
  };
  return transaction.type === 'TRANSFER'
    ? {
        ...common,
        type: 'TRANSFER',
        toAccountId: transaction.toAccountId,
        toAmount: transaction.toAmount,
      }
    : { ...common, type: transaction.type, categoryId: transaction.categoryId };
}

/** Whether `transaction` belongs in a list with `filters`, as the API decides. */
function matches(
  transaction: Transaction,
  filters: ListTransactionsQuery,
  calendar: CalendarSystem,
  categories: readonly Category[],
): boolean {
  const { period, accountId, categoryId, labelId } = filters;
  const days = period && periodDays(period, calendar);
  if (days && (transaction.occurredOn < days.from || transaction.occurredOn >= days.until)) {
    return false;
  }
  if (
    accountId &&
    transaction.accountId !== accountId &&
    !(transaction.type === 'TRANSFER' && transaction.toAccountId === accountId)
  ) {
    return false;
  }
  if (categoryId) {
    if (transaction.type === 'TRANSFER') return false;
    const parentId = categories.find((c) => c.id === transaction.categoryId)?.parentId;
    if (transaction.categoryId !== categoryId && parentId !== categoryId) return false;
  }
  return !labelId || transaction.labelIds.includes(labelId);
}

/**
 * A list from the API with the changes still waiting applied on top, newest
 * first, and the state of each Transaction they touch: what the user did shows
 * at once, marked until the API has it.
 */
export function withWaitingChanges(
  list: readonly Transaction[],
  entries: readonly QueuedTransactionChange[],
  context: {
    filters: ListTransactionsQuery;
    calendar: CalendarSystem;
    categories: readonly Category[];
    /** The signed-in User, who recorded what they create. */
    userId: string;
  },
): { transactions: Transaction[]; states: ReadonlyMap<string, SyncState> } {
  let shown = [...list];
  const states = new Map<string, SyncState>();
  for (const entry of entries) {
    const id = entry.entityId;
    const at = shown.findIndex((t) => t.id === id);
    const existing = shown[at];
    shown = shown.filter((t) => t.id !== id);
    states.set(id, entry.status);
    if (entry.kind === 'delete') continue;
    const changed = transactionFromInput(entry.payload, {
      id,
      createdBy: existing?.createdBy ?? context.userId,
      // An edit made on top starts from the same version, so it cannot skip a conflict.
      version: entry.kind === 'create' ? 1 : entry.baseVersion,
    });
    if (!matches(changed, context.filters, context.calendar, context.categories)) continue;
    // An edit keeps its place; a new one goes first among those of its day, as the API lists them.
    if (existing) shown.splice(at, 0, changed);
    else shown.unshift(changed);
  }
  if (entries.length > 0) {
    shown.sort((a, b) =>
      a.occurredOn === b.occurredOn ? 0 : a.occurredOn < b.occurredOn ? 1 : -1,
    );
  }
  return { transactions: shown, states };
}
