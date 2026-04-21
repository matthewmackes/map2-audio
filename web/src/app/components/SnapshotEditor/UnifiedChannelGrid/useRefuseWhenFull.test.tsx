import '@testing-library/jest-dom'
import { renderHook } from '@testing-library/react'

import {
  isRowFull,
  useRefuseWhenFull,
  REFUSE_WHEN_FULL_MESSAGE,
  type PushToastFn,
} from './useRefuseWhenFull'
import { makeEmptyRow, type UnifiedChannelRow } from './gridConstants'

function fullRow(): UnifiedChannelRow {
  const row = makeEmptyRow('row-1', 'Full')
  for (let i = 0; i < row.slots.length; i += 1) {
    row.slots[i] = {
      ...row.slots[i],
      kind: 'plugin',
      uri: `urn:plugin:${i}`,
      label: `P${i}`,
      category: 'Utility',
    }
  }
  return row
}

function halfRow(): UnifiedChannelRow {
  const row = makeEmptyRow('row-2', 'Half')
  row.slots[0] = {
    ...row.slots[0],
    kind: 'plugin',
    uri: 'urn:plugin:0',
    label: 'P0',
    category: 'Utility',
  }
  return row
}

describe('isRowFull', () => {
  it('returns true when all 8 slots are occupied', () => {
    expect(isRowFull(fullRow())).toBe(true)
  })

  it('returns false when any slot is empty', () => {
    expect(isRowFull(halfRow())).toBe(false)
  })
})

describe('useRefuseWhenFull', () => {
  it('refuses add when row is full and invokes pushToast with the warn tone', () => {
    const pushToast = jest.fn() as jest.MockedFunction<PushToastFn>
    const { result } = renderHook(() => useRefuseWhenFull(pushToast))

    const outcome = result.current(fullRow())
    expect(outcome.refused).toBe(true)
    expect(pushToast).toHaveBeenCalledWith(
      REFUSE_WHEN_FULL_MESSAGE,
      'warn',
      expect.objectContaining({ title: 'Cannot add block', durationMs: 4000 }),
    )
  })

  it('does not refuse when row has capacity and does not push a toast', () => {
    const pushToast = jest.fn() as jest.MockedFunction<PushToastFn>
    const { result } = renderHook(() => useRefuseWhenFull(pushToast))

    const outcome = result.current(halfRow())
    expect(outcome.refused).toBe(false)
    expect(pushToast).not.toHaveBeenCalled()
  })
})
