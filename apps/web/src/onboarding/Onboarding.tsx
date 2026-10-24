import { calendarSystems, canonicalTimeZone, moneyDisplays } from '@daric/core';
import type {
  CalendarSystem,
  Me,
  MoneyDisplay,
  MyWorkspace,
  UpdateWorkspaceInput,
} from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoaderCircle } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useApi } from '../api/api';
import { ME_QUERY_KEY, useSignedIn } from '../auth/session';
import { LanguageToggle } from '../i18n/LanguageToggle';
import { useI18n } from '../i18n/locale';
import { pendingInvitation } from '../members/pendingInvitation';
import { useOfflineDevice } from '../offline/offline';
import { CALENDAR_LABELS, MONEY_DISPLAY_UNITS } from '../settings/labels';
import { useFormatters, useUpdateWorkspace } from '../settings/settings';
import { BaseCurrencyOptions, timeZoneChoices } from '../settings/WorkspaceSettingsForm';
import { Logo } from '../shell/Logo';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Field, FormMessage, Label, NativeSelect } from '../ui/Field';
import { SegmentedControl } from '../ui/SegmentedControl';

type Step = 'language' | 'currency' | 'calendar' | 'money' | 'offline';

/** Every step for a User setting up their own Workspace. */
const OWNER_STEPS: readonly Step[] = ['language', 'currency', 'calendar', 'money', 'offline'];
/** Someone else's Workspace is theirs to set up: an invited User makes only their own choices. */
const INVITED_STEPS: readonly Step[] = ['language', 'offline'];

const TITLES: Record<Step, PlainMessageKey> = {
  language: 'onboarding.language.title',
  currency: 'onboarding.currency.title',
  calendar: 'onboarding.calendar.title',
  money: 'onboarding.money.title',
  offline: 'onboarding.offline.title',
};

const HINTS: Record<Step, PlainMessageKey> = {
  language: 'onboarding.language.hint',
  currency: 'settings.workspace.baseCurrencyHint',
  calendar: 'settings.workspace.calendarHint',
  money: 'onboarding.money.hint',
  offline: 'onboarding.offline.hint',
};

type WorkspaceDraft = Required<Omit<UpdateWorkspaceInput, 'name'>>;

/** What each Workspace step saves. */
const STEP_FIELDS: Partial<Record<Step, readonly (keyof WorkspaceDraft)[]>> = {
  currency: ['baseCurrency'],
  calendar: ['calendar', 'timezone'],
  money: ['moneyDisplay'],
};

/** This device's own timezone, if the browser names one Daric knows. */
function deviceTimeZone(): string | undefined {
  return canonicalTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

function savedDraft(workspace: MyWorkspace): WorkspaceDraft {
  const { baseCurrency, calendar, timezone, moneyDisplay } = workspace;
  return { baseCurrency, calendar, timezone, moneyDisplay };
}

/** The User's own Personal Workspace, which they set up here. */
function personalWorkspace(me: Me): MyWorkspace | undefined {
  return me.workspaces.find((w) => w.type === 'PERSONAL' && w.role === 'OWNER');
}

/** Joined, or on the way to joining, a Workspace someone else owns. */
function isInvited(me: Me): boolean {
  return pendingInvitation.get() !== null || me.workspaces.some((w) => w.role !== 'OWNER');
}

/**
 * The first-run wizard, shown in place of the app until the User finishes or
 * skips it (then never again, on any device). Each step starts from today's
 * setting or, for the timezone, the device's own; Next saves it through the
 * usual settings, Skip leaves it as it is.
 */
export function Onboarding() {
  const { t } = useI18n();
  const format = useFormatters();
  const api = useApi();
  const queryClient = useQueryClient();
  const device = useOfflineDevice();
  const { me } = useSignedIn();
  const id = useId();
  const ids = { title: `${id}-title`, step: `${id}-step`, hint: `${id}-hint` };

  const [personal] = useState(() => personalWorkspace(me));
  const [steps] = useState(() => (personal && !isInvited(me) ? OWNER_STEPS : INVITED_STEPS));
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<WorkspaceDraft | undefined>(
    () => personal && { ...savedDraft(personal), timezone: deviceTimeZone() ?? personal.timezone },
  );
  const [keep, setKeep] = useState(() => device.keeps());

  const updateWorkspace = useUpdateWorkspace(personal?.id ?? '');
  const step = steps[index] ?? 'language';
  const last = index === steps.length - 1;

  const finish = useMutation({
    mutationFn: () => api.finishOnboarding(),
    onSuccess: () => {
      queryClient.setQueryData<Me | null>(
        ME_QUERY_KEY,
        (current) => current && { ...current, user: { ...current.user, onboarded: true } },
      );
    },
  });

  const save = useMutation({
    mutationFn: async (which: Step) => {
      if (which === 'offline') return device.setKeep(keep);
      const fields = STEP_FIELDS[which];
      if (!fields || !personal || !draft) return;
      const saved = savedDraft(workspaceNow());
      const changes = Object.fromEntries(
        fields.filter((key) => draft[key] !== saved[key]).map((key) => [key, draft[key]]),
      );
      if (Object.keys(changes).length > 0) await updateWorkspace.mutateAsync(changes);
    },
  });

  /** The Personal Workspace as last saved, which earlier steps may have changed. */
  function workspaceNow(): MyWorkspace {
    const me = queryClient.getQueryData<Me | null>(ME_QUERY_KEY);
    return me?.workspaces.find((w) => w.id === personal?.id) ?? (personal as MyWorkspace);
  }

  // Each new step is announced by moving focus to its title; the first one is simply there.
  const stepTitle = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (moved.current) stepTitle.current?.focus();
    moved.current = true;
  }, [index]);

  function forward() {
    save.reset();
    if (last) finish.mutate();
    else setIndex(index + 1);
  }

  function onNext(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate(step, { onSuccess: forward });
  }

  function onSkip() {
    // A skipped step keeps what is saved, so going back to it shows that.
    const fields = STEP_FIELDS[step];
    if (fields && personal && draft) {
      const saved = savedDraft(workspaceNow());
      setDraft({ ...draft, ...Object.fromEntries(fields.map((key) => [key, saved[key]])) });
    }
    if (step === 'offline') setKeep(device.keeps());
    forward();
  }

  function onBack() {
    save.reset();
    setIndex(index - 1);
  }

  const busy = save.isPending || finish.isPending;
  const failed = save.isError || finish.isError;
  const changeDraft = (next: Partial<WorkspaceDraft>) =>
    setDraft((current) => current && { ...current, ...next });

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-section sm:py-4">
      <div className="flex items-center gap-3">
        <Logo className="size-10 shrink-0" />
        <div className="me-auto flex min-w-0 flex-col">
          <h1 id={ids.title} className="text-xl font-bold">
            {t('onboarding.title')}
          </h1>
          <p className="text-sm text-foreground-muted">{t('onboarding.hint')}</p>
        </div>
      </div>

      <Card className="gap-section">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-foreground-muted">
              {t('onboarding.progress', {
                step: format.count(index + 1),
                total: format.count(steps.length),
              })}
            </p>
            <Button
              type="button"
              variant="link"
              className="text-sm"
              disabled={busy}
              onClick={() => finish.mutate()}
            >
              {t('onboarding.skipAll')}
            </Button>
          </div>
          <div aria-hidden className="flex gap-1">
            {steps.map((s, i) => (
              <span
                key={s}
                className={
                  i <= index
                    ? 'h-1.5 flex-1 rounded-full bg-primary transition-colors duration-(--daric-duration-fast)'
                    : 'h-1.5 flex-1 rounded-full bg-surface-muted transition-colors duration-(--daric-duration-fast)'
                }
              />
            ))}
          </div>
        </div>

        <form
          aria-labelledby={ids.step}
          aria-describedby={ids.hint}
          onSubmit={onNext}
          className="flex flex-col gap-section"
        >
          <header className="flex flex-col gap-1">
            <h2
              id={ids.step}
              ref={stepTitle}
              tabIndex={-1}
              className="text-lg font-semibold outline-none"
            >
              {t(TITLES[step])}
            </h2>
            <p id={ids.hint} className="text-sm text-foreground-muted">
              {t(HINTS[step])}
            </p>
          </header>

          {step === 'language' && <LanguageToggle hideLegend={false} />}
          {step === 'currency' && draft && (
            <CurrencyStep
              value={draft.baseCurrency}
              onChange={(baseCurrency) => changeDraft({ baseCurrency })}
            />
          )}
          {step === 'calendar' && draft && (
            <CalendarStep
              calendar={draft.calendar}
              timezone={draft.timezone}
              onChange={changeDraft}
            />
          )}
          {step === 'money' && draft && (
            <SegmentedControl<MoneyDisplay>
              legend={t('settings.workspace.moneyDisplay')}
              choices={moneyDisplays.map((value) => ({
                value,
                label: t(MONEY_DISPLAY_UNITS[value]),
              }))}
              value={draft.moneyDisplay}
              onChange={(moneyDisplay) => changeDraft({ moneyDisplay })}
            />
          )}
          {step === 'offline' && (
            <SegmentedControl<'yes' | 'no'>
              legend={t('onboarding.offline.title')}
              hideLegend
              choices={[
                { value: 'yes', label: t('onboarding.offline.yes') },
                { value: 'no', label: t('onboarding.offline.no') },
              ]}
              value={keep ? 'yes' : 'no'}
              onChange={(value) => setKeep(value === 'yes')}
            />
          )}

          {failed && <FormMessage tone="alert">{t('onboarding.failed')}</FormMessage>}

          <div className="flex flex-col gap-2">
            <Button type="submit" disabled={busy} className="w-full">
              {busy && (
                <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />
              )}
              {t(last ? 'onboarding.finish' : 'onboarding.next')}
            </Button>
            <div className="flex gap-2">
              {index > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={onBack}
                  className="flex-1"
                >
                  {t('onboarding.back')}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={onSkip}
                className="flex-1"
              >
                {t('onboarding.skip')}
              </Button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}

function CurrencyStep({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useI18n();
  const id = useId();
  return (
    <Field>
      <Label htmlFor={id}>{t('settings.workspace.baseCurrency')}</Label>
      <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <BaseCurrencyOptions />
      </NativeSelect>
    </Field>
  );
}

function CalendarStep({
  calendar,
  timezone,
  onChange,
}: {
  calendar: CalendarSystem;
  timezone: string;
  onChange: (next: { calendar?: CalendarSystem; timezone?: string }) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  return (
    <>
      <SegmentedControl<CalendarSystem>
        legend={t('settings.workspace.calendar')}
        choices={calendarSystems.map((value) => ({ value, label: t(CALENDAR_LABELS[value]) }))}
        value={calendar}
        onChange={(next) => onChange({ calendar: next })}
      />
      <Field>
        <Label htmlFor={id}>{t('settings.workspace.timezone')}</Label>
        <NativeSelect
          id={id}
          dir="ltr"
          value={timezone}
          onChange={(e) => onChange({ timezone: e.target.value })}
        >
          {timeZoneChoices(timezone).map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </NativeSelect>
      </Field>
    </>
  );
}
