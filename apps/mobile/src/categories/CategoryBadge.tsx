import type { CategoryColor, CategoryIcon } from '@daric/core';
import { categoryPalette, nativeTheme, palette } from '@daric/design-tokens';
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
} from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

/** The same icons the web app draws for each key. */
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

/** A Category's icon in white on its color. Decorative: the name always goes alongside. */
export function CategoryBadge({
  icon,
  color,
  size = 'md',
}: {
  icon: CategoryIcon;
  color: CategoryColor;
  size?: 'sm' | 'md';
}) {
  const Icon = CATEGORY_ICONS[icon];
  const side = size === 'sm' ? 28 : 36;
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.badge, { width: side, height: side, backgroundColor: categoryPalette[color] }]}
    >
      <Icon color={palette.white} size={size === 'sm' ? 16 : 20} strokeWidth={2} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: nativeTheme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
