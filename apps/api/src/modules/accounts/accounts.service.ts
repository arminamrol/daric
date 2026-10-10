import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { accountBalance, amountToWire } from '@daric/core';
import type { AccountWire, CreateAccountInput, UpdateAccountInput } from '@daric/core';
import { eq, isNull, sql, type SQL } from 'drizzle-orm';
import { isUuid, type Membership } from '../../common/request';
import { one } from '../../db/client';
import { accounts, currencies, workspaces } from '../../db/schema';
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

interface Row extends Omit<AccountWire, 'openingBalance' | 'balance' | 'archived'> {
  minorUnits: number;
  openingBalance: bigint;
  archivedAt: Date | null;
}

function toWire(row: Row): AccountWire {
  const { minorUnits, archivedAt, ...account } = row;
  // No Transactions yet: the balance is the opening balance (ticket 11 adds their effect).
  const balance = accountBalance({
    currency: { code: row.currency, minorUnits },
    openingBalance: row.openingBalance,
  });
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
    return scopedTx()
      .select(columns)
      .from(accounts)
      .innerJoin(currencies, eq(currencies.code, accounts.currency))
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
