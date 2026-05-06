// Snapshot editor "active channel status rail" derivation hook
// (T2473 JSX partition — channel-status-rail extraction).
//
// Lifts the activeChannelStatusRail useMemo block off the monolith.
// Computes the rail props (channelLabel, chainLabel, blockSummary,
// blendLabel, routingSourceLabel, stateLabel, mute/solo, three clip
// flags) from the active flow + chain + clip-timestamp store slices.
//
// Behavioral parity preserved verbatim: same memo deps, same
// blend-clamp logic (0..100 percent rounded), same fallback strings
// ('No chain assigned' twice, 'No chain routing' on null chain id),
// same routingSourceLabel cascade based on isLoading + is_override.

import { useMemo } from 'react'

import type { Chain } from '../../../map2/types'
import type { JuceGridLivePathLayout } from '../../components/SnapshotEditor/snapshotEditorLivePath'
import type { FlowSlot } from './snapshotEditorPageTypes'

interface ActiveFlowChainRoutingQuery {
  isLoading: boolean
  data?: { is_override?: boolean }
}

export interface SnapshotEditorActiveChannelStatusRail {
  channelLabel: string
  chainLabel: string
  blockSummary: string
  blendLabel: string
  routingSourceLabel: string
  stateLabel: string
  muted: boolean
  solo: boolean
  inputClipActive: boolean
  outputClipActive: boolean
  clipActive: boolean
}

export interface UseSnapshotEditorActiveChannelStatusRailArgs {
  activeFlow: FlowSlot | null | undefined
  activeFlowChainId: number | null
  activeFlowChainRoutingQuery: ActiveFlowChainRoutingQuery
  activeFlowLabel: string
  currentChain: Chain | null | undefined
  flowClipTimestamps: Record<string, number | null>
  flowInputClipTimestamps: Record<string, number | null>
  flowOutputClipTimestamps: Record<string, number | null>
  livePathLayout: JuceGridLivePathLayout
  routingBlendPositions: Record<string, number | undefined>
}

export function useSnapshotEditorActiveChannelStatusRail({
  activeFlow,
  activeFlowChainId,
  activeFlowChainRoutingQuery,
  activeFlowLabel,
  currentChain,
  flowClipTimestamps,
  flowInputClipTimestamps,
  flowOutputClipTimestamps,
  livePathLayout,
  routingBlendPositions,
}: UseSnapshotEditorActiveChannelStatusRailArgs): SnapshotEditorActiveChannelStatusRail | null {
  return useMemo(() => {
    if (!activeFlow) {
      return null
    }

    const flowState = livePathLayout.flowStates[activeFlow.id]
    const blockCount = currentChain?.plugins.length ?? 0
    const blendPercent = Math.max(
      0,
      Math.min(100, Math.round(routingBlendPositions[activeFlow.id] ?? 100)),
    )
    const routingSourceLabel = activeFlowChainId === null
      ? 'No chain routing'
      : activeFlowChainRoutingQuery.isLoading
        ? 'Routing status loading'
        : activeFlowChainRoutingQuery.data?.is_override
          ? 'Channel routing override'
          : 'Shared routing map'

    return {
      channelLabel: activeFlowLabel,
      chainLabel: currentChain ? `Chain ${activeFlowLabel}` : 'No chain assigned',
      blockSummary: currentChain
        ? `${blockCount} loaded ${blockCount === 1 ? 'block' : 'blocks'}`
        : 'No chain assigned',
      blendLabel: `${blendPercent}% blend`,
      routingSourceLabel,
      stateLabel: flowState?.activeAudio ? 'Live' : 'Snapshot',
      muted: activeFlow.muted,
      solo: activeFlow.solo,
      inputClipActive: typeof flowInputClipTimestamps[activeFlow.id] === 'number',
      outputClipActive: typeof flowOutputClipTimestamps[activeFlow.id] === 'number',
      clipActive: typeof flowClipTimestamps[activeFlow.id] === 'number',
    }
  }, [
    activeFlow,
    activeFlowChainId,
    activeFlowChainRoutingQuery.data?.is_override,
    activeFlowChainRoutingQuery.isLoading,
    activeFlowLabel,
    currentChain,
    flowClipTimestamps,
    flowInputClipTimestamps,
    flowOutputClipTimestamps,
    livePathLayout.flowStates,
    routingBlendPositions,
  ])
}
