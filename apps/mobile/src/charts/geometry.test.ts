import { describe, expect, it } from 'vitest';
import { barPlot, extremes, linePlot, nearest, niceTicks } from './geometry';

const box = { width: 200, height: 100, inset: 10 };

describe('niceTicks', () => {
  it('steps by 1, 2 or 5 times a power of ten, covering the values', () => {
    expect(niceTicks(0, 95)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(1_200, 4_700)).toEqual([1_000, 2_000, 3_000, 4_000, 5_000]);
    expect(niceTicks(-30, 40)).toEqual([-40, -20, 0, 20, 40]);
  });

  it('spreads a single value so it sits on a scale', () => {
    expect(niceTicks(500, 500)).toEqual([0, 500, 1_000]);
    expect(niceTicks(0, 0)).toEqual([0, 1]);
  });
});

describe('linePlot', () => {
  it('places points by time across the width and by value up the height', () => {
    const plot = linePlot([0, 10, 30], [0, 50, 100], box);
    expect(plot.points).toEqual([
      { x: 10, y: 90 },
      { x: 70, y: 50 },
      { x: 190, y: 10 },
    ]);
    expect(plot.path).toBe('M10 90 L70 50 L190 10');
    expect(plot.ticks.map((t) => t.value)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(plot.ticks[0]).toEqual({ value: 0, y: 90 });
  });

  it('runs from the right when the app reads right to left', () => {
    const plot = linePlot([0, 30], [0, 100], { ...box, rtl: true });
    expect(plot.points).toEqual([
      { x: 190, y: 90 },
      { x: 10, y: 10 },
    ]);
  });

  it('puts a lone point in the middle', () => {
    expect(linePlot([5], [500], box).points).toEqual([{ x: 100, y: 50 }]);
  });
});

describe('barPlot', () => {
  it('stands each group of bars side by side in its own band, from zero', () => {
    const plot = barPlot(
      [
        [100, 50],
        [0, 80],
      ],
      { ...box, gap: 0 },
    );
    expect(plot.ticks.map((t) => t.value)).toEqual([0, 20, 40, 60, 80, 100]);
    // Two bands of 90 across 180; each bar half of the band's 60% middle.
    expect(plot.bands).toEqual([
      { start: 10, end: 100 },
      { start: 100, end: 190 },
    ]);
    expect(plot.bars[0]).toEqual({ group: 0, series: 0, x: 28, y: 10, width: 27, height: 80 });
    expect(plot.bars[1]).toEqual({ group: 0, series: 1, x: 55, y: 50, width: 27, height: 40 });
    expect(plot.bars[2]).toMatchObject({ group: 1, series: 0, height: 0, y: 90 });
  });

  it('puts the first group at the right when the app reads right to left', () => {
    const plot = barPlot([[1], [2]], { ...box, rtl: true });
    expect(plot.bands[0]).toEqual({ start: 100, end: 190 });
  });
});

describe('extremes', () => {
  it('finds the first, last, lowest and highest', () => {
    const items = [
      { day: 'a', v: 5n },
      { day: 'b', v: -2n },
      { day: 'c', v: 9n },
      { day: 'd', v: 3n },
    ];
    const found = extremes(items, (i) => i.v);
    expect(found).toEqual({
      first: items[0],
      last: items[3],
      lowest: items[1],
      highest: items[2],
    });
  });

  it('has nothing to say of nothing', () => {
    expect(extremes([], (i: { v: bigint }) => i.v)).toBeUndefined();
  });
});

describe('nearest', () => {
  it('picks the position closest to a touch, the first of a tie', () => {
    expect(nearest([10, 70, 190], 95)).toBe(1);
    expect(nearest([10, 70, 190], 400)).toBe(2);
    expect(nearest([10, 30], 20)).toBe(0);
    expect(nearest([], 20)).toBe(-1);
  });
});
