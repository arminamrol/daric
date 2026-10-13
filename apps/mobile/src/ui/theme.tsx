import type { ThemePreference } from '@daric/core';
import { nativeTheme } from '@daric/design-tokens';
import type { ThemeColors, ThemeName } from '@daric/design-tokens';
import { StatusBar } from 'expo-status-bar';
import { createContext, use, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useColorScheme } from 'react-native';

interface Theme {
  readonly name: ThemeName;
  readonly colors: ThemeColors;
}

const ThemeContext = createContext<Theme | null>(null);

/** Light or dark, as the User prefers; `system` follows the phone. */
export function ThemeProvider({
  preference = 'system',
  children,
}: {
  preference?: ThemePreference;
  children: ReactNode;
}) {
  const scheme = useColorScheme();
  const name: ThemeName =
    preference === 'system' ? (scheme === 'dark' ? 'dark' : 'light') : preference;
  const value = useMemo(() => ({ name, colors: nativeTheme.colors[name] }), [name]);
  return (
    <ThemeContext value={value}>
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      {children}
    </ThemeContext>
  );
}

export function useTheme(): Theme {
  const theme = use(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
}
