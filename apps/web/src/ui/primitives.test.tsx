import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from './Dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './DropdownMenu';
import { Popover, PopoverContent, PopoverTrigger } from './Popover';
import { SegmentedControl } from './SegmentedControl';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './Select';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from './Sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';
import { toast } from './Toast';
import { Tooltip, TooltipContent, TooltipTrigger } from './Tooltip';
import { UiProvider } from './UiProvider';

const labels = { close: 'بستن', notifications: 'اعلان‌ها' };

function renderUi(ui: ReactNode, dir: 'ltr' | 'rtl' = 'rtl') {
  return render(
    <UiProvider dir={dir} labels={labels}>
      {ui}
    </UiProvider>,
  );
}

const PERIODS = [
  { value: 'month', label: 'ماهانه' },
  { value: 'year', label: 'سالانه' },
  { value: 'once', label: 'یک‌باره' },
] as const;
type Period = (typeof PERIODS)[number]['value'];

function Periods({ disabled }: { disabled?: boolean }) {
  const [value, setValue] = useState<Period>('month');
  return (
    <SegmentedControl<Period>
      legend="دوره"
      choices={PERIODS}
      value={value}
      onChange={setValue}
      disabled={disabled}
    />
  );
}

const checked = () => screen.getByRole('radio', { checked: true });

/** Presses an arrow key the way a person does: focus moves while it is held down. */
async function pressArrow(key: 'ArrowLeft' | 'ArrowRight') {
  const before = document.activeElement;
  await userEvent.keyboard(`{${key}>}`);
  await waitFor(() => expect(document.activeElement).not.toBe(before));
  await userEvent.keyboard(`{/${key}}`);
}

describe('SegmentedControl', () => {
  it('is a labelled group of radios with one picked, and a click picks another', async () => {
    renderUi(<Periods />);
    const group = screen.getByRole('radiogroup', { name: 'دوره' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['ماهانه', 'سالانه', 'یک‌باره']);
    expect(checked().textContent).toBe('ماهانه');
    await userEvent.click(screen.getByRole('radio', { name: 'سالانه' }));
    expect(checked().textContent).toBe('سالانه');
  });

  it('moves with the arrow keys in reading order, mirrored in right-to-left', async () => {
    const rtl = renderUi(<Periods />, 'rtl');
    await userEvent.tab();
    await pressArrow('ArrowLeft');
    expect(checked().textContent).toBe('سالانه');
    expect(document.activeElement).toBe(checked());
    rtl.unmount();

    renderUi(<Periods />, 'ltr');
    await userEvent.tab();
    await pressArrow('ArrowRight');
    expect(checked().textContent).toBe('سالانه');
  });

  it('can be disabled as a whole', async () => {
    renderUi(<Periods disabled />);
    for (const radio of screen.getAllByRole('radio')) expect(radio.matches(':disabled')).toBe(true);
    await userEvent.click(screen.getByRole('radio', { name: 'سالانه' }));
    expect(checked().textContent).toBe('ماهانه');
  });
});

describe('ConfirmDialog', () => {
  const question = 'این عضو برداشته شود؟';
  function renderConfirm() {
    const onConfirm = vi.fn();
    renderUi(
      <ConfirmDialog
        label="برداشتن"
        ariaLabel="برداشتن reza@example.com"
        question={question}
        confirm="بله، بردار"
        cancel="انصراف"
        onConfirm={onConfirm}
      />,
    );
    return onConfirm;
  }

  it('asks before acting, and acts on the explicit answer', async () => {
    const onConfirm = renderConfirm();
    await userEvent.click(screen.getByRole('button', { name: 'برداشتن reza@example.com' }));
    const dialog = screen.getByRole('alertdialog', { name: question });
    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'بله، بردار' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('leaves things as they were on cancel or Escape, and gives focus back', async () => {
    const onConfirm = renderConfirm();
    const trigger = screen.getByRole('button', { name: 'برداشتن reza@example.com' });
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole('button', { name: 'انصراف' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('starts on the safe answer', async () => {
    renderConfirm();
    await userEvent.click(screen.getByRole('button', { name: 'برداشتن reza@example.com' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'انصراف' }));
  });
});

describe('Dialog and Sheet', () => {
  it('open as a titled modal with a labelled close button, and close on Escape', async () => {
    renderUi(
      <>
        <Dialog>
          <DialogTrigger asChild>
            <Button>ویرایش</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogTitle>ویرایش حساب</DialogTitle>
            <DialogDescription>نام و نوع حساب</DialogDescription>
          </DialogContent>
        </Dialog>
        <Sheet>
          <SheetTrigger asChild>
            <Button>فیلترها</Button>
          </SheetTrigger>
          <SheetContent side="bottom" aria-describedby={undefined}>
            <SheetTitle>فیلتر تراکنش‌ها</SheetTitle>
          </SheetContent>
        </Sheet>
      </>,
    );
    for (const [trigger, title] of [
      ['ویرایش', 'ویرایش حساب'],
      ['فیلترها', 'فیلتر تراکنش‌ها'],
    ] as const) {
      const button = screen.getByRole('button', { name: trigger });
      await userEvent.click(button);
      const dialog = screen.getByRole('dialog', { name: title });
      await userEvent.click(within(dialog).getByRole('button', { name: 'بستن' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(button);

      await userEvent.click(button);
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).toBeNull();
    }
  });
});

describe('menus and popups', () => {
  it('a dropdown menu opens from the keyboard and runs the chosen item', async () => {
    const onSelect = vi.fn();
    renderUi(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>بیشتر</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>ویرایش</DropdownMenuItem>
          <DropdownMenuItem variant="danger" onSelect={onSelect}>
            حذف
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['ویرایش', 'حذف']);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'حذف' }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('a popover shows its content and closes on Escape', async () => {
    renderUi(
      <Popover>
        <PopoverTrigger asChild>
          <Button>تاریخ</Button>
        </PopoverTrigger>
        <PopoverContent aria-label="انتخاب تاریخ">تقویم</PopoverContent>
      </Popover>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'تاریخ' }));
    expect(screen.getByRole('dialog', { name: 'انتخاب تاریخ' }).textContent).toBe('تقویم');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a tooltip describes its trigger on focus', async () => {
    renderUi(
      <Tooltip>
        <TooltipTrigger asChild>
          <Button aria-label="همگام‌سازی">↻</Button>
        </TooltipTrigger>
        <TooltipContent>آخرین همگام‌سازی: الان</TooltipContent>
      </Tooltip>,
    );
    await userEvent.tab();
    expect((await screen.findByRole('tooltip')).textContent).toContain('آخرین همگام‌سازی: الان');
  });

  it('a select picks an option from the keyboard', async () => {
    function Currency() {
      const [value, setValue] = useState('IRR');
      return (
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger aria-label="ارز">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="IRR">ریال</SelectItem>
            <SelectItem value="USD">دلار</SelectItem>
          </SelectContent>
        </Select>
      );
    }
    renderUi(<Currency />);
    const trigger = screen.getByRole('combobox', { name: 'ارز' });
    expect(trigger.textContent).toBe('ریال');
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    await userEvent.click(screen.getByRole('option', { name: 'دلار' }));
    expect(trigger.textContent).toBe('دلار');
  });
});

describe('Tabs', () => {
  it('move with the arrow keys in reading order and show the chosen panel', async () => {
    renderUi(
      <Tabs defaultValue="month">
        <TabsList aria-label="بازه">
          <TabsTrigger value="month">ماه</TabsTrigger>
          <TabsTrigger value="year">سال</TabsTrigger>
        </TabsList>
        <TabsContent value="month">گزارش ماه</TabsContent>
        <TabsContent value="year">گزارش سال</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole('tabpanel').textContent).toBe('گزارش ماه');
    await userEvent.tab();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { selected: true }).textContent).toBe('سال');
    expect(screen.getByRole('tabpanel').textContent).toBe('گزارش سال');
  });
});

describe('toast', () => {
  it('shows a short message in the notifications region', async () => {
    renderUi(<p>صفحه</p>);
    act(() => {
      toast('ذخیره شد.');
    });
    const region = screen.getByRole('region', { name: /اعلان‌ها/ });
    expect(await within(region).findByText('ذخیره شد.')).toBeTruthy();
  });
});
