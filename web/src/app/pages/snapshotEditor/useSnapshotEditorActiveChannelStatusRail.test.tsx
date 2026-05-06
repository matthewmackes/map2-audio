/**
 * T2473 cycle 8 — paired test for the slice-14 active-channel-status-rail
 * hook. Pure derivation; no QueryClient needed.
 */
import { renderHook } from '@testing-library/react'

import type { Chain } from '../../../map2/types'
import type { JuceGridLivePathLayout } from '../../components/SnapshotEditor/snapshotEditorLivePath'
import { useSnapshotEditorActiveChannelStatusRail } from './useSnapshotEditorActiveChannelStatusRail'
import type { FlowSlot } from './snapshotEditorPageTypes'

function makeFlow(overrides: Partial<FlowSlot> = {}): FlowSlot {
  return {
    id: 'flow-a',
    label: 'A',
    chainId: null,
    bypassed: false,
    muted: false,
    solo: false,
    ...overrides,
  } as FlowSlot
}

const baseLivePath: JuceGridLivePathLayout = {
  flowStates: {
    'flow-a': { activeAudio: false, dimmed: false, sidechainKey: false },
  },
  activeFlowIds: [],
  primaryFlowId: null,
  secondaryFlowId: null,
  status: 'available',
} as unknown as JuceGridLivePathLayout

const baseArgs = {
  activeFlow: makeFlow(),
  activeFlowChainId: null as number | null,
  activeFlowChainRoutingQuery: { isLoading: false, data: undefined },
  activeFlowLabel: 'A',
  currentChain: null as Chain | null | undefined,
  flowClipTimestamps: {} as Record<string, number | null>,
  flowInputClipTimestamps: {} as Record<string, number | null>,
  flowOutputClipTimestamps: {} as Record<string, number | null>,
  livePathLayout: baseLivePath,
  routingBlendPositions: {} as Record<string, number | undefined>,
}

describe('useSnapshotEditorActiveChannelStatusRail', () => {
  it('returns null when activeFlow is missing', () => {
    const { result } = renderHook(() =>
      useSnapshotEditorActiveChannelStatusRail({ ...baseArgs, activeFlow: null }),
    )
    expect(result.current).toBeNull()
  })

  describe('routingSourceLabel cascade', () => {
    it('"No chain routing" when activeFlowChainId is null', () => {
      const { result } = renderHook(() => useSnapshotEditorActiveChannelStatusRail(baseArgs))
      expect(result.current?.routingSourceLabel).toBe('No chain routing')
    })

    it('"Routing status loading" when query is loading', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorActiveChannelStatusRail({
          ...baseArgs,
          activeFlowChainId: 7,
          activeFlowChainRoutingQuery: { isLoading: true, data: undefined },
        }),
      )
      expect(result.current?.routingSourceLabel).toBe('Routing status loading')
    })

    it('"Channel routing override" when is_override is true', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorActiveChannelStatusRail({
          ...baseArgs,
          activeFlowChainId: 7,
          activeFlowChainRoutingQuery: { isLoading: false, data: { is_override: true } },
        }),
      )
      expect(result.current?.routingSourceLabel).toBe('Channel routing override')
    })

    it('"Shared routing map" when chain id present, not loading, no override', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorActiveChannelStatusRail({
          ...baseArgs,
          activeFlowChainId: 7,
          activeFlowChainRoutingQuery: { isLoading: false, data: { is_override: false } },
        }),
      )
      expect(result.current?.routingSourceLabel).toBe('Shared routing map')
    })
  })

  describe('blendPercent clamp', () => {
    it('clamps to 0 when negative blend supplied', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorActiveChannelStatusRail({
          ...baseArgs,
          routingBlendPositions: { 'flow-a': -10 },
        }),
      )
      expect(result.current?.blendLabel).toBe('0% blend')
    })

    it('clamps to 100 when over-range blend supplied', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorActiveChannelStatusRail({
          ...baseArgs,
          routingBlendPositions: { 'flow-a': 250 },
        }),
      )
      expect(result.current?.blendLabel).toBe('100% blend')
    })

    it('defaults to 100% when no blend value present', () => {
      const { result } = renderHook(() => useSnapshotEditorActiveChannelStatusRail(baseArgs))
      expect(result.current?.blendLabel).toBe('100% blend')
    })

    it('rounds fractional values', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorActiveChannelStatusRail({
          ...baseArgs,
          routingBlendPositions: { 'flow-a': 42.7 },
        }),
      )
      expect(result.current?.blendLabel).toBe('43% blend')
    })
  })

  describe('block summary + chain label', () => {
    it('uses "No chain assigned" twice when no chain', () => {
      const { result } = renderHook(() => useSnapshotEditorActiveChannelStatusRail(baseArgs))
      expect(result.current?.chainLabel).toBe('No chain assigned')
      expect(result.current?.blockSummary).toBe('No chain assigned')
    })

    it('reports plural "blocks" when chain has > 1 plugin', () => {
      const chain = { id: 7, plugins: [{ uri: 'a' }, { uri: 'b' }, { uri: 'c' }] } as unknown as Chain
      const { result } = renderHook(() =>
        useSnapshotEditorActiveChannelStatusRail({ ...baseArgs, currentChain: chain }),
      )
      expect(result.current?.chainLabel).toBe('Chain A')
      expect(result.current?.blockSummary).toBe('3 loaded blocks')
    })

    it('reports singular "block" when chain has exactly 1 plugin', () => {
      const chain = { id: 7, plugins: [{ uri: 'a' }] } as unknown as Chain
      const { result } = renderHook(() =>
        useSnapshotEditorActiveChannelStatusRail({ ...baseArgs, currentChain: chain }),
      )
      expect(result.current?.blockSummary).toBe('1 loaded block')
    })
  })

  describe('stateLabel + clip flags', () => {
    it('reports "Live" when live-path flow state is activeAudio', () => {
      const live: JuceGridLivePathLayout = {
        ...baseLivePath,
        flowStates: {
          'flow-a': { activeAudio: true, dimmed: false, sidechainKey: false },
        },
      } as unknown as JuceGridLivePathLayout
      const { result } = renderHook(() =>
        useSnapshotEditorActiveChannelStatusRail({ ...baseArgs, livePathLayout: live }),
      )
      expect(result.current?.stateLabel).toBe('Live')
    })

    it('reports "Snapshot" when not live', () => {
      const { result } = renderHook(() => useSnapshotEditorActiveChannelStatusRail(baseArgs))
      expect(result.current?.stateLabel).toBe('Snapshot')
    })

    it('reflects mute/solo from active flow', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorActiveChannelStatusRail({
          ...baseArgs,
          activeFlow: makeFlow({ muted: true, solo: true }),
        }),
      )
      expect(result.current?.muted).toBe(true)
      expect(result.current?.solo).toBe(true)
    })

    it('detects clip flags from each timestamp store', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorActiveChannelStatusRail({
          ...baseArgs,
          flowClipTimestamps: { 'flow-a': 12345 },
          flowInputClipTimestamps: { 'flow-a': 12345 },
          flowOutputClipTimestamps: { 'flow-a': null },
        }),
      )
      expect(result.current?.clipActive).toBe(true)
      expect(result.current?.inputClipActive).toBe(true)
      expect(result.current?.outputClipActive).toBe(false)
    })
  })
})
