import type { PlainMessageKey } from '@daric/i18n';
import {
  ChartColumn,
  Coins,
  House,
  Landmark,
  type LucideIcon,
  PiggyBank,
  ReceiptText,
  Repeat,
  Settings,
  Shapes,
  ShieldCheck,
  Tag,
  TrendingUp,
  Wallet,
} from 'lucide-react';

/** A page the navigation leads to. */
export interface Section {
  readonly to: string;
  readonly label: PlainMessageKey;
  readonly icon: LucideIcon;
  /** Active only on exactly this address, not on the pages below it. */
  readonly end?: boolean;
}

export const HOME: Section = { to: '/', label: 'nav.home', icon: House, end: true };
export const TRANSACTIONS: Section = {
  to: '/transactions',
  label: 'nav.transactions',
  icon: ReceiptText,
};
export const BUDGETS: Section = { to: '/budgets', label: 'nav.budgets', icon: PiggyBank };
export const RECURRING: Section = { to: '/recurring', label: 'nav.recurring', icon: Repeat };

/** Insights: reading where the money went and where it is heading. */
export const INSIGHTS: readonly Section[] = [
  { to: '/reports', label: 'nav.reports', icon: ChartColumn },
  { to: '/projection', label: 'nav.projection', icon: TrendingUp },
  { to: '/net-worth', label: 'nav.netWorth', icon: Landmark },
];

/** The Back Office's own pages arrive with BO-02; until then only the link has a place. */
const BACK_OFFICE: Section = { to: '/back-office', label: 'nav.backOffice', icon: ShieldCheck };

/** More: what the Workspace is made of, and the settings; the Back Office only for Operators. */
export function moreSections({ operator }: { operator: boolean }): readonly Section[] {
  return [
    { to: '/accounts', label: 'nav.accounts', icon: Wallet },
    { to: '/categories', label: 'nav.categories', icon: Shapes },
    { to: '/labels', label: 'nav.labels', icon: Tag },
    RECURRING,
    { to: '/rates', label: 'nav.rates', icon: Coins },
    { to: '/settings', label: 'nav.settings', icon: Settings },
    ...(operator ? [BACK_OFFICE] : []),
  ];
}

/** Whether `pathname` is one of `sections` or a page below one. */
export function isWithin(pathname: string, sections: readonly Section[]) {
  return sections.some(({ to }) => pathname === to || pathname.startsWith(`${to}/`));
}
