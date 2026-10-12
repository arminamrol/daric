import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { amountToWire } from '@daric/core';
import type { CreateValuationInput, UpdateValuationInput, ValuationWire } from '@daric/core';
import { and, desc, eq, sql } from 'drizzle-orm';
import { isUniqueViolation } from '../../common/db-errors';
import { isUuid, type Membership } from '../../common/request';
import { one } from '../../db/client';
import { accountValuations, accounts } from '../../db/schema';
import { scopedTx } from '../../db/scope';
import { AuditService } from '../audit/audit.service';

const columns = {
  id: accountValuations.id,
  accountId: accountValuations.accountId,
  amount: accountValuations.amount,
  valuedOn: accountValuations.valuedOn,
  version: accountValuations.version,
};

type Row = { [K in keyof typeof columns]: (typeof accountValuations.$inferSelect)[K] };

export const VALUATION_TAKEN = 'The Account already has a Valuation on this day';

function toWire(row: Row): ValuationWire {
  return { ...row, amount: amountToWire(row.amount) };
}

/** Every Valuation of the Workspace in scope, for working out Account values. */
export async function allValuations() {
  return scopedTx()
    .select({
      accountId: accountValuations.accountId,
      amount: accountValuations.amount,
      valuedOn: accountValuations.valuedOn,
    })
    .from(accountValuations);
}

// Queries filter by id only: WorkspaceGuard and row-level security keep them
// inside the caller's Workspace (ADR-0001); the composite foreign key keeps a
// Valuation's Account in its Workspace too.
@Injectable()
export class ValuationsService {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  private async account(accountId: string) {
    if (!isUuid(accountId)) throw new NotFoundException();
    const [account] = await scopedTx()
      .select({ id: accounts.id, archivedAt: accounts.archivedAt })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    if (!account) throw new NotFoundException();
    return account;
  }

  /** The Account's Valuations, newest first. */
  async list(accountId: string): Promise<ValuationWire[]> {
    await this.account(accountId);
    const rows = await scopedTx()
      .select(columns)
      .from(accountValuations)
      .where(eq(accountValuations.accountId, accountId))
      .orderBy(desc(accountValuations.valuedOn));
    return rows.map(toWire);
  }

  private async get(accountId: string, valuationId: string): Promise<ValuationWire> {
    if (!isUuid(valuationId)) throw new NotFoundException();
    const [row] = await scopedTx()
      .select(columns)
      .from(accountValuations)
      .where(
        and(eq(accountValuations.id, valuationId), eq(accountValuations.accountId, accountId)),
      );
    if (!row) throw new NotFoundException();
    return toWire(row);
  }

  /** A new Valuation needs an active Account; an archived one keeps those it has. */
  async create(
    membership: Membership,
    userId: string,
    accountId: string,
    input: CreateValuationInput,
  ): Promise<ValuationWire> {
    const account = await this.account(accountId);
    if (account.archivedAt) throw new BadRequestException('The Account is archived');
    const { workspaceId } = membership;
    const tx = scopedTx();
    const created = one(
      await this.write(() =>
        tx
          .insert(accountValuations)
          .values({ ...input, accountId, workspaceId })
          .returning({ id: accountValuations.id }),
      ),
    );
    await this.audit.record(tx, {
      action: 'valuation.create',
      actorUserId: userId,
      workspaceId,
      metadata: { valuationId: created.id, accountId },
    });
    return this.get(accountId, created.id);
  }

  async update(
    membership: Membership,
    userId: string,
    accountId: string,
    valuationId: string,
    input: UpdateValuationInput,
  ): Promise<ValuationWire> {
    await this.get(accountId, valuationId);
    const tx = scopedTx();
    await this.write(() =>
      tx
        .update(accountValuations)
        .set({ ...input, version: sql`${accountValuations.version} + 1` })
        .where(eq(accountValuations.id, valuationId)),
    );
    await this.audit.record(tx, {
      action: 'valuation.update',
      actorUserId: userId,
      workspaceId: membership.workspaceId,
      metadata: { valuationId, accountId, fields: Object.keys(input) },
    });
    return this.get(accountId, valuationId);
  }

  async remove(
    membership: Membership,
    userId: string,
    accountId: string,
    valuationId: string,
  ): Promise<void> {
    await this.get(accountId, valuationId);
    const tx = scopedTx();
    await tx.delete(accountValuations).where(eq(accountValuations.id, valuationId));
    await this.audit.record(tx, {
      action: 'valuation.delete',
      actorUserId: userId,
      workspaceId: membership.workspaceId,
      metadata: { valuationId, accountId },
    });
  }

  /** Runs a write that may hit the one-Valuation-per-day rule, answering 409 if it does. */
  private async write<T>(query: () => Promise<T>): Promise<T> {
    try {
      return await query();
    } catch (error) {
      if (isUniqueViolation(error, 'account_valuations_account_day_key')) {
        throw new ConflictException(VALUATION_TAKEN);
      }
      throw error;
    }
  }
}
