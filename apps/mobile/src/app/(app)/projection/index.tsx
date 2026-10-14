import { currencyByCode, hasRole, money, projectionModes, transactionTypes } from '@daric/core';
import type { ProjectionMode, ProjectionReport, TransactionType } from '@daric/core';
import { nativeTheme } from '@daric/design-tokens';
import { isolate } from '@daric/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSignedIn } from '../../../auth/session';
import { projectionKey } from '../../../data/keys';
import { useFormatters, useShownInBase } from '../../../display/formatters';
import { useI18n } from '../../../i18n/locale';
import { Assumptions } from '../../../projection/Assumptions';
import { useCategoryNames } from '../../../projection/names';
import type { NameOf } from '../../../projection/names';
import {
  usePlannedItems,
  useProjection,
  useUpdateProjectionSettings,
} from '../../../projection/projection';
import { Card, Figure, Heading, Rows } from '../../../ui/Card';
import { Choices } from '../../../ui/Choices';
import { FormMessage } from '../../../ui/Form';
import { ScreenHeader } from '../../../ui/HeaderButton';
import { ListRow } from '../../../ui/ListRow';
import { ScrollScreen } from '../../../ui/ScrollScreen';
import { Text } from '../../../ui/Text';

const FIGURES_OF = { INCOME: 'income', EXPENSE: 'expense' } as const;

/** Which mode the Projection is shown in; an Owner's or Admin's choice is kept for everyone. */
function ModeSwitch({
  mode,
  onChange,
}: {
  mode: ProjectionMode;
  onChange: (mode: ProjectionMode) => void;
}) {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  const update = useUpdateProjectionSettings();
  return (
    <View style={styles.part}>
      <Choices
        label={t('projection.mode')}
        choices={projectionModes.map((id) => ({ id, label: t(`projection.mode.${id}`) }))}
        selected={mode}
        onSelect={(id) => {
          const value = id as ProjectionMode;
          onChange(value);
          if (hasRole(workspace.role, 'ADMIN')) update.mutate({ mode: value });
        }}
      />
      <Text size="sm" tone="foregroundMuted" accessibilityLiveRegion="polite">
        {t(`projection.modeHint.${mode}`)}
      </Text>
      <FormMessage message={update.isError ? t('projection.modeFailed') : undefined} />
    </View>
  );
}

function TypeTotals({ type, projection }: { type: TransactionType; projection: ProjectionReport }) {
  const { t } = useI18n();
  const shown = useShownInBase(projection.baseCurrency);
  const figures = projection[FIGURES_OF[type]];
  const { mode } = projection;
  return (
    <Card>
      <Heading small>{t(`projection.type.${type}`)}</Heading>
      <Figure large label={t('projection.projected')} value={shown(figures.projected)} />
      <Figure row label={t('projection.actual')} value={shown(figures.actual)} />
      {mode !== 'MANUAL' && (
        <>
          <Figure row label={t('projection.variable')} value={shown(figures.variable)} />
          <Figure row label={t('projection.recurring')} value={shown(figures.recurring)} />
        </>
      )}
      {mode !== 'AUTOMATIC' && (
        <Figure row label={t('projection.planned')} value={shown(figures.planned)} />
      )}
    </Card>
  );
}

function CategoryBreakdown({
  type,
  projection,
  nameOf,
}: {
  type: TransactionType;
  projection: ProjectionReport;
  nameOf: NameOf;
}) {
  const { t } = useI18n();
  const shown = useShownInBase(projection.baseCurrency);
  const detail = (line: ProjectionReport['categories'][number]) => {
    const amounts = {
      actual: isolate(shown(line.actual)),
      variable: isolate(shown(line.variable)),
      recurring: isolate(shown(line.recurring)),
      planned: isolate(shown(line.planned)),
    };
    if (projection.mode === 'MANUAL') return t('projection.categoryDetailManual', amounts);
    if (projection.mode === 'COMBINED') return t('projection.categoryDetailCombined', amounts);
    return t('projection.categoryDetail', amounts);
  };
  const lines = projection.categories
    .filter((c) => c.type === type)
    .sort((a, b) => (a.projected < b.projected ? 1 : a.projected > b.projected ? -1 : 0));
  if (lines.length === 0) return null;

  return (
    <View style={styles.part}>
      <Heading>{t('projection.byCategory', { type: t(`projection.type.${type}`) })}</Heading>
      <Rows>
        {lines.map((line) => (
          <ListRow
            key={line.categoryId ?? ''}
            title={nameOf(line.categoryId)}
            trailing={shown(line.projected)}
            lines={[detail(line)]}
          />
        ))}
      </Rows>
    </View>
  );
}

/** Every Planned Item; Owners and Admins open one to change it. */
function PlannedItems({ nameOf }: { nameOf: NameOf }) {
  const { t } = useI18n();
  const format = useFormatters();
  const router = useRouter();
  const { workspace } = useSignedIn();
  const items = usePlannedItems();
  const mayChange = hasRole(workspace.role, 'ADMIN');

  return (
    <View style={styles.part}>
      <Heading>{t('plannedItems.title')}</Heading>
      <Text size="sm" tone="foregroundMuted">
        {t('plannedItems.intro')}
      </Text>
      {items.isPending ? (
        <Text tone="foregroundMuted">{t('session.loading')}</Text>
      ) : !items.data ? (
        <Text tone="danger" accessibilityRole="alert">
          {t('plannedItems.loadFailed')}
        </Text>
      ) : items.data.length === 0 ? (
        <Text tone="foregroundMuted">{t('plannedItems.empty')}</Text>
      ) : (
        <Rows>
          {items.data.map((item) => {
            const amount = isolate(format.money(money(item.amount, currencyByCode(item.currency))));
            const start = isolate(format.day(item.startOn));
            const when =
              item.kind === 'ONE_OFF'
                ? t('plannedItems.once', { amount, day: start })
                : item.endOn
                  ? t('plannedItems.monthlyUntil', {
                      amount,
                      start,
                      end: isolate(format.day(item.endOn)),
                    })
                  : t('plannedItems.monthly', { amount, start });
            return (
              <ListRow
                key={item.id}
                title={item.name}
                lines={[
                  [
                    t(`plannedItems.kind.${item.kind}`),
                    t(`projection.type.${item.type}`),
                    nameOf(item.categoryId),
                  ].join(' · '),
                  when,
                ]}
                actionLabel={
                  mayChange ? t('plannedItems.edit', { name: isolate(item.name) }) : undefined
                }
                onPress={mayChange ? () => router.push(`/projection/${item.id}`) : undefined}
              />
            );
          })}
        </Rows>
      )}
    </View>
  );
}

/**
 * The Projection of the current year in the mode chosen (the Workspace's at
 * first), its breakdown by Category, every assumption behind it and the
 * Planned Items. Owners and Admins set the Workspace's mode and the Trailing
 * Average's length, and enter Planned Items.
 */
export default function ProjectionScreen() {
  const { t } = useI18n();
  const format = useFormatters();
  const router = useRouter();
  const { workspace } = useSignedIn();
  const [mode, setMode] = useState<ProjectionMode>();
  const projection = useProjection(mode);
  const nameOf = useCategoryNames();
  const queryClient = useQueryClient();
  const data = projection.data;

  return (
    <>
      <ScreenHeader
        title={t('projection.title')}
        action={
          hasRole(workspace.role, 'ADMIN') && {
            label: t('plannedItems.new'),
            onPress: () => router.push('/projection/new'),
          }
        }
      />
      <ScrollScreen
        refreshing={projection.isRefetching}
        // The Planned Items and settings too.
        onRefresh={() =>
          void queryClient.invalidateQueries({ queryKey: projectionKey(workspace.id) })
        }
      >
        {projection.isPending ? (
          <Text tone="foregroundMuted">{t('session.loading')}</Text>
        ) : !data ? (
          <Text tone="danger" accessibilityRole="alert">
            {t('projection.loadFailed')}
          </Text>
        ) : (
          <>
            <Text size="sm" tone="foregroundMuted">
              {t('projection.intro', {
                year: format.count(data.year),
                yearEnd: isolate(format.day(data.yearEnd)),
                today: isolate(format.day(data.today)),
                base: format.currency(currencyByCode(data.baseCurrency)),
              })}
            </Text>
            <ModeSwitch mode={mode ?? data.mode} onChange={setMode} />
            {transactionTypes.map((type) => (
              <TypeTotals key={type} type={type} projection={data} />
            ))}
            {data.categories.length === 0 ? (
              <Text tone="foregroundMuted">{t('projection.empty')}</Text>
            ) : (
              transactionTypes.map((type) => (
                <CategoryBreakdown key={type} type={type} projection={data} nameOf={nameOf} />
              ))
            )}
            <Assumptions projection={data} nameOf={nameOf} />
            <PlannedItems nameOf={nameOf} />
          </>
        )}
      </ScrollScreen>
    </>
  );
}

const styles = StyleSheet.create({
  part: { gap: nativeTheme.space(2) },
});
