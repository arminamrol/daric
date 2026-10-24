import type { CategoryColor, CategoryIcon } from '@daric/core';
import { categoryPalette } from '@daric/design-tokens';
import {
  Baby,
  Book,
  Briefcase,
  Bus,
  Car,
  CircleEllipsis,
  Coffee,
  Dumbbell,
  Film,
  Fuel,
  Gift,
  GraduationCap,
  HandHeart,
  HeartPulse,
  House,
  Key,
  Laptop,
  type LucideIcon,
  PawPrint,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  Zap,
} from 'lucide-react';

export const CATEGORY_ICONS: Record<CategoryIcon, LucideIcon> = {
  utensils: Utensils,
  'shopping-cart': ShoppingCart,
  coffee: Coffee,
  home: House,
  zap: Zap,
  wifi: Wifi,
  smartphone: Smartphone,
  car: Car,
  fuel: Fuel,
  bus: Bus,
  'heart-pulse': HeartPulse,
  pill: Pill,
  shirt: Shirt,
  'shopping-bag': ShoppingBag,
  'graduation-cap': GraduationCap,
  book: Book,
  film: Film,
  plane: Plane,
  gift: Gift,
  'hand-heart': HandHeart,
  baby: Baby,
  'paw-print': PawPrint,
  dumbbell: Dumbbell,
  wrench: Wrench,
  receipt: Receipt,
  briefcase: Briefcase,
  laptop: Laptop,
  'piggy-bank': PiggyBank,
  'trending-up': TrendingUp,
  key: Key,
  wallet: Wallet,
  'circle-ellipsis': CircleEllipsis,
};

export const CATEGORY_COLORS: Record<CategoryColor, string> = categoryPalette;

/**
 * A Category's icon in white on its color. Alone it is decorative, as the name always goes
 * alongside; given `name`, it is a chip with the name beside the icon.
 */
export function CategoryBadge({
  icon,
  color,
  size = 'md',
  name,
}: {
  icon: CategoryIcon;
  color: CategoryColor;
  size?: 'sm' | 'md';
  name?: string;
}) {
  const Icon = CATEGORY_ICONS[icon];
  const badge = (
    <span
      aria-hidden="true"
      style={{ backgroundColor: CATEGORY_COLORS[color] }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-white ${size === 'sm' ? 'size-7' : 'size-9'}`}
    >
      <Icon className={size === 'sm' ? 'size-4' : 'size-5'} strokeWidth={2} />
    </span>
  );
  if (name === undefined) return badge;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {badge}
      <span className="truncate font-medium">{name}</span>
    </span>
  );
}
