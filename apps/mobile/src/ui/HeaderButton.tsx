import { Stack } from 'expo-router';
import { Pressable } from 'react-native';
import { Text } from './Text';

/** A text button in the screen header, e.g. "New" or "Log out". */
export function HeaderButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={12}
    >
      <Text>{label}</Text>
    </Pressable>
  );
}

/** Sets the screen's title, and a header button for its main action if there is one. */
export function ScreenHeader({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onPress: () => void } | false | undefined;
}) {
  return (
    <Stack.Screen
      options={{
        title,
        ...(action && { headerRight: () => <HeaderButton {...action} /> }),
      }}
    />
  );
}
