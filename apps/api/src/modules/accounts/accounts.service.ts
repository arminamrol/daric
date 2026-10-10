import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { accountBalance, amountToWire, balanceEffect, money } from '@daric/core';
import type {
  AccountWire,
  CreateAccountInput,
  TransactionType,
  UpdateAccountInput,
} from '@daric/core';
import { eq, isNull, sql, type SQL } from 'drizzle-orm';
import { isUuid, type Membership } from '../../common/request';
import { one } from '../../db/client';
import { accounts, currencies, transactions, workspaces } from '../../db/schema';
import { scopedTx } from '../../db/scope';
import { AuditService } from '../audit/audit.service';

const columns = {
  id: accounts.id,
  name: accounts.name,
  type: accounts.type,
  class: accounts.class,
  currency: accounts.currency,
  minorUnits: currencies.minorUnits,
  openingBalance: accounts.openingBalance,
  archivedAt: accounts.archivedAt,
};

/** Each Account's Income and Expense totals, deleted Transactions left out. */
function totalsByAccount() {
  // `sum` of a bigint is a numeric, which arrives as a string.
  const total = (type: TransactionType) =>
    sql<string>`coalesce(sum(${transactions.amount}) FILTER (WHERE ${transactions.type} = ${type}), 0)`;
  return scopedTx()
    .select({
      accountId: transactions.accountId,
      income: total('INCOME').as('income'),
      expense: total('EXPENSE').as('expense'),
    })
    .from(transactions)
    .where(isNull(transactions.deletedAt))
    .groupBy(transactions.accountId)
    .as('totals');
}

interface Row extends Omit<AccountWire, 'openingBalance' | 'balance' | 'archived'> {
  minorUnits: number;
  openingBalance: bigint;
  archivedAt: Date | null;
  income: string | null;
  expense: string | null;
}

function toWire(row: Row): AccountWire {
  const { minorUnits, archivedAt, income, expense, ...account } = row;
  const currency = { code: row.currency, minorUnits };
  const effects = [
    balanceEffect({ type: 'INCOME', amount: BigInt(income ?? 0) }, row.class),
    balanceEffect({ type: 'EXPENSE', amount: BigInt(expense ?? 0) }, row.class),
  ].map((amount) => money(amount, currency));
  const balance = accountBalance({ currency, openingBalance: row.openingBalance }, effects);
  return {
    ...account,
    openingBalance: amountToWire(row.openingBalance),
    balance: amountToWire(balance.amount),
    archived: archivedAt !== null,
  };
}

// Queries filter by id only: WorkspaceGuard and row-level security keep them
// inside the caller's Workspace (ADR-0001).
@Injectable()
export class AccountsService {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  private select(where: SQL | undefined) {
    const totals = totalsByAccount();
    return scopedTx()
      .select({ ...columns, income: totals.income, expense: totals.expense })
      .from(accounts)
      .innerJoin(currencies, eq(currencies.code, accounts.currency))
      .leftJoin(totals, eq(totals.accountId, accounts.id))
      .where(where)
      .orderBy(accounts.createdAt, accounts.id);
  }

  async list(options: { includeArchived: boolean }): Promise<AccountWire[]> {
    const rows = await this.select(
      options.includeArchived ? undefined : isNull(accounts.archivedAt),
    );
    return rows.map(toWire);
  }

  async get(accountId: string): Promise<AccountWire> {
    if (!isUuid(accountId)) throw new NotFoundException();
    const [row] = await this.select(eq(accounts.id, accountId));
    if (!row) throw new NotFoundException();
    return toWire(row);
  }

  async create(
    membership: Membership,
    userId: string,
    input: CreateAccountInput,
  ): Promise<AccountWire> {
    const { workspaceId } = membership;
    const tx = scopedTx();
    // Row-level security would refuse the insert anyway; answer 404 like every other route.
    const [visible] = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    if (!visible) throw new NotFoundException();
    const created = one(
      await tx
        .insert(accounts)
        .values({ ...input, workspaceId })
        .returning({ id: accounts.id }),
    );
    await this.audit.record(tx, {
      action: 'account.create',
      actorUserId: userId,
      workspaceId,
      metadata: { accountId: created.id },
    });
    return this.get(created.id);
  }

  async update(
    membership: Membership,
    userId: string,
    accountId: string,
    input: UpdateAccountInput,
  ): Promise<AccountWire> {
    if (!isUuid(accountId)) throw new NotFoundException();
    const tx = scopedTx();
    const { archived, ...fields } = input;
    const updated = await tx
      .update(accounts)
      .set({
        ...fields,
        // Archiving again keeps the first archive time.
        ...(archived !== undefined && {
          archivedAt: archived ? sql`coalesce(${accounts.archivedAt}, now())` : null,
        }),
        version: sql`${accounts.version} + 1`,
      })
      .where(eq(accounts.id, accountId))
      .returning({ id: accounts.id });
    if (updated.length === 0) throw new NotFoundException();
    await this.audit.record(tx, {
      action: 'account.update',
      actorUserId: userId,
      workspaceId: membership.workspaceId,
      metadata: { accountId, fields: Object.keys(input) },
    });
    return this.get(accountId);
  }
}
