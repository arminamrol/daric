import {
  type BudgetPeriod,
  dayOf,
  daysInMonth,
  type IsoDay,
  type MonthPeriod,
  monthPeriodOfDay,
  periodStart,
  previousPeriod,
} from '@daric/core';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { hashPassword } from '../../modules/auth/passwords';
import { seedDefaultCategories } from '../../modules/categories/defaults';
import { type Database, type Transaction, one } from '../client';
import {
  accountValuations,
  accounts,
  authIdentities,
  budgets,
  categories,
  exchangeRates,
  labels,
  recurringOccurrences,
  recurringRules,
  transactionLabels,
  transactions,
  users,
  workspaceMembers,
  workspaces,
} from '../schema';

export const DEMO_EMAIL = 'demo@example.com';
export const DEMO_PASSWORD = 'daric-demo';

/** Full Jalali months before the current one that get activity. */
const MONTHS_BACK = 6;

const MONTH_NAMES = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

const demoAccounts = {
  mellat: {
    name: 'بانک ملت',
    type: 'BANK',
    class: 'ASSET',
    currency: 'IRR',
    opening: 900_000_000n,
  },
  saman: {
    name: 'کارت سامان',
    type: 'CARD',
    class: 'ASSET',
    currency: 'IRR',
    opening: 60_000_000n,
  },
  cash: { name: 'نقد', type: 'CASH', class: 'ASSET', currency: 'IRR', opening: 8_000_000n },
  wallet: {
    name: 'کیف پول اسنپ',
    type: 'WALLET',
    class: 'ASSET',
    currency: 'IRR',
    opening: 2_000_000n,
  },
  dollars: { name: 'دلار', type: 'CASH', class: 'ASSET', currency: 'USD', opening: 50_000n },
  // Valued each month instead of moved by Transactions.
  gold: { name: 'سکهٔ طلا', type: 'OTHER_ASSET', class: 'ASSET', currency: 'IRR', opening: 0n },
  loan: {
    name: 'وام قرض‌الحسنه',
    type: 'LOAN',
    class: 'LIABILITY',
    currency: 'IRR',
    opening: 300_000_000n,
  },
} as const;
type AccountKey = keyof typeof demoAccounts;

const demoLabels = {
  eatingOut: { name: 'بیرون‌غذا', controllable: true },
  subscriptions: { name: 'اشتراک‌ها', controllable: true },
  online: { name: 'خرید آنلاین', controllable: true },
  essential: { name: 'ضروری', controllable: false },
  nowruz: { name: 'سفر نوروز', controllable: false },
} as const;
type LabelKey = keyof typeof demoLabels;

/** Demo Budgets in rials; Categories are named as in `Scripted`. */
const demoBudgets: {
  category: string;
  label?: LabelKey;
  period: BudgetPeriod;
  amount: bigint;
}[] = [
  { category: 'EXPENSE:خوراک', period: 'MONTHLY', amount: 120_000_000n },
  { category: 'EXPENSE:خوراک', label: 'eatingOut', period: 'MONTHLY', amount: 9_000_000n },
  { category: 'EXPENSE:رفت‌وآمد', period: 'MONTHLY', amount: 15_000_000n },
  { category: 'EXPENSE:قبض‌ها', period: 'MONTHLY', amount: 15_000_000n },
  { category: 'EXPENSE:تفریح و سفر', period: 'YEARLY', amount: 200_000_000n },
];

/** A demo Transaction before ids exist; Categories are named `KIND:name`. */
type Scripted = {
  day: IsoDay;
  account: AccountKey;
  amount: bigint;
  note?: string;
  labels?: LabelKey[];
  /** The demo Recurring Rule it is an occurrence of, confirmed. */
  rule?: RuleKey;
} & (
  | { type: 'INCOME' | 'EXPENSE'; category: string }
  | { type: 'TRANSFER'; to: AccountKey; toAmount?: bigint }
);

/**
 * Recurring Rules behind the monthly salary, rent and subscription, starting
 * with the first demo month on the scripted day. Salary and rent wait for
 * confirmation; the subscription posts itself.
 */
const demoRules = {
  salary: {
    name: 'حقوق',
    type: 'INCOME',
    account: 'mellat',
    category: 'INCOME:حقوق',
    amount: 650_000_000n,
    day: 1,
    autoPost: false,
  },
  rent: {
    name: 'اجارهٔ خانه',
    type: 'EXPENSE',
    account: 'mellat',
    category: 'EXPENSE:اجاره',
    amount: 250_000_000n,
    day: 1,
    autoPost: false,
  },
  filimo: {
    name: 'اشتراک فیلیمو',
    type: 'EXPENSE',
    account: 'wallet',
    category: 'EXPENSE:تفریح و سفر',
    amount: 2_500_000n,
    day: 12,
    autoPost: true,
  },
} as const satisfies Record<
  string,
  {
    name: string;
    type: 'INCOME' | 'EXPENSE';
    account: AccountKey;
    category: string;
    amount: bigint;
    day: number;
    autoPost: boolean;
  }
>;
type RuleKey = keyof typeof demoRules;

/** A small seeded generator (mulberry32), so the same day always seeds the same data. */
function seededRandom(seed: number) {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    /** Rials between `min` and `max`, rounded to 10,000 rials (1,000 tomans) like a real price. */
    rials: (min: number, max: number) =>
      BigInt(Math.round((min + next() * (max - min)) / 10_000) * 10_000),
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
    chance: (p: number) => next() < p,
  };
}

/** The months to fill: the last MONTHS_BACK full Jalali months and the current one. */
function demoMonths(today: IsoDay): MonthPeriod[] {
  let month = monthPeriodOfDay(today, 'jalali');
  const months = [month];
  for (let i = 0; i < MONTHS_BACK; i++) months.unshift((month = previousPeriod(month)));
  return months;
}

/** A household's month: salary, rent and bills, groceries, eating out, getting around. */
function scriptMonth(
  month: MonthPeriod,
  index: number,
  rand: ReturnType<typeof seededRandom>,
): Scripted[] {
  const name = MONTH_NAMES[month.month - 1] as string;
  const last = daysInMonth('jalali', month.year, month.month);
  const on = (day: number) => dayOf('jalali', { ...month, day: Math.min(day, last) });
  const script: Scripted[] = [
    {
      day: on(1),
      type: 'INCOME',
      account: 'mellat',
      category: 'INCOME:حقوق',
      amount: 650_000_000n,
      note: `حقوق ${name}`,
      rule: 'salary',
    },
    {
      day: on(1),
      type: 'EXPENSE',
      account: 'mellat',
      category: 'EXPENSE:اجاره',
      amount: 250_000_000n,
      note: `اجاره ${name}`,
      labels: ['essential'],
      rule: 'rent',
    },
    { day: on(2), type: 'TRANSFER', account: 'mellat', to: 'saman', amount: 170_000_000n },
    {
      day: on(2),
      type: 'TRANSFER',
      account: 'mellat',
      to: 'wallet',
      amount: 15_000_000n,
      note: 'شارژ کیف پول',
    },
    {
      day: on(3),
      type: 'TRANSFER',
      account: 'mellat',
      to: 'cash',
      amount: 10_000_000n,
      note: 'برداشت از خودپرداز',
    },
    {
      day: on(5),
      type: 'EXPENSE',
      account: 'mellat',
      category: 'EXPENSE:شارژ ساختمان',
      amount: 12_000_000n,
      labels: ['essential'],
    },
    {
      day: on(10),
      type: 'TRANSFER',
      account: 'mellat',
      to: 'loan',
      amount: 15_000_000n,
      note: 'قسط وام',
    },
    {
      day: on(12),
      type: 'EXPENSE',
      account: 'wallet',
      category: 'EXPENSE:تفریح و سفر',
      amount: 2_500_000n,
      note: 'اشتراک فیلیمو',
      labels: ['subscriptions'],
      rule: 'filimo',
    },
    {
      day: on(14),
      type: 'EXPENSE',
      account: 'mellat',
      category: 'EXPENSE:آب، برق و گاز',
      amount: rand.rials(3_000_000, 9_000_000),
      labels: ['essential'],
    },
    {
      day: on(16),
      type: 'EXPENSE',
      account: 'saman',
      category: 'EXPENSE:اینترنت و موبایل',
      amount: rand.rials(4_000_000, 6_500_000),
      note: 'بسته اینترنت',
    },
    {
      day: on(29),
      type: 'INCOME',
      account: 'mellat',
      category: 'INCOME:سود سپرده',
      amount: rand.rials(8_000_000, 10_000_000),
    },
  ];

  for (const day of [4, 11, 18, 25]) {
    script.push({
      day: on(day + rand.int(0, 2)),
      type: 'EXPENSE',
      account: 'saman',
      category: 'EXPENSE:خواربار',
      amount: rand.rials(18_000_000, 42_000_000),
      note: rand.pick(['هایپراستار', 'افق کوروش', 'میوه و تره‌بار', 'سوپرمارکت محل']),
    });
  }
  for (let i = 0; i < 3; i++) {
    script.push({
      day: on(rand.int(1, last)),
      type: 'EXPENSE',
      account: 'saman',
      category: 'EXPENSE:رستوران و کافه',
      amount: rand.rials(4_000_000, 22_000_000),
      note: rand.pick(['کافه', 'پیتزا', 'رستوران سنتی', 'سفارش از اسنپ‌فود']),
      labels: ['eatingOut'],
    });
  }
  for (let i = 0; i < 6; i++) {
    script.push({
      day: on(rand.int(1, last)),
      type: 'EXPENSE',
      account: 'wallet',
      category: 'EXPENSE:تاکسی و حمل‌ونقل عمومی',
      amount: rand.rials(800_000, 3_500_000),
      note: 'اسنپ',
    });
  }
  for (const day of [8, 22]) {
    script.push({
      day: on(day),
      type: 'EXPENSE',
      account: 'cash',
      category: 'EXPENSE:سوخت',
      amount: rand.rials(1_000_000, 2_500_000),
      note: 'بنزین',
    });
  }
  for (let i = 0; i < 4; i++) {
    script.push({
      day: on(rand.int(1, last)),
      type: 'EXPENSE',
      account: 'cash',
      category: 'EXPENSE:خوراک',
      amount: rand.rials(500_000, 2_000_000),
      note: rand.pick(['نان', 'میوه', 'بستنی']),
    });
  }

  if (index % 2 === 1) {
    script.push({
      day: on(rand.int(15, 25)),
      type: 'INCOME',
      account: 'mellat',
      category: 'INCOME:کار آزاد',
      amount: rand.rials(80_000_000, 220_000_000),
      note: 'پروژه طراحی سایت',
    });
  }
  if (rand.chance(0.5)) {
    script.push({
      day: on(rand.int(1, last)),
      type: 'EXPENSE',
      account: 'saman',
      category: 'EXPENSE:دارو',
      amount: rand.rials(1_500_000, 9_000_000),
      note: 'داروخانه',
    });
  }
  if (rand.chance(0.6)) {
    script.push({
      day: on(rand.int(1, last)),
      type: 'EXPENSE',
      account: 'saman',
      category: 'EXPENSE:خرید و پوشاک',
      amount: rand.rials(15_000_000, 60_000_000),
      note: 'دیجی‌کالا',
      labels: ['online'],
    });
  }
  if (index % 3 === 1) {
    // Buys dollars at about 1,050,000 rials each.
    script.push({
      day: on(rand.int(5, 20)),
      type: 'TRANSFER',
      account: 'mellat',
      to: 'dollars',
      amount: 210_000_000n,
      toAmount: 20_000n,
      note: 'خرید ۲۰۰ دلار',
    });
  }
  return script;
}

/** Once-a-year events that fall inside the seeded months. */
function scriptOneOffs(months: MonthPeriod[]): Scripted[] {
  const script: Scripted[] = [];
  for (const month of months) {
    const on = (day: number) => dayOf('jalali', { ...month, day });
    if (month.month === 1) {
      script.push(
        {
          day: on(3),
          type: 'EXPENSE',
          account: 'mellat',
          category: 'EXPENSE:تفریح و سفر',
          amount: 85_000_000n,
          note: 'هتل شیراز',
          labels: ['nowruz'],
        },
        {
          day: on(4),
          type: 'EXPENSE',
          account: 'saman',
          category: 'EXPENSE:رستوران و کافه',
          amount: 18_000_000n,
          note: 'شام در شیراز',
          labels: ['nowruz', 'eatingOut'],
        },
        {
          day: on(2),
          type: 'EXPENSE',
          account: 'cash',
          category: 'EXPENSE:هدیه و نیکوکاری',
          amount: 6_000_000n,
          note: 'عیدی بچه‌ها',
        },
        {
          day: on(1),
          type: 'INCOME',
          account: 'cash',
          category: 'INCOME:هدیه',
          amount: 5_000_000n,
          note: 'عیدی',
        },
      );
    }
    if (month.month === 6) {
      script.push({
        day: on(20),
        type: 'EXPENSE',
        account: 'mellat',
        category: 'EXPENSE:آموزش',
        amount: 45_000_000n,
        note: 'کلاس زبان',
        labels: ['essential'],
      });
    }
    if (month.month === 4) {
      script.push({
        day: on(9),
        type: 'EXPENSE',
        account: 'mellat',
        category: 'EXPENSE:تعمیرات',
        amount: 28_000_000n,
        note: 'تعمیر کولر',
      });
    }
  }
  return script;
}

/** A new id for each key of `items`. */
function idsFor<K extends string>(items: Record<K, unknown>): Record<K, string> {
  return Object.fromEntries(Object.keys(items).map((key) => [key, uuidv7()])) as Record<K, string>;
}

/** Removes the demo User and every Workspace they own, so a rerun starts clean. */
async function removeDemo(tx: Transaction): Promise<void> {
  const [user] = await tx
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${DEMO_EMAIL}`);
  if (!user) return;
  const owned = tx
    .select({ id: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, user.id), eq(workspaceMembers.role, 'OWNER')));
  await tx.delete(workspaces).where(inArray(workspaces.id, owned));
  await tx.delete(users).where(eq(users.id, user.id));
}

/**
 * Creates the demo User (DEMO_EMAIL / DEMO_PASSWORD) with a Jalali Personal
 * Workspace: Accounts, the default Categories, Labels, Budgets, Recurring Rules, dollar
 * Exchange Rates, Valuations, and Transactions and
 * Transfers from the start of the Jalali month MONTHS_BACK months before
 * `today` up to `today`. Replaces the demo User if they exist, so it can run any number
 * of times. Later features add their own entities here. Its Workspace dates
 * from the first of those months; Net Worth Snapshots of the months that have
 * ended are left to the month-end job (`takeDueAutoSnapshots`).
 */
export async function seedDemo(
  db: Database,
  options: { today: IsoDay },
): Promise<{ userId: string; workspaceId: string }> {
  const secretHash = await hashPassword(DEMO_PASSWORD);
  return db.transaction(async (tx) => {
    await removeDemo(tx);

    const user = one(await tx.insert(users).values({ email: DEMO_EMAIL }).returning());
    await tx
      .insert(authIdentities)
      .values({ userId: user.id, provider: 'PASSWORD', identifier: DEMO_EMAIL, secretHash });
    const workspace = one(
      await tx
        .insert(workspaces)
        .values({
          type: 'PERSONAL',
          name: 'شخصی',
          calendar: 'jalali',
          timezone: 'Asia/Tehran',
          baseCurrency: 'IRR',
          moneyDisplay: 'rial',
        })
        .returning(),
    );
    const workspaceId = workspace.id;
    await tx.insert(workspaceMembers).values({ workspaceId, userId: user.id, role: 'OWNER' });
    await seedDefaultCategories(tx, workspaceId);

    const accountIds = idsFor(demoAccounts);
    await tx.insert(accounts).values(
      Object.entries(demoAccounts).map(([key, { opening, ...account }]) => ({
        ...account,
        id: accountIds[key as AccountKey],
        workspaceId,
        openingBalance: opening,
      })),
    );

    const labelIds = idsFor(demoLabels);
    await tx.insert(labels).values(
      Object.entries(demoLabels).map(([key, label]) => ({
        ...label,
        id: labelIds[key as LabelKey],
        workspaceId,
      })),
    );

    const categoryIds = new Map(
      (
        await tx
          .select({ id: categories.id, kind: categories.kind, name: categories.name })
          .from(categories)
          .where(eq(categories.workspaceId, workspaceId))
      ).map((c) => [`${c.kind}:${c.name}`, c.id]),
    );
    const categoryId = (key: string) => {
      const id = categoryIds.get(key);
      if (!id) throw new Error(`No default Category ${key}`);
      return id;
    };

    const rand = seededRandom(1405);
    const months = demoMonths(options.today);
    const thisMonth = monthPeriodOfDay(options.today, 'jalali');
    const scripted = [
      ...months.flatMap((m, i) => scriptMonth(m, i, rand)),
      ...scriptOneOffs(months),
    ]
      .filter((p) => p.day <= options.today)
      // This month's rent is left as a Due Occurrence waiting for confirmation.
      .filter((p) => !(p.rule === 'rent' && p.day >= dayOf('jalali', { ...thisMonth, day: 1 })))
      // Stable, so ties keep their scripted order and the same day seeds the same rows.
      .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

    const rows = scripted.map((p) => {
      const common = {
        id: uuidv7(),
        workspaceId,
        type: p.type,
        accountId: accountIds[p.account],
        amount: p.amount,
        occurredOn: p.day,
        note: p.note ?? null,
        createdBy: user.id,
      };
      return p.type === 'TRANSFER'
        ? { ...common, toAccountId: accountIds[p.to], toAmount: p.toAmount ?? p.amount }
        : { ...common, categoryId: categoryId(p.category) };
    });
    await tx.insert(transactions).values(rows);
    const attached = scripted.flatMap((p, i) =>
      (p.labels ?? []).map((label) => ({
        transactionId: (rows[i] as { id: string }).id,
        labelId: labelIds[label],
        workspaceId,
      })),
    );
    if (attached.length > 0) await tx.insert(transactionLabels).values(attached);

    await tx.insert(budgets).values(
      demoBudgets.map((b) => ({
        workspaceId,
        categoryId: categoryId(b.category),
        labelId: b.label ? labelIds[b.label] : null,
        period: b.period,
        amount: b.amount,
        currency: 'IRR',
      })),
    );

    const first = months[0] as MonthPeriod;
    // Dated as if kept since the first demo month, so the month-end job takes a
    // Net Worth Snapshot of each month that has ended.
    await tx
      .update(workspaces)
      .set({ createdAt: periodStart(first, { calendar: 'jalali', timeZone: 'Asia/Tehran' }) })
      .where(eq(workspaces.id, workspaceId));
    const ruleIds = idsFor(demoRules);
    await tx.insert(recurringRules).values(
      (Object.keys(demoRules) as RuleKey[]).map((key) => {
        const r = demoRules[key];
        return {
          id: ruleIds[key],
          workspaceId,
          name: r.name,
          type: r.type,
          accountId: accountIds[r.account],
          categoryId: categoryId(r.category),
          amount: r.amount,
          frequency: 'MONTHLY' as const,
          startOn: dayOf('jalali', { ...first, day: r.day }),
          autoPost: r.autoPost,
          createdBy: user.id,
        };
      }),
    );
    const confirmed = scripted.flatMap((p, i) =>
      p.rule
        ? [
            {
              ruleId: ruleIds[p.rule],
              dueOn: p.day,
              workspaceId,
              status: 'CONFIRMED' as const,
              transactionId: (rows[i] as { id: string }).id,
            },
          ]
        : [],
    );
    await tx.insert(recurringOccurrences).values(confirmed);

    // A dollar rate from the first day of each month, creeping up towards the
    // 1,050,000 rials the demo buys dollars at.
    await tx.insert(exchangeRates).values(
      months.map((month, i) => ({
        workspaceId,
        currency: 'USD',
        baseCurrency: 'IRR',
        rate: String(1_050_000 - (months.length - 1 - i) * 12_500),
        effectiveOn: dayOf('jalali', { ...month, day: 1 }),
      })),
    );

    // Two gold coins, valued on the first day of each month as their price climbs.
    await tx.insert(accountValuations).values(
      months.map((month, i) => ({
        workspaceId,
        accountId: accountIds.gold,
        amount: 1_800_000_000n - BigInt(months.length - 1 - i) * 40_000_000n,
        valuedOn: dayOf('jalali', { ...month, day: 1 }),
      })),
    );

    return { userId: user.id, workspaceId };
  });
}
