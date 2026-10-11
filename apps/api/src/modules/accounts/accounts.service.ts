import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { accountBalance, amountToWire, flowEffect, money } from '@daric/core';
import type { AccountWire, CreateAccountInput, UpdateAccountInput } from '@daric/core';
import { and, eq, isNull, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
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

// `sum` of a bigint is a numeric, which arrives as a string.
const sumOf = (column: SQLWrapper, filter?: SQL) =>
  filter
    ? sql<string>`coalesce(sum(${column}) FILTER (WHERE ${filter}), 0)`
    : sql<string>`coalesce(sum(${column}), 0)`;

/**
 * What flowed into and out of each Account as the Account of its Transactions,
 * deleted ones left out: Income in, Expense and Transfers out.
 */
function flowsByAccount() {
  return scopedTx()
    .select({
      accountId: transactions.accountId,
      inflow: sumOf(transactions.amount, sql`${transactions.type} = 'INCOME'`).as('inflow'),
      outflow: sumOf(transactions.amount, sql`${transactions.type} <> 'INCOME'`).as('outflow'),
    })
    .from(transactions)
    .where(isNull(transactions.deletedAt))
    .groupBy(transactions.accountId)
    .as('flows');
}

/** What Transfers put into each Account, deleted ones left out. */
function transfersInByAccount() {
  return scopedTx()
    .select({
      accountId: sql<string>`${transactions.toAccountId}`.as('to_account_id'),
      transferredIn: sumOf(transactions.toAmount).as('transferred_in'),
    })
    .from(transactions)
    .where(and(eq(transactions.type, 'TRANSFER'), isNull(transactions.deletedAt)))
    .groupBy(transactions.toAccountId)
    .as('transfers_in');
}

interface Row extends Omit<AccountWire, 'openingBalance' | 'balance' | 'archived'> {
  minorUnits: number;
  openingBalance: bigint;
  archivedAt: Date | null;
  inflow: string | null;
  outflow: string | null;
  transferredIn: string | null;
}

function toWire(row: Row): AccountWire {
  const { minorUnits, archivedAt, inflow, outflow, transferredIn, ...account } = row;
  const currency = { code: row.currency, minorUnits };
  const effects = [
    flowEffect('IN', BigInt(inflow ?? 0) + BigInt(transferredIn ?? 0), row.class),
    flowEffect('OUT', BigInt(outflow ?? 0), row.class),
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
    const flows = flowsByAccount();
    const transfersIn = transfersInByAccount();
    return scopedTx()
      .select({
        ...columns,
        inflow: flows.inflow,
        outflow: flows.outflow,
        transferredIn: transfersIn.transferredIn,
      })
      .from(accounts)
      .innerJoin(currencies, eq(currencies.code, accounts.currency))
      .leftJoin(flows, eq(flows.accountId, accounts.id))
      .leftJoin(transfersIn, eq(transfersIn.accountId, accounts.id))
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
