import { baseCurrencyCodes, calendarSystems, hasRole, moneyDisplays } from '@daric/core';
import type { CalendarSystem, MoneyDisplay, UpdateWorkspaceInput, Workspace } from '@daric/core';
import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { useI18n } from '../i18n/locale';
import { Button } from '../ui/Button';
import { Card, CardDescription, CardTitle } from '../ui/Card';
import {
  Field,
  FieldDescription,
  FieldSet,
  FormMessage,
  Input,
  Label,
  NativeSelect,
} from '../ui/Field';
import { SegmentedControl } from '../ui/SegmentedControl';
import { CALENDAR_LABELS, CURRENCY_NAMES, MONEY_DISPLAY_UNITS } from './labels';
import { useUpdateWorkspace } from './settings';

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
export function timeZoneChoices(current: string): string[] {
  const all = Intl.supportedValuesOf('timeZone');
  return all.includes(current) ? all : [current, ...all];
}

/** Every currency that can be a Base Currency, named in the User's language where Daric can. */
export function BaseCurrencyOptions() {
  const { t } = useI18n();
  return baseCurrencyCodes.map((code) => {
    const name = CURRENCY_NAMES[code];
    return (
      <option key={code} value={code}>
        {name ? t(name) : code}
      </option>
    );
  });
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
    <Card>
      <CardTitle id={ids.title}>{t('settings.workspace.title')}</CardTitle>
      <form
        aria-labelledby={ids.title}
        aria-describedby={canEdit ? undefined : ids.readOnly}
        onSubmit={onSubmit}
        className="flex flex-col gap-section"
      >
        {!canEdit && (
          <CardDescription id={ids.readOnly}>{t('settings.workspace.readOnly')}</CardDescription>
        )}
        <FieldSet disabled={!canEdit}>
          <Field>
            <Label htmlFor={ids.name}>{t('settings.workspace.name')}</Label>
            <Input
              id={ids.name}
              value={draft.name}
              maxLength={100}
              onChange={(e) => change({ name: e.target.value })}
              aria-invalid={nameMissing ? true : undefined}
            />
          </Field>
          <Field>
            <Label htmlFor={ids.currency}>{t('settings.workspace.baseCurrency')}</Label>
            <NativeSelect
              id={ids.currency}
              value={draft.baseCurrency}
              onChange={(e) => change({ baseCurrency: e.target.value })}
              aria-describedby={ids.currencyHint}
            >
              <BaseCurrencyOptions />
            </NativeSelect>
            <FieldDescription id={ids.currencyHint}>
              {t('settings.workspace.baseCurrencyHint')}
            </FieldDescription>
          </Field>
          <Field>
            <SegmentedControl<CalendarSystem>
              legend={t('settings.workspace.calendar')}
              choices={calendarSystems.map((value) => ({
                value,
                label: t(CALENDAR_LABELS[value]),
              }))}
              value={draft.calendar}
              onChange={(calendar) => change({ calendar })}
              describedBy={ids.calendarHint}
              disabled={!canEdit}
            />
            <FieldDescription id={ids.calendarHint}>
              {t('settings.workspace.calendarHint')}
            </FieldDescription>
          </Field>
          <Field>
            <Label htmlFor={ids.timezone}>{t('settings.workspace.timezone')}</Label>
            <NativeSelect
              id={ids.timezone}
              dir="ltr"
              value={draft.timezone}
              onChange={(e) => change({ timezone: e.target.value })}
            >
              {timeZoneChoices(workspace.timezone).map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <SegmentedControl<MoneyDisplay>
            legend={t('settings.workspace.moneyDisplay')}
            choices={moneyDisplays.map((value) => ({
              value,
              label: t(MONEY_DISPLAY_UNITS[value]),
            }))}
            value={draft.moneyDisplay}
            onChange={(moneyDisplay) => change({ moneyDisplay })}
            disabled={!canEdit}
          />
        </FieldSet>
        {save.isSuccess && <FormMessage tone="status">{t('settings.saved')}</FormMessage>}
        {save.isError && <FormMessage tone="alert">{t('settings.saveFailed')}</FormMessage>}
        {canEdit && (
          <Button
            type="submit"
            disabled={save.isPending || nameMissing || Object.keys(changes).length === 0}
            className="w-fit"
          >
            {t('settings.save')}
          </Button>
        )}
      </form>
    </Card>
  );
}
