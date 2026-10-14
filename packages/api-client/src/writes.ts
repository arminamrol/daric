import type {
  CreateAccountInput,
  CreateBudgetInput,
  CreateCategoryInput,
  CreateLabelInput,
  CreateRecurringRuleInput,
  CreateTransactionInput,
  ReorderCategoriesInput,
  Transaction,
  UpdateAccountInput,
  UpdateBudgetInput,
  UpdateCategoryInput,
  UpdateLabelInput,
  UpdateRecurringRuleInput,
} from '@daric/core';
import type { Change, Entry, SendResult, Transport } from '@daric/offline-queue';
import type { ApiClient } from './client';
import { refusalOf, sendTransaction } from './transport';

/**
 * What a create names (no id: the queue's key carries it), or what an edit
 * changes; an edit folded into a create waiting to be sent adds to it, so a
 * create may carry `archived` too.
 */
type Fields<Create, Update> = Partial<Omit<Create, 'id'>> & Update;

export type AccountFields = Fields<CreateAccountInput, Partial<UpdateAccountInput>>;
export type CategoryFields = Fields<CreateCategoryInput, Partial<UpdateCategoryInput>>;
export type LabelFields = Fields<CreateLabelInput, Partial<UpdateLabelInput>>;
export type BudgetFields = Fields<CreateBudgetInput, Partial<UpdateBudgetInput>>;
export type RecurringRuleFields = Fields<
  CreateRecurringRuleInput,
  Partial<UpdateRecurringRuleInput>
>;

/** Confirming a Due Occurrence (optionally with another Amount) or skipping it. */
export type OccurrenceAction = { ruleId: string; dueOn: string } & (
  { action: 'confirm'; amount?: bigint } | { action: 'skip' }
);

/** A write to something of a Workspace other than a Transaction. */
export type EntityWrite =
  | { entity: 'account'; fields: AccountFields }
  | { entity: 'category'; fields: CategoryFields }
  /** The new order of one group of sibling Categories; each one replaces the last. */
  | { entity: 'categoryOrder'; fields: ReorderCategoriesInput }
  | { entity: 'label'; fields: LabelFields }
  | { entity: 'budget'; fields: BudgetFields }
  | { entity: 'recurringRule'; fields: RecurringRuleFields }
  | { entity: 'occurrence'; fields: OccurrenceAction };

/**
 * A write waiting in the offline queue shared by everything of a Workspace,
 * so changes reach the API in the order they were made (an Account before the
 * Transaction recorded on it). A Transaction's is the whole Transaction, as
 * the Transaction-only queue keeps it, so entries an earlier version left
 * still replay.
 */
export type WorkspaceWrite = CreateTransactionInput | EntityWrite;

export type Entity = EntityWrite['entity'] | 'transaction';

/** A change waiting in the Workspace queue; its scope is the Workspace. */
export type QueuedWrite = Entry<WorkspaceWrite, Transaction>;

/**
 * The queue's key for something: a Transaction's bare id, anything else's id
 * after its kind (`budget:…`), so a delete, which carries no payload, still
 * says what it deletes.
 */
export function entityKey(entity: Entity, id: string): string {
  return entity === 'transaction' ? id : `${entity}:${id}`;
}

const ENTITIES = new Set<string>([
  'account',
  'category',
  'categoryOrder',
  'label',
  'budget',
  'recurringRule',
  'occurrence',
] satisfies EntityWrite['entity'][]);

/** The kind and id a queue key names: the reverse of `entityKey`. */
export function parseEntityKey(key: string): { entity: Entity; id: string } {
  const at = key.indexOf(':');
  const entity = key.slice(0, at);
  return at > 0 && ENTITIES.has(entity)
    ? { entity: entity as Entity, id: key.slice(at + 1) }
    : { entity: 'transaction', id: key };
}

const isEntityWrite = (write: WorkspaceWrite): write is EntityWrite => 'entity' in write;

/**
 * How the queue folds an edit into an earlier change of the same thing: edits
 * name only the fields they change, so they merge; a whole Transaction or a
 * new order replaces the one before.
 */
export function mergeWrites(earlier: WorkspaceWrite, later: WorkspaceWrite): WorkspaceWrite {
  if (
    !isEntityWrite(earlier) ||
    !isEntityWrite(later) ||
    earlier.entity !== later.entity ||
    later.entity === 'categoryOrder' ||
    later.entity === 'occurrence'
  ) {
    return later;
  }
  return { ...later, fields: { ...earlier.fields, ...later.fields } } as EntityWrite;
}

/** The changes of `entity` among `entries`, with the ids they are about. */
export function entriesOf<E extends Entity>(
  entries: readonly QueuedWrite[],
  entity: E,
): (QueuedWrite & { id: string })[] {
  return entries.flatMap((entry) => {
    const key = parseEntityKey(entry.entityId);
    return key.entity === entity ? [{ ...entry, id: key.id }] : [];
  });
}

/** Whether `entry` is a Transaction change, as `withWaitingChanges` takes them. */
export function isTransactionEntry(
  entry: QueuedWrite,
): entry is Entry<CreateTransactionInput, Transaction> {
  return parseEntityKey(entry.entityId).entity === 'transaction';
}

/** Sends one change of something other than a Transaction; throws to try again later. */
async function sendEntity(
  api: ApiClient,
  change: Change<WorkspaceWrite>,
  entity: EntityWrite['entity'],
  id: string,
): Promise<void> {
  const ws = change.scope;
  if (change.kind === 'delete') {
    if (entity !== 'budget') throw new Error(`A ${entity} cannot be deleted`);
    return api.deleteBudget(ws, id);
  }
  const write = change.payload;
  if (!isEntityWrite(write) || write.entity !== entity) {
    throw new Error(`The change of ${change.entityId} carries another kind of write`);
  }
  const creating = change.kind === 'create';

  // A create sends what it names under the queued id; archiving it before it
  // was sent is an edit after it.
  switch (write.entity) {
    case 'account': {
      const { archived, ...fields } = write.fields;
      if (!creating) {
        await api.updateAccount(ws, id, write.fields);
        return;
      }
      await api.createAccount(ws, { ...(fields as CreateAccountInput), id });
      if (archived) await api.updateAccount(ws, id, { archived });
      return;
    }
    case 'category': {
      const { archived, ...fields } = write.fields;
      if (!creating) {
        await api.updateCategory(ws, id, write.fields);
        return;
      }
      await api.createCategory(ws, { ...(fields as CreateCategoryInput), id });
      if (archived) await api.updateCategory(ws, id, { archived });
      return;
    }
    case 'categoryOrder':
      await api.reorderCategories(ws, write.fields);
      return;
    case 'label': {
      const { archived, ...fields } = write.fields;
      if (!creating) {
        await api.updateLabel(ws, id, write.fields);
        return;
      }
      await api.createLabel(ws, { ...(fields as CreateLabelInput), id });
      if (archived) await api.updateLabel(ws, id, { archived });
      return;
    }
    case 'budget':
      if (creating) await api.createBudget(ws, { ...(write.fields as CreateBudgetInput), id });
      else await api.updateBudget(ws, id, write.fields);
      return;
    case 'recurringRule': {
      const { archived, ...fields } = write.fields;
      if (!creating) {
        await api.updateRecurringRule(ws, id, write.fields);
        return;
      }
      await api.createRecurringRule(ws, { ...(fields as CreateRecurringRuleInput), id });
      if (archived) await api.updateRecurringRule(ws, id, { archived });
      return;
    }
    case 'occurrence': {
      const { ruleId, dueOn } = write.fields;
      if (write.fields.action === 'skip') return api.skipOccurrence(ws, ruleId, dueOn);
      const { amount } = write.fields;
      await api.confirmOccurrence(ws, ruleId, dueOn, amount === undefined ? {} : { amount });
      return;
    }
  }
}

/**
 * Sends the Workspace queue's changes with the API client: Transactions as
 * `transactionTransport` does, anything else by its kind. `afterChange` runs
 * once the server took a change, before the queue lets go of it, so lists
 * refetch without the change briefly vanishing. Only Transactions carry
 * versions the server checks; other edits are last-write-wins.
 */
export function workspaceTransport(
  api: ApiClient,
  afterChange: (workspaceId: string, entity: Entity) => Promise<unknown>,
): Transport<WorkspaceWrite, Transaction> {
  async function apply(change: Change<WorkspaceWrite>): Promise<SendResult<Transaction>> {
    const { entity, id } = parseEntityKey(change.entityId);
    if (entity === 'transaction') {
      return sendTransaction(api, change as Change<CreateTransactionInput>);
    }
    try {
      await sendEntity(api, change, entity, id);
      return { status: 'done' };
    } catch (error) {
      const refusal = refusalOf(error);
      if (refusal.status === 404 && change.kind !== 'create') {
        // Deleted meanwhile (only Budgets are): deletes win.
        return change.kind === 'update' ? { status: 'gone' } : { status: 'done' };
      }
      return { status: 'rejected', reason: refusal.message };
    }
  }

  return {
    async send(change) {
      const result = await apply(change);
      // Lists refetch when the server changed; a gone or refused change left them as they were.
      if (result.status === 'done' || result.status === 'conflict') {
        await afterChange(change.scope, parseEntityKey(change.entityId).entity);
      }
      return result;
    },
  };
}
