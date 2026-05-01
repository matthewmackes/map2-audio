// Pure exponential-backoff helper for useMidiDeviceEvents WS reconnection.
//
// Sequence: 1s, 2s, 4s, 8s, 16s, 16s, 16s, ...
// (doubles up to a cap so a long-down backend doesn't burn cycles
// reconnecting every second). A small jitter (±15%) is folded in so a
// fleet of clients doesn't synchronize-storm the backend on a coordinated
// outage.

export interface BackoffOptions {
  /** Base delay for attempt 1, in ms. Default 1000. */
  baseMs?: number
  /** Cap on the doubled delay, in ms. Default 16_000. */
  capMs?: number
  /** Jitter as a fraction of the chosen delay (±). Default 0.15. */
  jitter?: number
  /** Optional RNG injection for tests. Default Math.random. */
  rng?: () => number
}

const DEFAULT_BASE_MS = 1000
const DEFAULT_CAP_MS = 16_000
const DEFAULT_JITTER = 0.15

/**
 * Returns the delay (in ms) for the given 1-indexed reconnect attempt.
 * Attempt 1 → ~baseMs, attempt 2 → ~2×baseMs, capped at capMs.
 *
 * The returned delay includes ±jitter * delay random spread so multiple
 * clients reconnecting after a server bounce don't all hit the WS at the
 * same instant.
 */
export function computeBackoffMs(attempt: number, options: BackoffOptions = {}): number {
  const baseMs = options.baseMs ?? DEFAULT_BASE_MS
  const capMs = options.capMs ?? DEFAULT_CAP_MS
  const jitter = options.jitter ?? DEFAULT_JITTER
  const rng = options.rng ?? Math.random
  if (attempt < 1) return 0
  const exponent = Math.min(attempt - 1, 30) // guard against Infinity at large attempt counts
  const raw = baseMs * Math.pow(2, exponent)
  const capped = Math.min(raw, capMs)
  const spread = capped * jitter
  // Centered jitter: rng() in [0, 1) → offset in [-spread, +spread).
  const offset = (rng() * 2 - 1) * spread
  return Math.max(0, Math.round(capped + offset))
}
