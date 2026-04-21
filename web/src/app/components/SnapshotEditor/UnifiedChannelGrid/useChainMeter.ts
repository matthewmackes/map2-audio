import { useMemo } from 'react'

import useVuMeters from '../../../hooks/useVuMeters'

export interface ChainMeterReading {
  /** Normalised left amplitude in [0, 1] (0 = silence, 1 = full-scale). */
  left: number
  /** Normalised right amplitude in [0, 1] — equals left when mono. */
  right: number
  /** True while the engine is delivering fresh meter frames. */
  isLive: boolean
  /** True when at least one channel is at/above the clip threshold (≈ -0.1 dBFS). */
  clipped: boolean
}

const CLIP_THRESHOLD_DB = -0.1
const FLOOR_DB = -60

export function dbToNormalised(db: number): number {
  if (!Number.isFinite(db)) return 0
  if (db <= FLOOR_DB) return 0
  if (db >= 0) return 1
  return (db - FLOOR_DB) / -FLOOR_DB
}

/**
 * Per-chain meter readout. Today all chains share the engine's master
 * output levels (backend has no per-chain meter endpoint yet — T710-sub24
 * follow-up); `chainId` is accepted so sub25 can wire one call per row and
 * we can upgrade to a real per-chain feed without changing callers.
 */
export function useChainMeter(chainId: string | null): ChainMeterReading {
  const { levels, peakHold, isRunning } = useVuMeters({ useWebSocket: true })

  return useMemo<ChainMeterReading>(() => {
    if (!chainId) {
      return { left: 0, right: 0, isLive: false, clipped: false }
    }

    const left = dbToNormalised(levels.outputLeft)
    const right = dbToNormalised(levels.outputRight)
    const peakLeft = peakHold.outputLeft
    const peakRight = peakHold.outputRight
    const clipped = peakLeft >= CLIP_THRESHOLD_DB || peakRight >= CLIP_THRESHOLD_DB

    return {
      left,
      right,
      isLive: isRunning,
      clipped,
    }
  }, [chainId, levels.outputLeft, levels.outputRight, peakHold.outputLeft, peakHold.outputRight, isRunning])
}
