/**
 * T2473 cycle 21 — paired test for useSnapshotEditorRoutingHandlers.
 *
 * Drives UNTESTED_HOOKS to zero. Hook returns two callbacks:
 * `queueLiveRoutingDraftUpdate` (delegates to a TanStack mutation
 * when the active snapshot is the authority-live one) and
 * `toggleAbSwitch` (composes a routing-mode swap, records undo,
 * queues the live update).
 */
import { renderHook, act } from '@testing-library/react'

import { useSnapshotEditorRoutingHandlers } from './useSnapshotEditorRoutingHandlers'

function makeArgs(over: Partial<Parameters<typeof useSnapshotEditorRoutingHandlers>[0]> = {}) {
  const captureCurrentState = jest.fn(() => ({
    chains: [],
    flowSlots: [],
    routing: { mode: 'series', activeSlotId: 'a' },
    activeFlowIndex: 0,
  } as never))
  const setEditorSnapshotState = jest.fn()
  const recordSnapshotUndoRedoStep = jest.fn()
  const setRoutingLiveApplyState = jest.fn()
  const mutate = jest.fn()
  const updateLiveSnapshotRoutingMutation = { mutate } as never
  const args = {
    activeSnapshot: { id: 7 },
    isAuthorityLiveSnapshot: true,
    abSwitchEnabled: true,
    abSwitchAlternateFlow: { id: 'b', label: 'B' },
    snapshotEditorMutationDisabled: false,
    captureCurrentState,
    setEditorSnapshotState,
    recordSnapshotUndoRedoStep,
    setRoutingLiveApplyState,
    updateLiveSnapshotRoutingMutation,
    ...over,
  } as unknown as Parameters<typeof useSnapshotEditorRoutingHandlers>[0]
  return {
    args,
    spies: {
      captureCurrentState,
      setEditorSnapshotState,
      recordSnapshotUndoRedoStep,
      setRoutingLiveApplyState,
      mutate,
    },
  }
}

describe('useSnapshotEditorRoutingHandlers', () => {
  describe('queueLiveRoutingDraftUpdate', () => {
    it('mutates with the active snapshot id + draft when isAuthorityLiveSnapshot', () => {
      const { args, spies } = makeArgs()
      const { result } = renderHook(() => useSnapshotEditorRoutingHandlers(args))
      const draft = { chains: [], flowSlots: [], routing: { mode: 'series' }, activeFlowIndex: 0 } as never
      act(() => result.current.queueLiveRoutingDraftUpdate(draft))
      expect(spies.setRoutingLiveApplyState).toHaveBeenCalledWith('idle')
      expect(spies.mutate).toHaveBeenCalledWith({ snapshotId: 7, nextDraft: draft })
    })

    it('is a no-op when not isAuthorityLiveSnapshot', () => {
      const { args, spies } = makeArgs({ isAuthorityLiveSnapshot: false })
      const { result } = renderHook(() => useSnapshotEditorRoutingHandlers(args))
      act(() => result.current.queueLiveRoutingDraftUpdate({} as never))
      expect(spies.mutate).not.toHaveBeenCalled()
      expect(spies.setRoutingLiveApplyState).not.toHaveBeenCalled()
    })

    it('is a no-op when activeSnapshot is null', () => {
      const { args, spies } = makeArgs({ activeSnapshot: null })
      const { result } = renderHook(() => useSnapshotEditorRoutingHandlers(args))
      act(() => result.current.queueLiveRoutingDraftUpdate({} as never))
      expect(spies.mutate).not.toHaveBeenCalled()
    })
  })

  describe('toggleAbSwitch', () => {
    it('captures current state, sets routing to ab_switch + alternate slot, records undo, queues live update', () => {
      const { args, spies } = makeArgs()
      const { result } = renderHook(() => useSnapshotEditorRoutingHandlers(args))
      act(() => result.current.toggleAbSwitch())

      expect(spies.captureCurrentState).toHaveBeenCalled()
      expect(spies.setEditorSnapshotState).toHaveBeenCalled()
      const newDraft = (spies.setEditorSnapshotState.mock.calls[0] as unknown[])[0] as { routing: { mode: string; activeSlotId: string } }
      expect(newDraft.routing.mode).toBe('ab_switch')
      expect(newDraft.routing.activeSlotId).toBe('b')
      expect(spies.recordSnapshotUndoRedoStep).toHaveBeenCalledWith(
        newDraft,
        'Switch A/B path to B',
      )
      // queueLiveRoutingDraftUpdate runs internally and forwards.
      expect(spies.mutate).toHaveBeenCalledWith({ snapshotId: 7, nextDraft: newDraft })
    })

    it('is a no-op when mutation is disabled', () => {
      const { args, spies } = makeArgs({ snapshotEditorMutationDisabled: true })
      const { result } = renderHook(() => useSnapshotEditorRoutingHandlers(args))
      act(() => result.current.toggleAbSwitch())
      expect(spies.captureCurrentState).not.toHaveBeenCalled()
      expect(spies.mutate).not.toHaveBeenCalled()
    })

    it('is a no-op when ab-switch is not enabled', () => {
      const { args, spies } = makeArgs({ abSwitchEnabled: false })
      const { result } = renderHook(() => useSnapshotEditorRoutingHandlers(args))
      act(() => result.current.toggleAbSwitch())
      expect(spies.captureCurrentState).not.toHaveBeenCalled()
    })

    it('is a no-op when no alternate flow is available', () => {
      const { args, spies } = makeArgs({ abSwitchAlternateFlow: null })
      const { result } = renderHook(() => useSnapshotEditorRoutingHandlers(args))
      act(() => result.current.toggleAbSwitch())
      expect(spies.captureCurrentState).not.toHaveBeenCalled()
    })

    it('does not mutate when not authority-live, but still records the local draft change', () => {
      const { args, spies } = makeArgs({ isAuthorityLiveSnapshot: false })
      const { result } = renderHook(() => useSnapshotEditorRoutingHandlers(args))
      act(() => result.current.toggleAbSwitch())
      // Local draft + undo still happen (not gated on authority-live).
      expect(spies.captureCurrentState).toHaveBeenCalled()
      expect(spies.setEditorSnapshotState).toHaveBeenCalled()
      expect(spies.recordSnapshotUndoRedoStep).toHaveBeenCalled()
      // But the live mutation does NOT fire.
      expect(spies.mutate).not.toHaveBeenCalled()
    })
  })
})
