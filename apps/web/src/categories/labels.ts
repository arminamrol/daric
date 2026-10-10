import type { CategoryColor, CategoryIcon, CategoryKind } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';

export const CATEGORY_KIND_LABELS: Record<CategoryKind, PlainMessageKey> = {
  EXPENSE: 'categories.kind.EXPENSE',
  INCOME: 'categories.kind.INCOME',
};

export const CATEGORY_ICON_LABELS = {
  utensils: 'categories.icon.utensils',
  'shopping-cart': 'categories.icon.shopping-cart',
  coffee: 'categories.icon.coffee',
  home: 'categories.icon.home',
  zap: 'categories.icon.zap',
  wifi: 'categories.icon.wifi',
  smartphone: 'categories.icon.smartphone',
  car: 'categories.icon.car',
  fuel: 'categories.icon.fuel',
  bus: 'categories.icon.bus',
  'heart-pulse': 'categories.icon.heart-pulse',
  pill: 'categories.icon.pill',
  shirt: 'categories.icon.shirt',
  'shopping-bag': 'categories.icon.shopping-bag',
  'graduation-cap': 'categories.icon.graduation-cap',
  book: 'categories.icon.book',
  film: 'categories.icon.film',
  plane: 'categories.icon.plane',
  gift: 'categories.icon.gift',
  'hand-heart': 'categories.icon.hand-heart',
  baby: 'categories.icon.baby',
  'paw-print': 'categories.icon.paw-print',
  dumbbell: 'categories.icon.dumbbell',
  wrench: 'categories.icon.wrench',
  receipt: 'categories.icon.receipt',
  briefcase: 'categories.icon.briefcase',
  laptop: 'categories.icon.laptop',
  'piggy-bank': 'categories.icon.piggy-bank',
  'trending-up': 'categories.icon.trending-up',
  key: 'categories.icon.key',
  wallet: 'categories.icon.wallet',
  'circle-ellipsis': 'categories.icon.circle-ellipsis',
} as const satisfies Record<CategoryIcon, PlainMessageKey>;

export const CATEGORY_COLOR_LABELS = {
  red: 'categories.color.red',
  orange: 'categories.color.orange',
  amber: 'categories.color.amber',
  green: 'categories.color.green',
  teal: 'categories.color.teal',
  sky: 'categories.color.sky',
  blue: 'categories.color.blue',
  indigo: 'categories.color.indigo',
  violet: 'categories.color.violet',
  pink: 'categories.color.pink',
  brown: 'categories.color.brown',
  slate: 'categories.color.slate',
} as const satisfies Record<CategoryColor, PlainMessageKey>;
