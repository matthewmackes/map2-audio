/**
 * T2473 cycle 11 — paired test for the slice-15 routing-inspector-content
 * hook. The hook handles 9 routing inspector ids (input, output, series,
 * split, mix, ab, morph, key, sidechain) plus the null short-circuit.
 */
import { renderHook } from '@testing-library/react'

import type { JuceGridLivePathLayout } from '../../components/SnapshotEditor/snapshotEditorLivePath'
import { useSnapshotEditorRoutingInspectorContent } from './useSnapshotEditorRoutingInspectorContent'
import type { FlowSlot } from './snapshotEditorPageTypes'

function makeFlow(id: string, label: string): FlowSlot {
  return { id, label, chainId: null } as unknown as FlowSlot
}

const flows = [makeFlow('a', 'A'), makeFlow('b', 'B'), makeFlow('c', 'C')]
const flowIndex = new Map<string, number>([
  ['a', 0],
  ['b', 1],
  ['c', 2],
])

const baseLivePath: JuceGridLivePathLayout = {
  flowStates: {},
  activeFlowIds: ['a'],
  primaryFlowId: 'a',
  secondaryFlowId: 'b',
  status: 'available',
} as unknown as JuceGridLivePathLayout

const baseArgs = {
  routingInspectorId: null as string | null,
  portRouting: undefined,
  portsInfo: undefined,
  flowSlots: flows,
  flowIndexById: flowIndex,
  livePathLayout: baseLivePath,
  audioInterfaceStatus: { isRunning: true, deviceName: 'JACK', sampleRate: 48000, bufferSize: 64 },
  audioOutputStatus: { isRunning: true, deviceName: 'JACK' },
  activeRoutingMode: { label: 'Series', summary: 'Sequential.' },
  routing: { blendPositions: { a: 100 }, morphProgress: 0 },
}

describe('useSnapshotEditorRoutingInspectorContent', () => {
  it('returns null when routingInspectorId is null', () => {
    const { result } = renderHook(() =>
      useSnapshotEditorRoutingInspectorContent(baseArgs),
    )
    expect(result.current).toBeNull()
  })

  it('returns null for an unrecognized inspector id', () => {
    const { result } = renderHook(() =>
      useSnapshotEditorRoutingInspectorContent({
        ...baseArgs,
        routingInspectorId: 'not-a-mode',
      }),
    )
    expect(result.current).toBeNull()
  })

  describe('per-mode pane shape', () => {
    it('"input" pane reports Running tag when isRunning, Stopped otherwise', () => {
      const r1 = renderHook(() =>
        useSnapshotEditorRoutingInspectorContent({ ...baseArgs, routingInspectorId: 'input' }),
      )
      expect(r1.result.current?.heading).toBe('Input routing')
      expect(r1.result.current?.tags?.[0]).toBe('Running')

      const r2 = renderHook(() =>
        useSnapshotEditorRoutingInspectorContent({
          ...baseArgs,
          routingInspectorId: 'input',
          audioInterfaceStatus: { isRunning: false },
        }),
      )
      expect(r2.result.current?.tags?.[0]).toBe('Stopped')
    })

    it('"output" pane reports the active routing mode label as second tag', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorRoutingInspectorContent({
          ...baseArgs,
          routingInspectorId: 'output',
          activeRoutingMode: { label: 'A/B', summary: 'A/B mode.' },
        }),
      )
      expect(result.current?.heading).toBe('Output routing')
      expect(result.current?.tags).toContain('A/B')
    })

    it('"series" pane uses Live/Unavailable tag from livePathLayout.status', () => {
      const r1 = renderHook(() =>
        useSnapshotEditorRoutingInspectorContent({
          ...baseArgs,
          routingInspectorId: 'series',
        }),
      )
      expect(r1.result.current?.heading).toBe('Series routing')
      expect(r1.result.current?.tags).toContain('Live')

      const unavailable = { ...baseLivePath, status: 'unavailable' } as never
      const r2 = renderHook(() =>
        useSnapshotEditorRoutingInspectorContent({
          ...baseArgs,
          routingInspectorId: 'series',
          livePathLayout: unavailable,
        }),
      )
      expect(r2.result.current?.tags).toContain('Unavailable')
    })

    it('"split" pane includes branch count tag', () => {
      const livePath = { ...baseLivePath, activeFlowIds: ['a', 'b', 'c'] } as never
      const { result } = renderHook(() =>
        useSnapshotEditorRoutingInspectorContent({
          ...baseArgs,
          routingInspectorId: 'split',
          livePathLayout: livePath,
        }),
      )
      expect(result.current?.heading).toBe('Parallel split')
      expect(result.current?.tags).toContain('3 live branches')
    })

    it('"mix" pane includes the Mix bus tag', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorRoutingInspectorContent({
          ...baseArgs,
          routingInspectorId: 'mix',
        }),
      )
      expect(result.current?.heading).toBe('Parallel mix')
      expect(result.current?.tags).toContain('Mix bus')
    })

    it('"ab" pane uses Configured/Unavailable from status', () => {
      const r1 = renderHook(() =>
        useSnapshotEditorRoutingInspectorContent({ ...baseArgs, routingInspectorId: 'ab' }),
      )
      expect(r1.result.current?.heading).toBe('A/B selector')
      expect(r1.result.current?.tags).toContain('Configured')

      const unavailable = { ...baseLivePath, status: 'unavailable' } as never
      const r2 = renderHook(() =>
        useSnapshotEditorRoutingInspectorContent({
          ...baseArgs,
          routingInspectorId: 'ab',
          livePathLayout: unavailable,
        }),
      )
      expect(r2.result.current?.tags).toContain('Unavailable')
    })

    it('"morph" pane reports rounded morph percentage in tag and row', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorRoutingInspectorContent({
          ...baseArgs,
          routingInspectorId: 'morph',
          routing: { blendPositions: {}, morphProgress: 0.625 },
        }),
      )
      expect(result.current?.heading).toBe('Morph control')
      expect(result.current?.tags).toContain('63%')
      const morphRow = result.current?.rows?.find((r) => r.label === 'Morph amount')
      expect(morphRow?.value).toBe('63%')
    })

    it('"key" pane reports the Key input subhead', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorRoutingInspectorContent({
          ...baseArgs,
          routingInspectorId: 'key',
        }),
      )
      expect(result.current?.heading).toBe('Sidechain key input')
      expect(result.current?.tags).toContain('Key input')
    })

    it('"sidechain" pane reports Live/Unavailable tag from status', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorRoutingInspectorContent({
          ...baseArgs,
          routingInspectorId: 'sidechain',
        }),
      )
      expect(result.current?.heading).toBe('Sidechain routing')
      expect(result.current?.tags).toContain('Live')
    })
  })

  describe('row label content', () => {
    it('"input" rows include Device + Source routes + Active branches + Clocking', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorRoutingInspectorContent({
          ...baseArgs,
          routingInspectorId: 'input',
        }),
      )
      const labels = result.current?.rows?.map((r) => r.label)
      expect(labels).toEqual(['Device', 'Source routes', 'Active branches', 'Clocking'])
    })

    it('"output" rows include Device + Destinations + Live branches + Delivery mode', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorRoutingInspectorContent({
          ...baseArgs,
          routingInspectorId: 'output',
        }),
      )
      const labels = result.current?.rows?.map((r) => r.label)
      expect(labels).toEqual(['Device', 'Destinations', 'Live branches', 'Delivery mode'])
    })

    it('"morph" Source/Target flow rows reflect primary + secondary flow labels', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorRoutingInspectorContent({
          ...baseArgs,
          routingInspectorId: 'morph',
        }),
      )
      const sourceRow = result.current?.rows?.find((r) => r.label === 'Source flow')
      const targetRow = result.current?.rows?.find((r) => r.label === 'Target flow')
      expect(sourceRow?.value).toBe('A')
      expect(targetRow?.value).toBe('B')
    })
  })
})
