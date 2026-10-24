import { Direction, Tooltip } from 'radix-ui';
import { createContext, use } from 'react';
import type { ReactNode } from 'react';
import { Toaster } from './Toast';

/** Words the primitives say themselves, translated by whoever provides them. */
export interface UiLabels {
  readonly close: string;
  readonly notifications: string;
}

const LabelsContext = createContext<UiLabels>({ close: 'Close', notifications: 'Notifications' });

export function useUiLabels(): UiLabels {
  return use(LabelsContext);
}

/**
 * What every primitive needs from the page: the writing direction (arrow keys, menus and sheets
 * mirror in right-to-left), their own words, one tooltip timer and the toast region.
 */
export function UiProvider({
  dir,
  labels,
  children,
}: {
  dir: 'ltr' | 'rtl';
  labels: UiLabels;
  children: ReactNode;
}) {
  return (
    <Direction.Provider dir={dir}>
      <LabelsContext value={labels}>
        <Tooltip.Provider delayDuration={300}>
          {children}
          <Toaster dir={dir} label={labels.notifications} />
        </Tooltip.Provider>
      </LabelsContext>
    </Direction.Provider>
  );
}
