/**
 * T2473 cycle 10 — paired test for the slice-16 clip-timestamps lifecycle hook.
 *
 * The hook owns 1 useMemo (flowClipPeakEntries) + 5 useEffects:
 *   - 2 ingest effects: write into global / input / output stores
 *   - 3 expiration effects: schedule timeouts that prune stale entries
 *
 * The tests focus on behavioral observables — what setter calls go
 * out, what shape they pass — rather than the internal effect order.
 */
import { renderHook } from '@testing-library/react'

import { useSnapshotEditorClipTimestamps } from './useSnapshotEditorClipTimestamps'
import type { FlowSlot } from './snapshotEditorPageTypes'

function makeFlow(id: string, chainId: number | null = null): FlowSlot {
  return { id, label: id.toUpperCase(), chainId } as unknown as FlowSlot
}

describe('useSnapshotEditorClipTimestamps', () => {
  describe('flowClipPeakEntries derivation', () => {
    it('flattens nested pluginPeaks into one array', () => {
      const peaks = {
        'urn:plugin-a': {
          'in-l': { uri: 'urn:plugin-a', plugin_position: 0, is_clipping: true, port_symbol: 'in-l' },
          'in-r': { uri: 'urn:plugin-a', plugin_position: 0, is_clipping: false, port_symbol: 'in-r' },
        },
        'urn:plugin-b': {
          'out-l': { uri: 'urn:plugin-b', plugin_position: 1, is_clipping: false, port_symbol: 'out-l' },
        },
      }
      const { result } = renderHook(() =>
        useSnapshotEditorClipTimestamps({
          pluginPeaks: peaks,
          flowSlots: [],
          chainsQueryData: undefined,
          controlPlaneSnapshot: null,
          flowClipTimestamps: {},
          flowInputClipTimestamps: {},
          flowOutputClipTimestamps: {},
          setFlowClipTimestamps: jest.fn(),
          setFlowInputClipTimestamps: jest.fn(),
          setFlowOutputClipTimestamps: jest.fn(),
        }),
      )
      const entries = result.current.flowClipPeakEntries
      expect(entries.length).toBe(3)
      expect(entries.map((e) => e.uri).sort()).toEqual([
        'urn:plugin-a',
        'urn:plugin-a',
        'urn:plugin-b',
      ])
      const clipping = entries.filter((e) => e.isClipping)
      expect(clipping.length).toBe(1)
      expect(clipping[0].portSymbol).toBe('in-l')
    })

    it('returns an empty array when pluginPeaks is null/undefined', () => {
      const { result } = renderHook(() =>
        useSnapshotEditorClipTimestamps({
          pluginPeaks: null,
          flowSlots: [],
          chainsQueryData: undefined,
          controlPlaneSnapshot: null,
          flowClipTimestamps: {},
          flowInputClipTimestamps: {},
          flowOutputClipTimestamps: {},
          setFlowClipTimestamps: jest.fn(),
          setFlowInputClipTimestamps: jest.fn(),
          setFlowOutputClipTimestamps: jest.fn(),
        }),
      )
      expect(result.current.flowClipPeakEntries).toEqual([])
    })

    it('coerces missing plugin_position / port_symbol to null', () => {
      const peaks = {
        a: {
          x: { uri: 'urn:a' },
        },
      } as never
      const { result } = renderHook(() =>
        useSnapshotEditorClipTimestamps({
          pluginPeaks: peaks,
          flowSlots: [],
          chainsQueryData: undefined,
          controlPlaneSnapshot: null,
          flowClipTimestamps: {},
          flowInputClipTimestamps: {},
          flowOutputClipTimestamps: {},
          setFlowClipTimestamps: jest.fn(),
          setFlowInputClipTimestamps: jest.fn(),
          setFlowOutputClipTimestamps: jest.fn(),
        }),
      )
      expect(result.current.flowClipPeakEntries[0]).toEqual({
        uri: 'urn:a',
        pluginPosition: null,
        isClipping: false,
        portSymbol: null,
      })
    })
  })

  describe('ingest setter calls', () => {
    it('invokes setFlowClipTimestamps + setFlowInputClipTimestamps + setFlowOutputClipTimestamps', () => {
      const setGlobal = jest.fn()
      const setInput = jest.fn()
      const setOutput = jest.fn()
      renderHook(() =>
        useSnapshotEditorClipTimestamps({
          pluginPeaks: {},
          flowSlots: [makeFlow('flow-a', 1)],
          chainsQueryData: { chains: [{ id: 1, plugins: [] }] } as never,
          controlPlaneSnapshot: null,
          flowClipTimestamps: {},
          flowInputClipTimestamps: {},
          flowOutputClipTimestamps: {},
          setFlowClipTimestamps: setGlobal,
          setFlowInputClipTimestamps: setInput,
          setFlowOutputClipTimestamps: setOutput,
        }),
      )
      expect(setGlobal).toHaveBeenCalled()
      expect(setInput).toHaveBeenCalled()
      expect(setOutput).toHaveBeenCalled()
    })

    it('global ingest setter returns same ref when previous + next maps are both empty', () => {
      const setGlobal = jest.fn((updater: (p: Record<string, number>) => Record<string, number>) => {
        // When no flows produce a timestamp AND previous is empty,
        // keys are equal-length (0) and the updater returns the same
        // reference — preventing wasted re-renders.
        const previous: Record<string, number> = {}
        const next = updater(previous)
        expect(next).toBe(previous)
      })
      renderHook(() =>
        useSnapshotEditorClipTimestamps({
          pluginPeaks: {},
          flowSlots: [],
          chainsQueryData: undefined,
          controlPlaneSnapshot: null,
          flowClipTimestamps: {},
          flowInputClipTimestamps: {},
          flowOutputClipTimestamps: {},
          setFlowClipTimestamps: setGlobal,
          setFlowInputClipTimestamps: jest.fn(),
          setFlowOutputClipTimestamps: jest.fn(),
        }),
      )
    })
  })

  describe('expiration timeout scheduling', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })
    afterEach(() => {
      jest.useRealTimers()
    })

    it('does not schedule a timeout when flowClipTimestamps is empty', () => {
      const setGlobal = jest.fn()
      renderHook(() =>
        useSnapshotEditorClipTimestamps({
          pluginPeaks: null,
          flowSlots: [],
          chainsQueryData: undefined,
          controlPlaneSnapshot: null,
          flowClipTimestamps: {},
          flowInputClipTimestamps: {},
          flowOutputClipTimestamps: {},
          setFlowClipTimestamps: setGlobal,
          setFlowInputClipTimestamps: jest.fn(),
          setFlowOutputClipTimestamps: jest.fn(),
        }),
      )
      // Advance well past any reasonable hold; setter should still
      // only have been called from the ingest, not the expiration.
      const ingestCalls = setGlobal.mock.calls.length
      jest.advanceTimersByTime(60_000)
      expect(setGlobal.mock.calls.length).toBe(ingestCalls)
    })

    it('schedules a timeout when flowClipTimestamps has at least one fresh entry', () => {
      const setGlobal = jest.fn()
      // Simulate a clip-timestamp from "just now" — within the
      // FLOW_CARD_CLIP_HOLD_MS window so the expiration window > 0.
      renderHook(() =>
        useSnapshotEditorClipTimestamps({
          pluginPeaks: null,
          flowSlots: [],
          chainsQueryData: undefined,
          controlPlaneSnapshot: null,
          flowClipTimestamps: { 'flow-a': Date.now() },
          flowInputClipTimestamps: {},
          flowOutputClipTimestamps: {},
          setFlowClipTimestamps: setGlobal,
          setFlowInputClipTimestamps: jest.fn(),
          setFlowOutputClipTimestamps: jest.fn(),
        }),
      )
      // After running all timers, the expiration callback fires and
      // calls setFlowClipTimestamps with a pruning updater.
      jest.runAllTimers()
      expect(setGlobal.mock.calls.length).toBeGreaterThanOrEqual(2)
    })
  })
})
