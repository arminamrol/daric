import { categoryColors, categoryIcons } from '@daric/core';
import type { CategoryColor, CategoryIcon } from '@daric/core';
import { Check } from 'lucide-react';
import { useId } from 'react';
import { useI18n } from '../i18n/locale';
import { CATEGORY_COLORS, CATEGORY_ICONS } from './CategoryBadge';
import { CATEGORY_COLOR_LABELS, CATEGORY_ICON_LABELS } from './labels';

// Native radios, visually hidden, keep arrow-key navigation and screen-reader
// names; each choice shows its name as a tooltip and carries it as text.
const choiceClass =
  'relative flex cursor-pointer items-center justify-center rounded-lg has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus';

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
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-medium">{t('categories.form.icon')}</legend>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-2">
        {categoryIcons.map((icon) => {
          const Icon = CATEGORY_ICONS[icon];
          const label = t(CATEGORY_ICON_LABELS[icon]);
          const checked = icon === value;
          return (
            <label
              key={icon}
              title={label}
              style={checked ? { backgroundColor: CATEGORY_COLORS[color] } : undefined}
              className={`${choiceClass} size-11 border border-border ${checked ? 'border-transparent text-white' : 'bg-background text-foreground hover:bg-surface-muted'}`}
            >
              <input
                type="radio"
                name={name}
                value={icon}
                checked={checked}
                onChange={() => onChange(icon)}
                className="sr-only"
              />
              <Icon aria-hidden="true" className="size-5" />
              <span className="sr-only">{label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ColorPicker({
  value,
  onChange,
}: {
  value: CategoryColor;
  onChange: (color: CategoryColor) => void;
}) {
  const { t } = useI18n();
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-medium">{t('categories.form.color')}</legend>
      <div className="flex flex-wrap gap-2">
        {categoryColors.map((color) => {
          const label = t(CATEGORY_COLOR_LABELS[color]);
          const checked = color === value;
          return (
            <label
              key={color}
              title={label}
              style={{ backgroundColor: CATEGORY_COLORS[color] }}
              className={`${choiceClass} size-9 rounded-full text-white ${checked ? 'ring-2 ring-foreground ring-offset-2 ring-offset-surface' : ''}`}
            >
              <input
                type="radio"
                name={name}
                value={color}
                checked={checked}
                onChange={() => onChange(color)}
                className="sr-only"
              />
              {/* The check, not only the ring, marks the choice. */}
              {checked && <Check aria-hidden="true" className="size-5" />}
              <span className="sr-only">{label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
