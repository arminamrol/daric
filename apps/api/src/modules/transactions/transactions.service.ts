import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { amountToWire, MAX_LABELS_PER_TRANSACTION, periodDays } from '@daric/core';
import type { CreateTransactionInput, ListTransactionsQuery, TransactionWire } from '@daric/core';
import { and, desc, eq, gte, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { isUuid, type Membership } from '../../common/request';
import {
  accounts,
  categories,
  labels,
  transactionLabels,
  transactions,
  workspaces,
} from '../../db/schema';
import { scopedTx } from '../../db/scope';
import { AuditService } from '../audit/audit.service';

const columns = {
  id: transactions.id,
  type: transactions.type,
  accountId: transactions.accountId,
  categoryId: transactions.categoryId,
  amount: transactions.amount,
  occurredOn: transactions.occurredOn,
  note: transactions.note,
  createdBy: transactions.createdBy,
  // Ordered by id, so the same Labels always come in the same order.
  labelIds: sql<string[]>`(
    SELECT coalesce(array_agg(${transactionLabels.labelId} ORDER BY ${transactionLabels.labelId}), '{}')::text[]
    FROM ${transactionLabels} WHERE ${transactionLabels.transactionId} = ${transactions.id}
  )`,
  version: transactions.version,
};

type Row = Pick<typeof transactions.$inferSelect, Exclude<keyof typeof columns, 'labelIds'>> & {
  labelIds: string[];
};

const ID_TAKEN = 'This id is already used by another Transaction';

function toWire(row: Row): TransactionWire {
  // Only Income and Expense are ever written here, each with a Category.
  if (row.type === 'TRANSFER' || row.categoryId === null) {
    throw new Error(`Transaction ${row.id} is not an Income or Expense`);
  }
  return { ...row, type: row.type, categoryId: row.categoryId, amount: amountToWire(row.amount) };
}

/**
 * Whether a stored Transaction is the one `input` describes (a replayed create).
 * Labels count only while it is unchanged: once Labels were attached or
 * detached, a client still replaying its queued create gets the current copy.
 */
function sameTransaction(row: Row, input: CreateTransactionInput): boolean {
  return (
    row.type === input.type &&
    row.accountId === input.accountId &&
    row.categoryId === input.categoryId &&
    row.amount === input.amount &&
    row.occurredOn === input.occurredOn &&
    row.note === input.note &&
    (row.version > 1 || row.labelIds.join() === [...input.labelIds].sort().join())
  );
}

// Queries filter by id only: WorkspaceGuard and row-level security keep them
// inside the caller's Workspace (ADR-0001); the composite foreign keys keep a
// Transaction's Account and Category in its Workspace too.
@Injectable()
export class TransactionsService {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  private select(where: SQL | undefined) {
    return scopedTx()
      .select(columns)
      .from(transactions)
      .where(and(isNull(transactions.deletedAt), where))
      .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt), desc(transactions.id));
  }

  async list(membership: Membership, query: ListTransactionsQuery): Promise<TransactionWire[]> {
    const filters: (SQL | undefined)[] = [];
    if (query.period) {
      const [workspace] = await scopedTx()
        .select({ calendar: workspaces.calendar })
        .from(workspaces)
        .where(eq(workspaces.id, membership.workspaceId));
      if (!workspace) throw new NotFoundException();
      const { from, until } = periodDays(query.period, workspace.calendar);
      filters.push(gte(transactions.occurredOn, from), lt(transactions.occurredOn, until));
    }
    if (query.accountId) filters.push(eq(transactions.accountId, query.accountId));
    if (query.categoryId) {
      // A parent Category includes its children.
      const children = scopedTx()
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.parentId, query.categoryId));
      filters.push(
        or(
          eq(transactions.categoryId, query.categoryId),
          inArray(transactions.categoryId, children),
        ),
      );
    }
    if (query.labelId) {
      const labelled = scopedTx()
        .select({ id: transactionLabels.transactionId })
        .from(transactionLabels)
        .where(eq(transactionLabels.labelId, query.labelId));
      filters.push(inArray(transactions.id, labelled));
    }
    const rows = await this.select(and(...filters));
    return rows.map(toWire);
  }

  async get(transactionId: string): Promise<TransactionWire> {
    if (!isUuid(transactionId)) throw new NotFoundException();
    const [row] = await this.select(eq(transactions.id, transactionId));
    if (!row) throw new NotFoundException();
    return toWire(row);
  }

  /**
   * Records an Income or Expense. Sending the same id again answers with the
   * Transaction already recorded (`created: false`), even if it was deleted
   * since: a replayed create never brings a deleted Transaction back.
   */
  async create(
    membership: Membership,
    userId: string,
    input: CreateTransactionInput,
  ): Promise<{ created: boolean; transaction: TransactionWire }> {
    const { workspaceId } = membership;
    const tx = scopedTx();
    // Row-level security would refuse the insert anyway; answer 404 like every other route.
    const [visible] = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    if (!visible) throw new NotFoundException();

    if (input.id) {
      const replayed = await this.replayed(input.id, input);
      if (replayed) return { created: false, transaction: replayed };
    }
    await this.assertUsable(input);

    const { labelIds, ...fields } = input;
    const [inserted] = await tx
      .insert(transactions)
      .values({ ...fields, workspaceId, createdBy: userId })
      .onConflictDoNothing({ target: transactions.id })
      .returning({ id: transactions.id });
    if (!inserted) {
      // The same id was recorded meanwhile, by a concurrent replay or in another Workspace.
      const replayed = input.id && (await this.replayed(input.id, input));
      if (replayed) return { created: false, transaction: replayed };
      throw new ConflictException(ID_TAKEN);
    }
    if (labelIds.length > 0) {
      await tx
        .insert(transactionLabels)
        .values(labelIds.map((labelId) => ({ transactionId: inserted.id, labelId, workspaceId })));
    }
    await this.audit.record(tx, {
      action: 'transaction.create',
      actorUserId: userId,
      workspaceId,
      metadata: { transactionId: inserted.id },
    });
    return { created: true, transaction: await this.get(inserted.id) };
  }

  /** The Transaction already recorded under `id`, if it is the one `input` describes. */
  private async replayed(
    id: string,
    input: CreateTransactionInput,
  ): Promise<TransactionWire | undefined> {
    const [row] = await scopedTx()
      .select(columns)
      .from(transactions)
      .where(eq(transactions.id, id));
    if (!row) return undefined;
    if (!sameTransaction(row, input)) {
      throw new ConflictException(ID_TAKEN);
    }
    return toWire(row);
  }

  /**
   * Throws a 400 unless the Account, Category and Labels exist and are active,
   * and the Category fits the type.
   */
  private async assertUsable(input: CreateTransactionInput) {
    const [account] = await scopedTx()
      .select({ archivedAt: accounts.archivedAt })
      .from(accounts)
      .where(eq(accounts.id, input.accountId));
    if (!account) throw new BadRequestException('Account not found');
    if (account.archivedAt) throw new BadRequestException('The Account is archived');

    const [category] = await scopedTx()
      .select({ kind: categories.kind, archivedAt: categories.archivedAt })
      .from(categories)
      .where(eq(categories.id, input.categoryId));
    if (!category) throw new BadRequestException('Category not found');
    if (category.archivedAt) throw new BadRequestException('The Category is archived');
    if (category.kind !== input.type) {
      throw new BadRequestException(`An ${input.type} needs an ${input.type} Category`);
    }

    if (input.labelIds.length > 0) {
      const found = await scopedTx()
        .select({ archivedAt: labels.archivedAt })
        .from(labels)
        .where(inArray(labels.id, input.labelIds));
      if (found.length !== input.labelIds.length) throw new BadRequestException('Label not found');
      if (found.some((label) => label.archivedAt)) {
        throw new BadRequestException('A Label is archived');
      }
    }
  }

  /**
   * Attaches an active Label to a Transaction. Attaching one it already
   * carries changes nothing, so a repeated request is harmless.
   */
  async attachLabel(
    membership: Membership,
    userId: string,
    transactionId: string,
    labelId: string,
  ): Promise<TransactionWire> {
    const tx = scopedTx();
    const label = await this.lockForLabel(transactionId, labelId);
    const carried = await tx
      .select({ labelId: transactionLabels.labelId })
      .from(transactionLabels)
      .where(eq(transactionLabels.transactionId, transactionId));
    if (carried.some((row) => row.labelId === labelId)) return this.get(transactionId);
    if (label.archivedAt) throw new BadRequestException('The Label is archived');
    if (carried.length >= MAX_LABELS_PER_TRANSACTION) {
      throw new BadRequestException(
        `A Transaction carries at most ${MAX_LABELS_PER_TRANSACTION} Labels`,
      );
    }
    await tx
      .insert(transactionLabels)
      .values({ transactionId, labelId, workspaceId: membership.workspaceId });
    await this.bumpVersion(transactionId);
    await this.audit.record(tx, {
      action: 'transaction.label_attach',
      actorUserId: userId,
      workspaceId: membership.workspaceId,
      metadata: { transactionId, labelId },
    });
    return this.get(transactionId);
  }

  /** Detaches a Label, archived or not; detaching one it does not carry changes nothing. */
  async detachLabel(
    membership: Membership,
    userId: string,
    transactionId: string,
    labelId: string,
  ): Promise<TransactionWire> {
    const tx = scopedTx();
    await this.lockForLabel(transactionId, labelId);
    const [detached] = await tx
      .delete(transactionLabels)
      .where(
        and(
          eq(transactionLabels.transactionId, transactionId),
          eq(transactionLabels.labelId, labelId),
        ),
      )
      .returning({ labelId: transactionLabels.labelId });
    if (detached) {
      await this.bumpVersion(transactionId);
      await this.audit.record(tx, {
        action: 'transaction.label_detach',
        actorUserId: userId,
        workspaceId: membership.workspaceId,
        metadata: { transactionId, labelId },
      });
    }
    return this.get(transactionId);
  }

  /**
   * Locks a Transaction that is not deleted, so concurrent changes to its
   * Labels take turns (the Label count stays within the limit), and reads the
   * Label. 404 unless both exist in the Workspace.
   */
  private async lockForLabel(transactionId: string, labelId: string) {
    if (!isUuid(transactionId) || !isUuid(labelId)) throw new NotFoundException();
    const tx = scopedTx();
    const [row] = await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.id, transactionId), isNull(transactions.deletedAt)))
      .for('update');
    if (!row) throw new NotFoundException();
    const [label] = await tx
      .select({ archivedAt: labels.archivedAt })
      .from(labels)
      .where(eq(labels.id, labelId));
    if (!label) throw new NotFoundException();
    return label;
  }

  /** Bumps a Transaction's version after its Labels changed. */
  private async bumpVersion(transactionId: string): Promise<void> {
    await scopedTx()
      .update(transactions)
      .set({ version: sql`${transactions.version} + 1` })
      .where(eq(transactions.id, transactionId));
  }
}
