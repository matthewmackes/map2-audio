/**
 * T2512-METRICS-CHART — unit tests for the sparkline ring-buffer + polyline.
 */
import {
  SPARKLINE_CAPACITY,
  appendMetricsDelta,
  sparklinePoints,
  trailingSum,
  type MetricsHistory,
} from './looperMetricsSparkline'

describe('appendMetricsDelta', () => {
  test('records simple positive deltas', () => {
    const h: MetricsHistory = new Map()
    appendMetricsDelta(h, { record: 0 }, { record: 1 })
    appendMetricsDelta(h, { record: 1 }, { record: 3 })
    expect(h.get('record')).toEqual([1, 2])
  })

  test('clamps negative deltas (counter reset) to zero', () => {
    const h: MetricsHistory = new Map()
    appendMetricsDelta(h, { record: 5 }, { record: 0 })
    expect(h.get('record')).toEqual([0])
  })

  test('captures new verbs without a prior snapshot, capped at 1', () => {
    const h: MetricsHistory = new Map()
    // First sighting of a verb with cumulative=10 should not push a
    // big spike — we joined mid-session.
    appendMetricsDelta(h, {}, { record: 10 })
    expect(h.get('record')).toEqual([1])
    // Subsequent increments are normal.
    appendMetricsDelta(h, { record: 10 }, { record: 12 })
    expect(h.get('record')).toEqual([1, 2])
  })

  test('verbs that disappear push a 0', () => {
    const h: MetricsHistory = new Map()
    appendMetricsDelta(h, { record: 5 }, {})
    expect(h.get('record')).toEqual([0])
  })

  test('respects SPARKLINE_CAPACITY (ring-buffer eviction)', () => {
    const h: MetricsHistory = new Map()
    for (let i = 0; i < SPARKLINE_CAPACITY + 5; i++) {
      appendMetricsDelta(h, { record: i }, { record: i + 1 })
    }
    expect(h.get('record')!.length).toBe(SPARKLINE_CAPACITY)
    // Most-recent-last means the final sample is the most recent
    // delta (which is always 1 in this loop).
    expect(h.get('record')![SPARKLINE_CAPACITY - 1]).toBe(1)
  })
})

describe('sparklinePoints', () => {
  test('empty input → empty string', () => {
    expect(sparklinePoints([], 80, 18)).toBe('')
  })

  test('single sample renders as a single point at x=0', () => {
    const s = sparklinePoints([1], 80, 18)
    expect(s.split(' ')).toHaveLength(1)
    expect(s.startsWith('0.00,')).toBe(true)
  })

  test('returns N points for N samples', () => {
    const s = sparklinePoints([1, 2, 3, 4, 5], 80, 18)
    expect(s.split(' ')).toHaveLength(5)
  })

  test('max value maps near top (y close to 1)', () => {
    const s = sparklinePoints([0, 0, 0, 10], 80, 18)
    const parts = s.split(' ')
    const lastY = parseFloat(parts[parts.length - 1].split(',')[1])
    // Last point should be near the top (y small).
    expect(lastY).toBeLessThan(5)
  })

  test('all-zero series flattens to the baseline', () => {
    const s = sparklinePoints([0, 0, 0], 80, 18)
    const ys = s.split(' ').map((p) => parseFloat(p.split(',')[1]))
    // All Ys equal the baseline (height-1 = 17).
    for (const y of ys) {
      expect(y).toBeCloseTo(17)
    }
  })
})

describe('trailingSum', () => {
  test('sums all samples by default', () => {
    expect(trailingSum([1, 2, 3, 4])).toBe(10)
  })

  test('sums only the last N samples', () => {
    expect(trailingSum([1, 2, 3, 4], 2)).toBe(7) // 3 + 4
  })

  test('empty input → 0', () => {
    expect(trailingSum([])).toBe(0)
  })
})
