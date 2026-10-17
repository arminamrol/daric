/** The slice of React Native's `Platform` a phone's name is read from. */
export interface PlatformInfo {
  OS: string;
  /** Android has Manufacturer and Model, iOS interfaceIdiom; each platform's type names only its own. */
  constants: object;
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : undefined);

/**
 * What this phone is called in the User's list of Signed-in Devices: maker and
 * model on Android, iPhone or iPad on iOS (which tells no model without a
 * native module). Undefined when it cannot tell; the API then reads the user agent.
 */
export function phoneName({ OS, constants }: PlatformInfo): string | undefined {
  const known = constants as Record<string, unknown>;
  if (OS === 'ios') return known['interfaceIdiom'] === 'pad' ? 'iPad' : 'iPhone';
  if (OS !== 'android') return undefined;
  const model = text(known['Model']);
  if (!model) return undefined;
  const maker = text(known['Manufacturer']);
  if (!maker || model.toLowerCase().startsWith(maker.toLowerCase())) return model;
  return `${maker.charAt(0).toUpperCase()}${maker.slice(1)} ${model}`;
}
