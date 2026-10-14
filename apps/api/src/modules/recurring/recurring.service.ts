import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  addDays,
  amountToWire,
  dueOccurrences,
  hasRole,
  isIsoDay,
  isOccurrence,
  nextOccurrence,
  todayIn,
} from '@daric/core';
import type {
  CalendarSystem,
  ConfirmOccurrenceInput,
  DueOccurrencesWire,
  DueOccurrenceWire,
  IsoDay,
  ParsedCreateRecurringRuleInput,
  RecurringRuleWire,
  TransactionType,
  TransactionWire,
  UpdateRecurringRuleInput,
} from '@daric/core';
import { and, asc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { createOnce, unlessMissing, type Created } from '../../common/create-once';
import { isUuid, type Membership } from '../../common/request';
import {
  accounts,
  categories,
  recurringOccurrences,
  recurringRules,
  workspaces,
} from '../../db/schema';
import { scopedTx } from '../../db/scope';
import { AuditService } from '../audit/audit.service';
import { TransactionsService } from '../transactions/transactions.service';

const columns = {
  id: recurringRules.id,
  name: recurringRules.name,
  type: recurringRules.type,
  accountId: recurringRules.accountId,
  categoryId: recurringRules.categoryId,
  amount: recurringRules.amount,
  frequency: recurringRules.frequency,
  interval: recurringRules.interval,
  startOn: recurringRules.startOn,
  endOn: recurringRules.endOn,
  dueFrom: recurringRules.dueFrom,
  autoPost: recurringRules.autoPost,
  createdBy: recurringRules.createdBy,
  archivedAt: recurringRules.archivedAt,
  version: recurringRules.version,
};

type Row = { [K in keyof typeof columns]: (typeof recurringRules.$inferSelect)[K] };

/** The Workspace Calendar and the day it is there now. */
interface Today {
  calendar: CalendarSystem;
  today: IsoDay;
}

export const OCCURRENCE_SKIPPED = 'This occurrence was skipped';
export const OCCURRENCE_CONFIRMED = 'This occurrence was confirmed';
export const NOT_DUE = 'Not a Due Occurrence of this rule';
export const TRANSACTION_DELETED =
  'This occurrence was confirmed, and the Transaction confirming it was deleted since';

function toWire(row: Row, { calendar, today }: Today): RecurringRuleWire {
  const { archivedAt, createdBy: _, dueFrom: _from, ...rest } = row;
  return {
    ...rest,
    amount: amountToWire(row.amount),
    archived: archivedAt !== null,
    nextDueOn: archivedAt ? null : nextOccurrence(row, calendar, addDays(today, 1)),
  };
}

function toDueWire(row: Row, dueOn: IsoDay): DueOccurrenceWire {
  return {
    ruleId: row.id,
    dueOn,
    name: row.name,
    type: row.type,
    accountId: row.accountId,
    categoryId: row.categoryId,
    amount: amountToWire(row.amount),
  };
}

// Queries filter by id only: WorkspaceGuard and row-level security keep them
// inside the caller's Workspace (ADR-0001); the composite foreign keys keep a
// rule's Account and Category, and an occurrence's rule and Transaction, in
// its Workspace too.
@Injectable()
export class RecurringService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(TransactionsService) private readonly transactions: TransactionsService,
  ) {}

  private async today(workspaceId: string): Promise<Today> {
    const [workspace] = await scopedTx()
      .select({ calendar: workspaces.calendar, timezone: workspaces.timezone })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    // Row-level security hides a Workspace the caller is not a Member of.
    if (!workspace) throw new NotFoundException();
    return { calendar: workspace.calendar, today: todayIn(new Date(), workspace.timezone) };
  }

  private select(where: SQL | undefined) {
    return scopedTx()
      .select(columns)
      .from(recurringRules)
      .where(where)
      .orderBy(asc(recurringRules.createdAt), asc(recurringRules.id));
  }

  async list(
    membership: Membership,
    { includeArchived }: { includeArchived: boolean },
  ): Promise<RecurringRuleWire[]> {
    const today = await this.today(membership.workspaceId);
    const rows = await this.select(includeArchived ? undefined : isNull(recurringRules.archivedAt));
    return rows.map((row) => toWire(row, today));
  }

  private async row(ruleId: string, { lock = false } = {}): Promise<Row> {
    if (!isUuid(ruleId)) throw new NotFoundException();
    const query = this.select(eq(recurringRules.id, ruleId));
    const [row] = await (lock ? query.for('update') : query);
    if (!row) throw new NotFoundException();
    return row;
  }

  async get(membership: Membership, ruleId: string): Promise<RecurringRuleWire> {
    return toWire(await this.row(ruleId), await this.today(membership.workspaceId));
  }

  /** Sending the same id again answers with the rule it holds now (`created: false`). */
  async create(
    membership: Membership,
    userId: string,
    input: ParsedCreateRecurringRuleInput,
  ): Promise<Created<RecurringRuleWire>> {
    const { workspaceId } = membership;
    await this.today(workspaceId);
    return createOnce(
      input.id,
      (id) => unlessMissing(this.get(membership, id)),
      async () => {
        await this.assertUsableAccount(input.accountId);
        await this.assertUsableCategory(input.categoryId, input.type);
        const tx = scopedTx();
        const [created] = await tx
          .insert(recurringRules)
          .values({ ...input, workspaceId, createdBy: userId })
          .onConflictDoNothing({ target: recurringRules.id })
          .returning({ id: recurringRules.id });
        if (!created) return undefined;
        await this.audit.record(tx, {
          action: 'recurring.create',
          actorUserId: userId,
          workspaceId,
          metadata: { ruleId: created.id },
        });
        return this.get(membership, created.id);
      },
    );
  }

  /**
   * Changes a rule. Occurrences already confirmed or skipped stay so; an
   * archived Account or Category the rule already has may stay. A new start,
   * frequency or interval applies from tomorrow: no earlier day of the new
   * schedule comes due, so days already handled do not come back.
   */
  async update(
    membership: Membership,
    userId: string,
    ruleId: string,
    input: UpdateRecurringRuleInput,
  ): Promise<RecurringRuleWire> {
    const current = await this.row(ruleId, { lock: true });
    const { archived, ...fields } = input;
    const next = { ...current, ...fields };
    if (next.endOn !== null && next.endOn < next.startOn) {
      throw new BadRequestException('A rule cannot end before it starts');
    }
    if (next.accountId !== current.accountId) await this.assertUsableAccount(next.accountId);
    if (next.categoryId !== current.categoryId || next.type !== current.type) {
      await this.assertUsableCategory(next.categoryId, next.type, current.categoryId);
    }
    const rescheduled =
      next.startOn !== current.startOn ||
      next.frequency !== current.frequency ||
      next.interval !== current.interval;
    const { today } = await this.today(membership.workspaceId);
    const tx = scopedTx();
    await tx
      .update(recurringRules)
      .set({
        ...fields,
        ...(rescheduled && { dueFrom: addDays(today, 1) }),
        // Archiving again keeps the first archive time.
        ...(archived !== undefined && {
          archivedAt: archived ? (current.archivedAt ?? sql`now()`) : null,
        }),
        version: sql`${recurringRules.version} + 1`,
      })
      .where(eq(recurringRules.id, ruleId));
    await this.audit.record(tx, {
      action: 'recurring.update',
      actorUserId: userId,
      workspaceId: membership.workspaceId,
      metadata: { ruleId, fields: Object.keys(input) },
    });
    return this.get(membership, ruleId);
  }

  /**
   * The Workspace's Due Occurrences, oldest first. Those of auto-posting rules
   * are recorded first, and leave the list, unless the rule's Account or
   * Category is archived: then they wait like any other. Only a Member or
   * above records them; a Viewer's list leaves them out until then.
   */
  async due(membership: Membership, userId: string): Promise<DueOccurrencesWire> {
    const today = await this.today(membership.workspaceId);
    const rules = await this.select(isNull(recurringRules.archivedAt));
    const handled = await this.handled(rules.map((rule) => rule.id));
    let autoPosted = 0;
    const due: DueOccurrenceWire[] = [];
    for (const rule of rules) {
      const handledDays = handled.get(rule.id) ?? [];
      const days = dueOccurrences(rule, today.calendar, today.today, handledDays, rule.dueFrom);
      if (days.length > 0 && rule.autoPost && (await this.usable(rule))) {
        if (hasRole(membership.role, 'MEMBER')) {
          autoPosted += await this.autoPost(membership, userId, rule.id, today);
        }
      } else {
        due.push(...days.map((dueOn) => toDueWire(rule, dueOn)));
      }
    }
    // A stable sort keeps rules of one day in the order they were made.
    due.sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0));
    return { occurrences: due, autoPosted };
  }

  /** The days of each rule's occurrences already confirmed or skipped. */
  private async handled(ruleIds: string[]): Promise<Map<string, IsoDay[]>> {
    const byRule = new Map<string, IsoDay[]>();
    if (ruleIds.length === 0) return byRule;
    const rows = await scopedTx()
      .select({ ruleId: recurringOccurrences.ruleId, dueOn: recurringOccurrences.dueOn })
      .from(recurringOccurrences)
      .where(inArray(recurringOccurrences.ruleId, ruleIds));
    for (const { ruleId, dueOn } of rows)
      byRule.set(ruleId, [...(byRule.get(ruleId) ?? []), dueOn]);
    return byRule;
  }

  /**
   * Records every Due Occurrence of an auto-posting rule, as its creator (or
   * the caller, once the creator's account is gone). The rule is locked and
   * read again, so two requests catching up at once record each occurrence once.
   */
  private async autoPost(
    membership: Membership,
    userId: string,
    ruleId: string,
    { calendar, today }: Today,
  ): Promise<number> {
    const rule = await this.row(ruleId, { lock: true });
    const handled = (await this.handled([ruleId])).get(ruleId) ?? [];
    const days = dueOccurrences(rule, calendar, today, handled, rule.dueFrom);
    for (const dueOn of days) {
      const { transaction } = await this.record(
        membership,
        rule.createdBy ?? userId,
        rule,
        dueOn,
        {},
      );
      await this.audit.record(scopedTx(), {
        action: 'recurring.auto_post',
        actorUserId: null,
        workspaceId: membership.workspaceId,
        metadata: { ruleId, dueOn, transactionId: transaction.id },
      });
    }
    return days.length;
  }

  /**
   * Records a Due Occurrence as a Transaction on the day it fell due, with
   * `input.amount` or the rule's. Confirming one already confirmed answers
   * with its Transaction (`created: false`) and records nothing.
   */
  async confirm(
    membership: Membership,
    userId: string,
    ruleId: string,
    dueOn: string,
    input: ConfirmOccurrenceInput,
  ): Promise<{ created: boolean; transaction: TransactionWire }> {
    const { rule, handled } = await this.lockOccurrence(membership, ruleId, dueOn);
    if (handled) {
      if (handled.status === 'SKIPPED' || !handled.transactionId) {
        throw new ConflictException(OCCURRENCE_SKIPPED);
      }
      try {
        return { created: false, transaction: await this.transactions.get(handled.transactionId) };
      } catch (error) {
        if (error instanceof NotFoundException) throw new ConflictException(TRANSACTION_DELETED);
        throw error;
      }
    }
    const recorded = await this.record(membership, userId, rule, dueOn, input);
    await this.audit.record(scopedTx(), {
      action: 'recurring.confirm',
      actorUserId: userId,
      workspaceId: membership.workspaceId,
      metadata: { ruleId, dueOn, transactionId: recorded.transaction.id },
    });
    return recorded;
  }

  /** Skips a Due Occurrence; skipping one already skipped changes nothing. */
  async skip(membership: Membership, userId: string, ruleId: string, dueOn: string) {
    const { handled } = await this.lockOccurrence(membership, ruleId, dueOn);
    if (handled) {
      if (handled.status === 'CONFIRMED') throw new ConflictException(OCCURRENCE_CONFIRMED);
      return;
    }
    const tx = scopedTx();
    await tx.insert(recurringOccurrences).values({
      ruleId,
      dueOn,
      workspaceId: membership.workspaceId,
      status: 'SKIPPED',
    });
    await this.audit.record(tx, {
      action: 'recurring.skip',
      actorUserId: userId,
      workspaceId: membership.workspaceId,
      metadata: { ruleId, dueOn },
    });
  }

  /**
   * Locks a rule so its occurrences are handled one at a time, and reads how
   * the occurrence on `dueOn` was handled, if it was. 404 for a rule or day
   * that does not parse or exist; 400 unless an occurrence not yet handled
   * is due on `dueOn`.
   */
  private async lockOccurrence(membership: Membership, ruleId: string, dueOn: string) {
    if (!isIsoDay(dueOn)) throw new NotFoundException();
    const rule = await this.row(ruleId, { lock: true });
    const [handled] = await scopedTx()
      .select({
        status: recurringOccurrences.status,
        transactionId: recurringOccurrences.transactionId,
      })
      .from(recurringOccurrences)
      .where(and(eq(recurringOccurrences.ruleId, ruleId), eq(recurringOccurrences.dueOn, dueOn)));
    if (handled) return { rule, handled };
    const { calendar, today } = await this.today(membership.workspaceId);
    const beforeDue = dueOn > today || (rule.dueFrom !== null && dueOn < rule.dueFrom);
    if (rule.archivedAt || beforeDue || !isOccurrence(rule, calendar, dueOn)) {
      throw new BadRequestException(NOT_DUE);
    }
    return { rule, handled: undefined };
  }

  /** Records the Transaction of an occurrence and marks the occurrence confirmed. */
  private async record(
    membership: Membership,
    userId: string,
    rule: Row,
    dueOn: IsoDay,
    input: ConfirmOccurrenceInput,
  ) {
    const recorded = await this.transactions.create(membership, userId, {
      type: rule.type,
      accountId: rule.accountId,
      categoryId: rule.categoryId,
      amount: input.amount ?? rule.amount,
      occurredOn: dueOn,
      note: rule.name,
      labelIds: [],
    });
    await scopedTx().insert(recurringOccurrences).values({
      ruleId: rule.id,
      dueOn,
      workspaceId: membership.workspaceId,
      status: 'CONFIRMED',
      transactionId: recorded.transaction.id,
    });
    return recorded;
  }

  /** Whether a Transaction can be recorded from the rule: its Account and Category are active. */
  private async usable(rule: Row): Promise<boolean> {
    const [account] = await scopedTx()
      .select({ archivedAt: accounts.archivedAt })
      .from(accounts)
      .where(eq(accounts.id, rule.accountId));
    const [category] = await scopedTx()
      .select({ archivedAt: categories.archivedAt })
      .from(categories)
      .where(eq(categories.id, rule.categoryId));
    return !account?.archivedAt && !category?.archivedAt;
  }

  private async assertUsableAccount(accountId: string): Promise<void> {
    const [account] = await scopedTx()
      .select({ archivedAt: accounts.archivedAt })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    if (!account) throw new BadRequestException('Account not found');
    if (account.archivedAt) throw new BadRequestException('The Account is archived');
  }

  /** An active Category of the rule's type, or the archived one it already has. */
  private async assertUsableCategory(
    categoryId: string,
    type: TransactionType,
    kept?: string,
  ): Promise<void> {
    const [category] = await scopedTx()
      .select({ kind: categories.kind, archivedAt: categories.archivedAt })
      .from(categories)
      .where(eq(categories.id, categoryId));
    if (!category) throw new BadRequestException('Category not found');
    if (category.kind !== type) {
      throw new BadRequestException(`An ${type} rule needs an ${type} Category`);
    }
    if (category.archivedAt && categoryId !== kept) {
      throw new BadRequestException('The Category is archived');
    }
  }
}
