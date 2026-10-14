import { Redirect, Stack, useRouter } from 'expo-router';
import { useLogout, useMe } from '../../auth/session';
import { useI18n } from '../../i18n/locale';
import { FONT } from '../../ui/fonts';
import { HeaderButton } from '../../ui/HeaderButton';
import { Status } from '../../ui/Screen';
import { ThemeProvider, useTheme } from '../../ui/theme';

function LogoutButton() {
  const { t } = useI18n();
  const logout = useLogout();
  return (
    <HeaderButton
      label={t('nav.logout')}
      disabled={logout.isPending}
      onPress={() => logout.mutate()}
    />
  );
}

function MoreButton() {
  const { t } = useI18n();
  const router = useRouter();
  return <HeaderButton label={t('nav.more')} onPress={() => router.push('/more')} />;
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
        options={{
          title: t('transactions.title'),
          headerLeft: () => <MoreButton />,
          headerRight: () => <LogoutButton />,
        }}
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
