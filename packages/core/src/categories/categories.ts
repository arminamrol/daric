import type { Locale } from '../locale';

/** Whether a Category classifies Income or Expense; fixed once created. */
export const categoryKinds = ['INCOME', 'EXPENSE'] as const;
export type CategoryKind = (typeof categoryKinds)[number];

/** The icons a Category can show; each app draws them from its own icon set. */
export const categoryIcons = [
  'utensils',
  'shopping-cart',
  'coffee',
  'home',
  'zap',
  'wifi',
  'smartphone',
  'car',
  'fuel',
  'bus',
  'heart-pulse',
  'pill',
  'shirt',
  'shopping-bag',
  'graduation-cap',
  'book',
  'film',
  'plane',
  'gift',
  'hand-heart',
  'baby',
  'paw-print',
  'dumbbell',
  'wrench',
  'receipt',
  'briefcase',
  'laptop',
  'piggy-bank',
  'trending-up',
  'key',
  'wallet',
  'circle-ellipsis',
] as const;
export type CategoryIcon = (typeof categoryIcons)[number];

/** The colors a Category can have; each theme decides the exact shade. */
export const categoryColors = [
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'sky',
  'blue',
  'indigo',
  'violet',
  'pink',
  'brown',
  'slate',
] as const;
export type CategoryColor = (typeof categoryColors)[number];

/** What `categoryTree` needs of a Category. */
export interface CategoryNode {
  readonly id: string;
  readonly kind: CategoryKind;
  readonly parentId: string | null;
}

/**
 * Top-level Categories with their children nested, each level in the order
 * given. Children whose parent is missing from the list (e.g. an archived one
 * filtered out) are left out.
 */
export function categoryTree<T extends CategoryNode>(categories: readonly T[]) {
  const tops = categories.filter((c) => c.parentId === null);
  return tops.map((top) => ({
    ...top,
    children: categories.filter((c) => c.parentId === top.id),
  }));
}

/**
 * The ids of `category`'s siblings (archived ones included, from `all`) after
 * swapping it with its nearest `visible` sibling in `direction`, or null at
 * the edge: the order a reorder sends when only some siblings are shown.
 */
export function swapWithNeighbour<T extends CategoryNode>(
  all: readonly T[],
  visible: readonly T[],
  category: T,
  direction: -1 | 1,
): string[] | null {
  const isSibling = (c: T) => c.kind === category.kind && c.parentId === category.parentId;
  const shown = visible.filter(isSibling);
  const neighbour = shown[shown.findIndex((c) => c.id === category.id) + direction];
  if (!neighbour) return null;
  return all
    .filter(isSibling)
    .map((c) => c.id)
    .map((id) => (id === category.id ? neighbour.id : id === neighbour.id ? category.id : id));
}

interface DefaultCategory {
  readonly kind: CategoryKind;
  /** In each language: a new Workspace gets them in its creator's. */
  readonly name: Readonly<Record<Locale, string>>;
  readonly icon: CategoryIcon;
  readonly color: CategoryColor;
  readonly children?: readonly Omit<DefaultCategory, 'kind' | 'children'>[];
}

/** The Categories every new Workspace starts with; the User may change them all. */
export const defaultCategories: readonly DefaultCategory[] = [
  {
    kind: 'EXPENSE',
    name: { fa: 'خوراک', en: 'Food' },
    icon: 'utensils',
    color: 'orange',
    children: [
      { name: { fa: 'خواربار', en: 'Groceries' }, icon: 'shopping-cart', color: 'orange' },
      {
        name: { fa: 'رستوران و کافه', en: 'Restaurants and cafés' },
        icon: 'coffee',
        color: 'orange',
      },
    ],
  },
  {
    kind: 'EXPENSE',
    name: { fa: 'مسکن', en: 'Housing' },
    icon: 'home',
    color: 'brown',
    children: [
      { name: { fa: 'اجاره', en: 'Rent' }, icon: 'key', color: 'brown' },
      { name: { fa: 'شارژ ساختمان', en: 'Building charges' }, icon: 'receipt', color: 'brown' },
      { name: { fa: 'تعمیرات', en: 'Repairs' }, icon: 'wrench', color: 'brown' },
    ],
  },
  {
    kind: 'EXPENSE',
    name: { fa: 'قبض‌ها', en: 'Bills' },
    icon: 'zap',
    color: 'amber',
    children: [
      {
        name: { fa: 'آب، برق و گاز', en: 'Water, electricity and gas' },
        icon: 'zap',
        color: 'amber',
      },
      { name: { fa: 'اینترنت و موبایل', en: 'Internet and mobile' }, icon: 'wifi', color: 'amber' },
    ],
  },
  {
    kind: 'EXPENSE',
    name: { fa: 'رفت‌وآمد', en: 'Transport' },
    icon: 'car',
    color: 'blue',
    children: [
      { name: { fa: 'سوخت', en: 'Fuel' }, icon: 'fuel', color: 'blue' },
      {
        name: { fa: 'تاکسی و حمل‌ونقل عمومی', en: 'Taxis and public transport' },
        icon: 'bus',
        color: 'blue',
      },
    ],
  },
  {
    kind: 'EXPENSE',
    name: { fa: 'سلامت', en: 'Health' },
    icon: 'heart-pulse',
    color: 'red',
    children: [{ name: { fa: 'دارو', en: 'Medicine' }, icon: 'pill', color: 'red' }],
  },
  {
    kind: 'EXPENSE',
    name: { fa: 'خرید و پوشاک', en: 'Shopping and clothing' },
    icon: 'shirt',
    color: 'pink',
  },
  {
    kind: 'EXPENSE',
    name: { fa: 'آموزش', en: 'Education' },
    icon: 'graduation-cap',
    color: 'indigo',
  },
  {
    kind: 'EXPENSE',
    name: { fa: 'تفریح و سفر', en: 'Leisure and travel' },
    icon: 'plane',
    color: 'teal',
  },
  {
    kind: 'EXPENSE',
    name: { fa: 'هدیه و نیکوکاری', en: 'Gifts and charity' },
    icon: 'gift',
    color: 'violet',
  },
  {
    kind: 'EXPENSE',
    name: { fa: 'سایر هزینه‌ها', en: 'Other expenses' },
    icon: 'circle-ellipsis',
    color: 'slate',
  },
  { kind: 'INCOME', name: { fa: 'حقوق', en: 'Salary' }, icon: 'briefcase', color: 'green' },
  { kind: 'INCOME', name: { fa: 'کار آزاد', en: 'Freelance' }, icon: 'laptop', color: 'teal' },
  {
    kind: 'INCOME',
    name: { fa: 'سود سپرده', en: 'Deposit interest' },
    icon: 'piggy-bank',
    color: 'sky',
  },
  { kind: 'INCOME', name: { fa: 'اجاره‌بها', en: 'Rental income' }, icon: 'key', color: 'brown' },
  { kind: 'INCOME', name: { fa: 'هدیه', en: 'Gifts' }, icon: 'gift', color: 'violet' },
  {
    kind: 'INCOME',
    name: { fa: 'سایر درآمدها', en: 'Other income' },
    icon: 'circle-ellipsis',
    color: 'slate',
  },
];
