import '@testing-library/jest-dom'
import { act, renderHook } from '@testing-library/react'

import { DEFAULT_SNAPSHOT_SLOT_STYLE, useSnapshotSlotStyle } from './useSnapshotSlotStyle'

const STORAGE_KEY = 'map2:snapshot-editor.slot-style'
const SYNC_EVENT = 'map2:snapshot-editor.slot-style.sync'

beforeEach(() => {
  window.localStorage.clear()
})

describe('useSnapshotSlotStyle', () => {
  it('returns the default when localStorage is empty', () => {
    const { result } = renderHook(() => useSnapshotSlotStyle())
    expect(result.current[0]).toBe(DEFAULT_SNAPSHOT_SLOT_STYLE)
  })

  it('hydrates from a valid pre-existing localStorage entry', () => {
    window.localStorage.setItem(STORAGE_KEY, 'v4-ring')
    const { result } = renderHook(() => useSnapshotSlotStyle())
    expect(result.current[0]).toBe('v4-ring')
  })

  it('falls back to the default when localStorage holds an invalid value', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not-a-real-style')
    const { result } = renderHook(() => useSnapshotSlotStyle())
    expect(result.current[0]).toBe(DEFAULT_SNAPSHOT_SLOT_STYLE)
  })

  it('writes the new value to localStorage when updated', () => {
    const { result } = renderHook(() => useSnapshotSlotStyle())
    act(() => {
      result.current[1]('v3-tinted')
    })
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('v3-tinted')
    expect(result.current[0]).toBe('v3-tinted')
  })

  it('dispatches a same-tab sync event so other subscribers update immediately', () => {
    const listener = jest.fn()
    window.addEventListener(SYNC_EVENT, listener as EventListener)
    try {
      const { result } = renderHook(() => useSnapshotSlotStyle())
      act(() => {
        result.current[1]('v6-led')
      })
      expect(listener).toHaveBeenCalledTimes(1)
      const evt = listener.mock.calls[0][0] as CustomEvent
      expect(evt.detail).toBe('v6-led')
    } finally {
      window.removeEventListener(SYNC_EVENT, listener as EventListener)
    }
  })

  it('updates a sibling instance when a same-tab sync event fires', () => {
    const a = renderHook(() => useSnapshotSlotStyle())
    const b = renderHook(() => useSnapshotSlotStyle())

    act(() => {
      a.result.current[1]('v3-tinted')
    })

    expect(a.result.current[0]).toBe('v3-tinted')
    expect(b.result.current[0]).toBe('v3-tinted')
  })

  it('updates when a cross-tab storage event arrives', () => {
    const { result } = renderHook(() => useSnapshotSlotStyle())
    expect(result.current[0]).toBe(DEFAULT_SNAPSHOT_SLOT_STYLE)

    act(() => {
      // Simulate another tab writing to localStorage. jsdom does not fire
      // 'storage' automatically on same-tab writes, so we synthesize one.
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: 'v4-ring',
          oldValue: null,
          storageArea: window.localStorage,
        }),
      )
    })

    expect(result.current[0]).toBe('v4-ring')
  })

  it('resets to default when a cross-tab storage event clears the key', () => {
    window.localStorage.setItem(STORAGE_KEY, 'v6-led')
    const { result } = renderHook(() => useSnapshotSlotStyle())
    expect(result.current[0]).toBe('v6-led')

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: null,
          oldValue: 'v6-led',
          storageArea: window.localStorage,
        }),
      )
    })

    expect(result.current[0]).toBe(DEFAULT_SNAPSHOT_SLOT_STYLE)
  })

  it('keeps the in-memory value when localStorage write throws (quota / private mode)', () => {
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError')
    })
    try {
      const { result } = renderHook(() => useSnapshotSlotStyle())
      // Should not throw.
      act(() => {
        result.current[1]('v3-tinted')
      })
      // Persistence failed but the in-memory state still reflects the user's choice.
      expect(result.current[0]).toBe('v3-tinted')
    } finally {
      setItemSpy.mockRestore()
    }
  })
})
