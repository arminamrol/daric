import { hasRole, MAX_TRAILING_MONTHS } from '@daric/core';
import type { ProjectionReport } from '@daric/core';
import { nativeTheme } from '@daric/design-tokens';
import { isolate } from '@daric/i18n';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSignedIn } from '../auth/session';
import { useFormatters, useShownInBase } from '../display/formatters';
import { useI18n } from '../i18n/locale';
import { Button } from '../ui/Button';
import { Card, Figure, Heading } from '../ui/Card';
import { Choices } from '../ui/Choices';
import { FormMessage } from '../ui/Form';
import { RateNotes, Warning } from '../ui/RateNotes';
import { Text } from '../ui/Text';
import type { NameOf } from './names';
import { useProjectionSettings, useUpdateProjectionSettings } from './projection';

const MONTHS = Array.from({ length: MAX_TRAILING_MONTHS }, (_, i) => i + 1);

/** Owner or Admin: how many closed months the Trailing Average looks back over. */
function TrailingMonthsForm({ trailingMonths }: { trailingMonths: number }) {
  const { t } = useI18n();
  const format = useFormatters();
  const update = useUpdateProjectionSettings();
  const [months, setMonths] = useState(trailingMonths);
  return (
    <View style={styles.part}>
      <Choices
        label={t('projection.trailingMonths')}
        choices={MONTHS.map((n) => ({
          id: String(n),
          label: t('projection.trailingMonthsOption', { count: format.count(n) }),
        }))}
        selected={String(months)}
        onSelect={(id) => setMonths(Number(id))}
      />
      <Button
        label={update.isPending ? t('projection.saving') : t('projection.save')}
        disabled={update.isPending || months === trailingMonths}
        onPress={() => update.mutate({ trailingMonths: months })}
      />
      <FormMessage message={update.isError ? t('projection.saveFailed') : undefined} />
    </View>
  );
}

/** A list of what goes into the Projection, each with how often and how much. */
function Lines({
  title,
  empty,
  lines,
}: {
  title: string;
  empty: string;
  lines: readonly { key: string; label: string; value: string }[];
}) {
  return (
    <View style={styles.part}>
      <Heading small>{title}</Heading>
      {lines.length === 0 ? (
        <Text size="sm" tone="foregroundMuted">
          {empty}
        </Text>
      ) : (
        lines.map((line) => <Figure key={line.key} row label={line.label} value={line.value} />)
      )}
    </View>
  );
}

/** Every assumption behind the Projection, and the Trailing Average's length for Owners and Admins. */
export function Assumptions({
  projection,
  nameOf,
}: {
  projection: ProjectionReport;
  nameOf: NameOf;
}) {
  const { t } = useI18n();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const settings = useProjectionSettings();
  const shown = useShownInBase(projection.baseCurrency);
  const { mode, remaining, window, monthsUsed } = projection;
  const averaging = mode !== 'MANUAL';
  const used = window.slice(window.length - monthsUsed);
  const months = used.map((p) => isolate(format.period(p))).join(t('totals.separator'));
  const occurrences = (count: number, total: bigint) =>
    t('projection.occurrences', { count: format.count(count), total: isolate(shown(total)) });

  return (
    <Card>
      <Heading>{t('projection.assumptions')}</Heading>
      <Text size="sm">
        {t('projection.remaining', {
          months: format.count(remaining.fullMonths),
          days: format.count(remaining.daysLeftInMonth),
          monthDays: format.count(remaining.daysInMonth),
        })}
      </Text>
      {averaging && monthsUsed > 0 && (
        <Text size="sm">
          {t(monthsUsed === window.length ? 'projection.window' : 'projection.windowShort', {
            months,
          })}
        </Text>
      )}
      {projection.warnings.map((warning) =>
        warning.kind === 'missing_rates' ? null : (
          <Warning key={warning.kind}>
            {warning.kind === 'short_history'
              ? t('projection.warning.short_history', {
                  used: format.count(warning.monthsUsed),
                  wanted: format.count(warning.monthsWanted),
                })
              : t('projection.warning.no_history')}
          </Warning>
        ),
      )}
      <RateNotes
        ratesUsed={projection.ratesUsed}
        missing={projection.missing}
        day={projection.today}
        baseCurrency={projection.baseCurrency}
      />
      {averaging &&
        settings.data &&
        (hasRole(workspace.role, 'ADMIN') ? (
          <TrailingMonthsForm
            key={settings.data.version}
            trailingMonths={settings.data.trailingMonths}
          />
        ) : (
          <Text size="sm" tone="foregroundMuted">
            {t('projection.trailingMonthsReadOnly', {
              count: format.count(settings.data.trailingMonths),
            })}
          </Text>
        ))}
      {averaging && (
        <Lines
          title={t('projection.averages')}
          empty={t('projection.noAverages')}
          lines={projection.categories
            .filter((c) => c.average !== 0n)
            .map((line) => ({
              key: `${line.type}|${line.categoryId}`,
              label: nameOf(line.categoryId),
              value: shown(line.average),
            }))}
        />
      )}
      {averaging && (
        <Lines
          title={t('projection.recurringList')}
          empty={t('projection.noRecurring')}
          lines={projection.recurring.map((rule) => ({
            key: rule.ruleId,
            label: `${rule.name} · ${nameOf(rule.categoryId)}`,
            value: occurrences(rule.occurrences.length, rule.total),
          }))}
        />
      )}
      {mode !== 'AUTOMATIC' && (
        <Lines
          title={t('projection.plannedList')}
          empty={t('projection.noPlanned')}
          lines={projection.planned.map((item) => ({
            key: item.itemId,
            label: `${item.name} · ${nameOf(item.categoryId)}`,
            value: occurrences(item.occurrences.length, item.total),
          }))}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  part: { gap: nativeTheme.space(2) },
});
