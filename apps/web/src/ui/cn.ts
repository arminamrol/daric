import { elevation, motion, spacing } from '@daric/design-tokens';
import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** tailwind-merge taught the token names it cannot guess, so a later class wins over its twin. */
const merge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: Object.keys(spacing).map(kebab),
      shadow: Object.keys(elevation.light),
      ease: Object.keys(motion.easing),
    },
  },
});

/** Joins class names, letting a later Tailwind utility override an earlier one of its kind. */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
