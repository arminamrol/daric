import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  accountValue,
  amountToWire,
  currencyByCode,
  dueAutoSnapshotDays,
  money,
  netWorth,
  todayIn,
} from '@daric/core';
import type {
  IsoDay,
  NetWorthSnapshotSummaryWire,
  NetWorthSnapshotWire,
  NetWorthWire,
  Valuation,
} from '@daric/core';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { DATABASE } from '../../common/di-tokens';
import { isUuid, type Membership } from '../../common/request';
import type { Database } from '../../db/client';
import { netWorthSnapshots, workspaceMembers, workspaces } from '../../db/schema';
import { runInWorkspace, scopedTx } from '../../db/scope';
import { AccountsService } from '../accounts/accounts.service';
import { AuditService } from '../audit/audit.service';
import { ratesInto } from '../exchange-rates/exchange-rates.service';
import { allValuations } from '../valuations/valuations.service';

type SnapshotRow = typeof netWorthSnapshots.$inferSelect;

const summaryColumns = {
  id: netWorthSnapshots.id,
  kind: netWorthSnapshots.kind,
  day: netWorthSnapshots.day,
  createdAt: netWorthSnapshots.createdAt,
  baseCurrency: netWorthSnapshots.baseCurrency,
  total: netWorthSnapshots.total,
  assets: netWorthSnapshots.assets,
  liabilities: netWorthSnapshots.liabilities,
  missing: sql<string[]>`${netWorthSnapshots.breakdown} -> 'missing'`,
};

function toSummary(
  row: Pick<SnapshotRow, Exclude<keyof typeof summaryColumns, 'missing'>> & { missing: string[] },
): NetWorthSnapshotSummaryWire {
  const { createdAt, total, assets, liabilities, ...rest } = row;
  return {
    ...rest,
    takenAt: createdAt.toISOString(),
    total: amountToWire(total),
    assets: amountToWire(assets),
    liabilities: amountToWire(liabilities),
  };
}

function toSnapshot(row: SnapshotRow): NetWorthSnapshotWire {
  const { id, kind, day, createdAt, baseCurrency, total, assets, liabilities, breakdown } = row;
  return {
    id,
    kind,
    day,
    takenAt: createdAt.toISOString(),
    baseCurrency,
    total: amountToWire(total),
    assets: amountToWire(assets),
    liabilities: amountToWire(liabilities),
    ...breakdown,
  };
}

@Injectable()
export class NetWorthService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private async workspace(workspaceId: string) {
    const [workspace] = await scopedTx()
      .select({ baseCurrency: workspaces.baseCurrency, timezone: workspaces.timezone })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    // Row-level security hides a Workspace the caller is not a Member of.
    if (!workspace) throw new NotFoundException();
    return workspace;
  }

  /**
   * Net Worth today in the Workspace's timezone: every Account, archived ones
   * included, at its latest Valuation on or before today, else its balance.
   */
  async get(membership: Membership): Promise<NetWorthWire> {
    const workspace = await this.workspace(membership.workspaceId);
    return this.on(todayIn(new Date(), workspace.timezone), workspace.baseCurrency);
  }

  /**
   * Net Worth on `day` in `baseCurrency`, in the current Workspace scope. With
   * `balancesOn`, balances count only Transactions on or before that day;
   * otherwise every Transaction, as Accounts show them.
   */
  private async on(day: IsoDay, baseCurrency: string, balancesOn?: IsoDay): Promise<NetWorthWire> {
    const base = currencyByCode(baseCurrency);
    const accounts = await this.accounts.list({
      includeArchived: true,
      ...(balancesOn !== undefined && { balancesOn }),
    });
    const valuations = await allValuations();
    const rates = await ratesInto(base.code);

    const byAccount = new Map<string, Valuation[]>();
    for (const v of valuations)
      byAccount.set(v.accountId, [...(byAccount.get(v.accountId) ?? []), v]);
    const valued = accounts.map((account) => {
      const balance = money(BigInt(account.balance), currencyByCode(account.currency));
      return { account, ...accountValue(balance, byAccount.get(account.id) ?? [], day) };
    });
    const result = netWorth(
      valued.map(({ account, value }) => ({ id: account.id, class: account.class, value })),
      base,
      rates,
      day,
    );
    return {
      day,
      baseCurrency: base.code,
      total: amountToWire(result.total.amount),
      assets: amountToWire(result.assets.amount),
      liabilities: amountToWire(result.liabilities.amount),
      byCurrency: result.byCurrency.map((c) => ({
        currency: c.currency.code,
        assets: amountToWire(c.assets.amount),
        liabilities: amountToWire(c.liabilities.amount),
        net: amountToWire(c.net.amount),
      })),
      accounts: valued.map(({ account, value, valuedOn }, index) => {
        const inBase = result.accounts[index]?.inBase;
        return {
          accountId: account.id,
          name: account.name,
          class: account.class,
          currency: account.currency,
          archived: account.archived,
          value: amountToWire(value.amount),
          valuedOn,
          inBase: inBase ? amountToWire(inBase.amount) : null,
        };
      }),
      ratesUsed: result.ratesUsed,
      missing: result.missing.map((c) => c.code),
    };
  }

  /** Stores `figure`; an AUTO one already stored for its day is left as it is (null). */
  private async store(
    workspaceId: string,
    kind: SnapshotRow['kind'],
    figure: NetWorthWire,
  ): Promise<SnapshotRow | null> {
    const { day, baseCurrency, total, assets, liabilities, ...breakdown } = figure;
    const [row] = await scopedTx()
      .insert(netWorthSnapshots)
      .values({
        workspaceId,
        kind,
        day,
        baseCurrency,
        total: BigInt(total),
        assets: BigInt(assets),
        liabilities: BigInt(liabilities),
        breakdown,
      })
      .onConflictDoNothing()
      .returning();
    return row ?? null;
  }

  /** Stores today's Net Worth, exactly as `get` shows it, as a MANUAL snapshot. */
  async takeSnapshot(membership: Membership, userId: string): Promise<NetWorthSnapshotWire> {
    const { workspaceId } = membership;
    const row = await this.store(workspaceId, 'MANUAL', await this.get(membership));
    if (!row) throw new Error('A MANUAL snapshot cannot conflict');
    await this.audit.record(scopedTx(), {
      action: 'net_worth_snapshot.create',
      actorUserId: userId,
      workspaceId,
      metadata: { snapshotId: row.id },
    });
    return toSnapshot(row);
  }

  /** Every snapshot, oldest first; same-day ones in the order they were taken. */
  async history(): Promise<NetWorthSnapshotSummaryWire[]> {
    const rows = await scopedTx()
      .select(summaryColumns)
      .from(netWorthSnapshots)
      .orderBy(
        asc(netWorthSnapshots.day),
        asc(netWorthSnapshots.createdAt),
        asc(netWorthSnapshots.id),
      );
    return rows.map(toSummary);
  }

  async snapshot(snapshotId: string): Promise<NetWorthSnapshotWire> {
    if (!isUuid(snapshotId)) throw new NotFoundException();
    const [row] = await scopedTx()
      .select()
      .from(netWorthSnapshots)
      .where(eq(netWorthSnapshots.id, snapshotId));
    if (!row) throw new NotFoundException();
    return toSnapshot(row);
  }

  /**
   * Takes the AUTO snapshots due at `now` in every Workspace: one of the last
   * day of each Workspace-Calendar month that has ended, as of that day, with
   * balances counting only Transactions up to it. Safe to run again and from
   * several processes at once: a month that has its snapshot is not taken
   * again. Returns how many were taken; throws after trying every Workspace
   * if any failed.
   */
  async takeDueAutoSnapshots(now: Date): Promise<number> {
    // Outside any request: read every Workspace past row-level security, then
    // work in each one scoped as one of its Members, an Owner first.
    const all = await this.db
      .select({ id: workspaces.id, createdAt: workspaces.createdAt })
      .from(workspaces)
      .orderBy(workspaces.createdAt);
    const members = await this.db
      .select({ workspaceId: workspaceMembers.workspaceId, userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .orderBy(desc(sql`${workspaceMembers.role} = 'OWNER'`), workspaceMembers.createdAt);
    const memberOf = new Map<string, string>();
    for (const m of members)
      if (!memberOf.has(m.workspaceId)) memberOf.set(m.workspaceId, m.userId);
    let taken = 0;
    const failures: unknown[] = [];
    for (const { id: workspaceId, createdAt } of all) {
      const memberId = memberOf.get(workspaceId);
      if (!memberId) continue;
      // One Workspace failing does not hold up the others.
      try {
        taken += await runInWorkspace(this.db, { userId: memberId, workspaceId }, () =>
          this.takeDueAutoSnapshotsIn(workspaceId, createdAt, now),
        );
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0)
      throw new AggregateError(failures, `${failures.length} Workspaces failed (${taken} taken)`);
    return taken;
  }

  private async takeDueAutoSnapshotsIn(
    workspaceId: string,
    createdAt: Date,
    now: Date,
  ): Promise<number> {
    const tx = scopedTx();
    const [workspace] = await tx
      .select({
        baseCurrency: workspaces.baseCurrency,
        calendar: workspaces.calendar,
        timeZone: workspaces.timezone,
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    if (!workspace) return 0;
    const [last] = await tx
      .select({ day: netWorthSnapshots.day })
      .from(netWorthSnapshots)
      .where(eq(netWorthSnapshots.kind, 'AUTO'))
      .orderBy(desc(netWorthSnapshots.day))
      .limit(1);
    const days = dueAutoSnapshotDays(workspace, now, {
      createdAt,
      lastAutoDay: last?.day ?? null,
    });
    let taken = 0;
    for (const day of days) {
      const figure = await this.on(day, workspace.baseCurrency, day);
      if (await this.store(workspaceId, 'AUTO', figure)) taken += 1;
    }
    return taken;
  }
}
