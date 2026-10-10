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

interface DefaultCategory {
  readonly kind: CategoryKind;
  readonly name: string;
  readonly icon: CategoryIcon;
  readonly color: CategoryColor;
  readonly children?: readonly Omit<DefaultCategory, 'kind' | 'children'>[];
}

/** The Persian Categories every new Workspace starts with; the User may change them all. */
export const defaultCategories: readonly DefaultCategory[] = [
  {
    kind: 'EXPENSE',
    name: 'خوراک',
    icon: 'utensils',
    color: 'orange',
    children: [
      { name: 'خواربار', icon: 'shopping-cart', color: 'orange' },
      { name: 'رستوران و کافه', icon: 'coffee', color: 'orange' },
    ],
  },
  {
    kind: 'EXPENSE',
    name: 'مسکن',
    icon: 'home',
    color: 'brown',
    children: [
      { name: 'اجاره', icon: 'key', color: 'brown' },
      { name: 'شارژ ساختمان', icon: 'receipt', color: 'brown' },
      { name: 'تعمیرات', icon: 'wrench', color: 'brown' },
    ],
  },
  {
    kind: 'EXPENSE',
    name: 'قبض‌ها',
    icon: 'zap',
    color: 'amber',
    children: [
      { name: 'آب، برق و گاز', icon: 'zap', color: 'amber' },
      { name: 'اینترنت و موبایل', icon: 'wifi', color: 'amber' },
    ],
  },
  {
    kind: 'EXPENSE',
    name: 'رفت‌وآمد',
    icon: 'car',
    color: 'blue',
    children: [
      { name: 'سوخت', icon: 'fuel', color: 'blue' },
      { name: 'تاکسی و حمل‌ونقل عمومی', icon: 'bus', color: 'blue' },
    ],
  },
  {
    kind: 'EXPENSE',
    name: 'سلامت',
    icon: 'heart-pulse',
    color: 'red',
    children: [{ name: 'دارو', icon: 'pill', color: 'red' }],
  },
  { kind: 'EXPENSE', name: 'خرید و پوشاک', icon: 'shirt', color: 'pink' },
  { kind: 'EXPENSE', name: 'آموزش', icon: 'graduation-cap', color: 'indigo' },
  { kind: 'EXPENSE', name: 'تفریح و سفر', icon: 'plane', color: 'teal' },
  { kind: 'EXPENSE', name: 'هدیه و نیکوکاری', icon: 'gift', color: 'violet' },
  { kind: 'EXPENSE', name: 'سایر هزینه‌ها', icon: 'circle-ellipsis', color: 'slate' },
  { kind: 'INCOME', name: 'حقوق', icon: 'briefcase', color: 'green' },
  { kind: 'INCOME', name: 'کار آزاد', icon: 'laptop', color: 'teal' },
  { kind: 'INCOME', name: 'سود سپرده', icon: 'piggy-bank', color: 'sky' },
  { kind: 'INCOME', name: 'اجاره‌بها', icon: 'key', color: 'brown' },
  { kind: 'INCOME', name: 'هدیه', icon: 'gift', color: 'violet' },
  { kind: 'INCOME', name: 'سایر درآمدها', icon: 'circle-ellipsis', color: 'slate' },
];
