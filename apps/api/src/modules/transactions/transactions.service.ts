import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  amountToWire,
  MAX_LABELS_PER_TRANSACTION,
  mayChangeTransaction,
  periodDays,
} from '@daric/core';
import type {
  CreateTransactionInput,
  ListTransactionsQuery,
  TransactionWire,
  UpdateTransactionInput,
} from '@daric/core';
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
  toAccountId: transactions.toAccountId,
  toAmount: transactions.toAmount,
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

/** A create or an edit: what validation looks at. */
type TransactionInput = CreateTransactionInput | UpdateTransactionInput;

function toWire(row: Row): TransactionWire {
  const { type, categoryId, toAccountId, toAmount, ...rest } = row;
  const common = { ...rest, amount: amountToWire(row.amount) };
  // The table's checks give a Transfer its destination and Income and Expense their Category.
  if (type === 'TRANSFER') {
    if (toAccountId === null || toAmount === null) {
      throw new Error(`Transfer ${row.id} has no destination`);
    }
    return { ...common, type, toAccountId, toAmount: amountToWire(toAmount) };
  }
  if (categoryId === null) throw new Error(`Transaction ${row.id} has no Category`);
  return { ...common, type, categoryId };
}

/**
 * Whether a stored Transaction is the one `input` describes (a replayed create).
 * Once it changed (edited, relabelled, deleted or restored), the create can no
 * longer be compared with it: a client still replaying its queued create gets
 * the current copy.
 */
function sameTransaction(row: Row, input: CreateTransactionInput): boolean {
  if (row.version > 1) return true;
  const sameKind =
    input.type === 'TRANSFER'
      ? row.toAccountId === input.toAccountId &&
        // Left out, the destination Amount of a same-currency Transfer is its Amount.
        row.toAmount === (input.toAmount ?? input.amount)
      : row.categoryId === input.categoryId;
  return (
    row.type === input.type &&
    sameKind &&
    row.accountId === input.accountId &&
    row.amount === input.amount &&
    row.occurredOn === input.occurredOn &&
    row.note === input.note &&
    row.labelIds.join() === [...input.labelIds].sort().join()
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
    if (query.accountId) {
      // A Transfer shows under both of its Accounts.
      filters.push(
        or(
          eq(transactions.accountId, query.accountId),
          eq(transactions.toAccountId, query.accountId),
        ),
      );
    }
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
   * Records an Income, Expense or Transfer. Sending the same id again answers with the
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
    const toAmount = await this.validate(input);

    const { labelIds, ...fields } = input;
    const [inserted] = await tx
      .insert(transactions)
      .values({
        ...fields,
        ...(toAmount !== undefined && { toAmount }),
        workspaceId,
        createdBy: userId,
      })
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
   * Throws a 400 unless the Accounts, Category and Labels exist and are
   * active, and the Category fits the type. An edit may keep the archived ones
   * the `current` Transaction already names. For a Transfer, answers the
   * destination Amount to store.
   */
  private async validate(input: TransactionInput, current?: Row): Promise<bigint | undefined> {
    const account = await this.usableAccount(input.accountId, 'Account', current?.accountId);
    let toAmount: bigint | undefined;
    if (input.type === 'TRANSFER') {
      toAmount = await this.transferredAmount(input, account.currency, current?.toAccountId);
    } else {
      const [category] = await scopedTx()
        .select({ kind: categories.kind, archivedAt: categories.archivedAt })
        .from(categories)
        .where(eq(categories.id, input.categoryId));
      if (!category) throw new BadRequestException('Category not found');
      if (category.archivedAt && input.categoryId !== current?.categoryId) {
        throw new BadRequestException('The Category is archived');
      }
      if (category.kind !== input.type) {
        throw new BadRequestException(`An ${input.type} needs an ${input.type} Category`);
      }
    }

    if (input.labelIds && input.labelIds.length > 0) {
      const found = await scopedTx()
        .select({ id: labels.id, archivedAt: labels.archivedAt })
        .from(labels)
        .where(inArray(labels.id, input.labelIds));
      if (found.length !== input.labelIds.length) throw new BadRequestException('Label not found');
      if (found.some((label) => label.archivedAt && !current?.labelIds.includes(label.id))) {
        throw new BadRequestException('A Label is archived');
      }
    }
    return toAmount;
  }

  /** An Account to put a Transaction on: active, or archived but the one it is on already. */
  private async usableAccount(accountId: string, name: string, kept?: string | null) {
    const [account] = await scopedTx()
      .select({ id: accounts.id, currency: accounts.currency, archivedAt: accounts.archivedAt })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    if (!account) throw new BadRequestException(`${name} not found`);
    if (account.archivedAt && accountId !== kept) {
      throw new BadRequestException(`The ${name} is archived`);
    }
    return account;
  }

  /**
   * What a Transfer puts into its destination Account. Nothing is converted:
   * of one currency it is the Amount itself, between currencies the user gives it.
   */
  private async transferredAmount(
    input: Extract<TransactionInput, { type: 'TRANSFER' }>,
    currency: string,
    kept?: string | null,
  ): Promise<bigint> {
    const destination = await this.usableAccount(input.toAccountId, 'destination Account', kept);
    if (destination.currency === currency) {
      if (input.toAmount !== undefined && input.toAmount !== input.amount) {
        throw new BadRequestException('Between Accounts of one currency both Amounts are the same');
      }
      return input.amount;
    }
    if (input.toAmount === undefined) {
      throw new BadRequestException('Between currencies the destination Amount is required');
    }
    return input.toAmount;
  }

  /**
   * Replaces a Transaction's fields, and its Labels when given. Refused with a
   * 409 carrying the current copy unless `input.version` is the current one; a
   * deleted Transaction answers 404, as a delete wins over any edit.
   */
  async update(
    membership: Membership,
    userId: string,
    transactionId: string,
    input: UpdateTransactionInput,
  ): Promise<TransactionWire> {
    const tx = scopedTx();
    const { deletedAt: _, ...current } = await this.lockToChange(membership, userId, transactionId);
    if (current.version !== input.version) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: 'The Transaction was changed since this version',
        transaction: toWire(current),
      });
    }
    const toAmount = await this.validate(input, current);

    const { labelIds, version: _version, ...fields } = input;
    const transfer = fields.type === 'TRANSFER';
    await tx
      .update(transactions)
      .set({
        type: fields.type,
        accountId: fields.accountId,
        amount: fields.amount,
        occurredOn: fields.occurredOn,
        note: fields.note,
        // Switching between Transfer and Income/Expense sets one side and clears the other.
        categoryId: transfer ? null : fields.categoryId,
        toAccountId: transfer ? fields.toAccountId : null,
        toAmount: transfer ? (toAmount ?? null) : null,
        version: sql`${transactions.version} + 1`,
      })
      .where(eq(transactions.id, transactionId));
    if (labelIds) {
      const { workspaceId } = membership;
      await tx.delete(transactionLabels).where(eq(transactionLabels.transactionId, transactionId));
      if (labelIds.length > 0) {
        await tx
          .insert(transactionLabels)
          .values(labelIds.map((labelId) => ({ transactionId, labelId, workspaceId })));
      }
    }
    await this.audit.record(tx, {
      action: 'transaction.update',
      actorUserId: userId,
      workspaceId: membership.workspaceId,
      metadata: { transactionId },
    });
    return this.get(transactionId);
  }

  /**
   * Deletes a Transaction softly, whatever version the caller saw. Deleting
   * one already deleted changes nothing.
   */
  async remove(membership: Membership, userId: string, transactionId: string): Promise<void> {
    const tx = scopedTx();
    const current = await this.lockToChange(membership, userId, transactionId, {
      deleted: true,
    });
    if (current.deletedAt) return;
    await tx
      .update(transactions)
      .set({ deletedAt: sql`now()`, version: sql`${transactions.version} + 1` })
      .where(eq(transactions.id, transactionId));
    await this.audit.record(tx, {
      action: 'transaction.delete',
      actorUserId: userId,
      workspaceId: membership.workspaceId,
      metadata: { transactionId },
    });
  }

  /** Brings a deleted Transaction back (undo); restoring one not deleted changes nothing. */
  async restore(
    membership: Membership,
    userId: string,
    transactionId: string,
  ): Promise<TransactionWire> {
    const tx = scopedTx();
    const current = await this.lockToChange(membership, userId, transactionId, {
      deleted: true,
    });
    if (current.deletedAt) {
      await tx
        .update(transactions)
        .set({ deletedAt: null, version: sql`${transactions.version} + 1` })
        .where(eq(transactions.id, transactionId));
      await this.audit.record(tx, {
        action: 'transaction.restore',
        actorUserId: userId,
        workspaceId: membership.workspaceId,
        metadata: { transactionId },
      });
    }
    return this.get(transactionId);
  }

  /**
   * Locks a Transaction so changes to it take turns, and reads it. 404 unless
   * it exists in the Workspace and, unless `deleted`, is not deleted; 403
   * unless the caller may change it.
   */
  private async lockToChange(
    membership: Membership,
    userId: string,
    transactionId: string,
    { deleted = false } = {},
  ): Promise<Row & { deletedAt: Date | null }> {
    if (!isUuid(transactionId)) throw new NotFoundException();
    const [row] = await scopedTx()
      .select({ ...columns, deletedAt: transactions.deletedAt })
      .from(transactions)
      .where(
        and(
          eq(transactions.id, transactionId),
          deleted ? undefined : isNull(transactions.deletedAt),
        ),
      )
      .for('update');
    if (!row) throw new NotFoundException();
    if (!mayChangeTransaction(membership.role, userId, row)) throw new ForbiddenException();
    return row;
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
    const label = await this.lockForLabel(membership, userId, transactionId, labelId);
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
    await this.lockForLabel(membership, userId, transactionId, labelId);
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
   * Label. 404 unless both exist in the Workspace, 403 unless the caller may
   * change the Transaction.
   */
  private async lockForLabel(
    membership: Membership,
    userId: string,
    transactionId: string,
    labelId: string,
  ) {
    if (!isUuid(labelId)) throw new NotFoundException();
    await this.lockToChange(membership, userId, transactionId);
    const [label] = await scopedTx()
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
