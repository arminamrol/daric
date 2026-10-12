import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  amountToWire,
  currencyByCode,
  DEFAULT_TRAILING_MONTHS,
  money,
  monthPeriodOfDay,
  periodDays,
  periodParam,
  previousPeriod,
  projectYear,
  todayIn,
} from '@daric/core';
import type {
  ProjectionFigures,
  ProjectionSettings,
  ProjectionWire,
  UpdateProjectionSettingsInput,
} from '@daric/core';
import { and, asc, eq, gte, isNull, lte, min, ne, sql } from 'drizzle-orm';
import type { Membership } from '../../common/request';
import {
  accounts,
  projectionSettings,
  recurringOccurrences,
  recurringRules,
  transactions,
  workspaces,
} from '../../db/schema';
import { scopedTx } from '../../db/scope';
import { AuditService } from '../audit/audit.service';
import { ratesInto } from '../exchange-rates/exchange-rates.service';

function figuresToWire(f: ProjectionFigures) {
  return {
    actual: amountToWire(f.actual),
    average: amountToWire(f.average),
    variable: amountToWire(f.variable),
    recurring: amountToWire(f.recurring),
    projected: amountToWire(f.projected),
  };
}

// Queries read the whole table: WorkspaceGuard and row-level security keep
// them inside the caller's Workspace (ADR-0001).
@Injectable()
export class ProjectionService {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  /** The Workspace's settings, or the defaults while it has never changed them. */
  async settings(): Promise<ProjectionSettings> {
    const [row] = await scopedTx()
      .select({
        trailingMonths: projectionSettings.trailingMonths,
        version: projectionSettings.version,
      })
      .from(projectionSettings);
    return row ?? { trailingMonths: DEFAULT_TRAILING_MONTHS, version: 0 };
  }

  async updateSettings(
    membership: Membership,
    userId: string,
    input: UpdateProjectionSettingsInput,
  ): Promise<ProjectionSettings> {
    const { workspaceId } = membership;
    const tx = scopedTx();
    await tx
      .insert(projectionSettings)
      .values({ workspaceId, ...input })
      .onConflictDoUpdate({
        target: projectionSettings.workspaceId,
        set: { ...input, version: sql`${projectionSettings.version} + 1` },
      });
    await this.audit.record(tx, {
      action: 'projection_settings.update',
      actorUserId: userId,
      workspaceId,
      metadata: { fields: Object.keys(input) },
    });
    return this.settings();
  }

  /**
   * The Automatic Projection of the current Workspace-Calendar year, from the
   * Transactions up to today, the Trailing Average and active Recurring Rules,
   * in the Base Currency.
   */
  async get(membership: Membership): Promise<ProjectionWire> {
    const tx = scopedTx();
    const [workspace] = await tx
      .select({
        calendar: workspaces.calendar,
        timezone: workspaces.timezone,
        baseCurrency: workspaces.baseCurrency,
      })
      .from(workspaces)
      .where(eq(workspaces.id, membership.workspaceId));
    // Row-level security hides a Workspace the caller is not a Member of.
    if (!workspace) throw new NotFoundException();
    const { calendar, baseCurrency } = workspace;
    const today = todayIn(new Date(), workspace.timezone);
    const { trailingMonths } = await this.settings();

    // Read from the earlier of the year's start and the window's first month.
    const thisMonth = monthPeriodOfDay(today, calendar);
    let windowStart = thisMonth;
    for (let i = 0; i < trailingMonths; i++) windowStart = previousPeriod(windowStart);
    const yearStart = periodDays({ kind: 'year', year: thisMonth.year }, calendar).from;
    const from = [periodDays(windowStart, calendar).from, yearStart].sort()[0] as string;

    const rows = await tx
      .select({
        type: transactions.type,
        categoryId: transactions.categoryId,
        amount: transactions.amount,
        occurredOn: transactions.occurredOn,
        currency: accounts.currency,
        // Confirming a Recurring Rule's occurrence links it; such Transactions are not variable.
        recurring: sql<boolean>`EXISTS (
          SELECT 1 FROM ${recurringOccurrences}
          WHERE ${recurringOccurrences.transactionId} = ${transactions.id}
        )`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(
        and(
          isNull(transactions.deletedAt),
          ne(transactions.type, 'TRANSFER'),
          gte(transactions.occurredOn, from),
          lte(transactions.occurredOn, today),
        ),
      );
    const [first] = await tx
      .select({ day: min(transactions.occurredOn) })
      .from(transactions)
      .where(isNull(transactions.deletedAt));
    const rules = await tx
      .select({
        id: recurringRules.id,
        name: recurringRules.name,
        type: recurringRules.type,
        categoryId: recurringRules.categoryId,
        amount: recurringRules.amount,
        currency: accounts.currency,
        frequency: recurringRules.frequency,
        interval: recurringRules.interval,
        startOn: recurringRules.startOn,
        endOn: recurringRules.endOn,
      })
      .from(recurringRules)
      .innerJoin(accounts, eq(accounts.id, recurringRules.accountId))
      .where(isNull(recurringRules.archivedAt))
      .orderBy(asc(recurringRules.createdAt), asc(recurringRules.id));

    const projection = projectYear({
      calendar,
      today,
      trailingMonths,
      base: currencyByCode(baseCurrency),
      rates: await ratesInto(baseCurrency),
      transactions: rows.map((row) => ({
        ...row,
        amount: money(row.amount, currencyByCode(row.currency)),
      })),
      rules: rules.map((rule) => ({
        ...rule,
        amount: money(rule.amount, currencyByCode(rule.currency)),
      })),
      historyFrom: first?.day ?? null,
    });

    return {
      year: projection.year,
      today: projection.today,
      yearEnd: projection.yearEnd,
      baseCurrency,
      remaining: projection.remaining,
      window: projection.window.map(periodParam),
      monthsUsed: projection.monthsUsed,
      income: figuresToWire(projection.income),
      expense: figuresToWire(projection.expense),
      categories: projection.categories.map((c) => ({
        categoryId: c.categoryId,
        type: c.type,
        ...figuresToWire(c),
      })),
      recurring: projection.recurring.map((r) => ({ ...r, total: amountToWire(r.total) })),
      ratesUsed: projection.ratesUsed,
      missing: projection.missing,
      warnings: projection.warnings,
    };
  }
}
