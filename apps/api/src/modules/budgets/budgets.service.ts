import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  amountToWire,
  budgetExpenses,
  budgetPeriodOf,
  budgetProgress,
  currencyByCode,
  dayOf,
  money,
  monthPeriodOfDay,
  periodDays,
  periodParam,
  rateDayOf,
  todayIn,
  toBaseCurrency,
} from '@daric/core';
import type {
  BudgetProgressWire,
  BudgetWire,
  CreateBudgetInput,
  MonthPeriod,
  UpdateBudgetInput,
} from '@daric/core';
import { and, asc, eq, gte, isNull, lt, sql, type SQL } from 'drizzle-orm';
import { isUniqueViolation } from '../../common/db-errors';
import { isUuid, type Membership } from '../../common/request';
import { one } from '../../db/client';
import {
  accounts,
  budgets,
  categories,
  labels,
  transactionLabels,
  transactions,
  workspaces,
} from '../../db/schema';
import { scopedTx } from '../../db/scope';
import { AuditService } from '../audit/audit.service';
import { ratesInto } from '../exchange-rates/exchange-rates.service';

const columns = {
  id: budgets.id,
  categoryId: budgets.categoryId,
  labelId: budgets.labelId,
  period: budgets.period,
  amount: budgets.amount,
  currency: budgets.currency,
  version: budgets.version,
};

type Row = { [K in keyof typeof columns]: (typeof budgets.$inferSelect)[K] };

export const BUDGET_TAKEN = 'The Category already has a Budget for this Label and Period';

// Queries filter by id only: WorkspaceGuard and row-level security keep them
// inside the caller's Workspace (ADR-0001); the composite foreign keys keep a
// Budget's Category and Label in its Workspace too.
@Injectable()
export class BudgetsService {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  private async workspace(workspaceId: string) {
    const [workspace] = await scopedTx()
      .select({
        calendar: workspaces.calendar,
        timezone: workspaces.timezone,
        baseCurrency: workspaces.baseCurrency,
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    // Row-level security hides a Workspace the caller is not a Member of.
    if (!workspace) throw new NotFoundException();
    return workspace;
  }

  private async select(where: SQL | undefined): Promise<Row[]> {
    return scopedTx()
      .select(columns)
      .from(budgets)
      .where(where)
      .orderBy(asc(budgets.createdAt), asc(budgets.id));
  }

  /**
   * Each Budget with its progress in `month` (the current month by default), or
   * in the year holding it for a yearly Budget. A Budget in the current Base
   * Currency converts Expenses in other currencies at the rate on the Period's
   * last day (or today); those with no rate, or on any Budget in a former Base
   * Currency, are counted apart.
   */
  private async withProgress(
    membership: Membership,
    rows: Row[],
    month: MonthPeriod | undefined,
  ): Promise<BudgetWire[]> {
    if (rows.length === 0) return [];
    const workspace = await this.workspace(membership.workspaceId);
    const { calendar, baseCurrency } = workspace;
    const today = todayIn(new Date(), workspace.timezone);
    const shown = month ?? monthPeriodOfDay(today, calendar);
    const day = dayOf(calendar, { year: shown.year, month: shown.month, day: 1 });
    // The year holds the month, so one read serves monthly and yearly Budgets.
    const { from, until } = periodDays({ kind: 'year', year: shown.year }, calendar);
    const tx = scopedTx();
    const workspaceCategories = await tx
      .select({ id: categories.id, kind: categories.kind, parentId: categories.parentId })
      .from(categories);
    const expenses = await tx
      .select({
        type: transactions.type,
        categoryId: transactions.categoryId,
        amount: transactions.amount,
        occurredOn: transactions.occurredOn,
        currency: accounts.currency,
        labelIds: sql<string[]>`(
          SELECT coalesce(array_agg(${transactionLabels.labelId}), '{}')::text[]
          FROM ${transactionLabels} WHERE ${transactionLabels.transactionId} = ${transactions.id}
        )`,
      })
      .from(transactions)
      .innerJoin(accounts, eq(accounts.id, transactions.accountId))
      .where(
        and(
          isNull(transactions.deletedAt),
          eq(transactions.type, 'EXPENSE'),
          gte(transactions.occurredOn, from),
          lt(transactions.occurredOn, until),
        ),
      );
    const rates = await ratesInto(baseCurrency);

    return rows.map((row) => {
      const period = budgetPeriodOf(row.period, day, calendar);
      const scope = { budget: row, period, calendar, categories: workspaceCategories };
      const counted = budgetExpenses(scope, expenses);
      let spent = counted
        .filter((t) => t.currency === row.currency)
        .reduce((sum, t) => sum + t.amount, 0n);
      let otherCurrency = counted.filter((t) => t.currency !== row.currency);
      let ratesUsed: BudgetProgressWire['ratesUsed'] = [];
      if (row.currency === baseCurrency) {
        const converted = toBaseCurrency(
          counted.map((t) => money(t.amount, currencyByCode(t.currency))),
          currencyByCode(baseCurrency),
          rates,
          rateDayOf(period, calendar, today),
        );
        spent = converted.total.amount;
        ratesUsed = converted.ratesUsed;
        const missing = new Set(converted.missing.map((c) => c.code));
        otherCurrency = otherCurrency.filter((t) => missing.has(t.currency));
      }
      const progress = budgetProgress(row.amount, spent);
      return {
        ...row,
        amount: amountToWire(row.amount),
        progress: {
          period: periodParam(period),
          spent: amountToWire(progress.spent),
          remaining: amountToWire(progress.remaining),
          percent: progress.percent,
          state: progress.state,
          ratesUsed,
          otherCurrencyExpenses: otherCurrency.length,
        },
      };
    });
  }

  async list(membership: Membership, month: MonthPeriod | undefined): Promise<BudgetWire[]> {
    return this.withProgress(membership, await this.select(undefined), month);
  }

  private async row(budgetId: string): Promise<Row> {
    if (!isUuid(budgetId)) throw new NotFoundException();
    const [row] = await this.select(eq(budgets.id, budgetId));
    if (!row) throw new NotFoundException();
    return row;
  }

  async get(
    membership: Membership,
    budgetId: string,
    month: MonthPeriod | undefined,
  ): Promise<BudgetWire> {
    return one(await this.withProgress(membership, [await this.row(budgetId)], month));
  }

  async create(
    membership: Membership,
    userId: string,
    input: CreateBudgetInput,
    month: MonthPeriod | undefined,
  ): Promise<BudgetWire> {
    const { workspaceId } = membership;
    const { baseCurrency } = await this.workspace(workspaceId);
    const labelId = input.labelId ?? null;
    await this.assertActiveExpenseCategory(input.categoryId);
    if (labelId) await this.assertActiveLabel(labelId);
    const tx = scopedTx();
    const created = one(
      await this.write(() =>
        tx
          .insert(budgets)
          .values({ ...input, labelId, workspaceId, currency: baseCurrency })
          .returning({ id: budgets.id }),
      ),
    );
    await this.audit.record(tx, {
      action: 'budget.create',
      actorUserId: userId,
      workspaceId,
      metadata: { budgetId: created.id },
    });
    return this.get(membership, created.id, month);
  }

  async update(
    membership: Membership,
    userId: string,
    budgetId: string,
    input: UpdateBudgetInput,
    month: MonthPeriod | undefined,
  ): Promise<BudgetWire> {
    const current = await this.row(budgetId);
    // An archived Category or Label the Budget already has may stay.
    if (input.categoryId !== undefined && input.categoryId !== current.categoryId) {
      await this.assertActiveExpenseCategory(input.categoryId);
    }
    if (input.labelId && input.labelId !== current.labelId) {
      await this.assertActiveLabel(input.labelId);
    }
    const tx = scopedTx();
    await this.write(() =>
      tx
        .update(budgets)
        .set({ ...input, version: sql`${budgets.version} + 1` })
        .where(eq(budgets.id, budgetId)),
    );
    await this.audit.record(tx, {
      action: 'budget.update',
      actorUserId: userId,
      workspaceId: membership.workspaceId,
      metadata: { budgetId, fields: Object.keys(input) },
    });
    return this.get(membership, budgetId, month);
  }

  async remove(membership: Membership, userId: string, budgetId: string): Promise<void> {
    await this.row(budgetId);
    const tx = scopedTx();
    await tx.delete(budgets).where(eq(budgets.id, budgetId));
    await this.audit.record(tx, {
      action: 'budget.delete',
      actorUserId: userId,
      workspaceId: membership.workspaceId,
      metadata: { budgetId },
    });
  }

  private async assertActiveExpenseCategory(categoryId: string): Promise<void> {
    const [category] = await scopedTx()
      .select({ kind: categories.kind, archivedAt: categories.archivedAt })
      .from(categories)
      .where(eq(categories.id, categoryId));
    if (!category) throw new BadRequestException('No such Category');
    if (category.kind !== 'EXPENSE') {
      throw new BadRequestException('Only Expense Categories have Budgets');
    }
    if (category.archivedAt) throw new BadRequestException('The Category is archived');
  }

  private async assertActiveLabel(labelId: string): Promise<void> {
    const [label] = await scopedTx()
      .select({ archivedAt: labels.archivedAt })
      .from(labels)
      .where(eq(labels.id, labelId));
    if (!label) throw new BadRequestException('No such Label');
    if (label.archivedAt) throw new BadRequestException('The Label is archived');
  }

  /** Runs a write that may hit the one-Budget-per-Category rule, answering 409 if it does. */
  private async write<T>(query: () => Promise<T>): Promise<T> {
    try {
      return await query();
    } catch (error) {
      if (isUniqueViolation(error, 'budgets_workspace_id_category_id_label_id_period_key')) {
        throw new ConflictException(BUDGET_TAKEN);
      }
      throw error;
    }
  }
}
