// Arithmetic Jalali calendar after Borkowski, as used by jalaali-js: leap years
// follow the 33-year cycle corrected by known break years, which matches the
// official Iranian calendar for Jalali years 1178–1633.

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394,
  2456, 3178,
] as const;

/** Earliest and latest supported Jalali years. */
export const JALALI_MIN_YEAR = BREAKS[0];
export const JALALI_MAX_YEAR = (BREAKS[BREAKS.length - 1] as number) - 1;

function div(a: number, b: number): number {
  return Math.trunc(a / b);
}

function mod(a: number, b: number): number {
  return a - Math.trunc(a / b) * b;
}

interface JalaliYearInfo {
  /** 0 when the year is leap, otherwise years since the last leap year. */
  readonly leap: number;
  /** The Gregorian year in which this Jalali year begins. */
  readonly gy: number;
  /** The day of March on which Farvardin 1 falls. */
  readonly march: number;
}

function jalaliYearInfo(jy: number): JalaliYearInfo {
  if (!Number.isInteger(jy) || jy < JALALI_MIN_YEAR || jy > JALALI_MAX_YEAR) {
    throw new RangeError(`Unsupported Jalali year ${jy}`);
  }
  const gy = jy + 621;
  let leapJ = -14;
  let jp: number = BREAKS[0];
  let jump = 0;
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i] as number;
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

export function isJalaliLeapYear(jy: number): boolean {
  return jalaliYearInfo(jy).leap === 0;
}

/** Julian Day Number of a Gregorian date. */
export function gregorianToJdn(gy: number, gm: number, gd: number): number {
  const d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
}

/** Gregorian year, month and day of a Julian Day Number. */
export function jdnToGregorian(jdn: number): [number, number, number] {
  let j = 4 * jdn + 139361631;
  j += div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  return [div(j, 1461) - 100100 + div(8 - gm, 6), gm, gd];
}

/** Julian Day Number of a Jalali date (assumed valid). */
export function jalaliToJdn(jy: number, jm: number, jd: number): number {
  const { gy, march } = jalaliYearInfo(jy);
  return gregorianToJdn(gy, 3, march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

/** Jalali year, month and day of a Julian Day Number. */
export function jdnToJalali(jdn: number): [number, number, number] {
  const [gy] = jdnToGregorian(jdn);
  let jy = gy - 621;
  const info = jalaliYearInfo(jy);
  let k = jdn - gregorianToJdn(gy, 3, info.march);
  if (k >= 0) {
    if (k <= 185) return [jy, 1 + div(k, 31), mod(k, 31) + 1];
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (info.leap === 1) k += 1;
  }
  return [jy, 7 + div(k, 30), mod(k, 30) + 1];
}

/** Julian Day Number of 1970-01-01, the Unix epoch. */
export const EPOCH_JDN = 2440588;
