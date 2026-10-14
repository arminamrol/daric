import { currencyByCode } from '@daric/core';
import type { ExchangeRate, IsoDay } from '@daric/core';
import { nativeTheme } from '@daric/design-tokens';
import { isolate } from '@daric/i18n';
import { TriangleAlert } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { useSignedIn } from '../auth/session';
import { useFormatters } from '../display/formatters';
import { useI18n } from '../i18n/locale';
import { Text } from './Text';
import { useTheme } from './theme';

/**
 * Beneath a total in the Base Currency: the rate each currency was converted
 * at, and a warning for each currency left out for want of a rate on `day`.
 * Rates are entered on the web.
 */
export function RateNotes({
  ratesUsed,
  missing,
  day,
}: {
  ratesUsed: readonly ExchangeRate[];
  missing: readonly string[];
  day: IsoDay;
}) {
  const { t } = useI18n();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const base = currencyByCode(workspace.baseCurrency);
  if (ratesUsed.length === 0 && missing.length === 0) return null;

  return (
    <View style={styles.notes}>
      {ratesUsed.map((rate) => {
        const currency = currencyByCode(rate.currency);
        const equation = t('rates.equation', {
          one: format.count(1),
          currency: format.currency(currency),
          rate: format.rate(rate.rate, currency, base),
          base: format.currency(base),
        });
        return (
          <Text key={rate.currency} size="sm" tone="foregroundMuted">
            {t('totals.rateUsed', {
              equation: isolate(equation),
              day: isolate(format.day(rate.effectiveOn)),
            })}
          </Text>
        );
      })}
      {missing.map((code) => (
        <Warning key={code}>
          {t('totals.missingRate', {
            currency: format.currency(currencyByCode(code)),
            day: isolate(format.day(day)),
          })}
        </Warning>
      ))}
    </View>
  );
}

/** A line to take note of, with an icon so color is not the only sign. */
export function Warning({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.warning}>
      <TriangleAlert color={colors.accent} size={16} strokeWidth={2} />
      <Text size="sm" style={[styles.grow, { color: colors.accent }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notes: { gap: nativeTheme.space(1) },
  warning: { flexDirection: 'row', alignItems: 'center', gap: nativeTheme.space(2) },
  grow: { flex: 1 },
});
