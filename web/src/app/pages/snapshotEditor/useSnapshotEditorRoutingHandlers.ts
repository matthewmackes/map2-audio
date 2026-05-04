import { useCallback } from 'react'
import type { UseMutationResult } from '@tanstack/react-query'
import type { SnapshotDraftData } from '../../../map2/types'
import type { SnapshotRoutingLiveApplyState } from '../../utils/snapshotRoutingLiveState'
import type { Updater } from '../../stores/snapshotEditorStore'
import { cloneSnapshotDraftData } from './snapshotEditorPageHelpers'
import type { FlowSlot } from './snapshotEditorPageTypes'

interface UpdateLiveRoutingMutationVars {
  snapshotId: number
  nextDraft: SnapshotDraftData
}

interface UseSnapshotEditorRoutingHandlersArgs {
  activeSnapshot: { id: number } | null | undefined
  isAuthorityLiveSnapshot: boolean
  abSwitchEnabled: boolean
  abSwitchAlternateFlow: FlowSlot | null
  snapshotEditorMutationDisabled: boolean
  captureCurrentState: () => SnapshotDraftData
  setEditorSnapshotState: (data: SnapshotDraftData) => void
  recordSnapshotUndoRedoStep: (nextDraft: SnapshotDraftData, description: string) => void
  setRoutingLiveApplyState: (state: Updater<SnapshotRoutingLiveApplyState>) => void
  updateLiveSnapshotRoutingMutation: UseMutationResult<unknown, unknown, UpdateLiveRoutingMutationVars, unknown>
}

export interface UseSnapshotEditorRoutingHandlersResult {
  queueLiveRoutingDraftUpdate: (nextDraft: SnapshotDraftData) => void
  toggleAbSwitch: () => void
}

export function useSnapshotEditorRoutingHandlers(
  args: UseSnapshotEditorRoutingHandlersArgs,
): UseSnapshotEditorRoutingHandlersResult {
  const {
    activeSnapshot,
    isAuthorityLiveSnapshot,
    abSwitchEnabled,
    abSwitchAlternateFlow,
    snapshotEditorMutationDisabled,
    captureCurrentState,
    setEditorSnapshotState,
    recordSnapshotUndoRedoStep,
    setRoutingLiveApplyState,
    updateLiveSnapshotRoutingMutation,
  } = args

  const queueLiveRoutingDraftUpdate = useCallback((nextDraft: SnapshotDraftData) => {
    if (!isAuthorityLiveSnapshot || !activeSnapshot) {
      return
    }
    setRoutingLiveApplyState('idle')
    updateLiveSnapshotRoutingMutation.mutate({
      snapshotId: activeSnapshot.id,
      nextDraft,
    })
  }, [activeSnapshot, isAuthorityLiveSnapshot, setRoutingLiveApplyState, updateLiveSnapshotRoutingMutation])

  const toggleAbSwitch = useCallback(() => {
    if (snapshotEditorMutationDisabled || !abSwitchEnabled || !abSwitchAlternateFlow) {
      return
    }

    const nextDraft = cloneSnapshotDraftData(captureCurrentState())
    nextDraft.routing = {
      ...nextDraft.routing,
      mode: 'ab_switch',
      activeSlotId: abSwitchAlternateFlow.id,
    }
    setEditorSnapshotState(nextDraft)
    recordSnapshotUndoRedoStep(nextDraft, `Switch A/B path to ${abSwitchAlternateFlow.label}`)
    queueLiveRoutingDraftUpdate(nextDraft)
  }, [
    abSwitchAlternateFlow,
    abSwitchEnabled,
    captureCurrentState,
    queueLiveRoutingDraftUpdate,
    recordSnapshotUndoRedoStep,
    setEditorSnapshotState,
    snapshotEditorMutationDisabled,
  ])

  return { queueLiveRoutingDraftUpdate, toggleAbSwitch }
}
