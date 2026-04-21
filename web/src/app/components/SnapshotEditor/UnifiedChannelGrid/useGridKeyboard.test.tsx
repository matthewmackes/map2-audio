import '@testing-library/jest-dom'
import { renderHook } from '@testing-library/react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

import { useGridKeyboard } from './useGridKeyboard'

function makeEvent(key: string): ReactKeyboardEvent<HTMLElement> & {
  preventDefault: jest.Mock
} {
  return {
    key,
    preventDefault: jest.fn(),
  } as unknown as ReactKeyboardEvent<HTMLElement> & { preventDefault: jest.Mock }
}

describe('useGridKeyboard', () => {
  it('ArrowLeft reorders selected block one slot earlier (clamped at 0)', () => {
    const onReorder = jest.fn()
    const { result } = renderHook(() =>
      useGridKeyboard({ rowId: 'row-a', slotIndex: 3 }, { onReorder }),
    )

    const e = makeEvent('ArrowLeft')
    result.current(e)
    expect(onReorder).toHaveBeenCalledWith('row-a', 3, 2)
    expect(e.preventDefault).toHaveBeenCalled()

    onReorder.mockClear()
    const { result: clamped } = renderHook(() =>
      useGridKeyboard({ rowId: 'row-a', slotIndex: 0 }, { onReorder }),
    )
    const e2 = makeEvent('ArrowLeft')
    clamped.current(e2)
    expect(onReorder).not.toHaveBeenCalled()
    expect(e2.preventDefault).not.toHaveBeenCalled()
  })

  it('ArrowRight reorders selected block one slot later (clamped at SLOT_COUNT-1 = 7)', () => {
    const onReorder = jest.fn()
    const { result } = renderHook(() =>
      useGridKeyboard({ rowId: 'row-a', slotIndex: 5 }, { onReorder }),
    )
    const e = makeEvent('ArrowRight')
    result.current(e)
    expect(onReorder).toHaveBeenCalledWith('row-a', 5, 6)

    onReorder.mockClear()
    const { result: clamped } = renderHook(() =>
      useGridKeyboard({ rowId: 'row-a', slotIndex: 7 }, { onReorder }),
    )
    clamped.current(makeEvent('ArrowRight'))
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('Delete and Backspace remove the selected block', () => {
    const onRemove = jest.fn()
    const { result } = renderHook(() =>
      useGridKeyboard({ rowId: 'row-a', slotIndex: 2 }, { onRemove }),
    )

    result.current(makeEvent('Delete'))
    expect(onRemove).toHaveBeenCalledWith('row-a', 2)

    onRemove.mockClear()
    result.current(makeEvent('Backspace'))
    expect(onRemove).toHaveBeenCalledWith('row-a', 2)
  })

  it('Escape calls onDeselect regardless of selection', () => {
    const onDeselect = jest.fn()
    const { result: withSel } = renderHook(() =>
      useGridKeyboard({ rowId: 'row-a', slotIndex: 3 }, { onDeselect }),
    )
    withSel.current(makeEvent('Escape'))
    expect(onDeselect).toHaveBeenCalledTimes(1)

    onDeselect.mockClear()
    const { result: noSel } = renderHook(() => useGridKeyboard(null, { onDeselect }))
    noSel.current(makeEvent('Escape'))
    expect(onDeselect).toHaveBeenCalledTimes(1)
  })

  it('Arrow/Delete are no-op when nothing is selected', () => {
    const handlers = {
      onReorder: jest.fn(),
      onRemove: jest.fn(),
    }
    const { result } = renderHook(() => useGridKeyboard(null, handlers))

    result.current(makeEvent('ArrowLeft'))
    result.current(makeEvent('ArrowRight'))
    result.current(makeEvent('Delete'))

    expect(handlers.onReorder).not.toHaveBeenCalled()
    expect(handlers.onRemove).not.toHaveBeenCalled()
  })
})
