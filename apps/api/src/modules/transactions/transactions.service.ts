import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { amountToWire, periodDays } from '@daric/core';
import type { CreateTransactionInput, ListTransactionsQuery, TransactionWire } from '@daric/core';
import { and, desc, eq, gte, inArray, isNull, lt, or, type SQL } from 'drizzle-orm';
import { isUuid, type Membership } from '../../common/request';
import { accounts, categories, transactions, workspaces } from '../../db/schema';
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
  version: transactions.version,
};

type Row = Pick<typeof transactions.$inferSelect, keyof typeof columns>;

function toWire(row: Row): TransactionWire {
  // Only Income and Expense are ever written here, each with a Category.
  if (row.type === 'TRANSFER' || row.categoryId === null) {
    throw new Error(`Transaction ${row.id} is not an Income or Expense`);
  }
  return { ...row, type: row.type, categoryId: row.categoryId, amount: amountToWire(row.amount) };
}

/** Whether a stored Transaction is the one `input` describes (a replayed create). */
function sameTransaction(row: Row, input: CreateTransactionInput): boolean {
  return (
    row.type === input.type &&
    row.accountId === input.accountId &&
    row.categoryId === input.categoryId &&
    row.amount === input.amount &&
    row.occurredOn === input.occurredOn &&
    row.note === input.note
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

    const [inserted] = await tx
      .insert(transactions)
      .values({ ...input, workspaceId, createdBy: userId })
      .onConflictDoNothing({ target: transactions.id })
      .returning({ id: transactions.id });
    if (!inserted) {
      // The same id was recorded meanwhile, by a concurrent replay or in another Workspace.
      const replayed = input.id && (await this.replayed(input.id, input));
      if (replayed) return { created: false, transaction: replayed };
      throw new ConflictException('This id is already used by another Transaction');
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
      throw new ConflictException('This id is already used by another Transaction');
    }
    return toWire(row);
  }

  /** Throws a 400 unless the Account and Category exist, are active, and the Category fits the type. */
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
  }
}
