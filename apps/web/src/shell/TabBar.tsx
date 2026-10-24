import { ChartPie, Ellipsis, type LucideIcon, Plus } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useLocation } from 'react-router';
import { useI18n } from '../i18n/locale';
import { useFormatters } from '../settings/settings';
import { ThemeToggle } from '../theme/ThemeToggle';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../ui/Sheet';
import { LogoutButton } from './LogoutButton';
import { RecordTransactionSheet } from './RecordTransactionSheet';
import { SectionLink } from './SectionLink';
import { tabClass } from './tabClass';
import { useNavigation } from './useNavigation';
import {
  BUDGETS,
  HOME,
  INSIGHTS,
  isWithin,
  RECURRING,
  TRANSACTIONS,
  type Section,
} from './sections';

/**
 * The phone's navigation along the bottom edge: Home, Transactions, the "+" that records a
 * Transaction, then Insights and More, which open a list of their pages from the bottom.
 */
export function TabBar() {
  const { t } = useI18n();
  const { more, dueCount, canRecord } = useNavigation();

  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-lg items-center gap-1 px-2 py-1">
        <li className="flex flex-1">
          <SectionLink section={HOME} look="tab" />
        </li>
        <li className="flex flex-1">
          <SectionLink section={TRANSACTIONS} look="tab" />
        </li>
        {canRecord && (
          <li className="flex flex-1 justify-center">
            <RecordTransactionSheet side="bottom">
              <button
                type="button"
                aria-label={t('transactions.form.title')}
                className="-mt-6 grid size-14 cursor-pointer place-items-center rounded-full bg-primary text-on-primary shadow-popover transition-transform duration-(--daric-duration-fast) active:scale-95"
              >
                <Plus aria-hidden className="size-7" strokeWidth={2.2} />
              </button>
            </RecordTransactionSheet>
          </li>
        )}
        <li className="flex flex-1">
          <SectionList label={t('nav.insights')} icon={ChartPie} sections={INSIGHTS} />
        </li>
        <li className="flex flex-1">
          <SectionList
            label={t('nav.more')}
            icon={Ellipsis}
            sections={[BUDGETS, ...more]}
            waiting={dueCount}
          >
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <ThemeToggle hideLegend={false} />
              <LogoutButton className="w-fit px-0" />
            </div>
          </SectionList>
        </li>
      </ul>
    </nav>
  );
}

/**
 * A tab that opens its pages as a list from the bottom; it reads as current while one of them is
 * open. `waiting` counts Due Occurrences among them.
 */
function SectionList({
  label,
  icon: Icon,
  sections,
  waiting = 0,
  children,
}: {
  label: string;
  icon: LucideIcon;
  sections: readonly Section[];
  waiting?: number;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const format = useFormatters();
  const [open, setOpen] = useState(false);
  const active = isWithin(useLocation().pathname, sections);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger aria-current={active ? 'true' : undefined} className={tabClass(active)}>
        <Icon aria-hidden className="size-5" strokeWidth={1.9} />
        {label}
        {waiting > 0 && (
          <span
            aria-hidden
            className="absolute end-1/4 top-0.5 rounded-full bg-primary px-1.5 text-xs font-medium text-on-primary tabular-nums"
          >
            {format.count(waiting)}
          </span>
        )}
        {waiting > 0 && (
          <span className="sr-only"> {t('nav.dueCount', { count: format.count(waiting) })}</span>
        )}
      </SheetTrigger>
      <SheetContent side="bottom" aria-describedby={undefined}>
        <SheetHeader>
          <SheetTitle>{label}</SheetTitle>
        </SheetHeader>
        <ul className="flex flex-col gap-1">
          {sections.map((section) => (
            <li key={section.to}>
              <SectionLink
                section={section}
                waiting={section.to === RECURRING.to ? waiting : 0}
                onNavigate={() => setOpen(false)}
              />
            </li>
          ))}
        </ul>
        {children}
      </SheetContent>
    </Sheet>
  );
}
