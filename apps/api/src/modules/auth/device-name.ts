import { deviceNameSchema } from '@daric/core';

/** First match wins: browsers built on Chrome say "Chrome" and "Safari" too. */
const BROWSERS: [RegExp, string][] = [
  [/\bEdg(e|A|iOS)?\//, 'Edge'],
  [/\b(OPR|Opera)\//, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\b(Firefox|FxiOS)\//, 'Firefox'],
  [/\b(Chrome|CriOS|Chromium)\//, 'Chrome'],
  [/\bVersion\/[\d.]+.*\bSafari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/\biPad\b/, 'iPadOS'],
  [/\b(iPhone|iPod)\b/, 'iOS'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bWindows\b/, 'Windows'],
  [/\bMac OS X\b/, 'macOS'],
  [/\bLinux\b/, 'Linux'],
];

const first = (patterns: [RegExp, string][], text: string) =>
  patterns.find(([pattern]) => pattern.test(text))?.[1];

/**
 * A readable name for a Signed-in Device: the one a native app gives (its
 * phone model), else browser and OS from the user agent ("Chrome · Windows"),
 * else null. Brand names only, so it reads the same in every language.
 */
export function deviceName({
  given,
  userAgent,
}: {
  given?: string | undefined;
  userAgent: string | null;
}): string | null {
  const parsed = deviceNameSchema.safeParse(given);
  if (parsed.success) return parsed.data;
  if (!userAgent) return null;
  const parts = [first(BROWSERS, userAgent), first(SYSTEMS, userAgent)].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}
