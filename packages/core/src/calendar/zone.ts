import { toEpochDay } from './calendar';

const DAY_MS = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Throws a RangeError for a timezone the runtime does not know. */
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Milliseconds since the Unix epoch of `instant`; throws for an invalid Date. */
export function instantMs(instant: Date): number {
  const t = instant.getTime();
  if (Number.isNaN(t)) throw new RangeError('Invalid instant');
  return t;
}

/** The wall-clock time in `timeZone` at `t`, as milliseconds of a UTC timeline, to the second. */
function wallClock(t: number, timeZone: string): number {
  const fields: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(t)) {
    if (part.type !== 'literal') fields[part.type] = Number(part.value);
  }
  const epochDay = toEpochDay('gregorian', {
    year: fields['year'] as number,
    month: fields['month'] as number,
    day: fields['day'] as number,
  });
  const seconds =
    (fields['hour'] as number) * 3600 +
    (fields['minute'] as number) * 60 +
    (fields['second'] as number);
  return epochDay * DAY_MS + seconds * 1000;
}

/** How far `timeZone` is ahead of UTC at `t`, in milliseconds. */
function offsetAt(t: number, timeZone: string): number {
  return wallClock(t, timeZone) - Math.floor(t / 1000) * 1000;
}

/** The day (days since 1970-01-01 on the local Gregorian calendar) that `t` falls on in `timeZone`. */
export function localEpochDay(t: number, timeZone: string): number {
  return Math.floor(wallClock(t, timeZone) / DAY_MS);
}

/**
 * The first instant of local day `epochDay` in `timeZone`: its midnight, the
 * earlier one if midnight repeats, or the moment clocks jump past a skipped midnight.
 * Assumes at most one offset change within a day of midnight.
 */
export function startOfLocalDay(epochDay: number, timeZone: string): number {
  const wall = epochDay * DAY_MS;
  const before = wall - offsetAt(wall - DAY_MS, timeZone);
  const after = wall - offsetAt(wall + DAY_MS, timeZone);
  const midnights = [before, after]
    .filter((t) => wallClock(t, timeZone) === wall)
    .sort((a, b) => a - b);
  if (midnights[0] !== undefined) return midnights[0];

  // Midnight was skipped: find the first instant already on `epochDay`.
  let lo = Math.min(before, after);
  let hi = Math.max(before, after);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (localEpochDay(mid, timeZone) >= epochDay) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
