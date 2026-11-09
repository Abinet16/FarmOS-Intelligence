/** Small, dependency-free helpers for chart axes. */

/**
 * A "nice" step (1, 2 or 5 × 10^n) giving about `count` intervals. Rounds to
 * the nearest nice step on a log scale (the thresholds d3 uses), so 0–93
 * gets steps of 20 rather than 50.
 */
export function niceStep(span: number, count: number): number {
  if (span <= 0) return 1;
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const nice =
    normalized >= Math.sqrt(50)
      ? 10
      : normalized >= Math.sqrt(10)
        ? 5
        : normalized >= Math.sqrt(2)
          ? 2
          : 1;
  return nice * magnitude;
}

/** Tick values covering [min, max], expanded outward to whole steps. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min) * 0.1;
    return niceTicks(min - pad, max + pad, count);
  }
  const step = niceStep(max - min, count);
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= max + step * 0.5; value += step) {
    ticks.push(Number(value.toPrecision(12)));
  }
  if (ticks[ticks.length - 1]! < max) ticks.push(ticks[ticks.length - 1]! + step);
  return ticks;
}

/** Splits a series into runs of consecutive non-null values (gaps stay gaps). */
export function segments<T>(points: readonly T[], value: (point: T) => number | null) {
  const runs: { index: number; value: number }[][] = [];
  let current: { index: number; value: number }[] = [];
  points.forEach((point, index) => {
    const v = value(point);
    if (v === null) {
      if (current.length) runs.push(current);
      current = [];
    } else {
      current.push({ index, value: v });
    }
  });
  if (current.length) runs.push(current);
  return runs;
}
