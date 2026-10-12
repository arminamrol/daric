import { MAX_TRAILING_MONTHS } from '@daric/core';
import { useId, useState } from 'react';
import { useI18n } from '../i18n/locale';
import { useFormatters } from '../settings/settings';
import { useUpdateProjectionSettings } from './projection';

const MONTHS = Array.from({ length: MAX_TRAILING_MONTHS }, (_, i) => i + 1);

/** Owner or Admin: how many closed months the Trailing Average looks back over. */
export function TrailingMonthsForm({ trailingMonths }: { trailingMonths: number }) {
  const { t } = useI18n();
  const format = useFormatters();
  const update = useUpdateProjectionSettings();
  const [months, setMonths] = useState(trailingMonths);
  const selectId = useId();

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate({ trailingMonths: months });
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={selectId} className="text-sm font-medium">
          {t('projection.trailingMonths')}
        </label>
        <select
          id={selectId}
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          className="rounded-md border border-border bg-background px-3 py-2 text-foreground"
        >
          {MONTHS.map((n) => (
            <option key={n} value={n}>
              {t('projection.trailingMonthsOption', { count: format.count(n) })}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={update.isPending || months === trailingMonths}
        className="rounded-md bg-primary px-4 py-2 font-medium text-on-primary disabled:opacity-60"
      >
        {update.isPending ? t('projection.saving') : t('projection.save')}
      </button>
      {update.isError && (
        <p role="alert" className="w-full text-sm text-danger">
          {t('projection.saveFailed')}
        </p>
      )}
    </form>
  );
}
