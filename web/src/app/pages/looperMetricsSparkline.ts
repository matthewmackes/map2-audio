/**
 * T2512-METRICS-CHART — sparkline math + ring-buffer helpers for the
 * per-verb counters on LooperPage.
 *
 * The looper backend exposes `metrics` as a flat dict of *cumulative*
 * verb counts. To render a sparkline we need *per-sample deltas*, so
 * the UI ring-buffers the deltas since the previous update.
 *
 * This module is intentionally framework-free: a pure delta-tracker
 * + a polyline-path generator. The React panel wraps it in a
 * useRef-backed accumulator so the history survives renders.
 */

export const SPARKLINE_CAPACITY = 60

/**
 * Mutable per-verb history. Maps verb name → ring buffer of deltas
 * (most-recent-last). A verb that never appeared gets no entry.
 */
export type MetricsHistory = Map<string, number[]>

/**
 * Append the deltas between two cumulative-counter snapshots to a
 * history map, evicting old samples past SPARKLINE_CAPACITY.
 *
 * Rules:
 * - A verb missing from ``next`` is treated as 0 in next (verb went
 *   away — push a 0).
 * - A verb missing from ``prev`` is treated as 0 (first appearance
 *   — its delta equals the full current value, which usually means
 *   "we joined late and just saw the cumulative total"; clamp to 1
 *   so the sparkline reads "one event in this slot" rather than a
 *   huge artificial spike).
 * - A negative delta (counter was reset) clamps to 0 so the
 *   sparkline doesn't render a spurious dip.
 *
 * Returns the updated history map (same instance) for chaining.
 */
export function appendMetricsDelta(
  history: MetricsHistory,
  prev: Record<string, number>,
  next: Record<string, number>,
): MetricsHistory {
  // Union of keys so we capture verbs that disappeared between
  // samples (their delta is 0).
  const keys = new Set<string>([
    ...Object.keys(prev),
    ...Object.keys(next),
  ])
  for (const verb of keys) {
    const before = prev[verb] ?? 0
    const after = next[verb] ?? 0
    let delta = after - before
    if (delta < 0) delta = 0
    // First-appearance clamp: prev had no entry AND after > 1.
    // Pushing a huge delta on first sight gives the operator a
    // misleading "burst" spike. Cap at 1.
    if (!(verb in prev) && after > 1) delta = 1
    const buf = history.get(verb) ?? []
    buf.push(delta)
    while (buf.length > SPARKLINE_CAPACITY) buf.shift()
    history.set(verb, buf)
  }
  return history
}

/**
 * Build an SVG polyline ``points`` string for a value array.
 *
 * Output coordinates fit the viewBox (0,0) → (width, height) with a
 * 1-unit vertical padding so the line never touches the top/bottom
 * edge of the chart. A flat-zero series renders as a baseline line.
 */
export function sparklinePoints(
  values: readonly number[],
  width: number,
  height: number,
): string {
  if (values.length === 0) return ''
  const max = Math.max(1, ...values)
  const stepX = values.length === 1 ? 0 : width / (values.length - 1)
  const usableH = Math.max(1, height - 2)
  const baseY = height - 1
  const pts: string[] = []
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    const normalized = Math.max(0, v) / max
    const x = i * stepX
    const y = baseY - normalized * usableH
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  }
  return pts.join(' ')
}

/**
 * Sum of the last `n` samples — used by the panel header to surface
 * a "verbs in the last N seconds" headline.
 */
export function trailingSum(
  values: readonly number[],
  n = SPARKLINE_CAPACITY,
): number {
  let sum = 0
  const start = Math.max(0, values.length - n)
  for (let i = start; i < values.length; i++) sum += values[i]
  return sum
}
