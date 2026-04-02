import { useCallback, useRef, useState } from 'react'

import type { SnapshotDraftData } from '../../../map2/types'

function cloneDraftState(state: SnapshotDraftData): SnapshotDraftData {
  return JSON.parse(JSON.stringify(state)) as SnapshotDraftData
}

function fingerprintDraftState(state: SnapshotDraftData): string {
  return JSON.stringify(state)
}

export interface SnapshotEditorUndoRedoState {
  canUndo: boolean
  canRedo: boolean
  undoDescription?: string
  redoDescription?: string
  current: SnapshotDraftData | null
  push: (nextState: SnapshotDraftData, description: string) => void
  undo: () => SnapshotDraftData | null
  redo: () => SnapshotDraftData | null
  reset: (initialState: SnapshotDraftData) => void
  clear: () => void
}

export function useSnapshotEditorUndoRedo(): SnapshotEditorUndoRedoState {
  const statesRef = useRef<SnapshotDraftData[]>([])
  const transitionDescriptionsRef = useRef<string[]>([])
  const pointerRef = useRef(-1)
  const [, setVersion] = useState(0)
  const tick = useCallback(() => setVersion((version) => version + 1), [])

  const clear = useCallback(() => {
    statesRef.current = []
    transitionDescriptionsRef.current = []
    pointerRef.current = -1
    tick()
  }, [tick])

  const reset = useCallback((initialState: SnapshotDraftData) => {
    statesRef.current = [cloneDraftState(initialState)]
    transitionDescriptionsRef.current = []
    pointerRef.current = 0
    tick()
  }, [tick])

  const push = useCallback((nextState: SnapshotDraftData, description: string) => {
    if (pointerRef.current < 0) {
      statesRef.current = [cloneDraftState(nextState)]
      transitionDescriptionsRef.current = []
      pointerRef.current = 0
      tick()
      return
    }

    const currentState = statesRef.current[pointerRef.current]
    if (fingerprintDraftState(currentState) === fingerprintDraftState(nextState)) {
      return
    }

    statesRef.current = statesRef.current.slice(0, pointerRef.current + 1)
    transitionDescriptionsRef.current = transitionDescriptionsRef.current.slice(0, pointerRef.current)
    statesRef.current.push(cloneDraftState(nextState))
    transitionDescriptionsRef.current.push(description)
    pointerRef.current = statesRef.current.length - 1
    tick()
  }, [tick])

  const undo = useCallback((): SnapshotDraftData | null => {
    if (pointerRef.current <= 0) {
      return null
    }
    pointerRef.current -= 1
    tick()
    return cloneDraftState(statesRef.current[pointerRef.current])
  }, [tick])

  const redo = useCallback((): SnapshotDraftData | null => {
    if (pointerRef.current < 0 || pointerRef.current >= statesRef.current.length - 1) {
      return null
    }
    pointerRef.current += 1
    tick()
    return cloneDraftState(statesRef.current[pointerRef.current])
  }, [tick])

  const current = pointerRef.current >= 0
    ? cloneDraftState(statesRef.current[pointerRef.current])
    : null
  const canUndo = pointerRef.current > 0
  const canRedo = pointerRef.current >= 0 && pointerRef.current < statesRef.current.length - 1
  const undoDescription = canUndo
    ? transitionDescriptionsRef.current[pointerRef.current - 1]
    : undefined
  const redoDescription = canRedo
    ? transitionDescriptionsRef.current[pointerRef.current]
    : undefined

  return {
    canUndo,
    canRedo,
    undoDescription,
    redoDescription,
    current,
    push,
    undo,
    redo,
    reset,
    clear,
  }
}
