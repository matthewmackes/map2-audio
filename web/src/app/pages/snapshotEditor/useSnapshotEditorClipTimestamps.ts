// Snapshot editor "flow clip timestamps" lifecycle hook
// (T2473 JSX partition — clip-timestamp lifecycle extraction).
//
// Lifts the per-flow input/output/global clip detection + expiration
// pipeline off the monolith. Owns:
//   1. flowClipPeakEntries — derived from pluginPeaks (one entry per
//      port across every plugin in the live tree).
//   2. Three "ingest" useEffects — pull clip state from the chain +
//      peak entries and write into the three timestamp stores
//      (global / input / output) on every chains+peaks tick.
//   3. Three "expiration" useEffects — schedule timeouts that drop
//      stale entries after FLOW_CARD_CLIP_HOLD_MS so the LED indicator
//      blinks off when clipping resolves.
//
// Behavioral parity preserved verbatim — same memo deps, same setter
// shape (functional updater that returns same ref when nothing
// changed), same expiration math (max(50ms, min(remaining))), same
// hold duration constant.

import { useEffect, useMemo } from 'react'

import {
  FLOW_CARD_CLIP_HOLD_MS,
  resolveFlowClipTimestamp,
  resolveFlowEdgeClipTimestamp,
} from '../../components/SnapshotEditor/snapshotEditorFlowCard'
import { buildEffectiveLiveSnapshotChains } from '../../components/SnapshotEditor/snapshotEditorLiveSnapshotHydration'
import type { ChainsResponse } from '../../../map2/types'
import type { FlowSlot } from './snapshotEditorPageTypes'

interface FlowClipPeakEntry {
  uri: string
  pluginPosition: number | null
  isClipping: boolean
  portSymbol: string | null
}

type ClipTimestampSetter = (
  updater: (previous: Record<string, number>) => Record<string, number>,
) => void

export interface UseSnapshotEditorClipTimestampsArgs {
  pluginPeaks: Record<string, Record<string, {
    uri: string
    plugin_position?: number | null
    is_clipping?: boolean
    port_symbol?: string | null
  }>> | null | undefined
  flowSlots: FlowSlot[]
  chainsQueryData: ChainsResponse | undefined
  controlPlaneSnapshot: Parameters<typeof buildEffectiveLiveSnapshotChains>[0] | null | undefined
  flowClipTimestamps: Record<string, number>
  flowInputClipTimestamps: Record<string, number>
  flowOutputClipTimestamps: Record<string, number>
  setFlowClipTimestamps: ClipTimestampSetter
  setFlowInputClipTimestamps: ClipTimestampSetter
  setFlowOutputClipTimestamps: ClipTimestampSetter
}

export function useSnapshotEditorClipTimestamps({
  pluginPeaks,
  flowSlots,
  chainsQueryData,
  controlPlaneSnapshot,
  flowClipTimestamps,
  flowInputClipTimestamps,
  flowOutputClipTimestamps,
  setFlowClipTimestamps,
  setFlowInputClipTimestamps,
  setFlowOutputClipTimestamps,
}: UseSnapshotEditorClipTimestampsArgs): { flowClipPeakEntries: FlowClipPeakEntry[] } {
  const flowClipPeakEntries = useMemo(
    () =>
      Object.values(pluginPeaks ?? {})
        .flatMap((ports) => Object.values(ports))
        .map((peak) => ({
          uri: peak.uri,
          pluginPosition: peak.plugin_position ?? null,
          isClipping: Boolean(peak.is_clipping),
          portSymbol: peak.port_symbol ?? null,
        })),
    [pluginPeaks],
  )

  // Ingest 1: global clip timestamps.
  useEffect(() => {
    const now = Date.now()
    const clipSourceChains = controlPlaneSnapshot
      ? buildEffectiveLiveSnapshotChains(controlPlaneSnapshot, chainsQueryData).chains
      : (chainsQueryData?.chains ?? [])
    const clipSourceChainById = new Map(
      clipSourceChains.map((chain) => [chain.id, chain] as const),
    )

    setFlowClipTimestamps((previous) => {
      const next: Record<string, number> = {}

      flowSlots.forEach((flow) => {
        const chain = flow.chainId != null ? clipSourceChainById.get(flow.chainId) : undefined
        const nextTimestamp = resolveFlowClipTimestamp(
          chain?.plugins ?? [],
          flowClipPeakEntries,
          previous[flow.id],
          now,
          FLOW_CARD_CLIP_HOLD_MS,
        )
        if (typeof nextTimestamp === 'number') {
          next[flow.id] = nextTimestamp
        }
      })

      const previousKeys = Object.keys(previous)
      const nextKeys = Object.keys(next)
      const changed = previousKeys.length !== nextKeys.length
        || nextKeys.some((key) => previous[key] !== next[key])

      return changed ? next : previous
    })
  }, [chainsQueryData, controlPlaneSnapshot, flowClipPeakEntries, flowSlots, setFlowClipTimestamps])

  // Ingest 2: per-edge (input/output) clip timestamps.
  useEffect(() => {
    const now = Date.now()
    const clipSourceChains = controlPlaneSnapshot
      ? buildEffectiveLiveSnapshotChains(controlPlaneSnapshot, chainsQueryData).chains
      : (chainsQueryData?.chains ?? [])
    const clipSourceChainById = new Map(
      clipSourceChains.map((chain) => [chain.id, chain] as const),
    )

    const updateEdgeClipTimestamps = (
      previous: Record<string, number>,
      edge: 'input' | 'output',
    ): Record<string, number> => {
      const next: Record<string, number> = {}

      flowSlots.forEach((flow) => {
        const chain = flow.chainId != null ? clipSourceChainById.get(flow.chainId) : undefined
        const nextTimestamp = resolveFlowEdgeClipTimestamp(
          chain?.plugins ?? [],
          flowClipPeakEntries,
          edge,
          previous[flow.id],
          now,
          FLOW_CARD_CLIP_HOLD_MS,
        )
        if (typeof nextTimestamp === 'number') {
          next[flow.id] = nextTimestamp
        }
      })

      const previousKeys = Object.keys(previous)
      const nextKeys = Object.keys(next)
      const changed = previousKeys.length !== nextKeys.length
        || nextKeys.some((key) => previous[key] !== next[key])

      return changed ? next : previous
    }

    setFlowInputClipTimestamps((previous) => updateEdgeClipTimestamps(previous, 'input'))
    setFlowOutputClipTimestamps((previous) => updateEdgeClipTimestamps(previous, 'output'))
  }, [
    chainsQueryData,
    controlPlaneSnapshot,
    flowClipPeakEntries,
    flowSlots,
    setFlowInputClipTimestamps,
    setFlowOutputClipTimestamps,
  ])

  // Expiration 1: global clip timestamps.
  useEffect(() => {
    const expiryDelays = Object.values(flowClipTimestamps)
      .map((timestamp) => (timestamp + FLOW_CARD_CLIP_HOLD_MS) - Date.now())
      .filter((delay) => delay > 0)

    if (expiryDelays.length === 0) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      const now = Date.now()
      setFlowClipTimestamps((previous) => {
        const next = Object.fromEntries(
          Object.entries(previous).filter(
            ([, timestamp]) => now - timestamp < FLOW_CARD_CLIP_HOLD_MS,
          ),
        )
        const changed = Object.keys(next).length !== Object.keys(previous).length
        return changed ? next : previous
      })
    }, Math.max(50, Math.min(...expiryDelays)))

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [flowClipTimestamps, setFlowClipTimestamps])

  // Expiration 2: input clip timestamps.
  useEffect(() => {
    const expiryDelays = Object.values(flowInputClipTimestamps)
      .map((timestamp) => (timestamp + FLOW_CARD_CLIP_HOLD_MS) - Date.now())
      .filter((delay) => delay > 0)

    if (expiryDelays.length === 0) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      const now = Date.now()
      setFlowInputClipTimestamps((previous) => {
        const next = Object.fromEntries(
          Object.entries(previous).filter(
            ([, timestamp]) => now - timestamp < FLOW_CARD_CLIP_HOLD_MS,
          ),
        )
        const changed = Object.keys(next).length !== Object.keys(previous).length
        return changed ? next : previous
      })
    }, Math.max(50, Math.min(...expiryDelays)))

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [flowInputClipTimestamps, setFlowInputClipTimestamps])

  // Expiration 3: output clip timestamps.
  useEffect(() => {
    const expiryDelays = Object.values(flowOutputClipTimestamps)
      .map((timestamp) => (timestamp + FLOW_CARD_CLIP_HOLD_MS) - Date.now())
      .filter((delay) => delay > 0)

    if (expiryDelays.length === 0) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      const now = Date.now()
      setFlowOutputClipTimestamps((previous) => {
        const next = Object.fromEntries(
          Object.entries(previous).filter(
            ([, timestamp]) => now - timestamp < FLOW_CARD_CLIP_HOLD_MS,
          ),
        )
        const changed = Object.keys(next).length !== Object.keys(previous).length
        return changed ? next : previous
      })
    }, Math.max(50, Math.min(...expiryDelays)))

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [flowOutputClipTimestamps, setFlowOutputClipTimestamps])

  return { flowClipPeakEntries }
}
