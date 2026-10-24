import { IRR, money } from '@daric/core';
import type { Account } from '@daric/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '../app/providers';
import { useMe } from '../auth/session';
import { fakeApi } from '../test/fake-api';
import { Button } from '../ui/Button';
import { ChartFrame } from '../ui/ChartFrame';
import { ResponsiveTable } from '../ui/ResponsiveTable';
import { AccountCard } from './AccountCard';
import { Amount } from './Amount';
import { BudgetProgress } from './BudgetProgress';
import { LabelChip } from './LabelChip';

function SignedIn({ children }: { children: ReactNode }) {
  return useMe().data ? children : null;
}

/** Renders `ui` for a signed-in User, in Persian, once they are known. */
function renderSignedIn(ui: ReactNode) {
  const { api } = fakeApi({ signedInAs: 'sara@example.com' });
  return render(
    <MemoryRouter>
      <AppProviders api={api}>
        <SignedIn>{ui}</SignedIn>
      </AppProviders>
    </MemoryRouter>,
  );
}

describe('Amount', () => {
  it('tells Income, Expense and Transfer apart by more than colour', async () => {
    renderSignedIn(
      <ul>
        <li>
          <Amount value={money(5000n, IRR)} kind="income" />
        </li>
        <li>
          <Amount value={money(5000n, IRR)} kind="expense" />
        </li>
        <li>
          <Amount value={money(5000n, IRR)} kind="transfer" />
        </li>
      </ul>,
    );
    const [income, expense, transfer] = (await screen.findAllByRole('listitem')).map(
      (item) => item.textContent,
    );
    expect(income).toMatch(/^\+[۰-۹]/);
    expect(expense).toMatch(/^−[۰-۹]/);
    expect(transfer).toMatch(/^[۰-۹]/);
    expect(screen.getAllByRole('listitem')[2]?.querySelector('svg')).not.toBeNull();
  });

  it('signs a negative balance only', async () => {
    renderSignedIn(
      <>
        <Amount value={money(-2500n, IRR)} />
        <Amount value={money(2500n, IRR)} label={false} />
      </>,
    );
    expect(await screen.findByText(/^−۲٬۵۰۰ ریال$/)).toBeTruthy();
    expect(screen.getByText(/^۲٬۵۰۰$/)).toBeTruthy();
  });
});

describe('AccountCard', () => {
  const loan: Account = {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'وام مسکن',
    type: 'LOAN',
    class: 'LIABILITY',
    currency: 'IRR',
    openingBalance: 0n,
    balance: 1200n,
    archived: false,
  };

  it('names the Account, says what it is in words and shows its balance', async () => {
    renderSignedIn(<AccountCard account={loan} href={`/accounts/${loan.id}`} />);
    const card = await screen.findByRole('article', { name: 'وام مسکن' });
    expect(card.textContent).toContain('وام');
    expect(card.textContent).toContain('بدهی');
    expect(card.textContent).toContain('۱٬۲۰۰ ریال');
    expect(within(card).getByRole('link').getAttribute('href')).toBe(`/accounts/${loan.id}`);
  });
});

describe('BudgetProgress', () => {
  it('fills to the limit at most and says the state in words', async () => {
    renderSignedIn(
      <>
        <span id="budget">خوراک</span>
        <BudgetProgress
          progress={{ spent: 150n, remaining: -50n, percent: 150, state: 'over' }}
          spent="۱۵۰ ریال"
          limit="۱۰۰ ریال"
          labelledBy="budget"
        />
      </>,
    );
    const bar = await screen.findByRole('progressbar', { name: 'خوراک' });
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
    expect(bar.getAttribute('aria-valuetext')).toContain('۱۵۰ ریال');
    expect(screen.getByText('بیش از بودجه')).toBeTruthy();
  });
});

describe('LabelChip', () => {
  it('can be taken off with its own named button', async () => {
    const onRemove = vi.fn();
    renderSignedIn(<LabelChip name="سفر" onRemove={onRemove} removeLabel="برداشتن سفر" />);
    await userEvent.click(await screen.findByRole('button', { name: 'برداشتن سفر' }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});

describe('ChartFrame', () => {
  const frame = (status: 'ready' | 'loading' | 'empty' | 'error', onRetry = vi.fn()) => (
    <ChartFrame
      title="درآمد و هزینه"
      summary="هزینه در مهر بیشتر از درآمد بود."
      status={status}
      legend={[{ label: 'درآمد', color: 'green' }]}
      empty={{ title: 'هنوز تراکنشی نیست', action: <Button>ثبت تراکنش</Button> }}
      onRetry={onRetry}
    >
      <svg data-testid="drawing" />
    </ChartFrame>
  );

  it('gives the drawing a text summary and hides the drawing from screen readers', async () => {
    renderSignedIn(frame('ready'));
    const region = await screen.findByRole('region', { name: 'درآمد و هزینه' });
    expect(within(region).getByText('هزینه در مهر بیشتر از درآمد بود.')).toBeTruthy();
    expect(within(region).getByText('درآمد')).toBeTruthy();
    expect(screen.getByTestId('drawing').closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('shows loading, empty with its action, and error with retry in the chart’s place', async () => {
    const onRetry = vi.fn();
    const loading = renderSignedIn(frame('loading'));
    expect(await screen.findByRole('status', { name: 'در حال بارگذاری…' })).toBeTruthy();
    expect(screen.queryByTestId('drawing')).toBeNull();
    loading.unmount();

    const empty = renderSignedIn(frame('empty'));
    expect(await screen.findByRole('heading', { name: 'هنوز تراکنشی نیست' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ثبت تراکنش' })).toBeTruthy();
    expect(screen.queryByTestId('drawing')).toBeNull();
    empty.unmount();

    renderSignedIn(frame('error', onRetry));
    await userEvent.click(
      within(await screen.findByRole('alert')).getByRole('button', { name: 'تلاش دوباره' }),
    );
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('ResponsiveTable', () => {
  it('is one table, named, with a header per column, at every width', async () => {
    renderSignedIn(
      <ResponsiveTable
        caption="نرخ‌ها"
        columns={[
          {
            key: 'currency',
            header: 'ارز',
            cell: (row: { c: string; r: string }) => row.c,
            primary: true,
          },
          { key: 'rate', header: 'نرخ', cell: (row) => row.r, align: 'end' },
        ]}
        rows={[{ c: 'دلار', r: '۶۰۰٬۰۰۰' }]}
        rowKey={(row) => row.c}
      />,
    );
    const table = await screen.findByRole('table', { name: 'نرخ‌ها' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['ارز', 'نرخ']);
    // On a phone each value carries its column's name, shown but not read twice.
    expect(within(table).getByRole('cell', { name: 'دلار' })).toBeTruthy();
    expect(within(table).getByRole('cell', { name: '۶۰۰٬۰۰۰' })).toBeTruthy();
  });
});
