import { categoryColors, categoryIcons } from '@daric/core';
import type { CategoryColor, CategoryIcon } from '@daric/core';
import { categoryPalette, nativeTheme, palette } from '@daric/design-tokens';
import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useI18n } from '../i18n/locale';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/theme';
import { CATEGORY_ICONS } from './CategoryBadge';

/** Pick a Category's icon from a grid; each one is read out by its name. */
export function IconPicker({
  value,
  color,
  onChange,
}: {
  value: CategoryIcon;
  color: CategoryColor;
  onChange: (icon: CategoryIcon) => void;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const label = t('categories.form.icon');
  return (
    <View style={styles.group}>
      <Text bold size="sm" importantForAccessibility="no">
        {label}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.grid}>
        {categoryIcons.map((icon) => {
          const Icon = CATEGORY_ICONS[icon];
          const on = icon === value;
          return (
            <Pressable
              key={icon}
              accessibilityRole="radio"
              accessibilityLabel={t(`categories.icon.${icon}`)}
              accessibilityState={{ selected: on, checked: on }}
              onPress={() => onChange(icon)}
              style={[
                styles.icon,
                on
                  ? { backgroundColor: categoryPalette[color], borderColor: categoryPalette[color] }
                  : { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Icon color={on ? palette.white : colors.foreground} size={20} strokeWidth={2} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Pick a Category's color; the chosen one carries a check, not only a ring. */
export function ColorPicker({
  value,
  onChange,
}: {
  value: CategoryColor;
  onChange: (color: CategoryColor) => void;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const label = t('categories.form.color');
  return (
    <View style={styles.group}>
      <Text bold size="sm" importantForAccessibility="no">
        {label}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.grid}>
        {categoryColors.map((color) => {
          const on = color === value;
          return (
            <Pressable
              key={color}
              accessibilityRole="radio"
              accessibilityLabel={t(`categories.color.${color}`)}
              accessibilityState={{ selected: on, checked: on }}
              onPress={() => onChange(color)}
              style={[
                styles.swatch,
                { backgroundColor: categoryPalette[color] },
                on && { borderColor: colors.foreground, borderWidth: 2 },
              ]}
            >
              {on && <Check color={palette.white} size={20} strokeWidth={2.5} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: nativeTheme.space(1) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: nativeTheme.space(2) },
  icon: {
    width: 44,
    height: 44,
    borderRadius: nativeTheme.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: nativeTheme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
