/**
 * Where a chart's marks go, worked out apart from drawing them. Values are
 * numbers only to place marks; every figure shown comes from the bigint.
 */

export interface PlotBox {
  width: number;
  height: number;
  /** Space kept clear on every side, so dots and strokes are not clipped. */
  inset: number;
  /** Time and groups run from the right. */
  rtl?: boolean;
}

export interface Tick {
  value: number;
  y: number;
}

/** Steps of 1, 2 or 5 times a power of ten, about `count` of them, covering `min`…`max`. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return min === 0 ? [0, 1] : [min - Math.abs(min), min, min + Math.abs(min)];
  const raw = (max - min) / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const step = power * (fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10);
  const ticks: number[] = [];
  for (let i = Math.floor(min / step); i <= Math.ceil(max / step); i++) ticks.push(i * step);
  return ticks;
}

/** A scale from the ticks' range to the box's height, the lowest tick at the bottom. */
function verticalScale(ticks: readonly number[], box: PlotBox) {
  const low = ticks[0] ?? 0;
  const high = ticks[ticks.length - 1] ?? 1;
  const bottom = box.height - box.inset;
  const span = bottom - box.inset;
  return (value: number) => bottom - ((value - low) / (high - low)) * span;
}

/** Flips an x across the box when it reads right to left. */
function mirror(box: PlotBox) {
  return (x: number) => (box.rtl ? box.width - x : x);
}

/** A line through `ys` at the times `xs`, with its points and the value ticks. */
export function linePlot(xs: readonly number[], ys: readonly number[], box: PlotBox) {
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const y = verticalScale(ticks, box);
  const flip = mirror(box);
  const first = Math.min(...xs);
  const last = Math.max(...xs);
  const span = box.width - 2 * box.inset;
  const x = (value: number) =>
    first === last ? box.width / 2 : box.inset + ((value - first) / (last - first)) * span;
  const points = xs.map((value, i) => ({ x: flip(x(value)), y: y(ys[i] ?? 0) }));
  return {
    points,
    path: points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' '),
    ticks: ticks.map((value) => ({ value, y: y(value) })),
  };
}

/** Of each band, this share holds the bars; the rest is space between groups. */
const BARS_SHARE = 0.6;

/**
 * Groups of bars (one per series) side by side, each group in its own band,
 * standing on zero; with the bands, to tell which group a touch is on.
 */
export function barPlot(groups: readonly (readonly number[])[], box: PlotBox & { gap?: number }) {
  const gap = box.gap ?? 2;
  const values = groups.flat();
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const y = verticalScale(ticks, box);
  const flip = mirror(box);
  const band = (box.width - 2 * box.inset) / Math.max(groups.length, 1);
  const zero = y(0);

  const bands = groups.map((_, group) => {
    const start = box.inset + group * band;
    const [a, b] = [flip(start), flip(start + band)];
    return { start: Math.min(a, b), end: Math.max(a, b) };
  });
  const bars = groups.flatMap((series, group) => {
    const count = series.length;
    const width = (band * BARS_SHARE - gap * (count - 1)) / count;
    const from = box.inset + group * band + (band * (1 - BARS_SHARE)) / 2;
    return series.map((value, index) => {
      const start = from + index * (width + gap);
      const top = Math.min(y(value), zero);
      return {
        group,
        series: index,
        x: box.rtl ? box.width - start - width : start,
        y: top,
        width,
        height: Math.abs(y(value) - zero),
      };
    });
  });
  return { bars, bands, ticks: ticks.map((value) => ({ value, y: y(value) })) };
}

/** The first, last, lowest and highest of `items` by `valueOf`, for a chart's summary. */
export function extremes<T>(items: readonly T[], valueOf: (item: T) => bigint) {
  const [first] = items;
  const last = items[items.length - 1];
  if (first === undefined || last === undefined) return undefined;
  let lowest: T = first;
  let highest: T = first;
  for (const item of items) {
    if (valueOf(item) < valueOf(lowest)) lowest = item;
    if (valueOf(item) > valueOf(highest)) highest = item;
  }
  return { first, last, lowest, highest };
}

/** Which of `positions` (each point's or band's x) lies nearest `x`; -1 when there are none. */
export function nearest(positions: readonly number[], x: number): number {
  let best = -1;
  positions.forEach((position, i) => {
    if (best === -1 || Math.abs(position - x) < Math.abs((positions[best] ?? 0) - x)) best = i;
  });
  return best;
}
