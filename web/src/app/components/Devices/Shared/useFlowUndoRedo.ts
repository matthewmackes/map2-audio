/**
 * T2485-3 — generic flow-canvas undo/redo hook.
 *
 * Promoted verbatim from web/src/app/components/Devices/IntelFX/useFlowUndoRedo.ts
 * (the IntelFX version was already device-agnostic; the only thing
 * that was IntelFX-shaped was its docstring). This is the canonical
 * home; the IntelFX module re-exports this one during the migration
 * window so existing callers keep compiling.
 *
 * Only tracks changes initiated from UI callbacks (bypass toggles,
 * sidebar param changes). WebSocket param-receive events from the
 * device are NOT pushed onto this stack — the operator's intent stack
 * stays separate from external state mutations.
 */

import { useCallback, useRef, useState } from 'react'

export interface FlowUndoEntry {
  paramId: string
  prevValue: number
  nextValue: number
}

export interface FlowUndoRedo {
  canUndo: boolean
  canRedo: boolean
  push: (paramId: string, prevValue: number, nextValue: number) => void
  undo: () => FlowUndoEntry | null
  redo: () => FlowUndoEntry | null
  clear: () => void
}

export function useFlowUndoRedo(maxDepth = 50): FlowUndoRedo {
  const stackRef = useRef<FlowUndoEntry[]>([])
  const pointerRef = useRef<number>(-1)
  // Dummy state to trigger re-renders when undo/redo availability changes.
  const [, setVersion] = useState(0)
  const tick = useCallback(() => setVersion((v) => v + 1), [])

  const push = useCallback(
    (paramId: string, prevValue: number, nextValue: number) => {
      // Truncate any redo history above the current pointer.
      stackRef.current = stackRef.current.slice(0, pointerRef.current + 1)
      stackRef.current.push({ paramId, prevValue, nextValue })
      if (stackRef.current.length > maxDepth) {
        stackRef.current = stackRef.current.slice(-maxDepth)
      }
      pointerRef.current = stackRef.current.length - 1
      tick()
    },
    [maxDepth, tick],
  )

  const undo = useCallback((): FlowUndoEntry | null => {
    if (pointerRef.current < 0) return null
    const entry = stackRef.current[pointerRef.current]
    pointerRef.current -= 1
    tick()
    return entry
  }, [tick])

  const redo = useCallback((): FlowUndoEntry | null => {
    if (pointerRef.current >= stackRef.current.length - 1) return null
    pointerRef.current += 1
    const entry = stackRef.current[pointerRef.current]
    tick()
    return entry
  }, [tick])

  const clear = useCallback(() => {
    stackRef.current = []
    pointerRef.current = -1
    tick()
  }, [tick])

  return {
    canUndo: pointerRef.current >= 0,
    canRedo: pointerRef.current < stackRef.current.length - 1,
    push,
    undo,
    redo,
    clear,
  }
}
