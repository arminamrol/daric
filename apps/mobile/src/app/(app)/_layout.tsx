import { Redirect, Stack } from 'expo-router';
import { Pressable } from 'react-native';
import { useLogout, useMe } from '../../auth/session';
import { useI18n } from '../../i18n/locale';
import { FONT } from '../../ui/fonts';
import { Status } from '../../ui/Screen';
import { Text } from '../../ui/Text';
import { ThemeProvider, useTheme } from '../../ui/theme';

function LogoutButton() {
  const { t } = useI18n();
  const logout = useLogout();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('nav.logout')}
      disabled={logout.isPending}
      onPress={() => logout.mutate()}
      hitSlop={12}
    >
      <Text>{t('nav.logout')}</Text>
    </Pressable>
  );
}

function SignedInStack() {
  const { t } = useI18n();
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.foreground,
        headerTitleStyle: { fontFamily: FONT.bold },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: t('transactions.title'), headerRight: () => <LogoutButton /> }}
      />
      <Stack.Screen
        name="new"
        options={{ title: t('transactions.form.title'), presentation: 'modal' }}
      />
    </Stack>
  );
}

/** Screens for a signed-in User; everyone else goes to login. */
export default function SignedInLayout() {
  const { t } = useI18n();
  const me = useMe();
  if (me.isPending) return <Status message={t('session.loading')} />;
  // Who was signed in last time is enough offline: a failed refetch keeps it.
  if (me.isError && me.data === undefined) return <Status alert message={t('session.error')} />;
  if (!me.data) return <Redirect href="/login" />;
  return (
    <ThemeProvider preference={me.data.preferences.theme}>
      <SignedInStack />
    </ThemeProvider>
  );
}
