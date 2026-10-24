import { ApiError } from '@daric/api-client';
import { nativeTheme } from '@daric/design-tokens';
import type { PlainMessageKey } from '@daric/i18n';
import { Redirect, router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Switch, View } from 'react-native';
import type { TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLogin, useMe } from '../auth/session';
import { LanguageChoices } from '../i18n/LanguageChoices';
import { useI18n } from '../i18n/locale';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Logo } from '../ui/Logo';
import { Screen, Status } from '../ui/Screen';
import { Text } from '../ui/Text';
import { useTheme } from '../ui/theme';

function errorOf(error: unknown): PlainMessageKey {
  if (error instanceof ApiError && error.status === 401) return 'auth.error.wrongCredentials';
  if (error instanceof ApiError && error.status === 429) return 'auth.error.tooManyAttempts';
  return 'auth.error.unexpected';
}

/** Login, with "Keep data on this device?" asked each time and yes by default on a phone (ADR-0005). */
export default function LoginScreen() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const me = useMe();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keep, setKeep] = useState(true);
  const [missing, setMissing] = useState<{ email?: PlainMessageKey; password?: PlainMessageKey }>(
    {},
  );
  const passwordRef = useRef<TextInput>(null);

  if (me.isPending) return <Status message={t('session.loading')} />;
  if (me.data) return <Redirect href="/" />;

  function submit() {
    const found = {
      ...(!email.trim() && { email: 'auth.error.emailRequired' as const }),
      ...(!password && { password: 'auth.error.passwordRequired' as const }),
    };
    setMissing(found);
    if (found.email || found.password) return;
    login.mutate({ email: email.trim(), password, keep }, { onSuccess: () => router.replace('/') });
  }

  return (
    <Screen>
      <SafeAreaView style={styles.fill}>
        <KeyboardAvoidingView behavior="padding" style={styles.fill}>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Logo size={56} />
            <Text size="2xl" bold accessibilityRole="header">
              {t('auth.login.title')}
            </Text>
            <Field
              label={t('auth.email')}
              value={email}
              onChangeText={setEmail}
              error={missing.email && t(missing.email)}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <Field
              ref={passwordRef}
              label={t('auth.password')}
              value={password}
              onChangeText={setPassword}
              error={missing.password && t(missing.password)}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={submit}
            />
            <View style={styles.keep}>
              <Text style={styles.fill} importantForAccessibility="no">
                {t('auth.keepData')}
              </Text>
              <Switch
                accessibilityLabel={t('auth.keepData')}
                value={keep}
                onValueChange={setKeep}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>
            {login.isError && (
              <Text tone="danger" accessibilityRole="alert" accessibilityLiveRegion="assertive">
                {t(errorOf(login.error))}
              </Text>
            )}
            <Button
              primary
              label={t('auth.login.submit')}
              onPress={submit}
              disabled={login.isPending}
            />
            <LanguageChoices />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  form: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: nativeTheme.space(4),
    padding: nativeTheme.space(6),
  },
  keep: { flexDirection: 'row', alignItems: 'center', gap: nativeTheme.space(3) },
});
