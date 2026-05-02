/**
 * T2485-3 — useFlowUndoRedo unit tests.
 */

import { act, renderHook } from '@testing-library/react'
import { useFlowUndoRedo } from './useFlowUndoRedo'

describe('useFlowUndoRedo', () => {
  it('starts with empty stack and no undo/redo available', () => {
    const { result } = renderHook(() => useFlowUndoRedo())
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
    expect(result.current.undo()).toBeNull()
    expect(result.current.redo()).toBeNull()
  })

  it('records an entry and exposes it on undo', () => {
    const { result } = renderHook(() => useFlowUndoRedo())
    act(() => {
      result.current.push('reverb.size', 0.5, 0.7)
    })
    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)

    let entry: ReturnType<typeof result.current.undo> = null
    act(() => {
      entry = result.current.undo()
    })
    expect(entry).toEqual({ paramId: 'reverb.size', prevValue: 0.5, nextValue: 0.7 })
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(true)
  })

  it('redoes after undo', () => {
    const { result } = renderHook(() => useFlowUndoRedo())
    act(() => {
      result.current.push('p', 0, 1)
    })
    act(() => {
      result.current.undo()
    })
    let redone: ReturnType<typeof result.current.redo> = null
    act(() => {
      redone = result.current.redo()
    })
    expect(redone).toEqual({ paramId: 'p', prevValue: 0, nextValue: 1 })
    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)
  })

  it('truncates redo history when a new push happens after undo', () => {
    const { result } = renderHook(() => useFlowUndoRedo())
    act(() => {
      result.current.push('a', 0, 1)
      result.current.push('b', 1, 2)
    })
    act(() => {
      result.current.undo()
    })
    // Pointer at index 0 (entry "a"); redo would have gone to "b".
    expect(result.current.canRedo).toBe(true)
    act(() => {
      result.current.push('c', 5, 6)
    })
    // "b" is gone — redo no longer possible.
    expect(result.current.canRedo).toBe(false)
    expect(result.current.canUndo).toBe(true)
  })

  it('caps stack at maxDepth', () => {
    const { result } = renderHook(() => useFlowUndoRedo(3))
    act(() => {
      result.current.push('a', 0, 1)
      result.current.push('b', 0, 1)
      result.current.push('c', 0, 1)
      result.current.push('d', 0, 1)
    })
    // Stack should now be [b, c, d]; first undo returns "d".
    let entry: ReturnType<typeof result.current.undo> = null
    act(() => {
      entry = result.current.undo()
    })
    expect(entry?.paramId).toBe('d')
    act(() => {
      entry = result.current.undo()
    })
    expect(entry?.paramId).toBe('c')
    act(() => {
      entry = result.current.undo()
    })
    expect(entry?.paramId).toBe('b')
    act(() => {
      entry = result.current.undo()
    })
    expect(entry).toBeNull()
  })

  it('clear() resets state', () => {
    const { result } = renderHook(() => useFlowUndoRedo())
    act(() => {
      result.current.push('p', 0, 1)
    })
    expect(result.current.canUndo).toBe(true)
    act(() => {
      result.current.clear()
    })
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })
})
