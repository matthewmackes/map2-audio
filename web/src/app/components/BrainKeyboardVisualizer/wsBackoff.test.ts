// Follow-up A: tests for the WS reconnection backoff helper.

import { computeBackoffMs } from './wsBackoff'

describe('computeBackoffMs', () => {
  // Pin RNG to 0.5 so the centered jitter offset is exactly 0 and the
  // returned delay equals the un-jittered exponential value.
  const noJitter = { rng: () => 0.5 }

  it('returns 0 for attempt < 1 (defensive)', () => {
    expect(computeBackoffMs(0, noJitter)).toBe(0)
    expect(computeBackoffMs(-5, noJitter)).toBe(0)
  })

  it('produces 1s, 2s, 4s, 8s, 16s for attempts 1..5 with default base/cap', () => {
    expect(computeBackoffMs(1, noJitter)).toBe(1000)
    expect(computeBackoffMs(2, noJitter)).toBe(2000)
    expect(computeBackoffMs(3, noJitter)).toBe(4000)
    expect(computeBackoffMs(4, noJitter)).toBe(8000)
    expect(computeBackoffMs(5, noJitter)).toBe(16000)
  })

  it('caps at 16s for high attempt counts', () => {
    expect(computeBackoffMs(6, noJitter)).toBe(16000)
    expect(computeBackoffMs(20, noJitter)).toBe(16000)
    expect(computeBackoffMs(1000, noJitter)).toBe(16000)
  })

  it('honors a custom base + cap', () => {
    const opts = { baseMs: 100, capMs: 2000, rng: () => 0.5 }
    expect(computeBackoffMs(1, opts)).toBe(100)
    expect(computeBackoffMs(2, opts)).toBe(200)
    expect(computeBackoffMs(3, opts)).toBe(400)
    expect(computeBackoffMs(5, opts)).toBe(1600)
    expect(computeBackoffMs(6, opts)).toBe(2000) // capped
    expect(computeBackoffMs(10, opts)).toBe(2000) // still capped
  })

  it('rng() = 0 produces the smallest jittered value', () => {
    // jitter = 0.15, attempt 1 default base = 1000 → spread = 150
    // rng() = 0 → offset = (0*2 - 1) * 150 = -150 → 1000 - 150 = 850
    expect(computeBackoffMs(1, { rng: () => 0 })).toBe(850)
  })

  it('rng() = 0.999... approaches the largest jittered value', () => {
    // attempt 1, default → spread = 150 → near +150 → ~1150
    const result = computeBackoffMs(1, { rng: () => 0.999 })
    expect(result).toBeGreaterThanOrEqual(1148)
    expect(result).toBeLessThanOrEqual(1150)
  })

  it('clamps negative results to 0 (degenerate jitter setting)', () => {
    // jitter > 1 could push the delay negative; helper must floor at 0.
    const result = computeBackoffMs(1, { jitter: 2, rng: () => 0 })
    expect(result).toBe(0)
  })

  it('jitter spread is bounded across many random samples', () => {
    // attempt 4, default cap allows 8000, jitter 0.15 → spread 1200.
    // Any random RNG must produce a value in [6800, 9200].
    let prev = -1
    for (let i = 0; i < 50; i += 1) {
      const result = computeBackoffMs(4)
      expect(result).toBeGreaterThanOrEqual(6800)
      expect(result).toBeLessThanOrEqual(9200)
      prev = result
    }
    expect(prev).toBeGreaterThan(0)
  })

  it('handles huge attempt counts without overflow', () => {
    // attempt 1e6 — should still be capped, not Infinity / NaN.
    const result = computeBackoffMs(1_000_000, noJitter)
    expect(Number.isFinite(result)).toBe(true)
    expect(result).toBe(16000)
  })
})
