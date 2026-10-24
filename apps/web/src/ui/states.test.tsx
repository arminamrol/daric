import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { Field, Input, Label } from './Field';
import { PasswordConfirmDialog } from './PasswordConfirmDialog';
import { SectionBoundary } from './SectionBoundary';
import { UiProvider } from './UiProvider';
import { UI_LABELS_FA } from './test-labels';

function renderUi(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <UiProvider dir="rtl" labels={UI_LABELS_FA}>
        {ui}
      </UiProvider>
    </QueryClientProvider>,
  );
}

describe('EmptyState', () => {
  it('says what goes here and offers the action that fills it', async () => {
    const onAdd = vi.fn();
    renderUi(
      <EmptyState
        title="هنوز حسابی نیست"
        description="حساب‌هایتان اینجا می‌آیند."
        action={<Button onClick={onAdd}>افزودن حساب</Button>}
      />,
    );
    expect(screen.getByRole('heading', { name: 'هنوز حسابی نیست' })).toBeTruthy();
    expect(screen.getByText('حساب‌هایتان اینجا می‌آیند.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'افزودن حساب' }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('can say it without an action, for Members who may not add', () => {
    renderUi(<EmptyState title="هنوز حسابی نیست" />);
    expect(screen.getByRole('heading', { name: 'هنوز حسابی نیست' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ErrorState', () => {
  it('announces the failure and tries again on retry', async () => {
    const onRetry = vi.fn();
    renderUi(<ErrorState onRetry={onRetry} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(UI_LABELS_FA.loadFailed);
    await userEvent.click(within(alert).getByRole('button', { name: UI_LABELS_FA.retry }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('takes its own words', () => {
    renderUi(<ErrorState title="گزارش بارگذاری نشد" description="دوباره امتحان کنید." />);
    expect(screen.getByRole('alert').textContent).toContain('گزارش بارگذاری نشد');
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('SectionBoundary', () => {
  function Flaky({ fail }: { fail: () => boolean }) {
    if (fail()) throw new Error('boom');
    return <p>بخش سالم</p>;
  }

  it('keeps a failing section from taking down the rest, and draws it again on retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let broken = true;
    renderUi(
      <>
        <p>بقیه صفحه</p>
        <SectionBoundary>
          <Flaky fail={() => broken} />
        </SectionBoundary>
      </>,
    );
    expect(screen.getByText('بقیه صفحه')).toBeTruthy();
    const alert = screen.getByRole('alert');
    broken = false;
    await userEvent.click(within(alert).getByRole('button', { name: UI_LABELS_FA.retry }));
    expect(await screen.findByText('بخش سالم')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('tries again by itself when its reset key changes, such as on a new route', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let broken = true;
    function Month() {
      const [month, setMonth] = useState(7);
      return (
        <>
          <Button onClick={() => setMonth((m) => m + 1)}>ماه بعد</Button>
          <SectionBoundary resetKey={month}>
            <Flaky fail={() => broken} />
          </SectionBoundary>
        </>
      );
    }
    renderUi(<Month />);
    expect(screen.getByRole('alert')).toBeTruthy();
    broken = false;
    await userEvent.click(screen.getByRole('button', { name: 'ماه بعد' }));
    expect(await screen.findByText('بخش سالم')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('asks a failed query again on retry', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let calls = 0;
    function Loaded() {
      const { data } = useQuery({
        queryKey: ['section'],
        queryFn: () => {
          calls += 1;
          if (calls === 1) throw new Error('offline');
          return Promise.resolve('رسید');
        },
        throwOnError: true,
      });
      return <p>{data ?? '…'}</p>;
    }
    renderUi(
      <SectionBoundary>
        <Loaded />
      </SectionBoundary>,
    );
    const alert = await screen.findByRole('alert');
    await userEvent.click(within(alert).getByRole('button', { name: UI_LABELS_FA.retry }));
    expect(await screen.findByText('رسید')).toBeTruthy();
    expect(calls).toBe(2);
  });
});

describe('PasswordConfirmDialog', () => {
  function Example({
    onConfirm,
    reasonRequired = false,
  }: {
    onConfirm: (password: string, form: FormData) => Promise<unknown>;
    reasonRequired?: boolean;
  }) {
    const [done, setDone] = useState(false);
    return (
      <>
        <PasswordConfirmDialog
          trigger={<Button variant="danger">حذف حساب</Button>}
          title="حساب حذف شود؟"
          description="این کار برگشت‌پذیر نیست."
          confirm="حذف برای همیشه"
          onConfirm={async (password, form) => {
            await onConfirm(password, form);
            setDone(true);
          }}
          errorMessage={(error) => (error instanceof Error ? error.message : 'خطا')}
        >
          <Field>
            <Label htmlFor="reason">دلیل</Label>
            <Input id="reason" name="reason" required={reasonRequired} />
          </Field>
        </PasswordConfirmDialog>
        {done && <p>انجام شد</p>}
      </>
    );
  }

  const open = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'حذف حساب' }));
    return screen.getByRole('dialog', { name: 'حساب حذف شود؟' });
  };

  it('starts on its first field, and acts only once the password is given', async () => {
    const onConfirm = vi.fn(() => Promise.resolve());
    renderUi(<Example onConfirm={onConfirm} />);
    const dialog = await open();
    const password = within(dialog).getByLabelText(UI_LABELS_FA.password);
    expect(password.getAttribute('type')).toBe('password');
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByLabelText('دلیل')));
    const confirm = within(dialog).getByRole('button', { name: 'حذف برای همیشه' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    await userEvent.type(within(dialog).getByLabelText('دلیل'), 'درخواست کاربر');
    await userEvent.type(password, 'secret-pass');
    await userEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledOnce();
    const [given, form] = onConfirm.mock.calls[0] as unknown as [string, FormData];
    expect(given).toBe('secret-pass');
    expect(form.get('reason')).toBe('درخواست کاربر');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('انجام شد')).toBeTruthy();
  });

  it('stays open on a refusal, says why, and lets the password be tried again', async () => {
    const onConfirm = vi
      .fn<(password: string) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('رمز عبور درست نیست.'))
      .mockResolvedValueOnce(undefined);
    renderUi(<Example onConfirm={onConfirm} />);
    const dialog = await open();
    const password = within(dialog).getByLabelText(UI_LABELS_FA.password);
    await userEvent.type(password, 'wrong');
    await userEvent.click(within(dialog).getByRole('button', { name: 'حذف برای همیشه' }));

    expect((await within(dialog).findByRole('alert')).textContent).toBe('رمز عبور درست نیست.');
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(password.getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByText('انجام شد')).toBeNull();

    await userEvent.clear(password);
    await userEvent.type(password, 'right{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onConfirm).toHaveBeenLastCalledWith('right', expect.any(FormData));
  });

  it('does nothing on cancel, and forgets what was typed', async () => {
    const onConfirm = vi.fn(() => Promise.resolve());
    renderUi(<Example onConfirm={onConfirm} />);
    let dialog = await open();
    await userEvent.type(within(dialog).getByLabelText(UI_LABELS_FA.password), 'secret');
    await userEvent.click(within(dialog).getByRole('button', { name: UI_LABELS_FA.cancel }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();

    dialog = await open();
    expect((within(dialog).getByLabelText(UI_LABELS_FA.password) as HTMLInputElement).value).toBe(
      '',
    );
  });

  it('waits for a required reason as well as the password', async () => {
    const onConfirm = vi.fn(() => Promise.resolve());
    renderUi(<Example onConfirm={onConfirm} reasonRequired />);
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText(UI_LABELS_FA.password), 'secret{Enter}');
    const confirm = within(dialog).getByRole('button', { name: 'حذف برای همیشه' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(onConfirm).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText('دلیل'), 'درخواست کاربر');
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('cannot be sent twice while the first is on its way', async () => {
    let finish: () => void = () => undefined;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderUi(<Example onConfirm={onConfirm} />);
    const dialog = await open();
    await userEvent.type(within(dialog).getByLabelText(UI_LABELS_FA.password), 'secret');
    const confirm = within(dialog).getByRole('button', { name: 'حذف برای همیشه' });
    await userEvent.click(confirm);
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
    finish();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
