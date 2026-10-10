import { baseCurrencyCodes, calendarSystems, hasRole, moneyDisplays } from '@daric/core';
import type { CalendarSystem, MoneyDisplay, UpdateWorkspaceInput, Workspace } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { useI18n } from '../i18n/locale';
import { ChoiceGroup } from '../ui/ChoiceGroup';
import { CALENDAR_LABELS } from './labels';
import { useUpdateWorkspace } from './settings';

const CURRENCY_NAMES: Readonly<Record<string, PlainMessageKey>> = {
  IRR: 'currency.IRR',
  USD: 'currency.USD',
  EUR: 'currency.EUR',
};

const MONEY_DISPLAY_LABELS: Record<MoneyDisplay, PlainMessageKey> = {
  rial: 'settings.workspace.moneyDisplay.rial',
  toman: 'settings.workspace.moneyDisplay.toman',
};

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-foreground aria-invalid:border-danger disabled:cursor-not-allowed';

type Draft = Required<UpdateWorkspaceInput>;

function draftOf(workspace: Workspace): Draft {
  const { name, baseCurrency, calendar, timezone, moneyDisplay } = workspace;
  return { name, baseCurrency, calendar, timezone, moneyDisplay };
}

/** The fields of `draft` that differ from `workspace`, so the audit log names only real changes. */
function changesOf(workspace: Workspace, draft: Draft): UpdateWorkspaceInput {
  const saved = draftOf(workspace);
  const next = { ...draft, name: draft.name.trim() };
  return Object.fromEntries(
    (Object.keys(next) as (keyof Draft)[])
      .filter((key) => next[key] !== saved[key])
      .map((key) => [key, next[key]]),
  );
}

/** IANA timezones the browser knows, with the Workspace's own first if the list lacks it. */
function timeZoneChoices(current: string): string[] {
  const all = Intl.supportedValuesOf('timeZone');
  return all.includes(current) ? all : [current, ...all];
}

/** Base Currency, Workspace Calendar, timezone and Rial/Toman: Owner and Admin only. */
export function WorkspaceSettingsForm({ workspace }: { workspace: Workspace }) {
  const { t } = useI18n();
  const id = useId();
  const ids = {
    title: `${id}-title`,
    readOnly: `${id}-read-only`,
    name: `${id}-name`,
    currency: `${id}-currency`,
    currencyHint: `${id}-currency-hint`,
    calendarHint: `${id}-calendar-hint`,
    timezone: `${id}-timezone`,
  };
  const canEdit = hasRole(workspace.role, 'ADMIN');
  const [draft, setDraft] = useState(() => draftOf(workspace));
  const save = useUpdateWorkspace(workspace.id);
  const changes = changesOf(workspace, draft);
  const nameMissing = draft.name.trim() === '';

  function change(next: Partial<Draft>) {
    save.reset();
    setDraft((current) => ({ ...current, ...next }));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (nameMissing || Object.keys(changes).length === 0) return;
    // The server may store a value differently (a timezone's canonical name).
    save.mutate(changes, { onSuccess: (saved) => setDraft(draftOf(saved)) });
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface px-6 py-6">
      <h2 id={ids.title} className="text-xl font-bold">
        {t('settings.workspace.title')}
      </h2>
      <form
        aria-labelledby={ids.title}
        aria-describedby={canEdit ? undefined : ids.readOnly}
        onSubmit={onSubmit}
        className="flex flex-col gap-5"
      >
        {!canEdit && (
          <p id={ids.readOnly} className="text-sm text-foreground-muted">
            {t('settings.workspace.readOnly')}
          </p>
        )}
        <fieldset disabled={!canEdit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.name} className="font-medium">
              {t('settings.workspace.name')}
            </label>
            <input
              id={ids.name}
              value={draft.name}
              maxLength={100}
              onChange={(e) => change({ name: e.target.value })}
              aria-invalid={nameMissing ? true : undefined}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.currency} className="font-medium">
              {t('settings.workspace.baseCurrency')}
            </label>
            <select
              id={ids.currency}
              value={draft.baseCurrency}
              onChange={(e) => change({ baseCurrency: e.target.value })}
              aria-describedby={ids.currencyHint}
              className={inputClass}
            >
              {baseCurrencyCodes.map((code) => {
                const name = CURRENCY_NAMES[code];
                return (
                  <option key={code} value={code}>
                    {name ? t(name) : code}
                  </option>
                );
              })}
            </select>
            <p id={ids.currencyHint} className="text-sm text-foreground-muted">
              {t('settings.workspace.baseCurrencyHint')}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <ChoiceGroup<CalendarSystem>
              legend={t('settings.workspace.calendar')}
              choices={calendarSystems.map((value) => ({
                value,
                label: t(CALENDAR_LABELS[value]),
              }))}
              value={draft.calendar}
              onChange={(calendar) => change({ calendar })}
              describedBy={ids.calendarHint}
            />
            <p id={ids.calendarHint} className="text-sm text-foreground-muted">
              {t('settings.workspace.calendarHint')}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.timezone} className="font-medium">
              {t('settings.workspace.timezone')}
            </label>
            <select
              id={ids.timezone}
              dir="ltr"
              value={draft.timezone}
              onChange={(e) => change({ timezone: e.target.value })}
              className={inputClass}
            >
              {timeZoneChoices(workspace.timezone).map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </div>
          <ChoiceGroup<MoneyDisplay>
            legend={t('settings.workspace.moneyDisplay')}
            choices={moneyDisplays.map((value) => ({
              value,
              label: t(MONEY_DISPLAY_LABELS[value]),
            }))}
            value={draft.moneyDisplay}
            onChange={(moneyDisplay) => change({ moneyDisplay })}
          />
        </fieldset>
        {save.isSuccess && (
          <p role="status" className="text-sm text-foreground-muted">
            {t('settings.saved')}
          </p>
        )}
        {save.isError && (
          <p role="alert" className="rounded-md bg-surface-muted px-3 py-2 text-sm text-danger">
            {t('settings.saveFailed')}
          </p>
        )}
        {canEdit && (
          <button
            type="submit"
            disabled={save.isPending || nameMissing || Object.keys(changes).length === 0}
            className="w-fit rounded-md bg-primary px-4 py-2 font-medium text-on-primary disabled:opacity-60"
          >
            {t('settings.save')}
          </button>
        )}
      </form>
    </section>
  );
}
